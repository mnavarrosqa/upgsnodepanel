import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawnSync } from 'child_process';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as db from '../db.js';
import * as appManager from '../services/appManager.js';
import * as nginx from '../services/nginx.js';
import { validateAppInput, validateName, validateDomain, validateCommand, validateNodeVersion, validateRepoUrl, validateRef, validateMaxRestarts, validateRestartDelay } from '../lib/validate.js';

export const appsRouter = Router();

const ZIP_MAX_SIZE = 250 * 1024 * 1024; // 250MB
const FILE_UPLOAD_MAX_SIZE = 250 * 1024 * 1024; // 250MB per file in file explorer
const ZIP_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000; // 15 min for slow uploads

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, os.tmpdir()),
    filename: (_, file, cb) => cb(null, `upgs-upload-${Date.now()}-${path.basename(file.originalname || 'app.zip')}`),
  }),
  limits: { fileSize: ZIP_MAX_SIZE },
  fileFilter: (_, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.zip')) return cb(null, true);
    cb(new Error('Only .zip files are allowed'));
  },
});

const fileExplorerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_UPLOAD_MAX_SIZE },
  fileFilter: (_, file, cb) => cb(null, true),
}).array('files', 50);

function appToJson(row) {
  if (!row) return null;
  const domain = row.domain && String(row.domain).trim();
  const sslEnabled = Boolean(row.ssl_enabled);
  const sslActive = sslEnabled && domain && (nginx.certsExist(domain) || nginx.appConfigHasSsl(row.id));
  const pm2 = appManager.getPm2Status(row);
  return {
    ...row,
    ssl_enabled: sslEnabled,
    ssl_active: sslActive,
    status: pm2.status,
    status_error: pm2.error || undefined,
    memory: pm2.memory,
    cpu: pm2.cpu,
    size: appManager.getAppSize(row),
  };
}

appsRouter.get('/', (req, res, next) => {
  try {
    const apps = db.listApps().map(appToJson);
    res.json({ apps });
  } catch (e) {
    next(e);
  }
});

appsRouter.get('/:id', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    res.json(appToJson(app));
  } catch (e) {
    next(e);
  }
});

appsRouter.post('/suggest', async (req, res, next) => {
  try {
    const body = req.body || {};
    const repoUrl = body.repo_url;
    const ref = body.ref;
    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
      return res.status(400).json({ error: 'repo_url is required' });
    }
    const { suggestFromPackageJson } = await import('../services/suggestFromPackageJson.js');
    const result = await suggestFromPackageJson(repoUrl.trim(), ref);
    res.json(result);
  } catch (e) {
    const msg = e.message || 'Suggest failed';
    if (msg.includes('required') || msg.includes('Unsupported') || msg.includes('not found')) {
      return res.status(400).json({ error: msg });
    }
    next(e);
  }
});

