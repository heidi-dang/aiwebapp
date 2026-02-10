# Linux Setup Instructions

## Prerequisites

- **Node.js 20.x or later**: Install via package manager or from [nodejs.org](https://nodejs.org/)
- **Git**: Install via package manager
- **curl/wget**: Usually pre-installed

### Ubuntu/Debian
```bash
# Update package list
sudo apt update

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
sudo apt install git
```

### CentOS/RHEL/Fedora
```bash
# Install Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs  # or dnf install -y nodejs

# Install Git
sudo yum install git  # or dnf install git
```

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/heidi-dang/aiwebapp.git
   cd aiwebapp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Development Setup

### Quick Start (Recommended)

Run the automated setup script:

```bash
./scripts/ops/hotscript-linux.sh
```

This script will:
- Install all service dependencies
- Configure environment variables
- Start all services with hot reload
- Set up logging

### Manual Setup

If you prefer manual setup:

1. **Start Landing Service** (Port 6868)
   ```bash
   node landing/server.mjs &
   ```

2. **Start Server** (Port 4001)
   ```bash
   cd server
   npm run dev &
   ```

3. **Start Runner** (Port 4002)
   ```bash
   cd runner
   npm run dev &
   ```

4. **Start UI** (Port 4000)
   ```bash
   cd ui
   npm run dev &
   ```

## Production Deployment

Run the production deployment script:

```bash
./scripts/ops/production-linux.sh
```

This will:
- Build all services for production
- Configure production environment
- Start services in background
- Set up logging and monitoring

## Access URLs

- **Landing Page**: http://localhost:6868
- **Main App**: http://localhost:4000
- **Registration**: http://localhost:4000/register
- **API**: http://localhost:4001

## Cloudflare Tunnel Setup (Optional)

For external access, set up Cloudflare tunnel:

1. **Install cloudflared**
   ```bash
   # Download and install
   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb

   # Or using package manager
   # Ubuntu/Debian
   sudo apt install cloudflared

   # CentOS/RHEL
   sudo yum install cloudflared
   ```

2. **Login to Cloudflare**
   ```bash
   cloudflared tunnel login
   ```

3. **Create tunnel**
   ```bash
   cloudflared tunnel create aiwebapp-prod
   ```

4. **Configure DNS** in Cloudflare dashboard:
   - `yourdomain.com` → tunnel
   - `app.yourdomain.com` → tunnel
   - `api.yourdomain.com` → tunnel
   - `code.yourdomain.com` → tunnel
   - `auth.yourdomain.com` → tunnel

## Troubleshooting

### Port Conflicts

If ports are in use, check what's running:

```bash
netstat -tlnp | grep -E ':(4000|4001|4002|6868)'
# or
ss -tlnp | grep -E ':(4000|4001|4002|6868)'
```

Kill processes if needed:

```bash
sudo kill -9 <PID>
```

### Services Not Starting

Check logs in the `logs/` directory:

```bash
tail -f logs/*.log
```

### Environment Issues

Delete `.env` files and re-run setup:

```bash
rm -f ui/.env server/.env runner/.env .env
./scripts/ops/hotscript-linux.sh
```

### Permission Issues

If you get permission errors:

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

## Systemd Service Setup (Optional)

For production, set up systemd services:

1. **Create service files** in `/etc/systemd/system/`

2. **Landing service** (`aiwebapp-landing.service`):
   ```ini
   [Unit]
   Description=Heidi AI Web App - Landing
   After=network.target

   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/path/to/aiwebapp
   ExecStart=/usr/bin/node landing/server.mjs
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and start services**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable aiwebapp-landing
   sudo systemctl start aiwebapp-landing
   ```

## Support

For issues, check the logs and ensure all prerequisites are installed.