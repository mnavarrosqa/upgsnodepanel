import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import session from 'express-session';
import { SqliteSessionStore } from './lib/sessionStore.js';
import { authRouter, requireAuth } from './auth.js';
import { nodeRouter } from './routes/node.js';
import * as db from './db.js';
import { appsRouter } from './routes/apps.js';
import { systemRouter } from './routes/system.js';
import * as nginx from './services/nginx.js';

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PANEL_PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const useSecureCookie = process.env.PANEL_HTTPS === '1' || process.env.PANEL_HTTPS === 'true';
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'upgs-panel-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: useSecureCookie,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
};
if (isProduction) {
  try {
    const store = new SqliteSessionStore();
    if (typeof store.on !== 'function') store.on = () => store;
    sessionConfig.store = store;
  } catch (err) {
    console.error('SqliteSessionStore failed, using default session store:', err.message);
  }
}
app.use(session(sessionConfig));

app.use('/api', authRouter);
app.use('/api/node', requireAuth, nodeRouter);
app.use('/api/apps', requireAuth, appsRouter);
app.use('/api/system', requireAuth, systemRouter);

if (isProduction) {
  const staticDir = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(staticDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
} else {
  app.get('/api/health', (req, res) => res.json({ ok: true }));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// On startup, write all app vhosts so domain configs are in sync (e.g. after .env path change)
// Preserve SSL block when the app already has one (panel user may not be able to read /etc/letsencrypt)
if (isProduction) {
  try {
    const apps = db.listApps();
    const withDomain = apps.filter((a) => a.domain && String(a.domain).trim());
    if (withDomain.length > 0) {
      const dir = process.env.NGINX_APPS_CONF_DIR || '/etc/nginx/conf.d';
      for (const a of withDomain) {
        const forceSsl = Boolean(a.ssl_enabled && nginx.appConfigHasSsl(a.id));
        nginx.writeAppConfig(a, false, forceSsl);
      }
      nginx.reloadNginx();
      console.log(`Nginx: wrote ${withDomain.length} app vhost(s) to ${dir}`);
    }
  } catch (e) {
    console.error('Nginx app config sync at startup failed:', e.message);
    if (e.stack) console.error(e.stack);
  }
}

app.listen(PORT, () => {
  console.log(`UPGS Node Panel listening on port ${PORT}`);
});
