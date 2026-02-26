import { run } from '../lib/exec.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const NVM_DIR = process.env.NVM_DIR || '/root/.nvm';
const NVM_VERSIONS = path.join(NVM_DIR, 'versions', 'node');

export function listVersions() {
  try {
    const { stdout } = run(`bash -c 'export NVM_DIR="${NVM_DIR}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm list --no-alias'`, { withNvm: false });
    const lines = stdout.split('\n').filter(Boolean);
    const versions = [];
    for (const line of lines) {
      const match = line.match(/v?(\d+\.\d+\.\d+)/);
      if (match) versions.push(match[1]);
    }
    if (versions.length > 0) return versions;
  } catch (_) {}
  try {
    if (fs.existsSync(NVM_VERSIONS)) {
      const dirs = fs.readdirSync(NVM_VERSIONS);
      const versions = [];
      for (const d of dirs) {
        const v = d.replace(/^v/, '');
        if (/^\d+\.\d+\.\d+$/.test(v)) versions.push(v);
      }
      return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    }
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
