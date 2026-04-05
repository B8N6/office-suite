#!/usr/bin/env bash
# B8N6 Office Suite — one-shot Ubuntu/Debian deployment
# Usage:  sudo bash deploy-ubuntu.sh

set -euo pipefail

APP_NAME="b8n6-office-suite"
APP_DIR="/opt/${APP_NAME}"
SERVICE_USER="www-data"
PORT="${PORT:-8787}"
GO_VERSION="1.22.3"
NODE_MAJOR="20"

BOLD='\033[1m'; GREEN='\033[0;32m'; YEL='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${YEL}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
err()   { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# --- Pre-flight ---------------------------------------------------------
[[ $EUID -eq 0 ]] || err "This script must be run with sudo/root."
command -v apt-get >/dev/null || err "This installer supports Ubuntu/Debian (apt-get not found)."

echo -e "${BOLD}=== B8N6 Office Suite installer ===${NC}"

info "Updating package index..."
apt-get update -qq
apt-get install -y -qq curl git build-essential openssl

# --- Go 1.22 ------------------------------------------------------------
if ! command -v go >/dev/null 2>&1 || ! go version | grep -q "go1.2[2-9]\|go1.[3-9][0-9]"; then
  info "Installing Go ${GO_VERSION}..."
  cd /tmp
  curl -fsSLO "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "go${GO_VERSION}.linux-amd64.tar.gz"
  rm "go${GO_VERSION}.linux-amd64.tar.gz"
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  export PATH=$PATH:/usr/local/go/bin
  ok "Go installed: $(go version)"
else
  ok "Go already installed: $(go version)"
fi

# --- Node.js 20 ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q "^v${NODE_MAJOR}\.\|^v2[1-9]\."; then
  info "Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  ok "Node.js installed: $(node --version)"
else
  ok "Node.js already installed: $(node --version)"
fi

# --- Build --------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

info "Building frontend..."
cd frontend
npm ci --silent
npm run build --silent
cd ..
ok "Frontend built → frontend/dist/"

info "Compiling Go backend..."
cd backend
export PATH=$PATH:/usr/local/go/bin
go mod download
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../b8n6mail .
cd ..
ok "Backend compiled → b8n6mail ($(stat -c%s b8n6mail | numfmt --to=iec))"

# --- Install ------------------------------------------------------------
info "Installing to ${APP_DIR}..."
mkdir -p "$APP_DIR/data" "$APP_DIR/frontend"
cp b8n6mail "$APP_DIR/"
cp -r frontend/dist/* "$APP_DIR/frontend/"
chmod +x "$APP_DIR/b8n6mail"

# Seed config.json if missing
if [[ ! -f "$APP_DIR/data/config.json" ]]; then
  SECRET=$(openssl rand -hex 32)
  cp data/config.example.json "$APP_DIR/data/config.json"
  sed -i "s|CHANGE-THIS-TO-A-LONG-RANDOM-SECRET|$SECRET|" "$APP_DIR/data/config.json"
  ok "Config created with random session secret."
else
  ok "Config preserved (data/config.json already exists)."
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# --- systemd service ----------------------------------------------------
info "Setting up systemd service..."
cat > /etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=B8N6 Office Suite v1.0
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/b8n6mail
Restart=always
RestartSec=5
Environment=PORT=${PORT}
Environment=SECURE_COOKIES=true
Environment=TLS_VERIFY=true

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true
MemoryDenyWriteExecute=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${APP_NAME}" >/dev/null
systemctl restart "${APP_NAME}"
sleep 2

if systemctl is-active --quiet "${APP_NAME}"; then
  ok "Service started successfully."
else
  err "Service failed to start. Check: journalctl -u ${APP_NAME} -n 50"
fi

# --- Summary ------------------------------------------------------------
IP=$(hostname -I | awk '{print $1}')
echo
echo -e "${BOLD}=== Installed successfully ===${NC}"
echo
echo -e "  App dir:   ${APP_DIR}"
echo -e "  Service:   systemctl status ${APP_NAME}"
echo -e "  Logs:      journalctl -u ${APP_NAME} -f"
echo -e "  URL:       ${GREEN}http://${IP}:${PORT}${NC}"
echo
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Add a mail domain in data/domains.json (see INSTALL.md)"
echo "  2. Seed your first owner:"
echo -e "     ${YEL}systemctl edit ${APP_NAME}${NC}"
echo -e "     → add:  ${YEL}Environment=B8N6_INITIAL_OWNER_EMAIL=admin@yourdomain.com${NC}"
echo -e "     ${YEL}systemctl restart ${APP_NAME}${NC}"
echo "  3. (Recommended) Set up NGINX + HTTPS — see INSTALL.md"
echo