function writeStreamLine(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

function flushStream() {
  return new Promise((r) => setImmediate(r));
}

function buildCreateDataFromBody(body, isZip = false) {
  const name = validateName(body.name);
  if (!name) throw new Error('name is required');
  const data = {
    name,
    repo_url: isZip ? 'upload://' : (validateRepoUrl(body.repo_url) || (() => { throw new Error('repo_url is required'); })()),
    branch: body.branch != null && String(body.branch).trim() !== '' ? validateRef(body.branch) : null,
    install_cmd: validateCommand(body.install_cmd, 'install_cmd') || 'npm install',
    build_cmd: validateCommand(body.build_cmd, 'build_cmd') || null,
    start_cmd: validateCommand(body.start_cmd, 'start_cmd') || 'npm start',
    node_version: validateNodeVersion(body.node_version) || '20',
    domain: validateDomain(body.domain) || null,
    ssl_enabled: body.ssl_enabled === '1' || body.ssl_enabled === true,
  };
  try {
    if (body.max_restarts !== undefined && body.max_restarts !== '' && body.max_restarts !== null) data.max_restarts = validateMaxRestarts(body.max_restarts);
  } catch (_) {}
  try {
    if (body.restart_delay !== undefined && body.restart_delay !== '' && body.restart_delay !== null) data.restart_delay = validateRestartDelay(body.restart_delay);
  } catch (_) {}
  return data;
}

appsRouter.post('/from-zip', upload.single('zip'), async (req, res, next) => {
  req.setTimeout(ZIP_UPLOAD_TIMEOUT_MS);
  const stream = req.query.stream === '1' || req.get('Accept') === 'application/x-ndjson';
  let zipPath = null;
  try {
    if (!req.file || !req.file.path) return res.status(400).json({ error: 'No .zip file uploaded' });
    zipPath = req.file.path;
    const body = req.body || {};
    let createData;
    try {
      createData = buildCreateDataFromBody(body, true);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Validation failed' });
    }
    const startAfterDeploy = body.start_after_deploy !== false && body.start_after_deploy !== '0';
    const app = db.createApp(createData);
    const send = stream
      ? async (obj) => {
          writeStreamLine(res, obj);
          await flushStream();
        }
      : () => {};
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders && res.flushHeaders();
    }
    try {
      await send({ step: 'extract', message: 'Extracting zip…' });
      appManager.extractZipToApp(app, zipPath);
      await send({ step: 'extract_done', message: 'Extract complete' });
      await send({ step: 'install', message: 'Running install…' });
      const installOut = appManager.runInstall(app);
      await send({ step: 'install_done', stdout: installOut.stdout || '', stderr: installOut.stderr || '' });
      if (app.build_cmd) {
        await send({ step: 'build', message: 'Running build…' });
        const buildOut = appManager.runBuild(app);
        await send({ step: 'build_done', stdout: buildOut.stdout || '', stderr: buildOut.stderr || '' });
      }
      let nginxResult = {};
      if (app.domain) {
        await send({ step: 'nginx', message: 'Configuring nginx…' });
        if (app.ssl_enabled) await send({ step: 'ssl', message: 'Obtaining SSL certificate…' });
        nginxResult = appManager.setupNginxAndReload(app);
        if (app.ssl_enabled) await send({ step: 'ssl_done', message: nginxResult.sslError ? 'SSL certificate could not be obtained' : 'SSL ready', sslError: nginxResult.sslError });
        await send({ step: 'nginx_done' });
      }
      if (startAfterDeploy) {
        await send({ step: 'start', message: 'Starting app…' });
        appManager.startApp(app);
        await send({ step: 'start_done' });
      } else {
        await send({ step: 'start_skipped', message: 'Skipped start (start after deploy disabled)' });
      }
      const finalApp = appToJson(db.getApp(app.id));
      try {
        db.addActivity(finalApp.id, finalApp.name, 'created');
      } catch (_) {}
      if (stream) {
        writeStreamLine(res, { done: true, app: finalApp, sslWarning: nginxResult.sslError || undefined });
        await flushStream();
        res.end();
      } else {
        res.status(201).json(finalApp);
      }
    } catch (e) {
      console.error('App setup error (from-zip):', e);
      db.deleteApp(app.id);
      try { appManager.deleteFromPm2(app); appManager.teardownNginx(app); } catch (_) {}
      try {
        const dir = appManager.appDir(app);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
      } catch (_) {}
      const errMsg = e.message || 'Setup failed';
      if (stream) {
        writeStreamLine(res, { error: errMsg });
        await flushStream();
        res.end();
      } else {
        return res.status(500).json({ error: errMsg });
      }
    }
  } catch (e) {
    if (!stream) return next(e);
    writeStreamLine(res, { error: e.message || 'Request failed' });
    await flushStream();
    res.end();
  } finally {
    if (zipPath && fs.existsSync(zipPath)) try { fs.unlinkSync(zipPath); } catch (_) {}
  }
});

