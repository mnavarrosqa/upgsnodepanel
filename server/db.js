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

export function getNextPort() {
  const database = getDb();
  initSchema(database);
  const row = database.prepare('SELECT COALESCE(MAX(port), 2999) + 1 AS next FROM apps').get();
  return row.next;
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
  const port = data.port ?? getNextPort();
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
