# Installation Guide — B8N6 Office Suite v1.0

This guide covers:
- [Quick install (Ubuntu 22.04+ / Debian 11+)](#quick-install-ubuntu-2204--debian-11)
- [Manual install](#manual-install)
- [NGINX + HTTPS](#nginx--https)
- [Bootstrapping your first owner](#bootstrapping-your-first-owner)
- [Upgrading](#upgrading-to-a-new-version)
- [Uninstalling](#uninstalling)

---

## Quick install (Ubuntu 22.04+ / Debian 11+)

One-shot installer. Run as a user with `sudo`:

```bash
git clone https://github.com/B8N6/office-suite.git
cd office-suite
sudo bash deploy-ubuntu.sh
```

The script will:

1. Install Go 1.22+ (if missing)
2. Install Node.js 20+ (if missing)
3. Build the React frontend to `frontend/dist/`
4. Compile the Go backend to `/opt/b8n6-office-suite/b8n6mail`
5. Copy `data/` directory (with config example)
6. Generate a random `SESSION_SECRET`
7. Create `/etc/systemd/system/b8n6-office-suite.service`
8. Start the service

After install, the suite is running on **http://your-server-ip:8787**. Continue to [Bootstrapping your first owner](#bootstrapping-your-first-owner).

---

## Manual install

### 1. Prerequisites

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y curl git build-essential

# Install Go 1.22
wget https://go.dev/dl/go1.22.3.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.3.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh
source /etc/profile.d/go.sh

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Clone + build

```bash
git clone https://github.com/B8N6/office-suite.git
cd office-suite

# Build frontend
cd frontend
npm ci
npm run build
cd ..

# Build backend
cd backend
go mod tidy
GOOS=linux GOARCH=amd64 go build -o ../b8n6mail .
cd ..
```

### 3. Install to /opt

```bash
sudo mkdir -p /opt/b8n6-office-suite
sudo cp b8n6mail /opt/b8n6-office-suite/
sudo cp -r frontend/dist /opt/b8n6-office-suite/frontend
sudo mkdir -p /opt/b8n6-office-suite/data
sudo cp data/config.example.json /opt/b8n6-office-suite/data/config.json

# Generate a secure session secret
SECRET=$(openssl rand -hex 32)
sudo sed -i "s/CHANGE-THIS-TO-A-LONG-RANDOM-SECRET/$SECRET/" /opt/b8n6-office-suite/data/config.json

# Set ownership
sudo chown -R www-data:www-data /opt/b8n6-office-suite
sudo chmod +x /opt/b8n6-office-suite/b8n6mail
```

### 4. Create systemd service

```bash
sudo tee /etc/systemd/system/b8n6-office-suite.service > /dev/null <<'EOF'
[Unit]
Description=B8N6 Office Suite
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/b8n6-office-suite
ExecStart=/opt/b8n6-office-suite/b8n6mail
Restart=always
RestartSec=5
Environment=PORT=8787
Environment=SECURE_COOKIES=true
Environment=TLS_VERIFY=true

# Harden
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/b8n6-office-suite/data
ProtectKernelTunables=true
ProtectKernelModules=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable b8n6-office-suite
sudo systemctl start b8n6-office-suite
sudo systemctl status b8n6-office-suite
```

---

## NGINX + HTTPS

For production, reverse-proxy behind NGINX + Let's Encrypt:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/b8n6-office-suite > /dev/null <<'EOF'
server {
    listen 80;
    server_name mail.yourdomain.com;

    client_max_body_size 50M;  # allow large cloud uploads

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/b8n6-office-suite /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get HTTPS certificate
sudo certbot --nginx -d mail.yourdomain.com --redirect --agree-tos -m admin@yourdomain.com
```

After HTTPS is active, the `SECURE_COOKIES=true` env var (already set in the systemd unit) takes effect.

---

## Bootstrapping your first owner

The `data/admin.json` file starts empty. You need to seed the first owner.

### Step 1: Add a mail domain via the API (or manually edit `data/domains.json`)

Since there's no owner yet, the admin API is locked. Either:

**A. Edit manually:**
```bash
sudo -u www-data tee /opt/b8n6-office-suite/data/domains.json > /dev/null <<'EOF'
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "domain": "yourdomain.com",
    "imap_host": "imap.yourdomain.com",
    "imap_port": 993,
    "imap_ssl": true,
    "smtp_host": "smtp.yourdomain.com",
    "smtp_port": 465,
    "smtp_ssl": true,
    "active": true,
    "notes": "Main domain"
  }
]
EOF
```

**B. Or set the owner seed first, so config fail-early warns you if domain missing:**
```bash
sudo systemctl set-environment B8N6_INITIAL_OWNER_EMAIL=admin@yourdomain.com
# ...then do A above
```

### Step 2: Seed the owner

```bash
# Set the env var in the systemd unit (or export before running binary)
sudo systemctl edit b8n6-office-suite
```

Add:
```
[Service]
Environment=B8N6_INITIAL_OWNER_EMAIL=admin@yourdomain.com
```

Save, then:
```bash
sudo systemctl restart b8n6-office-suite
sudo journalctl -u b8n6-office-suite --since "1 min ago" | grep Seeded
# Should see: ✓ Seeded initial owner: admin@yourdomain.com
```

### Step 3: Log in

1. Visit `https://mail.yourdomain.com/login`
2. Enter **your owner email** + its **IMAP mailbox password**
3. On success you'll see the mail dashboard with a red shield icon in the sidebar footer — click it to access the admin panel.

### Step 4: Remove the bootstrap env var

Once the owner exists in `data/admin.json`, the env var is ignored. Remove it to prevent confusion:

```bash
sudo systemctl edit b8n6-office-suite
# Delete the B8N6_INITIAL_OWNER_EMAIL line
sudo systemctl restart b8n6-office-suite
```

---

## Upgrading to a new version

```bash
cd /opt/b8n6-office-suite-src  # your clone
git fetch --tags
git checkout v1.0.1            # or whatever latest tag

# Rebuild
cd frontend && npm ci && npm run build && cd ..
cd backend && go build -o ../b8n6mail . && cd ..

# Stop service, swap binary, restart
sudo systemctl stop b8n6-office-suite
sudo cp b8n6mail /opt/b8n6-office-suite/
sudo cp -r frontend/dist/* /opt/b8n6-office-suite/frontend/
sudo chown -R www-data:www-data /opt/b8n6-office-suite
sudo systemctl start b8n6-office-suite
```

Your `data/` directory is preserved across upgrades.

---

## Uninstalling

```bash
sudo systemctl stop b8n6-office-suite
sudo systemctl disable b8n6-office-suite
sudo rm /etc/systemd/system/b8n6-office-suite.service
sudo rm -rf /opt/b8n6-office-suite
sudo systemctl daemon-reload

# If using NGINX:
sudo rm /etc/nginx/sites-enabled/b8n6-office-suite
sudo rm /etc/nginx/sites-available/b8n6-office-suite
sudo systemctl reload nginx
```

---

## Troubleshooting

### Can't log in — "domain not configured for this email"
Add the domain first via `/admin` (if you're an owner) or edit `data/domains.json` directly.

### Admin panel bounces back to login
Your IMAP auth failed, or your email isn't in `data/admin.json`. Check `sudo journalctl -u b8n6-office-suite -f` while attempting login.

### IMAP "certificate verify failed"
Set `TLS_VERIFY=false` in the systemd unit (only safe for self-signed certs in testing).

### Uploads fail silently
Check `client_max_body_size` in NGINX (default 1MB is too small). Set to 50M+.

### Sessions expire immediately
Make sure `SESSION_SECRET` is set and doesn't change between restarts. Keep it stable in `data/config.json`.

---

## First-boot checklist

- [ ] Service running: `systemctl status b8n6-office-suite`
- [ ] Can load `/login` from browser
- [ ] Random `SESSION_SECRET` in `data/config.json` (not the default placeholder)
- [ ] `SECURE_COOKIES=true` set if behind HTTPS
- [ ] `TLS_VERIFY=true` set for production
- [ ] At least one domain in `data/domains.json`
- [ ] At least one owner in `data/admin.json`
- [ ] Owner can successfully log in
- [ ] `B8N6_INITIAL_OWNER_EMAIL` env var removed after first owner exists
