import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { run, runPm2, runGit, getBashPath } from '../lib/exec.js';
import { isPortInUseSync } from '../lib/portCheck.js';
import * as nodeManager from './nodeManager.js';
import * as db from '../db.js';
import { writeAppConfig, removeAppConfig, reloadNginx, certsExist, obtainCert, appConfigHasSsl } from './nginx.js';

const APPS_BASE = process.env.APPS_BASE_PATH || '/var/www/upgs-node-apps';
const NVM_DIR = process.env.NVM_DIR || `${process.env.HOME || '/root'}/.nvm`;

/** Per-app lock for start/stop/restart so only one action runs at a time per app. */
const inProgressAppIds = new Set();

/**
 * Run fn with an exclusive lock for this app. If another action is in progress for appId, throws.
 * @param {number} appId
 * @param {() => T} fn
 * @returns {T}
 */
export function withAppAction(appId, fn) {
  if (inProgressAppIds.has(appId)) {
    const e = new Error('Start/stop/restart already in progress for this app');
    e.code = 'APP_ACTION_BUSY';
    throw e;
  }
  inProgressAppIds.add(appId);
  try {
    return fn();
  } finally {
    inProgressAppIds.delete(appId);
  }
}

/** Env for PM2: force HOME and PM2_HOME so panel and shell use the same daemon. */
function pm2Env(extra = {}) {
  const home = process.env.HOME || '/root';
  const pm2Home = process.env.PM2_HOME || `${home}/.pm2`;
  return {
    ...process.env,
    HOME: home,
    PM2_HOME: pm2Home,
    ...extra,
  };
}

function pm2Name(app) {
  return `upgs-app-${app.id}`;
}

function appDir(app) {
  return path.join(APPS_BASE, 'app-' + app.id);
}

/** Returns the absolute path of the app directory (for file explorer, etc.). */
export function getAppDir(app) {
  return appDir(app);
}

/**
 * One-time migration: move name-based app dirs to id-based (app-{id}).
 * Safe to run on every startup; only renames when oldDir exists and newDir does not.
 */
export function migrateAppDirsToId() {
  try {
    db.initDb();
    const apps = db.listApps();
    for (const app of apps) {
      const safeName = String(app.name).replace(/[^a-zA-Z0-9_-]/g, '_');
      const oldDir = path.join(APPS_BASE, safeName);
      const newDir = path.join(APPS_BASE, 'app-' + app.id);
      if (oldDir !== newDir && fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        fs.renameSync(oldDir, newDir);
        console.log(`Migrated app dir: ${oldDir} -> ${newDir}`);
      }
    }
  } catch (e) {
    console.error('App dir migration failed:', e.message);
  }
}

/**
 * Recursive directory size in bytes. Uses stat (follows symlinks). Returns 0 for empty or missing dir.
 */
function dirSizeSync(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dirPath, e.name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) total += stat.size;
      else if (stat.isDirectory()) total += dirSizeSync(full);
    } catch (_) {
      // skip permission errors or broken symlinks
    }
  }
  return total;
}

/**
 * Returns the on-disk size of the app directory in bytes, or null if the directory does not exist.
 */
export function getAppSize(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) return null;
  return dirSizeSync(dir);
}

function getDefaultBranchInRepo(dir) {
  const { stdout } = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
  return (stdout || '').trim() || 'main';
}

/** True if ref looks like a commit SHA (7-40 hex). */
function isRefSha(ref) {
  return typeof ref === 'string' && /^[a-f0-9]{7,40}$/i.test(ref.trim());
}

/**
 * Clones or updates the app repo. Returns { dir, actualBranch }.
 * app.branch can be a branch name, tag, or commit SHA. If empty/null, uses the repo's default branch.
 */
export function cloneApp(app) {
  const dir = appDir(app);
  const rawRef = (app.branch != null && String(app.branch).trim() !== '') ? String(app.branch).trim() : null;
  const ref = rawRef || null;
  const refIsSha = ref !== null && isRefSha(ref);

  try {
    fs.mkdirSync(APPS_BASE, { recursive: true });
  } catch (_) {}

  if (fs.existsSync(dir)) {
    runGit(['fetch', '--tags'], { cwd: dir });
    const checkoutRef = ref || getDefaultBranchInRepo(dir);
    runGit(['checkout', checkoutRef], { cwd: dir });
    const headRef = (() => {
      try {
        const { stdout } = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
        return (stdout || '').trim();
      } catch (_) {
        return 'HEAD';
      }
    })();
    if (headRef !== 'HEAD') {
      runGit(['pull'], { cwd: dir });
    }
    return { dir, actualBranch: checkoutRef };
  }

  if (ref === null) {
    runGit(['clone', app.repo_url, dir], {});
    const actualBranch = getDefaultBranchInRepo(dir);
    return { dir, actualBranch };
  }

  if (refIsSha) {
    runGit(['clone', app.repo_url, dir], {});
    runGit(['fetch', 'origin', ref], { cwd: dir });
    runGit(['checkout', ref], { cwd: dir });
    return { dir, actualBranch: ref };
  }

  try {
    runGit(['clone', '-b', ref, app.repo_url, dir], {});
  } catch (e) {
    if (ref === 'main') {
      runGit(['clone', app.repo_url, dir], {});
      try {
        runGit(['checkout', 'master'], { cwd: dir });
        return { dir, actualBranch: 'master' };
      } catch (_) {
        throw new Error((e.message || 'Clone failed').trim() + " Branch 'main' not found. Try 'master' or leave empty for auto.");
      }
    }
    throw e;
  }
  return { dir, actualBranch: ref };
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
  if (isPortInUseSync(app.port)) {
    throw new Error(`Port ${app.port} is already in use. Change the app port in settings or stop the other process.`);
  }
  if (!nodeManager.isVersionAvailable(app.node_version || '20')) {
    throw new Error(`Node version "${app.node_version || '20'}" is not installed. Install it in Node versions or choose an installed version.`);
  }
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
    runPm2(['start', getBashPath(), '--name', name, '--', scriptPath], {
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
    if (!proc) return { status: 'stopped' };
    return { status: proc.pm2_env?.status === 'online' ? 'running' : 'stopped' };
  } catch (e) {
    return { status: 'unknown', error: e?.message || 'Could not determine status' };
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
    if (appConfigHasSsl(app.id)) {
      // Config already has SSL (e.g. after panel restart); panel user may not read /etc/letsencrypt — just rewrite SSL block
      writeAppConfig(app, false, true);
    } else {
      try {
        obtainCert(domain);
        writeAppConfig(app, false, true);
      } catch (e) {
        console.warn('Could not obtain SSL cert for', domain, e.message);
        sslError = e.message || 'Could not obtain certificate';
        writeAppConfig(app);
      }
    }
  } else {
    writeAppConfig(app, false, Boolean(app.ssl_enabled && appConfigHasSsl(app.id)));
  }
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
