import { Router } from 'express';
import fs from 'fs';
import * as db from '../db.js';
import * as appManager from '../services/appManager.js';
import * as nginx from '../services/nginx.js';
import { validateAppInput } from '../lib/validate.js';

export const appsRouter = Router();

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

function writeStreamLine(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

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
    appManager.runInstall(app);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

appsRouter.post('/:id/build', (req, res, next) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    appManager.runBuild(app);
    res.json({ ok: true });
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
