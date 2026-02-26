import { run } from '../lib/exec.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const NVM_DIR = process.env.NVM_DIR || '/root/.nvm';
const NVM_VERSIONS = path.join(NVM_DIR, 'versions', 'node');

/** Extract version string from dir name (e.g. v20.10.0 -> 20.10.0, v20 -> 20). Normalize to at least major.minor for display. */
function parseVersionFromDir(dirName) {
  const v = dirName.replace(/^v/, '').trim();
  if (!v || !/^\d/.test(v)) return null;
  const parts = v.split('.');
  if (parts.length === 1) return parts[0] + '.0.0';
  if (parts.length === 2) return parts[0] + '.' + parts[1] + '.0';
  return v;
}

export function listVersions() {
  const versions = [];
  try {
    if (fs.existsSync(NVM_VERSIONS)) {
      const dirs = fs.readdirSync(NVM_VERSIONS);
      for (const d of dirs) {
        const v = parseVersionFromDir(d);
        if (v && /^\d+(\.\d+)*$/.test(v)) versions.push(v);
      }
    }
  } catch (_) {}
  if (versions.length > 0) {
    const unique = [...new Set(versions)];
    return unique.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }
  try {
    const { stdout } = run(`bash -c 'export NVM_DIR="${NVM_DIR}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm list --no-alias'`, { withNvm: false });
    const lines = stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      const match = line.match(/v?(\d+\.\d+(?:\.\d+)*)/);
      if (match) versions.push(match[1]);
    }
    if (versions.length > 0) {
      const unique = [...new Set(versions)];
      return unique.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    }
  } catch (_) {}
  try {
    const { stdout } = run('node -v', { withNvm: false });
    const match = (stdout || '').match(/v?(\d+\.\d+(?:\.\d+)*)/);
    if (match) return [match[1]];
  } catch (_) {}
  return [];
}

/**
 * Install a Node version via nvm. Returns { versions, stdout, stderr }.
 */
export function installVersion(version) {
  const v = String(version).trim();
  if (!v || (!/^[\d.]+\d$/.test(v) && v !== 'lts' && v !== 'node')) {
    throw new Error('Invalid version format');
  }
  const cmd = v === 'lts' ? 'nvm install --lts' : `nvm install ${v}`;
  const script = `export NVM_DIR="${NVM_DIR}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && ${cmd}`;
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (result.status !== 0) {
    const err = new Error(stderr || stdout || 'Install failed');
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }
  return { versions: listVersions(), stdout, stderr };
}
