#!/usr/bin/env bash
# UPGS Node Panel - installer for Ubuntu 20–25 (run as root or with sudo)
set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/upgs-node-panel}"
PANEL_PORT="${PANEL_PORT:-3000}"
APPS_BASE_PATH="${APPS_BASE_PATH:-/var/www/upgs-node-apps}"
NGINX_APPS_CONF_DIR="${NGINX_APPS_CONF_DIR:-/etc/nginx/upgs-node-apps.d}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root or with sudo."
  exit 1
fi

# Panel user: when run via sudo, use the invoking user; otherwise root
PANEL_USER="${SUDO_USER:-root}"
PANEL_HOME="$(getent passwd "$PANEL_USER" 2>/dev/null | cut -d: -f6)"
if [ -z "$PANEL_HOME" ]; then
  if [ "$PANEL_USER" = "root" ]; then
    PANEL_HOME="/root"
  else
    PANEL_HOME="/home/$PANEL_USER"
  fi
fi
# Set NVM/PM2 paths from panel user's home (allow env override if set before this script)
NVM_DIR="${NVM_DIR:-$PANEL_HOME/.nvm}"
PM2_HOME="${PM2_HOME:-$PANEL_HOME/.pm2}"

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

echo "[*] Installing nvm and Node.js (as $PANEL_USER)..."
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" NVM_DIR="$NVM_DIR" bash -c '
    mkdir -p "$NVM_DIR"
    curl -sSf https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash -s -- --no-use
  '
fi
sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" NVM_DIR="$NVM_DIR" bash -c '
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install --lts 2>/dev/null || nvm install 20
  nvm use --lts 2>/dev/null || nvm use 20
  npm install -g pm2
'

# Symlink node, npm, pm2 so systemd and any shell see them (nvm path is not in service PATH)
for bin in node npm pm2; do
  B="$(sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" NVM_DIR="$NVM_DIR" bash -c '. "$NVM_DIR/nvm.sh" && command -v "'"$bin"'"' 2>/dev/null)"
  if [ -z "$B" ]; then
    echo "[!] $bin not found after install. Aborting."
    exit 1
  fi
  ln -sf "$B" "/usr/local/bin/$bin"
done

# Ensure PM2 home exists so panel and shell use the same instance
mkdir -p "$PM2_HOME"
chown -R "$PANEL_USER:$PANEL_USER" "$PM2_HOME"

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

chown -R "$PANEL_USER:$PANEL_USER" "$INSTALL_DIR"

echo "[*] Installing Node dependencies and building client..."
echo "[*] (Deprecation warnings from transitive dependencies are normal and can be ignored.)"
# Clean install so native modules are built for this system; run as panel user so ownership is correct
rm -rf node_modules client/node_modules
sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" NVM_DIR="$NVM_DIR" bash -c "cd \"$INSTALL_DIR\" && npm install"
# Compile PAM auth helper (no npm native module needed; works on all Node versions)
mkdir -p server/lib
if [ ! -f server/lib/auth-pam.c ]; then
  echo "[*] Creating PAM helper source..."
  cat > server/lib/auth-pam.c << 'AUTHEOF'
/* PAM auth helper for UPGS Node Panel. Compile: gcc -o auth-pam auth-pam.c -lpam */
#define _GNU_SOURCE
#include <security/pam_appl.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
static const char *g_password;
static int conversation(int n, const struct pam_message **msg,
    struct pam_response **resp, void *data) {
  (void)data;
  if (n <= 0 || n > 128) return PAM_CONV_ERR;
  *resp = calloc(n, sizeof(struct pam_response));
  if (!*resp) return PAM_BUF_ERR;
  for (int i = 0; i < n; i++) {
    (*resp)[i].resp_retcode = 0;
    (*resp)[i].resp = NULL;
    if (msg[i]->msg_style == PAM_PROMPT_ECHO_OFF && g_password)
      (*resp)[i].resp = strdup(g_password);
  }
  return PAM_SUCCESS;
}
static struct pam_conv conv = { .conv = conversation, .appdata_ptr = NULL };
int main(int argc, char **argv) {
  const char *user = getenv("PAM_USER");
  const char *pass = getenv("PAM_PASSWORD");
  if (argc >= 2) user = argv[1];
  if (argc >= 3) pass = argv[2];
  if (!user || !pass) return 1;
  g_password = pass;
  pam_handle_t *pamh = NULL;
  int ret = pam_start("login", user, &conv, &pamh);
  if (ret != PAM_SUCCESS) goto out;
  ret = pam_authenticate(pamh, 0);
  if (ret != PAM_SUCCESS) goto out;
  ret = pam_acct_mgmt(pamh, 0);
out:
  if (pamh) pam_end(pamh, ret);
  return ret == PAM_SUCCESS ? 0 : 1;
}
AUTHEOF
fi
if [ -f server/lib/auth-pam.c ]; then
  if gcc -o server/lib/auth-pam server/lib/auth-pam.c -lpam 2>/dev/null; then
    chmod 755 server/lib/auth-pam
    chown "$PANEL_USER:$PANEL_USER" server/lib/auth-pam
    echo "[*] PAM auth helper compiled."
  else
    echo "[!] Could not compile PAM helper. Ensure libpam0g-dev is installed. Login may fail."
  fi
