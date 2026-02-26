import { Router } from 'express';
import dns from 'dns/promises';
import { run, runGit } from '../lib/exec.js';

export const systemRouter = Router();

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
