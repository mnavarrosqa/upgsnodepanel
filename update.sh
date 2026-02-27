#!/usr/bin/env bash
# UPGS Node Panel - update script (run as root or with sudo)
# Fetches latest from the main repo and restarts the panel.
set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/upgs-node-panel}"
REPO_URL="${REPO_URL:-https://github.com/mnavarrosqa/upgsnodepanel.git}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root or with sudo."
  exit 1
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo "Install directory not found: $INSTALL_DIR"
  echo "Run install.sh first."
  exit 1
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "Not a git repository: $INSTALL_DIR"
  echo "Re-run install.sh to install from the repo, or clone the repo into $INSTALL_DIR."
  exit 1
fi

cd "$INSTALL_DIR"

# Detect panel user from systemd unit (so npm/build run as same user and keep ownership)
PANEL_USER="root"
if [ -f /etc/systemd/system/upgs-node-panel.service ]; then
  u="$(grep '^User=' /etc/systemd/system/upgs-node-panel.service 2>/dev/null | cut -d= -f2)"
  [ -n "$u" ] && PANEL_USER="$u"
fi
PANEL_HOME="$(getent passwd "$PANEL_USER" 2>/dev/null | cut -d: -f6)"
if [ -z "$PANEL_HOME" ]; then
  [ "$PANEL_USER" = "root" ] && PANEL_HOME="/root" || PANEL_HOME="/home/$PANEL_USER"
fi
NVM_DIR="$(grep '^NVM_DIR=' .env 2>/dev/null | cut -d= -f2-)"
[ -z "$NVM_DIR" ] && NVM_DIR="$PANEL_HOME/.nvm"
PM2_HOME="$(grep '^PM2_HOME=' .env 2>/dev/null | cut -d= -f2-)"
[ -z "$PM2_HOME" ] && PM2_HOME="$PANEL_HOME/.pm2"

if ! git remote get-url origin &>/dev/null; then
  echo "[*] Adding remote origin..."
  git remote add origin "$REPO_URL"
else
  echo "[*] Setting origin to $REPO_URL..."
  git remote set-url origin "$REPO_URL"
fi

# Prefer main; fallback to master
BRANCH="main"
if git ls-remote --heads origin main 2>/dev/null | grep -q .; then
  BRANCH="main"
elif git ls-remote --heads origin master 2>/dev/null | grep -q .; then
  BRANCH="master"
fi

echo "[*] Fetching latest from origin ($BRANCH)..."
git fetch --depth 1 origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env

# So npm install (run as PANEL_USER) can write package-lock.json and node_modules
chown -R "$PANEL_USER:$PANEL_USER" "$INSTALL_DIR"

# Ensure PAM auth helper exists and is compiled (create from source if missing after pull)
mkdir -p server/lib
if [ ! -f server/lib/auth-pam.c ]; then
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
  gcc -o server/lib/auth-pam server/lib/auth-pam.c -lpam 2>/dev/null && chmod 755 server/lib/auth-pam && chown "$PANEL_USER:$PANEL_USER" server/lib/auth-pam 2>/dev/null || true
fi

# Ensure panel user owns any files we just created (e.g. server/lib/auth-pam)
chown -R "$PANEL_USER:$PANEL_USER" "$INSTALL_DIR"

echo "[*] Installing Node dependencies..."
sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" NVM_DIR="$NVM_DIR" bash -c '
  cd "'"$INSTALL_DIR"'"
  if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; nvm use --lts 2>/dev/null || nvm use 20 2>/dev/null || true; fi
  npm install
  cd client && npm install && npm run build
'

echo "[*] Restarting panel..."
# Save PM2 process list before restart; after restart the daemon may be gone (same cgroup as panel), so we restore it
sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" PM2_HOME="$PM2_HOME" pm2 save --no-update-env 2>/dev/null || true
systemctl restart upgs-node-panel
sleep 2
# Restore saved PM2 processes so apps come back without manual start
sudo -u "$PANEL_USER" env HOME="$PANEL_HOME" PM2_HOME="$PM2_HOME" pm2 resurrect 2>/dev/null || true

echo ""
echo "UPGS Node Panel updated and restarted."
