# UPGS Node Panel

Manage and install Node.js apps on your VPS. Log in with your server username and password (e.g. the user who ran the installer, or root), install Node versions via nvm, clone repos, run install/build/start commands, and expose each app via nginx (domain or IP:port). Optional SSL per app.

**Repository:** [https://github.com/mnavarrosqa/upgsnodepanel](https://github.com/mnavarrosqa/upgsnodepanel)

## Features

- **Auth**: Login with system credentials (PAM)
- **Node versions**: Install and list versions via nvm
- **Apps**: Add apps from Git repos; run install, build, start; Run / Pause / Restart / Delete via PM2
- **Per-app**: Domain or subdomain, optional SSL (Let's Encrypt), or access by server IP:port
- **UI**: Dark theme, flat icons, branded UPGS NODE PANEL

## Requirements

- **Ubuntu 20, 22, 24, or 25** (installer supports these only)
- root or sudo (installer must run with sudo; the panel then runs as the invoking user when you use `sudo ./install.sh`, or as root when run directly as root)
- The installer installs: nginx, git, Node.js (via nvm), PM2, PAM dev headers
- Optional: certbot for app SSL (installed by script when available). When the panel runs as a non-root user, nginx reload and certbot are invoked via sudo (the installer adds a sudoers rule). The same sudoers file allows the PAM helper to run as root so any system user can log in, not only the panel user.

## Quick start (development)

```bash
# Clone and install
git clone https://github.com/mnavarrosqa/upgsnodepanel.git
cd upgsnodepanel
npm install

# Optional: skip PAM on non-Linux or for local dev
export SKIP_PAM=1

# Build client and run server
npm run build
PANEL_PORT=3000 npm start
```

Open http://localhost:3000 and log in (with SKIP_PAM=1, any username/password works).

## Production

1. Set environment variables (copy `.env.example` to `.env`):
   - `SESSION_SECRET`: random string for session signing
   - `PANEL_PORT`: port the panel listens on (e.g. 3000)
   - `APPS_BASE_PATH`: directory for cloned app repos (e.g. `/var/www/upgs-node-apps`)
   - `NGINX_APPS_CONF_DIR`: directory where the panel writes app vhost files. The installer uses `/etc/nginx/upgs-node-apps.d` (writable by the panel user) and adds an nginx include for it. If you use a different path, ensure nginx includes it.
   - `NVM_DIR`: path to nvm (e.g. `~/.nvm` for the panel user, or `/root/.nvm` when run as root)

2. Build and run:
   ```bash
   NODE_ENV=production npm run build
   NODE_ENV=production npm start
   ```

3. Put nginx in front (reverse proxy to `PANEL_PORT`) and optionally use HTTPS for the panel.

## Installer

On a fresh **Ubuntu 20–25** server (as root or with sudo):

```bash
# One-liner: clone repo and run installer
curl -sSL https://raw.githubusercontent.com/mnavarrosqa/upgsnodepanel/main/install.sh | sudo bash
```

Or clone first, then run from the repo directory:

```bash
git clone https://github.com/mnavarrosqa/upgsnodepanel.git
cd upgsnodepanel
sudo ./install.sh
```

The installer will use the local copy if run from the repo; otherwise it clones from the repo above. Full steps: deps, nvm, PM2, panel code, nginx, systemd.

## Updating the panel

To pull the latest code from the main repo and restart the panel (run as root or with sudo):

```bash
sudo ./update.sh
```

Or from anywhere, if the repo is installed in the default location:

```bash
curl -sSL https://raw.githubusercontent.com/mnavarrosqa/upgsnodepanel/main/update.sh | sudo bash
```

Override install path or repo with env: `INSTALL_DIR=/opt/upgs-node-panel REPO_URL=... sudo ./update.sh`. Your `.env` is preserved.

## API (authenticated except login)

- `POST /api/login` — body: `{ username, password }`
- `POST /api/logout` — destroy session
- `GET /api/me` — current user
- `GET /api/node/versions` — list Node versions
- `POST /api/node/versions` — body: `{ version }` (e.g. "20", "lts")
- `GET/POST/PUT/DELETE /api/apps` — CRUD apps
- `GET /api/apps/:id/env` — get app `.env` file content
- `PUT /api/apps/:id/env` — body: `{ env: "string" }` — set app `.env` (restart app for changes to take effect)
- `POST /api/apps/:id/start|stop|restart` — PM2 control
- `GET /api/apps/:id/logs` — PM2 logs
- `GET /api/system/ip` — server public IP

## License

MIT
