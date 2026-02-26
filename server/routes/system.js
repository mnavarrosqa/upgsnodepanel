import { Router } from 'express';
import { run } from '../lib/exec.js';

export const systemRouter = Router();

systemRouter.get('/ip', (req, res, next) => {
  try {
    try {
      const { stdout } = run('curl -s -4 ifconfig.co 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null', {});
      const ip = (stdout || '').trim();
      if (ip) return res.json({ ip });
    } catch (_) {}
    res.json({ ip: null });
  } catch (e) {
    next(e);
  }
});
