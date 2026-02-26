import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'panel.db');

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      session TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      repo_url TEXT NOT NULL,
      branch TEXT DEFAULT 'main',
      install_cmd TEXT DEFAULT 'npm install',
      build_cmd TEXT,
      start_cmd TEXT DEFAULT 'npm start',
      node_version TEXT DEFAULT '20',
      port INTEGER NOT NULL UNIQUE,
      domain TEXT,
      ssl_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function initDb() {
  const database = getDb();
  initSchema(database);
  return database;
}

const APP_PORT_MIN = Number(process.env.APP_PORT_MIN) || 3001;
const APP_PORT_MAX = Number(process.env.APP_PORT_MAX) || 65535;
const PANEL_PORT = Number(process.env.PANEL_PORT) || 3000;

/**
 * Returns a random port in [APP_PORT_MIN, APP_PORT_MAX] that is not used by
 * the panel or any existing app. Avoids collisions with already allocated ports.
 */
export function getAvailablePort() {
  const database = getDb();
  initSchema(database);
  const used = new Set([PANEL_PORT]);
  const rows = database.prepare('SELECT port FROM apps').all();
  for (const row of rows) used.add(row.port);
  const min = Math.max(APP_PORT_MIN, 1);
  const max = Math.min(APP_PORT_MAX, 65535);
  const range = max - min + 1;
  let tries = Math.min(range, 5000);
  while (tries-- > 0) {
    const port = min + Math.floor(Math.random() * range);
    if (!used.has(port)) return port;
  }
  throw new Error('Could not find an available port');
}

export function listApps() {
  const database = getDb();
  return database.prepare('SELECT * FROM apps ORDER BY created_at DESC').all();
}

export function getApp(id) {
  const database = getDb();
  return database.prepare('SELECT * FROM apps WHERE id = ?').get(Number(id));
}

export function createApp(data) {
  const database = getDb();
  initSchema(database);
  const port = data.port ?? getAvailablePort();
  const stmt = database.prepare(`
    INSERT INTO apps (name, repo_url, branch, install_cmd, build_cmd, start_cmd, node_version, port, domain, ssl_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.repo_url,
    data.branch || 'main',
    data.install_cmd || 'npm install',
    data.build_cmd || null,
    data.start_cmd || 'npm start',
    data.node_version || '20',
    port,
    data.domain || null,
    data.ssl_enabled ? 1 : 0
  );
  return getApp(result.lastInsertRowid);
}

export function updateApp(id, data) {
  const database = getDb();
  const allowed = ['name', 'repo_url', 'branch', 'install_cmd', 'build_cmd', 'start_cmd', 'node_version', 'domain', 'ssl_enabled'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      if (key === 'ssl_enabled') {
        updates.push(`${key} = ?`);
        values.push(data[key] ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
  }
  if (updates.length === 0) return getApp(id);
  updates.push("updated_at = datetime('now')");
  values.push(Number(id));
  database.prepare(`UPDATE apps SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getApp(id);
}

export function deleteApp(id) {
  const database = getDb();
  database.prepare('DELETE FROM apps WHERE id = ?').run(Number(id));
}

export { getDb };
