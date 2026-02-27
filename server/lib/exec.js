import { execSync, spawnSync } from 'child_process';
import fs from 'fs';

const NVM_DIR = process.env.NVM_DIR || `${process.env.HOME || '/root'}/.nvm`;
const PM2_BIN_PATH = process.env.PM2_BIN || '/usr/local/bin/pm2';

/**
 * Path to bash for PM2 start scripts. Prefer BASH_PATH env, then /usr/bin/bash, else /bin/bash.
 */
export function getBashPath() {
  if (process.env.BASH_PATH) return process.env.BASH_PATH;
  try {
    if (fs.existsSync('/usr/bin/bash')) return '/usr/bin/bash';
  } catch (_) {}
  return '/bin/bash';
}

/**
 * Run a shell command. Optionally wrap in bash with nvm sourced.
 * @param {string} command
 * @param {{ cwd?: string, env?: Record<string,string>, withNvm?: boolean }} options
 * @returns {{ stdout: string, stderr: string }}
 */
export function run(command, options = {}) {
  const { cwd, env = {}, withNvm = false } = options;
  const fullEnv = { ...process.env, ...env };
  if (withNvm) {
    const wrapped = `export NVM_DIR="${NVM_DIR}" && [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh" && ${command}`;
    const result = execSync(wrapped, {
      encoding: 'utf-8',
      cwd,
      env: fullEnv,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: result || '', stderr: '' };
  }
  const result = execSync(command, {
    encoding: 'utf-8',
    cwd,
    env: fullEnv,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: result || '', stderr: '' };
}

/**
 * Run PM2 with argv (no shell). Uses fixed PM2 binary path and the given env
 * so the panel always talks to the same daemon as `pm2 list` in the shell.
 * @param {string[]} args - e.g. ['start', '/usr/bin/bash', '--name', 'upgs-app-1', '--', '/path/to/script.sh']
 * @param {{ env: Record<string, string> }} options - must include HOME and PM2_HOME (e.g. /root, /root/.pm2)
 * @returns {{ stdout: string, stderr: string }}
 */
export function runPm2(args, options = {}) {
  const { env } = options;
  const result = spawnSync(PM2_BIN_PATH, args, {
    encoding: 'utf-8',
    env: env || process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = new Error(result.stderr || result.stdout || 'PM2 command failed');
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    err.status = result.status;
    throw err;
  }
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

/**
 * Run git with argv (no shell). Throws on non-zero exit.
 * @param {string[]} args - e.g. ['clone', '-b', 'main', 'https://...', '/path']
 * @param {{ cwd?: string }} options
 */
export function runGit(args, options = {}) {
  const { cwd } = options;
  const result = spawnSync('git', args, {
    encoding: 'utf-8',
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = new Error(result.stderr || result.stdout || 'git failed');
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    err.status = result.status;
    throw err;
  }
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}
