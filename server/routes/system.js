import { Router } from 'express';
import { spawnSync } from 'child_process';
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
    } catch (_) {}
  }
  return total;
}

function getOwner(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const result = spawnSync('stat', ['-c', '%U', filePath], { encoding: 'utf-8' });
    if (result.status === 0 && result.stdout) return result.stdout.trim();
    return String(stat.uid);
  } catch (_) {
    return '—';
  }
}

function getNpmCachePath() {
  try {
    const { stdout } = run('npm config get cache', { withNvm: true });
    const p = (stdout || '').trim();
    return p && p !== 'undefined' ? p : null;
  } catch (_) {
    return (process.env.HOME || '/root') + '/.npm';
  }
}

function getMaintenanceOverview() {
  const options = MAINTENANCE_OPTIONS.map((opt) => ({ ...opt, size: 0, details: [] }));

  for (const opt of options) {
    if (opt.id === 'npm_cache') {
      const cachePath = getNpmCachePath();
      if (cachePath && fs.existsSync(cachePath)) {
        opt.size = dirSizeSync(cachePath);
        opt.details.push({
          path: cachePath,
          size: opt.size,
          owner: getOwner(cachePath),
          app: null,
        });
      }
    } else if (opt.id === 'pm2_logs') {
      const logsDir = path.join(PM2_ENV.PM2_HOME, 'logs');
      if (fs.existsSync(logsDir)) {
        const entries = fs.readdirSync(logsDir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isFile()) continue;
          const full = path.join(logsDir, e.name);
          try {
            const stat = fs.statSync(full);
            const appMatch = e.name.match(/^(.+?)-(out|err)\.log$/);
            opt.size += stat.size;
            opt.details.push({
              path: e.name,
              size: stat.size,
              owner: getOwner(full),
              app: appMatch ? appMatch[1] : null,
            });
          } catch (_) {}
        }
      }
    } else if (opt.id === 'temp_uploads') {
      const tmpDir = os.tmpdir();
      const entries = fs.readdirSync(tmpDir, { withFileTypes: true }).filter(
        (e) => e.isFile() && e.name.startsWith('upgs-upload-') && e.name.toLowerCase().endsWith('.zip')
      );
      for (const e of entries) {
        const full = path.join(tmpDir, e.name);
        try {
          const stat = fs.statSync(full);
          opt.size += stat.size;
          opt.details.push({
            path: full,
            size: stat.size,
            owner: getOwner(full),
            app: null,
          });
        } catch (_) {}
      }
    }
  }

  return options;
}

function getServerIp() {
  try {
    const { stdout } = run('curl -s -4 ifconfig.co 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null', {});
    return (stdout || '').trim() || null;
  } catch (_) {
    return null;
  }
}

function getSystemInfo() {
  const info = {
    hostname: os.hostname(),
    ip: getServerIp(),
    memory: null,
    swap: null,
    disk: null,
  };

  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    info.memory = {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
    };
  } catch (_) {}

  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => {
      const m = raw.match(new RegExp(`${key}:\\s*(\\d+)`, 'm'));
      return m ? parseInt(m[1], 10) * 1024 : 0;
    };
    const swapTotal = get('SwapTotal');
    const swapFree = get('SwapFree');
    if (swapTotal >= 0 && swapFree >= 0) {
      info.swap = {
        total: swapTotal,
        free: swapFree,
        used: swapTotal - swapFree,
      };
    }
  } catch (_) {}

  try {
    const stat = fs.statfsSync(process.platform === 'win32' ? 'C:\\' : '/');
    const blockSize = stat.frsize || stat.bsize || 512;
    const total = (stat.blocks || 0) * blockSize;
    const free = (stat.bfree || 0) * blockSize;
    const avail = (stat.bavail != null ? stat.bavail : stat.bfree || 0) * blockSize;
    if (total > 0) {
      info.disk = {
        total,
        free,
        available: avail,
        used: total - free,
      };
    }
  } catch (_) {}

  return info;
}

systemRouter.get('/info', (req, res, next) => {
  try {
    res.json(getSystemInfo());
  } catch (e) {
    next(e);
  }
});

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
    const options = getMaintenanceOverview();
    res.json({ options });
  } catch (e) {
    next(e);
  }
});

