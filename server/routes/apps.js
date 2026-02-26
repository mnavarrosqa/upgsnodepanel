import { Router } from 'express';
import fs from 'fs';
import * as db from '../db.js';
import * as appManager from '../services/appManager.js';
import { validateAppInput } from '../lib/validate.js';

export const appsRouter = Router();

function appToJson(row) {
  if (!row) return null;
  return {
    ...row,
    ssl_enabled: Boolean(row.ssl_enabled),
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

appsRouter.post('/', async (req, res, next) => {
  try {
    const data = req.body || {};
    let createData;
    try {
      const validated = validateAppInput(data, true);
      createData = {
        name: validated.name,
        repo_url: validated.repo_url,
        branch: validated.branch ?? 'main',
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
    try {
      appManager.cloneApp(app);
      appManager.runInstall(app);
      if (app.build_cmd) appManager.runBuild(app);
      if (app.domain) {
        appManager.setupNginxAndReload(app);
      }
      appManager.startApp(app);
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
      return res.status(500).json({ error: e.message || 'Setup failed' });
    }
    res.status(201).json(appToJson(db.getApp(app.id)));
  } catch (e) {
    next(e);
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
    appManager.deleteFromPm2(app);
    appManager.teardownNginx(app);
    db.deleteApp(req.params.id);
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
