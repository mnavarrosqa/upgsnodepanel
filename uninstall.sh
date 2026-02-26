#!/usr/bin/env bash
# UPGS Node Panel - uninstaller (run as root or with sudo)
set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/upgs-node-panel}"
NGINX_APPS_CONF_DIR="${NGINX_APPS_CONF_DIR:-/etc/nginx/conf.d}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root or with sudo."
  exit 1
fi

echo "This will stop the panel, remove the systemd unit, and remove nginx config."
echo "Install directory: $INSTALL_DIR"
read -r -p "Remove install directory and app configs dir? [y/N] " ans
if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo "[*] Stopping and disabling service..."
systemctl stop upgs-node-panel 2>/dev/null || true
systemctl disable upgs-node-panel 2>/dev/null || true
rm -f /etc/systemd/system/upgs-node-panel.service
systemctl daemon-reload

echo "[*] Removing nginx config..."
rm -f /etc/nginx/conf.d/upgs-panel.conf
rm -f "$NGINX_APPS_CONF_DIR"/upgs-node-app-*.conf
nginx -t && nginx -s reload 2>/dev/null || true

echo "[*] Removing install directory..."
rm -rf "$INSTALL_DIR"

echo "Uninstall complete. nvm, PM2, and Node were not removed."
