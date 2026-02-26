import { execSync } from 'child_process';

const NVM_DIR = process.env.NVM_DIR || '/root/.nvm';

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
