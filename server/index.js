import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import session from 'express-session';
import { authRouter, requireAuth } from './auth.js';
import { nodeRouter } from './routes/node.js';
import { appsRouter } from './routes/apps.js';
import { systemRouter } from './routes/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PANEL_PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'upgs-panel-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

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

app.listen(PORT, () => {
  console.log(`UPGS Node Panel listening on port ${PORT}`);
});