/** Returns the server's SSH public key for use as a deploy key (git clone via SSH). */
systemRouter.get('/ssh-public-key', (req, res, next) => {
  try {
    const home = process.env.HOME || '/root';
    const sshDir = path.join(home, '.ssh');
    const keyFiles = ['id_ed25519.pub', 'id_rsa.pub'];
    for (const name of keyFiles) {
      const filePath = path.join(sshDir, name);
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8').trim();
          if (content && !content.includes('\n')) {
            return res.json({ publicKey: content });
          }
        }
      } catch (_) {}
    }
    res.json({
      publicKey: null,
      error: 'No SSH key found. Generate one below.',
    });
  } catch (e) {
    next(e);
  }
});

/** Generates an SSH key on the server if none exists, then returns the public key. */
systemRouter.post('/ssh-public-key/generate', (req, res, next) => {
  try {
    const home = process.env.HOME || '/root';
    const sshDir = path.join(home, '.ssh');
    const keyPath = path.join(sshDir, 'id_ed25519');
    const pubPath = path.join(sshDir, 'id_ed25519.pub');

    if (fs.existsSync(pubPath)) {
      const content = fs.readFileSync(pubPath, 'utf8').trim();
      if (content && !content.includes('\n')) {
        return res.json({ publicKey: content });
      }
    }
    if (fs.existsSync(path.join(sshDir, 'id_rsa.pub'))) {
      const content = fs.readFileSync(path.join(sshDir, 'id_rsa.pub'), 'utf8').trim();
      if (content && !content.includes('\n')) {
        return res.json({ publicKey: content });
      }
    }

    try {
      fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    } catch (e) {
      return res.status(500).json({ error: 'Could not create .ssh directory: ' + (e.message || 'Permission denied') });
    }

    try {
      run(`ssh-keygen -t ed25519 -N "" -f "${keyPath}"`, {});
    } catch (e) {
      return res.status(500).json({ error: e.message || 'ssh-keygen failed' });
    }

    if (!fs.existsSync(pubPath)) {
      return res.status(500).json({ error: 'Key was generated but public file not found' });
    }
    const content = fs.readFileSync(pubPath, 'utf8').trim();
    if (!content || content.includes('\n')) {
      return res.status(500).json({ error: 'Invalid public key file' });
    }
    res.json({ publicKey: content });
  } catch (e) {
    next(e);
  }
});

function getSizeBeforeClean(id) {
  if (id === 'npm_cache') {
    const cachePath = getNpmCachePath();
    return cachePath && fs.existsSync(cachePath) ? dirSizeSync(cachePath) : 0;
  }
  if (id === 'pm2_logs') {
    const logsDir = path.join(PM2_ENV.PM2_HOME, 'logs');
    return fs.existsSync(logsDir) ? dirSizeSync(logsDir) : 0;
  }
  if (id === 'temp_uploads') {
    const tmpDir = os.tmpdir();
    let total = 0;
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.startsWith('upgs-upload-') && e.name.toLowerCase().endsWith('.zip')) {
        try {
          total += fs.statSync(path.join(tmpDir, e.name)).size;
        } catch (_) {}
      }
    }
    return total;
  }
  return 0;
}

systemRouter.post('/maintenance/clean', (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const allowed = new Set(MAINTENANCE_OPTIONS.map((o) => o.id));
    const toRun = items.filter((id) => allowed.has(id));
    const results = [];

    for (const id of toRun) {
      const sizeBefore = getSizeBeforeClean(id);
      try {
        if (id === 'npm_cache') {
          run('npm cache clean --force', { withNvm: true });
          results.push({ id, ok: true, message: 'npm cache cleared.', freed: sizeBefore });
        } else if (id === 'pm2_logs') {
          runPm2(['flush'], { env: PM2_ENV });
          results.push({ id, ok: true, message: 'PM2 logs flushed.', freed: sizeBefore });
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
          results.push({ id, ok: true, message: `Removed ${removed} temporary zip file(s).`, freed: sizeBefore });
        }
      } catch (e) {
        results.push({ id, ok: false, message: e.message || 'Clean failed.', freed: 0 });
      }
    }

    res.json({ results });
  } catch (e) {
    next(e);
  }
});
