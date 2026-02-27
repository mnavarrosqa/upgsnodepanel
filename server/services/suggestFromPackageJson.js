/**
 * Fetches package.json from a Git repo (GitHub/GitLab raw URL) and returns suggested
 * install_cmd, build_cmd, start_cmd, and node_version. Used by POST /api/apps/suggest.
 */

import { validateRepoUrl, validateRef } from '../lib/validate.js';

const DEFAULT_REF = 'main';

/**
 * Build raw URL for package.json from repo URL and ref.
 * Returns null if host is not supported (GitHub or GitLab).
 */
function rawPackageJsonUrl(repoUrl, ref) {
  const r = (ref && String(ref).trim()) || DEFAULT_REF;
  try {
    const u = new URL(repoUrl);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.replace(/\.git$/, '').replace(/^\//, '');

    if (host === 'github.com') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const owner = parts[0];
      const repo = parts[1];
      return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(r)}/package.json`;
    }

    if (host === 'gitlab.com') {
      return `https://gitlab.com/${pathname}/-/raw/${encodeURIComponent(r)}/package.json`;
    }

    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Parse engines.node (e.g. "20", ">=18", "18.x") and return a suggested major version string.
 */
function parseEnginesNode(enginesNode) {
  if (enginesNode == null || typeof enginesNode !== 'string') return null;
  const s = enginesNode.trim();
  const exact = /^(\d+)(?:\.\d+)*$/.exec(s);
  if (exact) return exact[1];
  const range = />=?\s*(\d+)/.exec(s);
  if (range) return range[1];
  const major = /^(\d+)\.x$/i.exec(s);
  if (major) return major[1];
  return null;
}

/**
 * Suggest commands and node version from package.json content.
 */
function parsePackageJson(json) {
  const out = { install_cmd: 'npm install', build_cmd: null, start_cmd: 'npm start', node_version: null };
  let pkg;
  try {
    pkg = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (_) {
    return out;
  }
  if (!pkg || typeof pkg !== 'object') return out;

  const scripts = pkg.scripts;
  if (scripts && typeof scripts === 'object') {
    if (scripts.build) out.build_cmd = 'npm run build';
    if (scripts.start) out.start_cmd = 'npm start';
    else if (scripts['start:prod']) out.start_cmd = 'npm run start:prod';
    else if (scripts['start:production']) out.start_cmd = 'npm run start:production';
  }

  if (pkg.engines && typeof pkg.engines === 'object' && pkg.engines.node) {
    const v = parseEnginesNode(pkg.engines.node);
    if (v) out.node_version = v;
  }

  return out;
}

/**
 * Suggest install/build/start commands and node version from a repo.
 * @param {string} repoUrl - HTTP(S) repo URL (GitHub or GitLab)
 * @param {string} [ref] - Branch, tag, or commit (default: main)
 * @returns {Promise<{ install_cmd?: string, build_cmd?: string | null, start_cmd?: string, node_version?: string }>}
 */
export async function suggestFromPackageJson(repoUrl, ref) {
  const url = validateRepoUrl(repoUrl);
  if (!url) throw new Error('repo_url is required');
  const r = ref != null && String(ref).trim() !== '' ? validateRef(ref) : null;
  const effectiveRef = r || DEFAULT_REF;

  const rawUrl = rawPackageJsonUrl(url, effectiveRef);
  if (!rawUrl) throw new Error('Unsupported host. Suggest from package.json supports GitHub and GitLab only.');

  const res = await fetch(rawUrl, { method: 'GET', redirect: 'follow' });
  if (!res.ok) {
    if (res.status === 404) throw new Error('package.json not found at that ref');
    throw new Error(`Could not fetch package.json: ${res.status}`);
  }
  const text = await res.text();
  return parsePackageJson(text);
}
