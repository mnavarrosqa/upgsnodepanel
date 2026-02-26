import { Router } from 'express';

let pamAuthenticatePromise = null;
try {
  const pam = await import('node-linux-pam');
  const mod = pam.default || pam;
  pamAuthenticatePromise = mod.pamAuthenticatePromise || (mod.pamAuthenticate && ((opts) => new Promise((resolve, reject) => {
    mod.pamAuthenticate(opts, (err) => (err ? reject(err) : resolve()));
  })));
} catch (_) {
  // PAM not available (e.g. non-Linux or build failed)
}

const SKIP_PAM = process.env.SKIP_PAM === '1' || process.env.SKIP_PAM === 'true';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    let ok = false;
    if (SKIP_PAM) {
      ok = true;
    } else if (pamAuthenticatePromise) {
      await pamAuthenticatePromise({ username, password });
      ok = true;
    } else {
      return res.status(503).json({ error: 'PAM authentication not available on this system' });
    }
    if (ok) {
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = username;
        res.json({ user: username });
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
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
