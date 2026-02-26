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

echo "[*] Installing Node dependencies..."
export NVM_DIR="${NVM_DIR:-/root/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use --lts 2>/dev/null || nvm use 20 2>/dev/null || true
fi
npm install
cd client && npm install && npm run build && cd ..

echo "[*] Restarting panel..."
systemctl restart upgs-node-panel

echo ""
echo "UPGS Node Panel updated and restarted."
