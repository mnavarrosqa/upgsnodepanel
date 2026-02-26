#!/usr/bin/env bash
# UPGS Node Panel - installer for Ubuntu 20–25 (run as root or with sudo)
set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/upgs-node-panel}"
PANEL_PORT="${PANEL_PORT:-3000}"
APPS_BASE_PATH="${APPS_BASE_PATH:-/var/www/upgs-node-apps}"
NGINX_APPS_CONF_DIR="${NGINX_APPS_CONF_DIR:-/etc/nginx/conf.d/upgs-node-apps}"
NVM_DIR="${NVM_DIR:-/root/.nvm}"
PM2_HOME="${PM2_HOME:-/root/.pm2}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root or with sudo."
  exit 1
fi

# Require Ubuntu 20, 22, 24, or 25
if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    ubuntu)
      case "${VERSION_ID:-}" in
        20.*|22.*|24.*|25.*) ;;
        *)
          echo "Unsupported Ubuntu version: ${VERSION_ID:-unknown}. This installer supports Ubuntu 20, 22, 24, and 25."
          exit 1
          ;;
      esac
      ;;
    *)
      echo "Unsupported OS: $ID. This installer supports Ubuntu 20–25 only."
      exit 1
      ;;
  esac
else
  echo "Cannot detect OS. This installer supports Ubuntu 20–25 only."
  exit 1
fi

echo "[*] Installing system dependencies (Ubuntu)..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git nginx build-essential libpam0g-dev curl ca-certificates \
  certbot python3-certbot-nginx 2>/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git nginx build-essential libpam0g-dev curl ca-certificates

echo "[*] Installing nvm and Node.js..."
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  mkdir -p "$NVM_DIR"
  curl -sSf https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash -s -- --no-use
fi
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm install --lts 2>/dev/null || nvm install 20
nvm use --lts 2>/dev/null || nvm use 20

echo "[*] Installing PM2..."
npm install -g pm2

# Symlink node, npm, pm2 so systemd and any shell see them (nvm path is not in service PATH)
for bin in node npm pm2; do
  B="$(command -v "$bin" 2>/dev/null)"
  if [ -z "$B" ]; then
    echo "[!] $bin not found after install. Aborting."
    exit 1
  fi
  ln -sf "$B" "/usr/local/bin/$bin"
done

# Ensure PM2 home exists so panel and shell use the same instance
mkdir -p "$PM2_HOME"
chown root:root "$PM2_HOME" 2>/dev/null || true

echo "[*] Installing panel to $INSTALL_DIR..."
mkdir -p "$(dirname "$INSTALL_DIR")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="${REPO_URL:-https://github.com/mnavarrosqa/upgsnodepanel.git}"
if [ -d "$SCRIPT_DIR/server" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
  cp -a "$SCRIPT_DIR" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  rm -f .env
else
  echo "[*] Cloning from $REPO_URL..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "[*] Installing Node dependencies and building client..."
npm install
cd client && npm install && npm run build && cd ..

echo "[*] Creating .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env 2>/dev/null || true
fi
sed -i "s/PANEL_PORT=.*/PANEL_PORT=$PANEL_PORT/" .env 2>/dev/null || true
sed -i "s|APPS_BASE_PATH=.*|APPS_BASE_PATH=$APPS_BASE_PATH|" .env 2>/dev/null || true
sed -i "s|NGINX_APPS_CONF_DIR=.*|NGINX_APPS_CONF_DIR=$NGINX_APPS_CONF_DIR|" .env 2>/dev/null || true
sed -i "s|NVM_DIR=.*|NVM_DIR=$NVM_DIR|" .env 2>/dev/null || true
# So panel and shell share the same PM2 instance (apps show in `pm2 list`)
if grep -q '^PM2_HOME=' .env 2>/dev/null; then
  sed -i "s|^PM2_HOME=.*|PM2_HOME=$PM2_HOME|" .env
else
  echo "PM2_HOME=$PM2_HOME" >> .env
fi

echo "[*] Creating directories..."
mkdir -p "$APPS_BASE_PATH"
mkdir -p "$NGINX_APPS_CONF_DIR"

echo "[*] Installing systemd unit..."
cp packaging/upgs-node-panel.service /etc/systemd/system/
sed -i "s|/opt/upgs-node-panel|$INSTALL_DIR|g" /etc/systemd/system/upgs-node-panel.service
systemctl daemon-reload
systemctl enable upgs-node-panel
systemctl start upgs-node-panel

if ! systemctl is-active --quiet upgs-node-panel; then
  echo "[!] Panel service failed to start. Status:"
  systemctl status upgs-node-panel --no-pager || true
  echo ""
  echo "Recent logs:"
  journalctl -u upgs-node-panel -n 30 --no-pager || true
  exit 1
fi

echo "[*] Configuring nginx for panel..."
NGINX_PANEL_CONF="/etc/nginx/conf.d/upgs-panel.conf"
if [ ! -f "$NGINX_PANEL_CONF" ]; then
  sed "s/PANEL_PORT/$PANEL_PORT/g" packaging/nginx-panel.conf.example > "$NGINX_PANEL_CONF"
  nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || true
fi

SERVER_IP=$(curl -s -4 ifconfig.co 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")
echo ""
echo "UPGS Node Panel is installed and running."
echo "  Panel URL: http://$SERVER_IP/"
echo "  Log in with your server (root) username and password."
echo "  Apps you add via the panel will appear in: pm2 list"
echo ""
