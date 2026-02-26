import { EventEmitter } from 'events';
import { getDb } from '../db.js';

/**
 * SQLite session store for express-session (production).
 * Uses the same DB as the panel; sessions table is created in db.js initSchema.
 * Extends EventEmitter so express-session can call store.on('disconnect', ...).
 */
export class SqliteSessionStore extends EventEmitter {
  constructor() {
    super();
    this.db = getDb();
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
      const row = this.db.prepare('SELECT session FROM sessions WHERE sid = ? AND expires > ?').get(sid, now);
      if (row) return callback(null, JSON.parse(row.session));
      callback();
    } catch (e) {
      callback(e);
    }
  }

  set(sid, session, callback) {
    try {
      const expires = session.cookie?.expires
        ? (session.cookie.expires instanceof Date ? session.cookie.expires.getTime() : session.cookie.expires)
        : Date.now() + 24 * 60 * 60 * 1000;
      this.db.prepare(
        'INSERT OR REPLACE INTO sessions (sid, session, expires) VALUES (?, ?, ?)'
      ).run(sid, JSON.stringify(session), expires);
      callback();
    } catch (e) {
      callback(e);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback();
    } catch (e) {
      callback(e);
    }
  }

  touch(sid, session, callback) {
    this.set(sid, session, callback);
  }

  regenerate(req, callback) {
    this.destroy(req.sessionID, (err) => {
      if (typeof this.generate === 'function') this.generate(req);
      callback(err);
    });
  }
}
