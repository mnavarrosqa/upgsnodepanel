import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { run } from '../lib/exec.js';

// Must be a directory that nginx includes (e.g. conf.d or upgs-node-apps.d). Files are named upgs-node-app-{id}.conf.
const NGINX_APPS_DIR = process.env.NGINX_APPS_CONF_DIR || '/etc/nginx/conf.d';
const NGINX_BIN = process.env.NGINX_BIN || '/usr/sbin/nginx';
const LETSENCRYPT_BASE = '/etc/letsencrypt/live';

/** True if the process is running as root (needed for nginx reload / certbot without sudo). */
function isRoot() {
  if (typeof process.getuid !== 'function') return true;
  return process.getuid() === 0;
}

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

/** True if the app's nginx vhost file contains an SSL server block (so badge shows active when panel user cannot read /etc/letsencrypt). */
export function appConfigHasSsl(id) {
  if (id == null || id === '') return false;
  const confPath = appConfPath(id);
  try {
    if (!fs.existsSync(confPath)) return false;
    const content = fs.readFileSync(confPath, 'utf-8');
    return /listen\s+443\s+ssl/.test(content) && /ssl_certificate\s+/.test(content);
  } catch {
    return false;
  }
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
  if (d.length === 0) return false;
  try {
    return fs.existsSync(certPath(d)) && fs.existsSync(keyPath(d));
  } catch {
    return false;
  }
}

/** Extract a short, actionable error message from certbot stdout+stderr (avoids generic "see the logfile" line). */
function certbotErrorMessage(stdout, stderr) {
  const raw = [stderr, stdout].filter(Boolean).join('\n').trim();
  if (!raw) return 'Certbot failed';
  const generic = /see the logfile|re-run certbot with -v|ask for help or search/i;
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    if (generic.test(line)) continue;
    if (/error|failed|refused|timeout|nxdomain|problem|unable|invalid|denied|no valid ip/i.test(line)) {
      return line.length > 200 ? line.slice(0, 197) + '...' : line;
    }
  }
  const first = lines.find((l) => l.length > 0 && l.length < 250 && !generic.test(l));
  return first || 'Certificate could not be obtained. Check DNS and port 80, then see /var/log/letsencrypt/letsencrypt.log';
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
  // Certbot's nginx plugin looks for 'nginx' in PATH; under systemd/PM2 PATH may not include /usr/sbin
  const nginxDir = path.dirname(NGINX_BIN);
  const pathEnv = process.env.PATH || '';
  const env = { ...process.env, PATH: nginxDir + (pathEnv ? ':' + pathEnv : '') };
  const runViaSudo = !isRoot();
  const finalArgs = runViaSudo ? ['sudo', certbot, ...args] : [certbot, ...args];
  const result = spawnSync(finalArgs[0], finalArgs.slice(1), { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024, env });
  if (result.status !== 0) {
    const msg = certbotErrorMessage(result.stdout, result.stderr);
    const err = new Error(msg);
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    throw err;
  }
}

export function writeAppConfig(app, forceHttpOnly = false, forceSsl = false) {
  ensureDir();
  const { id, domain, port, ssl_enabled } = app;
  const confPath = appConfPath(id);
  if (!domain) {
    if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
    return;
  }
  const serverName = domain.trim();
  const hasSsl = !forceHttpOnly && ssl_enabled && (forceSsl || certsExist(serverName));
  const comment = `# UPGS Node Panel - app ${id} - ${serverName}\n`;
  let content = '';
  if (hasSsl) {
    const cert = certPath(serverName);
    const key = keyPath(serverName);
    content = comment + `
server {
  listen 80;
  server_name ${serverName};
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  server_name ${serverName};
  ssl_certificate ${cert};
  ssl_certificate_key ${key};
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers off;
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
    if (isRoot()) {
      run(`${NGINX_BIN} -t`, {});
      run(`${NGINX_BIN} -s reload`, {});
    } else {
      const testResult = spawnSync('sudo', [NGINX_BIN, '-t'], { encoding: 'utf-8' });
      if (testResult.status !== 0) {
        const err = new Error(testResult.stderr || testResult.stdout || 'nginx -t failed');
        err.stdout = testResult.stdout;
        err.stderr = testResult.stderr;
        throw err;
      }
      const reloadResult = spawnSync('sudo', [NGINX_BIN, '-s', 'reload'], { encoding: 'utf-8' });
      if (reloadResult.status !== 0) {
        const err = new Error(reloadResult.stderr || reloadResult.stdout || 'nginx reload failed');
        err.stdout = reloadResult.stdout;
        err.stderr = reloadResult.stderr;
        throw err;
      }
    }
  } catch (e) {
    console.warn('Nginx reload failed:', e.message);
    throw e;
  }
}