appsRouter.post('/', async (req, res, next) => {
  const stream = req.query.stream === '1' || req.get('Accept') === 'application/x-ndjson';
  try {
    const data = req.body || {};
    let createData;
    try {
      const validated = validateAppInput(data, true);
      createData = {
        name: validated.name,
        repo_url: validated.repo_url,
        branch: validated.branch ?? null,
        install_cmd: validated.install_cmd ?? 'npm install',
        build_cmd: validated.build_cmd ?? null,
        start_cmd: validated.start_cmd ?? 'npm start',
        node_version: validated.node_version ?? '20',
        domain: validated.domain ?? null,
        ssl_enabled: validated.ssl_enabled ?? false,
        max_restarts: validated.max_restarts,
        restart_delay: validated.restart_delay,
      };
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Validation failed' });
    }
    const startAfterDeploy = req.body?.start_after_deploy !== false;
    const app = db.createApp(createData);
    const send = stream
      ? async (obj) => {
          writeStreamLine(res, obj);
          await flushStream();
        }
      : () => {};
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders && res.flushHeaders();
    }
    try {
      await send({ step: 'clone', message: 'Cloning repository…' });
      const { actualBranch } = appManager.cloneApp(app);
      if (actualBranch && actualBranch !== app.branch) {
        db.updateApp(app.id, { branch: actualBranch });
        app.branch = actualBranch;
      }
      await send({ step: 'clone_done', message: 'Repository ready' });

      await send({ step: 'install', message: 'Running install…' });
      const installOut = appManager.runInstall(app);
      await send({ step: 'install_done', stdout: installOut.stdout || '', stderr: installOut.stderr || '' });

      if (app.build_cmd) {
        await send({ step: 'build', message: 'Running build…' });
        const buildOut = appManager.runBuild(app);
        await send({ step: 'build_done', stdout: buildOut.stdout || '', stderr: buildOut.stderr || '' });
      }

      let nginxResult = {};
      if (app.domain) {
        await send({ step: 'nginx', message: 'Configuring nginx…' });
        if (app.ssl_enabled) await send({ step: 'ssl', message: 'Obtaining SSL certificate…' });
        nginxResult = appManager.setupNginxAndReload(app);
        if (app.ssl_enabled) await send({ step: 'ssl_done', message: nginxResult.sslError ? 'SSL certificate could not be obtained' : 'SSL ready', sslError: nginxResult.sslError });
        await send({ step: 'nginx_done' });
      }

      if (startAfterDeploy) {
        await send({ step: 'start', message: 'Starting app…' });
        appManager.startApp(app);
        await send({ step: 'start_done' });
      } else {
        await send({ step: 'start_skipped', message: 'Skipped start (start after deploy disabled)' });
      }

      const finalApp = appToJson(db.getApp(app.id));
      try {
        db.addActivity(finalApp.id, finalApp.name, 'created');
      } catch (_) {}
      if (stream) {
        writeStreamLine(res, { done: true, app: finalApp, sslWarning: nginxResult.sslError || undefined });
        await flushStream();
        res.end();
      } else {
        res.status(201).json(finalApp);
      }
    } catch (e) {
      console.error('App setup error:', e);
      db.deleteApp(app.id);
      try {
        appManager.deleteFromPm2(app);
        appManager.teardownNginx(app);
      } catch (_) {}
      try {
        const dir = appManager.appDir(app);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
      } catch (_) {}
      const errMsg = e.message || 'Setup failed';
      if (stream) {
        writeStreamLine(res, { error: errMsg });
        await flushStream();
        res.end();
      } else {
        return res.status(500).json({ error: errMsg });
      }
    }
  } catch (e) {
    if (!stream) return next(e);
    writeStreamLine(res, { error: e.message || 'Request failed' });
    await flushStream();
    res.end();
  }
});

appsRouter.put('/:id', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    let patch;
    try {
      patch = validateAppInput(req.body || {}, false);
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Validation failed' });
    }
    if (Object.keys(patch).length === 0) {
      return res.json(appToJson(db.getApp(app.id)));
    }
    const updated = db.updateApp(req.params.id, patch);
    try {
      appManager.setupNginxAndReload(updated);
    } catch (e) {
      console.error('Nginx reload failed:', e);
      return res.status(502).json({ error: 'Settings saved but nginx reload failed: ' + (e.message || 'unknown') });
    }
    res.json(appToJson(db.getApp(updated.id)));
  } catch (e) {
    next(e);
  }
});

