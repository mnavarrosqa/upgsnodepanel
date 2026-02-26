import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { run, runPm2, runGit } from '../lib/exec.js';
import { writeAppConfig, removeAppConfig, reloadNginx, certsExist, obtainCert } from './nginx.js';

const APPS_BASE = process.env.APPS_BASE_PATH || '/var/www/upgs-node-apps';
const NVM_DIR = process.env.NVM_DIR || '/root/.nvm';

/** Env for PM2: force HOME and PM2_HOME so panel and shell use the same daemon. */
function pm2Env(extra = {}) {
  return {
    ...process.env,
    HOME: '/root',
    PM2_HOME: '/root/.pm2',
    ...extra,
  };
}

function pm2Name(app) {
  return `upgs-app-${app.id}`;
}

function appDir(app) {
  const safeName = String(app.name).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(APPS_BASE, safeName);
}

/**
 * Clones or updates the app repo. Returns { dir, actualBranch }.
 * If app.branch is empty/null, uses the repo's default branch (auto-detect). Otherwise checks out the given branch (with main→master fallback).
 */
export function cloneApp(app) {
  const dir = appDir(app);
  const branch = (app.branch != null && String(app.branch).trim() !== '') ? String(app.branch).trim() : null;
  try {
    fs.mkdirSync(APPS_BASE, { recursive: true });
  } catch (_) {}
  if (fs.existsSync(dir)) {
    runGit(['fetch'], { cwd: dir });
    const checkoutBranch = branch || getDefaultBranchInRepo(dir);
    runGit(['checkout', checkoutBranch], { cwd: dir });
    runGit(['pull'], { cwd: dir });
    return { dir, actualBranch: checkoutBranch };
  }
  runGit(['clone', app.repo_url, dir], {});
  let actualBranch;
  if (branch) {
    actualBranch = branch;
    try {
      runGit(['checkout', branch], { cwd: dir });
    } catch (e) {
      if (branch === 'main') {
        try {
          runGit(['checkout', 'master'], { cwd: dir });
          actualBranch = 'master';
        } catch (_) {
          const msg = (e.message || '').toLowerCase();
          const hint = msg.includes('main')
            ? " Branch 'main' not found. Try setting branch to 'master' or leave empty for auto."
            : ` Branch '${branch}' not found in the repository.`;
          throw new Error((e.message || 'Checkout failed').trim() + hint);
        }
      } else {
        throw new Error((e.message || 'Checkout failed').trim() + ` Branch '${branch}' not found.`);
      }
    }
  } else {
    actualBranch = getDefaultBranchInRepo(dir);
  }
  return { dir, actualBranch };
}

function getDefaultBranchInRepo(dir) {
  const { stdout } = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
  return (stdout || '').trim() || 'main';
}

const UPLOAD_REPO_PLACEHOLDER = 'upload://';

export function isUploadApp(app) {
  return app.repo_url === UPLOAD_REPO_PLACEHOLDER;
}

/**
 * Extract a .zip file to the app directory. Creates the dir if needed.
 * If the zip has a single root directory, its contents are moved to the app dir so package.json is at the root.
 */
export function extractZipToApp(app, zipPath) {
  const dir = appDir(app);
  try {
    fs.mkdirSync(APPS_BASE, { recursive: true });
  } catch (_) {}
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(dir, true);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    const singleDir = path.join(dir, entries[0].name);
    const children = fs.readdirSync(singleDir, { withFileTypes: true });
    for (const c of children) {
      const src = path.join(singleDir, c.name);
      const dest = path.join(dir, c.name);
      fs.renameSync(src, dest);
    }
    fs.rmdirSync(singleDir);
  }
  return { dir };
}

export function runInstall(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) throw new Error('App directory not found. Clone first.');
  const cmd = app.install_cmd || 'npm install';
  const nodeVersion = app.node_version || '20';
  const result = run(`nvm use ${nodeVersion} 2>/dev/null; ${cmd}`, { cwd: dir, withNvm: true });
  return result;
}

