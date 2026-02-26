import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import dns from 'dns/promises';
import { run, runGit, runPm2 } from '../lib/exec.js';

export const systemRouter = Router();

const PM2_ENV = {
  ...process.env,
  HOME: process.env.HOME || '/root',
  PM2_HOME: process.env.PM2_HOME || (process.env.HOME || '/root') + '/.pm2',
};

const MAINTENANCE_OPTIONS = [
  {
    id: 'npm_cache',
    label: 'npm cache',
    description: 'Clear the global npm cache (downloaded packages). Safe; packages will be re-downloaded when needed.',
  },
  {
    id: 'pm2_logs',
    label: 'PM2 logs',
    description: 'Flush PM2 log files (out/err logs for all processes). Does not affect running apps.',
  },
  {
    id: 'temp_uploads',
    label: 'Temporary zip uploads',
    description: 'Remove leftover .zip files from app creation uploads in the system temp directory.',
  },
];

function getServerIp() {
  try {
    const { stdout } = run('curl -s -4 ifconfig.co 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null', {});
    return (stdout || '').trim() || null;
  } catch (_) {
    return null;
  }
}

systemRouter.get('/ip', (req, res, next) => {
  try {
    const ip = getServerIp();
    res.json({ ip: ip || null });
  } catch (e) {
    next(e);
  }
});

systemRouter.get('/check-domain', async (req, res, next) => {
  try {
    const domain = (req.query.domain || '').toString().trim().toLowerCase();
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }
    if (/[\s/\\:#]/.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain' });
    }
    let addresses = [];
    try {
      addresses = await dns.resolve4(domain);
    } catch (e) {
      return res.json({
        ok: false,
        resolves: false,
        message: e.code === 'ENOTFOUND' ? 'Domain does not resolve' : (e.message || 'Lookup failed'),
      });
    }
    const serverIp = getServerIp();
    const matches = serverIp && addresses.includes(serverIp);
    return res.json({
      ok: true,
      resolves: true,
      addresses,
      serverIp: serverIp || null,
      matches: !!matches,
      message: !serverIp
        ? 'Domain resolves (server IP unknown)'
        : matches
          ? `Domain points to this server (${serverIp})`
          : `Domain resolves to ${addresses.join(', ')} (this server: ${serverIp})`,
    });
  } catch (e) {
    next(e);
  }
});

systemRouter.get('/default-branch', (req, res, next) => {
  try {
    const url = (req.query.url || '').toString().trim();
    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!/^https?:/.test(url) || /[\s;|&$`'"]/.test(url)) {
      return res.status(400).json({ error: 'Invalid repository URL' });
    }
    let branch = null;
    try {
      const { stdout } = runGit(['ls-remote', '--symref', url, 'HEAD'], {});
      const match = (stdout || '').match(/ref:\s*refs\/heads\/(\S+)/);
      if (match) branch = match[1].trim();
    } catch (_) {}
    if (!branch) {
      try {
        const { stdout: outMain } = runGit(['ls-remote', url, 'refs/heads/main'], {});
        if (outMain && outMain.trim()) branch = 'main';
      } catch (_) {}
    }
    if (!branch) {
      try {
        const { stdout: outMaster } = runGit(['ls-remote', url, 'refs/heads/master'], {});
        if (outMaster && outMaster.trim()) branch = 'master';
      } catch (_) {}
    }
    if (!branch) return res.status(404).json({ error: 'Could not detect default branch' });
    res.json({ branch });
  } catch (e) {
    next(e);
  }
});

systemRouter.get('/maintenance', (req, res, next) => {
  try {
    res.json({ options: MAINTENANCE_OPTIONS });
  } catch (e) {
    next(e);
  }
});

systemRouter.post('/maintenance/clean', (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const allowed = new Set(MAINTENANCE_OPTIONS.map((o) => o.id));
    const toRun = items.filter((id) => allowed.has(id));
    const results = [];

    for (const id of toRun) {
      try {
        if (id === 'npm_cache') {
          run('npm cache clean --force', { withNvm: true });
          results.push({ id, ok: true, message: 'npm cache cleared.' });
        } else if (id === 'pm2_logs') {
          runPm2(['flush'], { env: PM2_ENV });
          results.push({ id, ok: true, message: 'PM2 logs flushed.' });
        } else if (id === 'temp_uploads') {
          const tmpDir = os.tmpdir();
          const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
          let removed = 0;
          for (const e of entries) {
            if (e.isFile() && e.name.startsWith('upgs-upload-') && e.name.toLowerCase().endsWith('.zip')) {
              try {
                fs.unlinkSync(path.join(tmpDir, e.name));
                removed++;
              } catch (_) {}
            }
          }
          results.push({ id, ok: true, message: `Removed ${removed} temporary zip file(s).` });
        }
      } catch (e) {
        results.push({ id, ok: false, message: e.message || 'Clean failed.' });
      }
    }

    res.json({ results });
  } catch (e) {
    next(e);
  }
});
