import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { run } from '../lib/exec.js';

// Must be a directory that nginx includes (e.g. conf.d). Files are named upgs-node-app-{id}.conf.
const NGINX_APPS_DIR = process.env.NGINX_APPS_CONF_DIR || '/etc/nginx/conf.d';
const NGINX_BIN = process.env.NGINX_BIN || '/usr/sbin/nginx';
const LETSENCRYPT_BASE = '/etc/letsencrypt/live';

function ensureDir() {
  try {
    fs.mkdirSync(NGINX_APPS_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create nginx apps dir:', e.message);
  }
}

function appConfPath(id) {
  return path.join(NGINX_APPS_DIR, `upgs-node-app-${id}.conf`);
}

function certPath(domain) {
  return path.join(LETSENCRYPT_BASE, domain, 'fullchain.pem');
}

function keyPath(domain) {
  return path.join(LETSENCRYPT_BASE, domain, 'privkey.pem');
}

export function certsExist(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const d = domain.trim();
  return d.length > 0 && fs.existsSync(certPath(d)) && fs.existsSync(keyPath(d));
}

/** Run certbot to obtain a certificate for the domain. Requires nginx to already have an HTTP server block for this domain. */
export function obtainCert(domain) {
  const d = (domain || '').trim();
  if (!d) throw new Error('Domain required for SSL');
  const certbot = process.env.CERTBOT_BIN || '/usr/bin/certbot';
  const args = ['certonly', '--nginx', '-d', d, '--non-interactive', '--agree-tos'];
  const email = process.env.LETSENCRYPT_EMAIL || process.env.CERTBOT_EMAIL;
  if (email) args.push('--email', email);
  else args.push('--register-unsafely-without-email');
  const result = spawnSync(certbot, args, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0) {
    const err = new Error(result.stderr || result.stdout || 'Certbot failed');
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    throw err;
  }
}

export function writeAppConfig(app, forceHttpOnly = false) {
  ensureDir();
  const { id, domain, port, ssl_enabled } = app;
  const confPath = appConfPath(id);
  if (!domain) {
    if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
    return;
  }
  const serverName = domain.trim();
  const hasSsl = !forceHttpOnly && ssl_enabled && certsExist(serverName);
  const comment = `# UPGS Node Panel - app ${id} - ${serverName}\n`;
  let content = '';
  if (hasSsl) {
    content = comment + `
server {
  listen 80;
  server_name ${serverName};
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  server_name ${serverName};
  ssl_certificate ${certPath(serverName)};
  ssl_certificate_key ${keyPath(serverName)};
  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
`;
  } else {
    content = comment + `
server {
  listen 80;
  server_name ${serverName};
  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
`;
  }
  fs.writeFileSync(confPath, content.trim());
}

export function removeAppConfig(id) {
  const confPath = appConfPath(id);
  try {
    if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
  } catch (e) {
    console.warn('Could not remove nginx config:', e.message);
  }
}

export function reloadNginx() {
  try {
    run(`${NGINX_BIN} -t`, {});
    run(`${NGINX_BIN} -s reload`, {});
  } catch (e) {
    console.warn('Nginx reload failed:', e.message);
    throw e;
  }
}
