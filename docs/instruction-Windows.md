# Windows Setup Instructions

## Prerequisites

- **Node.js 20.x or later**: Download from [nodejs.org](https://nodejs.org/)
- **Git**: Download from [git-scm.com](https://git-scm.com/)
- **VS Code** (recommended): Download from [code.visualstudio.com](https://code.visualstudio.com/)

## Installation

1. **Clone the repository**
   ```cmd
   git clone https://github.com/heidi-dang/aiwebapp.git
   cd aiwebapp
   ```

2. **Install dependencies**
   ```cmd
   npm install
   ```

## Development Setup

### Quick Start (Recommended)

Run the automated setup script:

```cmd
scripts\ops\hotscript-windows.bat
```

This script will:
- Install all service dependencies
- Configure environment variables
- Start all services with hot reload
- Set up logging

### Manual Setup

If you prefer manual setup:

1. **Start Landing Service** (Port 6868)
   ```cmd
   node landing/server.mjs
   ```

2. **Start Server** (Port 4001)
   ```cmd
   cd server
   npm run dev
   ```

3. **Start Runner** (Port 4002)
   ```cmd
   cd runner
   npm run dev
   ```

4. **Start UI** (Port 4000)
   ```cmd
   cd ui
   npm run dev
   ```

## Production Deployment

Run the production deployment script:

```cmd
scripts\ops\production-windows.bat
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
   ```cmd
   winget install --id Cloudflare.cloudflared
   ```

2. **Login to Cloudflare**
   ```cmd
   cloudflared tunnel login
   ```

3. **Create tunnel**
   ```cmd
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

```cmd
netstat -ano | findstr "4000\|4001\|4002\|6868"
```

Kill processes if needed:

```cmd
taskkill /PID <PID> /F
```

### Services Not Starting

Check logs in the `logs/` directory:

```cmd
type logs\*.log
```

### Environment Issues

Delete `.env` files and re-run setup:

```cmd
del /Q ui\.env server\.env runner\.env .env
scripts\ops\hotscript-windows.bat
```

## Support

For issues, check the logs and ensure all prerequisites are installed.