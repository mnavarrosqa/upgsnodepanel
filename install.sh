#!/usr/bin/env bash
# UPGS Node Panel - installer for Linux (run as root or with sudo)
set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/upgs-node-panel}"
PANEL_PORT="${PANEL_PORT:-3000}"
APPS_BASE_PATH="${APPS_BASE_PATH:-/var/www/upgs-node-apps}"
NGINX_APPS_CONF_DIR="${NGINX_APPS_CONF_DIR:-/etc/nginx/conf.d/upgs-node-apps}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root or with sudo."
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
else
  OS_ID=unknown
fi

echo "[*] Installing system dependencies..."
case "$OS_ID" in
  ubuntu|debian)
    apt-get update -qq
    apt-get install -y -qq git nginx build-essential libpam0g-dev certbot python3-certbot-nginx 2>/dev/null || apt-get install -y -qq git nginx build-essential libpam0g-dev
    ;;
  rhel|rocky|alma|centos|fedora)
    dnf install -y -q git nginx gcc make pam-devel 2>/dev/null || yum install -y -q git nginx gcc make pam-devel
    ;;
  *)
    echo "Unsupported OS: $OS_ID. Install manually: git, nginx, build-essential / gcc, libpam0g-dev / pam-devel"
    ;;
esac

echo "[*] Installing nvm and Node.js..."
export NVM_DIR="${NVM_DIR:-/root/.nvm}"
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

# Make node and pm2 available to systemd and to the shell (nvm path is not in PATH for services or new shells)
for bin in node npm pm2; do
  B="$(command -v "$bin" 2>/dev/null)"
  [ -n "$B" ] && ln -sf "$B" "/usr/local/bin/$bin"
done

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
  sed -i "s/PANEL_PORT=.*/PANEL_PORT=$PANEL_PORT/" .env 2>/dev/null || true
  sed -i "s|APPS_BASE_PATH=.*|APPS_BASE_PATH=$APPS_BASE_PATH|" .env 2>/dev/null || true
  sed -i "s|NGINX_APPS_CONF_DIR=.*|NGINX_APPS_CONF_DIR=$NGINX_APPS_CONF_DIR|" .env 2>/dev/null || true
  sed -i "s|NVM_DIR=.*|NVM_DIR=$NVM_DIR|" .env 2>/dev/null || true
fi

echo "[*] Creating directories..."
mkdir -p "$APPS_BASE_PATH"
mkdir -p "$NGINX_APPS_CONF_DIR"

echo "[*] Installing systemd unit..."
NODE_BIN="$(command -v node)"
# Ensure PATH for the service includes node/pm2 (in case /usr/local/bin is not in systemd's default PATH)
cp packaging/upgs-node-panel.service /etc/systemd/system/
sed -i "s|/opt/upgs-node-panel|$INSTALL_DIR|g" /etc/systemd/system/upgs-node-panel.service
sed -i "s|^ExecStart=.*|ExecStart=$NODE_BIN server/index.js|" /etc/systemd/system/upgs-node-panel.service
# Prepend PATH so node and pm2 are found when the panel runs (e.g. pm2 for managed apps)
if ! grep -q '^Environment=PATH=' /etc/systemd/system/upgs-node-panel.service; then
  sed -i "/^Environment=NODE_ENV/a Environment=PATH=/usr/local/bin:/usr/bin:/bin" /etc/systemd/system/upgs-node-panel.service
fi
systemctl daemon-reload
systemctl enable upgs-node-panel
systemctl start upgs-node-panel

echo "[*] Configuring nginx for panel..."
NGINX_PANEL_CONF="/etc/nginx/conf.d/upgs-panel.conf"
if [ ! -f "$NGINX_PANEL_CONF" ]; then
  sed "s/PANEL_PORT/$PANEL_PORT/g" packaging/nginx-panel.conf.example > "$NGINX_PANEL_CONF"
  nginx -t && nginx -s reload 2>/dev/null || true
fi

SERVER_IP=$(curl -s -4 ifconfig.co 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")
echo ""
echo "UPGS Node Panel is installed and running."
echo "  Panel URL: http://$SERVER_IP/"
echo "  Log in with your server (root) username and password."
echo ""
