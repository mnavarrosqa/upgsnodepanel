import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import * as db from '../db.js';
import * as appManager from '../services/appManager.js';
import * as nginx from '../services/nginx.js';
import { validateAppInput, validateName, validateDomain, validateCommand, validateNodeVersion, validateRepoUrl, validateRef } from '../lib/validate.js';

export const appsRouter = Router();

const ZIP_MAX_SIZE = 250 * 1024 * 1024; // 250MB
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

function appToJson(row) {
  if (!row) return null;
  const domain = row.domain && String(row.domain).trim();
  const sslEnabled = Boolean(row.ssl_enabled);
  const sslActive = sslEnabled && domain && nginx.certsExist(domain);
  return {
    ...row,
    ssl_enabled: sslEnabled,
    ssl_active: sslActive,
    status: appManager.getPm2Status(row),
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

function buildCreateDataFromBody(body, isZip = false) {
  const name = validateName(body.name);
  if (!name) throw new Error('name is required');
  return {
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
    const app = db.createApp(createData);
    const send = (obj) => stream && writeStreamLine(res, obj);
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders && res.flushHeaders();
    }
    try {
      send({ step: 'extract', message: 'Extracting zip…' });
      appManager.extractZipToApp(app, zipPath);
      send({ step: 'extract_done', message: 'Extract complete' });
      send({ step: 'install', message: 'Running install…' });
      const installOut = appManager.runInstall(app);
      send({ step: 'install_done', stdout: installOut.stdout || '', stderr: installOut.stderr || '' });
      if (app.build_cmd) {
        send({ step: 'build', message: 'Running build…' });
        const buildOut = appManager.runBuild(app);
        send({ step: 'build_done', stdout: buildOut.stdout || '', stderr: buildOut.stderr || '' });
      }
      let nginxResult = {};
      if (app.domain) {
        send({ step: 'nginx', message: 'Configuring nginx…' });
        if (app.ssl_enabled) send({ step: 'ssl', message: 'Obtaining SSL certificate…' });
        nginxResult = appManager.setupNginxAndReload(app);
        if (app.ssl_enabled) send({ step: 'ssl_done', message: nginxResult.sslError ? 'SSL certificate could not be obtained' : 'SSL ready', sslError: nginxResult.sslError });
        send({ step: 'nginx_done' });
      }
      send({ step: 'start', message: 'Starting app…' });
      appManager.startApp(app);
      send({ step: 'start_done' });
      const finalApp = appToJson(db.getApp(app.id));
      if (stream) {
        writeStreamLine(res, { done: true, app: finalApp, sslWarning: nginxResult.sslError || undefined });
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
      if (stream) { writeStreamLine(res, { error: errMsg }); res.end(); } else { return res.status(500).json({ error: errMsg }); }
    }
  } catch (e) {
    if (!stream) return next(e);
    writeStreamLine(res, { error: e.message || 'Request failed' });
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
      };
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Validation failed' });
    }
    const app = db.createApp(createData);
    const send = (obj) => stream && writeStreamLine(res, obj);
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders && res.flushHeaders();
    }
    try {
      send({ step: 'clone', message: 'Cloning repository…' });
      const { actualBranch } = appManager.cloneApp(app);
      if (actualBranch && actualBranch !== app.branch) {
        db.updateApp(app.id, { branch: actualBranch });
        app.branch = actualBranch;
      }
      send({ step: 'clone_done', message: 'Repository ready' });

      send({ step: 'install', message: 'Running install…' });
      const installOut = appManager.runInstall(app);
      send({ step: 'install_done', stdout: installOut.stdout || '', stderr: installOut.stderr || '' });

      if (app.build_cmd) {
        send({ step: 'build', message: 'Running build…' });
        const buildOut = appManager.runBuild(app);
        send({ step: 'build_done', stdout: buildOut.stdout || '', stderr: buildOut.stderr || '' });
      }

      let nginxResult = {};
      if (app.domain) {
        send({ step: 'nginx', message: 'Configuring nginx…' });
        if (app.ssl_enabled) send({ step: 'ssl', message: 'Obtaining SSL certificate…' });
        nginxResult = appManager.setupNginxAndReload(app);
        if (app.ssl_enabled) send({ step: 'ssl_done', message: nginxResult.sslError ? 'SSL certificate could not be obtained' : 'SSL ready', sslError: nginxResult.sslError });
        send({ step: 'nginx_done' });
      }

      send({ step: 'start', message: 'Starting app…' });
      appManager.startApp(app);
      send({ step: 'start_done' });

      const finalApp = appToJson(db.getApp(app.id));
      if (stream) {
        writeStreamLine(res, { done: true, app: finalApp, sslWarning: nginxResult.sslError || undefined });
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
        res.end();
      } else {
        return res.status(500).json({ error: errMsg });
      }
    }
  } catch (e) {
    if (!stream) return next(e);
    writeStreamLine(res, { error: e.message || 'Request failed' });
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
    appManager.deleteFromPm2(app);
    appManager.teardownNginx(app);
    db.deleteApp(req.params.id);
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    } catch (err) {
      console.warn('Could not remove app directory:', dir, err.message);
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
    appManager.startApp(app);
    res.json({ status: appManager.getPm2Status(app) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/stop', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.stopApp(app);
    res.json({ status: appManager.getPm2Status(app) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/restart', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.restartApp(app);
    res.json({ status: appManager.getPm2Status(app) });
  } catch (e) {
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
    const branch = req.body && req.body.branch !== undefined ? (req.body.branch === '' ? null : String(req.body.branch).trim()) : undefined;
    let current = branch !== undefined ? db.updateApp(app.id, { branch: branch || null }) : app;
    current = db.getApp(current.id);
    const appToUse = { ...current };
    if (branch !== undefined) appToUse.branch = branch;
    appManager.cloneApp(appToUse);
    const installOut = appManager.runInstall(current);
    if (current.build_cmd) appManager.runBuild(current);
    appManager.restartApp(current);
    res.json(appToJson(db.getApp(current.id)));
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