appsRouter.delete('/:id', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const dir = appManager.appDir(app);
    const warnings = [];
    try {
      appManager.deleteFromPm2(app);
    } catch (e) {
      console.warn('Could not remove from PM2:', e.message);
      warnings.push('Could not remove from PM2: ' + (e.message || 'unknown'));
    }
    try {
      appManager.teardownNginx(app);
    } catch (e) {
      console.warn('Could not remove nginx config:', e.message);
      warnings.push('Could not remove nginx config: ' + (e.message || 'unknown'));
    }
    db.deleteApp(req.params.id);
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    } catch (e) {
      console.warn('Could not remove app directory:', dir, e.message);
      warnings.push('Could not remove app directory: ' + (e.message || 'unknown'));
    }
    try {
      db.addActivity(app.id, app.name, 'deleted');
    } catch (_) {}
    if (warnings.length > 0) {
      return res.json({ ok: true, warnings });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

appsRouter.post('/:id/start', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.withAppAction(app.id, () => {
      appManager.startApp(app);
    });
    try {
      db.addActivity(app.id, app.name, 'started');
    } catch (_) {}
    const pm2 = appManager.getPm2Status(app);
    res.json({ status: pm2.status, status_error: pm2.error || undefined });
  } catch (e) {
    if (e.code === 'APP_ACTION_BUSY') return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/stop', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.withAppAction(app.id, () => {
      appManager.stopApp(app);
    });
    try {
      db.addActivity(app.id, app.name, 'stopped');
    } catch (_) {}
    const pm2 = appManager.getPm2Status(app);
    res.json({ status: pm2.status, status_error: pm2.error || undefined });
  } catch (e) {
    if (e.code === 'APP_ACTION_BUSY') return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/restart', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.withAppAction(app.id, () => {
      appManager.restartApp(app);
    });
    try {
      db.addActivity(app.id, app.name, 'restarted');
    } catch (_) {}
    const pm2 = appManager.getPm2Status(app);
    res.json({ status: pm2.status, status_error: pm2.error || undefined });
  } catch (e) {
    if (e.code === 'APP_ACTION_BUSY') return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/reload', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.withAppAction(app.id, () => {
      appManager.reloadApp(app);
    });
    try {
      db.addActivity(app.id, app.name, 'reloaded');
    } catch (_) {}
    const pm2 = appManager.getPm2Status(app);
    res.json({ status: pm2.status, status_error: pm2.error || undefined });
  } catch (e) {
    if (e.code === 'APP_ACTION_BUSY') return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/install', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const out = appManager.runInstall(app);
    res.json({ ok: true, stdout: out.stdout || '', stderr: out.stderr || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/build', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const out = appManager.runBuild(app);
    res.json({ ok: true, stdout: out.stdout || '', stderr: out.stderr || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/pull', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const branch = req.body && req.body.branch !== undefined ? (req.body.branch === '' ? null : String(req.body.branch).trim()) : undefined;
    const updated = branch !== undefined ? db.updateApp(app.id, { branch: branch || null }) : db.getApp(app.id);
    const appToUse = { ...updated };
    if (branch !== undefined) appToUse.branch = branch;
    const { actualBranch } = appManager.cloneApp(appToUse);
    if (actualBranch && actualBranch !== (updated.branch || '')) {
      db.updateApp(app.id, { branch: actualBranch });
    }
    res.json(appToJson(db.getApp(app.id)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/redeploy', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const startAfter = req.body?.start_after !== false;
    const branch = req.body && req.body.branch !== undefined ? (req.body.branch === '' ? null : String(req.body.branch).trim()) : undefined;
    let current = branch !== undefined ? db.updateApp(app.id, { branch: branch || null }) : app;
    current = db.getApp(current.id);
    const appToUse = { ...current };
    if (branch !== undefined) appToUse.branch = branch;
    appManager.cloneApp(appToUse);
    const installOut = appManager.runInstall(current);
    if (current.build_cmd) appManager.runBuild(current);
    let deployWarning = null;
    if (startAfter) {
      try {
        appManager.restartApp(current);
      } catch (e) {
        try {
          appManager.startApp(current);
        } catch (e2) {
          deployWarning = 'Deployed but app could not be started: ' + (e2.message || 'unknown');
        }
      }
    }
    const finalApp = appToJson(db.getApp(current.id));
    if (deployWarning) finalApp.deploy_warning = deployWarning;
    res.json(finalApp);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.get('/:id/logs', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const lines = Math.min(Number(req.query.lines) || 100, 500);
    const logs = appManager.getLogs(app, lines);
    res.json({ logs });
  } catch (e) {
    next(e);
  }
});

appsRouter.get('/:id/logs/stream', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    const child = appManager.streamLogs(app, (chunk) => {
      if (res.writableEnded) return;
      const escaped = String(chunk).replace(/\n/g, '\ndata: ').trim();
      if (escaped) res.write('data: ' + escaped + '\n\n');
    });
    req.on('close', () => {
      try {
        child.kill('SIGTERM');
      } catch (_) {}
    });
    child.on('exit', () => {
      if (!res.writableEnded) res.end();
    });
  } catch (e) {
    if (!res.headersSent) next(e);
    else try { res.end(); } catch (_) {}
  }
});

appsRouter.get('/:id/env', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const env = appManager.readAppEnv(app);
    res.json({ env });
  } catch (e) {
    next(e);
  }
});

appsRouter.put('/:id/env', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const content = req.body && typeof req.body.env === 'string' ? req.body.env : '';
    appManager.writeAppEnv(app, content);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

appsRouter.post('/:id/env-and-restart', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const content = req.body && typeof req.body.env === 'string' ? req.body.env : '';
    appManager.writeAppEnv(app, content);
    appManager.withAppAction(app.id, () => {
      const pm2 = appManager.getPm2Status(app);
      if (pm2.status === 'running') {
        appManager.restartApp(app);
      } else {
        appManager.startApp(app);
      }
    });
    try {
      db.addActivity(app.id, app.name, 'restarted');
    } catch (_) {}
    const pm2 = appManager.getPm2Status(app);
    res.json({ ok: true, status: pm2.status, status_error: pm2.error || undefined });
  } catch (e) {
    if (e.code === 'APP_ACTION_BUSY') return res.status(409).json({ error: e.message });
    next(e);
  }
});