fi
sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" NVM_DIR="$NVM_DIR" bash -c "cd \"$INSTALL_DIR/client\" && npm install && npm run build"

echo "[*] Creating .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env 2>/dev/null || true
fi
sed -i "s/PANEL_PORT=.*/PANEL_PORT=$PANEL_PORT/" .env 2>/dev/null || true
APP_PORT_MIN="${APP_PORT_MIN:-3001}"
APP_PORT_MAX="${APP_PORT_MAX:-3100}"
sed -i "s/^APP_PORT_MIN=.*/APP_PORT_MIN=$APP_PORT_MIN/" .env 2>/dev/null || true
sed -i "s/^APP_PORT_MAX=.*/APP_PORT_MAX=$APP_PORT_MAX/" .env 2>/dev/null || true
if ! grep -q '^APP_PORT_MIN=' .env 2>/dev/null; then echo "APP_PORT_MIN=$APP_PORT_MIN" >> .env; fi
if ! grep -q '^APP_PORT_MAX=' .env 2>/dev/null; then echo "APP_PORT_MAX=$APP_PORT_MAX" >> .env; fi
sed -i "s|APPS_BASE_PATH=.*|APPS_BASE_PATH=$APPS_BASE_PATH|" .env 2>/dev/null || true
sed -i "s|NGINX_APPS_CONF_DIR=.*|NGINX_APPS_CONF_DIR=$NGINX_APPS_CONF_DIR|" .env 2>/dev/null || true
if ! grep -q '^NGINX_APPS_CONF_DIR=' .env 2>/dev/null; then echo "NGINX_APPS_CONF_DIR=$NGINX_APPS_CONF_DIR" >> .env; fi
sed -i "s|NVM_DIR=.*|NVM_DIR=$NVM_DIR|" .env 2>/dev/null || true
if ! grep -q '^HOME=' .env 2>/dev/null; then echo "HOME=$PANEL_HOME" >> .env; fi
sed -i "s|^HOME=.*|HOME=$PANEL_HOME|" .env 2>/dev/null || true
# So panel and shell share the same PM2 instance (apps show in `pm2 list`)
if grep -q '^PM2_HOME=' .env 2>/dev/null; then
  sed -i "s|^PM2_HOME=.*|PM2_HOME=$PM2_HOME|" .env
else
  echo "PM2_HOME=$PM2_HOME" >> .env
fi

echo "[*] Creating directories..."
mkdir -p "$APPS_BASE_PATH"
chown -R "$PANEL_USER:$PANEL_USER" "$APPS_BASE_PATH"

# Nginx app vhosts: writable directory so panel (running as PANEL_USER) can write configs
mkdir -p "$NGINX_APPS_CONF_DIR"
chown "$PANEL_USER":root "$NGINX_APPS_CONF_DIR"
chmod 775 "$NGINX_APPS_CONF_DIR"
if [ ! -f /etc/nginx/conf.d/upgs-node-apps-include.conf ]; then
  echo "include $NGINX_APPS_CONF_DIR/*.conf;" > /etc/nginx/conf.d/upgs-node-apps-include.conf
fi

