import path from 'path';
import fs from 'fs';
import { run, runGit } from '../lib/exec.js';
import { writeAppConfig, removeAppConfig, reloadNginx } from './nginx.js';

const APPS_BASE = process.env.APPS_BASE_PATH || '/var/www/upgs-node-apps';
const NVM_DIR = process.env.NVM_DIR || '/root/.nvm';

function pm2Name(app) {
  return `upgs-app-${app.id}`;
}

function appDir(app) {
  const safeName = String(app.name).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(APPS_BASE, safeName);
}

export function cloneApp(app) {
  const dir = appDir(app);
  const branch = app.branch || 'main';
  try {
    fs.mkdirSync(APPS_BASE, { recursive: true });
  } catch (_) {}
  if (fs.existsSync(dir)) {
    runGit(['fetch'], { cwd: dir });
    runGit(['checkout', branch], { cwd: dir });
    runGit(['pull'], { cwd: dir });
  } else {
    runGit(['clone', '-b', branch, app.repo_url, dir], {});
  }
  return dir;
}

export function runInstall(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) throw new Error('App directory not found. Clone first.');
  const cmd = app.install_cmd || 'npm install';
  const nodeVersion = app.node_version || '20';
  run(`nvm use ${nodeVersion} 2>/dev/null; ${cmd}`, { cwd: dir, withNvm: true });
}

export function runBuild(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) throw new Error('App directory not found.');
  const cmd = app.build_cmd;
  if (!cmd) return;
  const nodeVersion = app.node_version || '20';
  run(`nvm use ${nodeVersion} 2>/dev/null; ${cmd}`, { cwd: dir, withNvm: true });
}

export function startApp(app) {
  const dir = appDir(app);
  if (!fs.existsSync(dir)) throw new Error('App directory not found.');
  const name = pm2Name(app);
  const startCmd = app.start_cmd || 'npm start';
  const nodeVersion = app.node_version || '20';
  const script = `export NVM_DIR="${NVM_DIR}" && . "$NVM_DIR/nvm.sh" && nvm use ${nodeVersion} 2>/dev/null; cd "${dir}" && export PORT=${app.port} && ${startCmd}`;
  try {
    run(`pm2 describe ${name}`, {});
  } catch (_) {
    run(`pm2 start bash --name ${name} -- -c ${JSON.stringify(script)}`, { env: { ...process.env, PORT: String(app.port) } });
    return;
  }
  run(`pm2 start ${name}`, {});
}

export function stopApp(app) {
  const name = pm2Name(app);
  try {
    run(`pm2 stop ${name}`, {});
  } catch (e) {
    if (!e.message.includes('not found')) throw e;
  }
}

export function restartApp(app) {
  const name = pm2Name(app);
  try {
    run(`pm2 restart ${name}`, {});
  } catch (e) {
    if (e.message.includes('not found')) startApp(app);
    else throw e;
  }
}

export function deleteFromPm2(app) {
  const name = pm2Name(app);
  try {
    run(`pm2 delete ${name}`, {});
  } catch (_) {}
}

export function getPm2Status(app) {
  const name = pm2Name(app);
  try {
    const { stdout } = run(`pm2 jlist`, {});
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
    const { stdout } = run(`pm2 logs ${name} --lines ${lines} --nostream`, {});
    return stdout;
  } catch (e) {
    return e.stdout || e.message || 'No logs';
  }
}

export function setupNginxAndReload(app) {
  writeAppConfig(app);
  reloadNginx();
}

export function teardownNginx(app) {
  removeAppConfig(app.id);
  reloadNginx();
}

export { appDir, pm2Name };