const MAX_READ_FILE_SIZE = 512 * 1024;

function resolveAppPath(app, relativePath) {
  const base = path.resolve(appManager.getAppDir(app));
  const raw = (relativePath || '').replace(/^\/*/, '');
  const resolved = path.normalize(path.join(base, raw));
  if (!resolved.startsWith(base) || resolved === base && raw !== '' && raw !== '.') {
    throw new Error('Path is outside app directory');
  }
  return resolved;
}

appsRouter.get('/:id/files', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const dirPath = resolveAppPath(app, req.query.path || '');
    if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Directory not found' });
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const base = appManager.getAppDir(app);
    const prefix = path.relative(base, dirPath) || '';
    const toSlash = (p) => p.split(path.sep).join('/');
    const list = entries.map((e) => {
      const full = path.join(dirPath, e.name);
      let size = 0;
      try {
        const s = fs.statSync(full);
        size = s.isFile() ? s.size : 0;
      } catch (_) {}
      const rel = prefix ? path.join(prefix, e.name) : e.name;
      return {
        name: e.name,
        path: toSlash(rel),
        isDirectory: e.isDirectory(),
        size,
      };
    }).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    res.json({ path: toSlash(prefix), entries: list });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

appsRouter.get('/:id/files/content', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const filePath = resolveAppPath(app, req.query.path || '');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });
    if (stat.size > MAX_READ_FILE_SIZE) return res.status(400).json({ error: 'File too large to view (max 512 KB)' });
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

appsRouter.put('/:id/files/content', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const filePath = resolveAppPath(app, req.body.path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });
    const content = typeof req.body.content === 'string' ? req.body.content : '';
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

appsRouter.post('/:id/files', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const rel = (req.body.path || '').trim().replace(/^\/*/, '');
    if (!rel || /\.\./.test(rel)) return res.status(400).json({ error: 'Invalid path' });
    const type = req.body.type === 'directory' ? 'directory' : 'file';
    const targetPath = resolveAppPath(app, rel);
    const base = appManager.getAppDir(app);
    if (!targetPath.startsWith(base) || targetPath === base) return res.status(400).json({ error: 'Invalid path' });
    if (fs.existsSync(targetPath)) return res.status(409).json({ error: 'Already exists' });
    if (type === 'directory') {
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(targetPath, typeof req.body.content === 'string' ? req.body.content : '', 'utf-8');
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

appsRouter.delete('/:id/files', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const filePath = resolveAppPath(app, req.query.path || '');
    const base = appManager.getAppDir(app);
    if (filePath === base || !filePath.startsWith(base)) return res.status(400).json({ error: 'Cannot delete app root' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

const ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz)$/i;

appsRouter.post('/:id/files/upload', (req, res, next) => {
  req.setTimeout(ZIP_UPLOAD_TIMEOUT_MS);
  fileExplorerUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 250 MB per file)' });
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    try {
      const app = db.getApp(req.params.id);
      if (!app) return res.status(404).json({ error: 'App not found' });
      const base = appManager.getAppDir(app);
      const relDir = (req.body.path || '').trim().replace(/^\/*/, '');
      const dirPath = resolveAppPath(app, relDir);
      if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Directory not found' });
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });
      const files = req.files || [];
      const uploaded = [];
      for (const file of files) {
        const name = path.basename((file.originalname || '').trim() || 'file');
        if (!name || name === '.' || name === '..' || name.includes('\0')) continue;
        const targetPath = path.join(dirPath, name);
        const resolvedTarget = path.resolve(targetPath);
        if (!resolvedTarget.startsWith(path.resolve(base))) continue;
        fs.writeFileSync(targetPath, file.buffer, 'binary');
        uploaded.push(name);
      }
      res.status(201).json({ ok: true, uploaded, count: uploaded.length });
    } catch (e) {
      if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
      next(e);
    }
  });
});

appsRouter.post('/:id/files/uncompress', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
    if (paths.length === 0) return res.status(400).json({ error: 'No paths provided' });
    const base = appManager.getAppDir(app);
    const results = [];
    for (const rel of paths) {
      const r = String(rel).trim().replace(/^\/*/, '');
      if (!r || /\.\./.test(r)) continue;
      const fullPath = resolveAppPath(app, r);
      if (!fs.existsSync(fullPath)) {
        results.push({ path: r, ok: false, error: 'Not found' });
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        results.push({ path: r, ok: false, error: 'Not a file' });
        continue;
      }
      const lower = fullPath.toLowerCase();
      const dir = path.dirname(fullPath);
      try {
        if (lower.endsWith('.zip')) {
          const zip = new AdmZip(fullPath);
          zip.extractAllTo(dir, true);
          results.push({ path: r, ok: true });
        } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
          const result = spawnSync(
            'tar',
            lower.endsWith('.tar') ? ['-xf', fullPath, '-C', dir] : ['-xzf', fullPath, '-C', dir],
            { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' }
          );
          if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'tar failed');
          results.push({ path: r, ok: true });
        } else {
          results.push({ path: r, ok: false, error: 'Unsupported format (use .zip, .tar, .tar.gz, .tgz)' });
        }
      } catch (e) {
        results.push({ path: r, ok: false, error: e.message || 'Extract failed' });
      }
    }
    res.json({ ok: true, results });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});

appsRouter.post('/:id/files/compress', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
    if (paths.length === 0) return res.status(400).json({ error: 'No paths provided' });
    const base = appManager.getAppDir(app);
    let archiveName = (req.body.archiveName || 'archive.zip').trim().replace(/^\/*/, '');
    if (!archiveName) archiveName = 'archive.zip';
    if (!archiveName.toLowerCase().endsWith('.zip')) return res.status(400).json({ error: 'Archive name must end with .zip' });
    const firstRel = String(paths[0]).trim().replace(/^\/*/, '');
    const firstFull = resolveAppPath(app, firstRel);
    const targetDir = path.dirname(firstFull);
    if (!targetDir.startsWith(path.resolve(base))) return res.status(400).json({ error: 'Invalid path' });
    const outPath = path.join(targetDir, path.basename(archiveName));
    const resolvedOut = path.resolve(outPath);
    if (!resolvedOut.startsWith(path.resolve(base))) return res.status(400).json({ error: 'Invalid archive path' });
    const zip = new AdmZip();
    for (const rel of paths) {
      const r = String(rel).trim().replace(/^\/*/, '');
      if (!r || /\.\./.test(r)) continue;
      const fullPath = resolveAppPath(app, r);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      const entryName = path.basename(fullPath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(fullPath, entryName);
      } else {
        zip.addLocalFile(fullPath, r);
      }
    }
    zip.writeZip(outPath);
    const toSlash = (p) => p.split(path.sep).join('/');
    res.json({ ok: true, path: toSlash(path.relative(base, outPath)) });
  } catch (e) {
    if (e.message && e.message.includes('outside')) return res.status(400).json({ error: e.message });
    next(e);
  }
});