# Allow panel user to run nginx reload and certbot without password (only when not root)
if [ "$PANEL_USER" != "root" ]; then
  NGINX_BIN_PATH="$(command -v nginx 2>/dev/null || echo '/usr/sbin/nginx')"
  CERTBOT_BIN_PATH="$(command -v certbot 2>/dev/null || echo '/usr/bin/certbot')"
  SUDOERS_FILE="/etc/sudoers.d/upgs-node-panel"
  PAM_HELPER_PATH="$INSTALL_DIR/server/lib/auth-pam"
  {
    echo "Defaults:$PANEL_USER !requiretty"
    echo "$PANEL_USER ALL=(root) NOPASSWD: SETENV: $PAM_HELPER_PATH"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $NGINX_BIN_PATH -t, $NGINX_BIN_PATH -s reload"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $CERTBOT_BIN_PATH certonly *"
  } > "$SUDOERS_FILE"
  chmod 440 "$SUDOERS_FILE"
  if ! visudo -c -f "$SUDOERS_FILE" >/dev/null 2>&1; then
    echo "[!] Sudoers file invalid. Removing. Nginx reload and certbot may fail for the panel."
    rm -f "$SUDOERS_FILE"
  else
    # So panel uses the same nginx/certbot paths as sudoers (systemd may not have /usr/sbin in PATH)
    sed -i "s|^NGINX_BIN=.*|NGINX_BIN=$NGINX_BIN_PATH|" .env 2>/dev/null || true
    grep -q '^NGINX_BIN=' .env 2>/dev/null || echo "NGINX_BIN=$NGINX_BIN_PATH" >> .env
    sed -i "s|^CERTBOT_BIN=.*|CERTBOT_BIN=$CERTBOT_BIN_PATH|" .env 2>/dev/null || true
    grep -q '^CERTBOT_BIN=' .env 2>/dev/null || echo "CERTBOT_BIN=$CERTBOT_BIN_PATH" >> .env
  fi
fi

echo "[*] Installing systemd unit..."
cp packaging/upgs-node-panel.service /etc/systemd/system/
sed -i "s|INSTALL_DIR|$INSTALL_DIR|g" /etc/systemd/system/upgs-node-panel.service
sed -i "s|PANEL_USER|$PANEL_USER|g" /etc/systemd/system/upgs-node-panel.service
sed -i "s|PANEL_HOME|$PANEL_HOME|g" /etc/systemd/system/upgs-node-panel.service
sed -i "s|__PM2_HOME__|$PM2_HOME|g" /etc/systemd/system/upgs-node-panel.service
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
sed "s/PANEL_PORT/$PANEL_PORT/g" packaging/nginx-panel.conf.example > "$NGINX_PANEL_CONF"
# Disable default nginx site so port 80 serves the panel (not the default nginx page)
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
systemctl enable nginx 2>/dev/null || true
systemctl start nginx 2>/dev/null || true
if nginx -t 2>/dev/null; then
  nginx -s reload 2>/dev/null || true
else
  echo "[!] nginx config test failed. Fix with: nginx -t"
fi

echo "[*] Installing certbot for automatic SSL (if not present)..."
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq 2>/dev/null || true
  apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
fi
if command -v certbot >/dev/null 2>&1; then
  echo "[*] Certbot installed. Set LETSENCRYPT_EMAIL in .env for cert expiry notices (optional)."
else
  echo "[!] Certbot not installed. Install it for automatic SSL: apt install certbot python3-certbot-nginx"
fi

echo "[*] Opening firewall ports (22, 80, 443, app range ${APP_PORT_MIN}-${APP_PORT_MAX})..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp comment 'SSH' 2>/dev/null || true
  ufw allow 80/tcp comment 'HTTP panel' 2>/dev/null || true
  ufw allow 443/tcp comment 'HTTPS' 2>/dev/null || true
  ufw allow "${APP_PORT_MIN}:${APP_PORT_MAX}/tcp" comment 'Node panel app ports' 2>/dev/null || true
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw reload 2>/dev/null || true
  fi
fi

SERVER_IP=$(curl -s -4 ifconfig.co 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")
echo ""
echo "UPGS Node Panel is installed and running."
echo "  Panel URL: http://$SERVER_IP/"
echo "  Log in with your server username and password (e.g. $PANEL_USER)."
echo "  Apps you add via the panel will appear in: pm2 list"
echo ""
