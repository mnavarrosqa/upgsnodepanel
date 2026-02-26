import { Router } from 'express';
import * as nodeManager from '../services/nodeManager.js';

export const nodeRouter = Router();

nodeRouter.get('/versions', (req, res, next) => {
  try {
    const versions = nodeManager.listVersions();
    res.json({ versions });
  } catch (e) {
    next(e);
  }
});

nodeRouter.post('/versions', (req, res, next) => {
  try {
    const { version } = req.body || {};
    if (!version) return res.status(400).json({ error: 'Version required' });
    const out = nodeManager.installVersion(version);
    res.json({ versions: out.versions, stdout: out.stdout || '', stderr: out.stderr || '' });
  } catch (e) {
    if (e.message === 'Invalid version format') {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({
      error: e.message || 'Install failed',
      stdout: e.stdout || '',
      stderr: e.stderr || '',
    });
  }
});
