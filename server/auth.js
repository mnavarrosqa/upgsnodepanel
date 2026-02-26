import { Router } from 'express';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAM_HELPER = path.join(__dirname, 'lib', 'auth-pam');

let pamAuthenticatePromise = null;
if (fs.existsSync(PAM_HELPER) && fs.statSync(PAM_HELPER).mode & 0o111) {
  // Use compiled PAM helper (preferred, no npm native module needed)
  pamAuthenticatePromise = (opts) => {
    const result = spawnSync(PAM_HELPER, [], {
      encoding: 'utf8',
      env: { ...process.env, PAM_USER: opts.username, PAM_PASSWORD: opts.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) throw new Error('auth failed');
  };
} else {
  try {
    const pam = await import('node-linux-pam');
    const mod = pam.default || pam;
    pamAuthenticatePromise = mod.pamAuthenticatePromise || (mod.pamAuthenticate && ((opts) => new Promise((resolve, reject) => {
      mod.pamAuthenticate(opts, (err) => (err ? reject(err) : resolve()));
    })));
  } catch (_) {}
}

const SKIP_PAM = process.env.SKIP_PAM === '1' || process.env.SKIP_PAM === 'true';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (!SKIP_PAM) {
      if (!pamAuthenticatePromise) {
        return res.status(503).json({
          error: 'PAM authentication not available. Run the installer again so the PAM helper is compiled.',
        });
      }
      try {
        await (Promise.resolve(pamAuthenticatePromise({ username, password })));
      } catch (err) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = username;
      res.json({ user: username });
    });
  } catch (err) {
    if (err.message && err.message.includes('auth')) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

authRouter.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ error: 'Not authenticated' });
});

export function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}