export function runBuild(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) throw new Error('App directory not found.');
  const cmd = app.build_cmd;
  if (!cmd) return { stdout: '', stderr: '' };
  const nodeVersion = app.node_version || '20';
  const result = run(`nvm use ${nodeVersion} 2>/dev/null; ${cmd}`, { cwd: dir, withNvm: true });
  return result;
}

const START_SCRIPT_NAME = '.upgs-start.sh';

export function startApp(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) throw new Error('App directory not found.');
  const name = pm2Name(app);
  const startCmd = app.start_cmd || 'npm start';
  const nodeVersion = app.node_version || '20';
  const scriptPath = path.join(dir, START_SCRIPT_NAME);
  const scriptBody = [
    `export NVM_DIR="${NVM_DIR}"`,
    `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`,
    `nvm use ${nodeVersion} 2>/dev/null || true`,
    `cd "${dir}"`,
    `export PORT=${app.port}`,
    startCmd,
  ].join('\n');
  fs.writeFileSync(scriptPath, scriptBody, 'utf8');
  try {
    runPm2(['describe', name], { env: pm2Env() });
  } catch (_) {
    runPm2(['start', '/usr/bin/bash', '--name', name, '--', scriptPath], {
      env: pm2Env({ PORT: String(app.port) }),
    });
    return;
  }
  runPm2(['start', name], { env: pm2Env() });
}

export function stopApp(app) {
  const name = pm2Name(app);
  try {
    runPm2(['stop', name], { env: pm2Env() });
  } catch (e) {
    if (!e.message?.includes('not found')) throw e;
  }
}

export function restartApp(app) {
  const name = pm2Name(app);
  try {
    runPm2(['restart', name], { env: pm2Env() });
  } catch (e) {
    if (e.message?.includes('not found')) startApp(app);
    else throw e;
  }
}

export function deleteFromPm2(app) {
  const name = pm2Name(app);
  try {
    runPm2(['delete', name], { env: pm2Env() });
  } catch (_) {}
}

export function getPm2Status(app) {
  const name = pm2Name(app);
  try {
    const { stdout } = runPm2(['jlist'], { env: pm2Env() });
    const list = JSON.parse(stdout);
    const proc = list.find((p) => p.name === name);
    if (!proc) return 'stopped';
    return proc.pm2_env?.status === 'online' ? 'running' : 'stopped';
  } catch (_) {
    return 'stopped';
  }
}

export function getLogs(app, lines = 100) {
  const name = pm2Name(app);
  try {
    const { stdout } = runPm2(['logs', name, '--lines', String(lines), '--nostream'], { env: pm2Env() });
    return stdout;
  } catch (e) {
    return e.stdout || e.message || 'No logs';
  }
}

/**
 * Set up nginx vhost for the app and optionally obtain SSL cert. Returns { sslError } if SSL was requested but certbot failed.
 */
export function setupNginxAndReload(app) {
  const domain = app.domain && String(app.domain).trim();
  if (!domain) {
    writeAppConfig(app);
    reloadNginx();
    return {};
  }
  // Write HTTP-only vhost first so the domain is in nginx (required for certbot --nginx)
  writeAppConfig(app, true);
  reloadNginx();
  let sslError = null;
  if (app.ssl_enabled && !certsExist(domain)) {
    try {
      obtainCert(domain);
    } catch (e) {
      console.warn('Could not obtain SSL cert for', domain, e.message);
      sslError = e.message || 'Could not obtain certificate';
    }
  }
  writeAppConfig(app);
  reloadNginx();
  return sslError ? { sslError } : {};
}

export function teardownNginx(app) {
  removeAppConfig(app.id);
  reloadNginx();
}

export function getAppEnvPath(app) {
  return path.join(appDir(app), '.env');
}

export function readAppEnv(app) {
  const envPath = getAppEnvPath(app);
  try {
    if (fs.existsSync(envPath)) {
      return fs.readFileSync(envPath, 'utf8');
    }
  } catch (_) {}
  return '';
}

export function writeAppEnv(app, content) {
  const envPath = getAppEnvPath(app);
  const dir = path.dirname(envPath);
  if (!fs.existsSync(dir)) throw new Error('App directory not found');
  fs.writeFileSync(envPath, typeof content === 'string' ? content : '', 'utf8');
}

export { appDir, pm2Name };
