import fs from 'fs';
import path from 'path';
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

export function writeAppConfig(app) {
  ensureDir();
  const { id, domain, port, ssl_enabled } = app;
  const confPath = appConfPath(id);
  if (!domain) {
    if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
    return;
  }
  const serverName = domain.trim();
  const hasSsl = ssl_enabled && fs.existsSync(certPath(serverName)) && fs.existsSync(keyPath(serverName));
  let content = '';
  if (hasSsl) {
    content = `
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
    content = `
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
