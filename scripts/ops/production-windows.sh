#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

prompt_user() {
    local message="$1"
    local default="${2:-y}"
    local resp
    read -r -p "$message (y/n) [$default]: " resp
    resp=${resp:-$default}
    case "$resp" in
        [Yy]* ) return 0 ;;
        * ) return 1 ;;
    esac
}

prompt_value() {
    local message="$1"
    local default_value="${2:-}"
    local resp
    if [ -n "${default_value:-}" ]; then
        read -r -p "$message [$default_value]: " resp
        resp=${resp:-$default_value}
    else
        read -r -p "$message: " resp
    fi
    printf '%s' "$resp"
}

step() {
    echo ""
    echo "== $1 =="
}

die() {
    echo "ERROR: $1"
    exit 1
}

have_cmd() {
    command -v "$1" >/dev/null 2>&1
}

check_port() {
    local port=$1
    local service=$2
    if netstat -an | grep -q ":$port "; then
        echo "⚠️  Port $port is already in use for $service"
        return 1
    fi
    return 0
}

step "Windows Production Deployment Setup"
echo "This script will guide you through deploying the application for production on Windows."
echo ""
echo "Prerequisites:"
echo "  - Git for Windows (https://git-scm.com/download/win)"
echo "  - Node.js 20+ (https://nodejs.org/)"
echo "  - PowerShell or Git Bash terminal"
echo "  - Windows Task Scheduler (for service management)"
echo ""

step "Step 1: Environment Check"
if ! have_cmd node; then
    die "Node.js not found. Please install Node.js 20+ from https://nodejs.org/"
fi

NODE_VERSION=$(node --version)
echo "✓ Node.js found: $NODE_VERSION"

if ! have_cmd npm; then
    die "npm not found. Please ensure npm is installed with Node.js"
fi
NPM_VERSION=$(npm --version)
echo "✓ npm found: $NPM_VERSION"

if ! have_cmd git; then
    echo "⚠️  Git not found. Some features may not work."
    echo "   Install Git for Windows: https://git-scm.com/download/win"
else
    echo "✓ Git found"
fi

step "Step 2: Project Structure Check"
if [ ! -d server ] || [ ! -d ui ] || [ ! -d runner ]; then
    die "This script must be run from the aiwebapp root directory containing server, ui, runner"
fi
echo "✓ Project structure verified"

step "Step 3: Production Environment Configuration"
ENV_FILE=".env.production"
if [ -f "$ENV_FILE" ]; then
    echo "Found existing production environment file"
    if prompt_user "Would you like to review/update production variables"; then
        echo "Current production variables:"
        cat "$ENV_FILE"
        echo ""
    fi
else
    echo "Creating new production environment file..."
    touch "$ENV_FILE"
fi

if ! grep -q "NODE_ENV=" "$ENV_FILE" 2>/dev/null; then
    echo "NODE_ENV=production" >> "$ENV_FILE"
fi

if ! grep -q "PORT=" "$ENV_FILE" 2>/dev/null; then
    PORT=$(prompt_value "Enter production UI port" "80")
    echo "PORT=$PORT" >> "$ENV_FILE"
fi

if ! grep -q "SERVER_PORT=" "$ENV_FILE" 2>/dev/null; then
    SERVER_PORT=$(prompt_value "Enter production Server port" "3001")
    echo "SERVER_PORT=$SERVER_PORT" >> "$ENV_FILE"
fi

if ! grep -q "RUNNER_PORT=" "$ENV_FILE" 2>/dev/null; then
    RUNNER_PORT=$(prompt_value "Enter production Runner port" "3002")
    echo "RUNNER_PORT=$RUNNER_PORT" >> "$ENV_FILE"
fi

if ! grep -q "RUNNER_TOKEN=" "$ENV_FILE" 2>/dev/null; then
    RUNNER_TOKEN=$(prompt_value "Enter secure production Runner token (or press Enter for auto-generated)" "")
    if [ -z "$RUNNER_TOKEN" ]; then
        RUNNER_TOKEN=$(openssl rand -hex 32 2>/dev/null || date | sha256sum | head -c 64)
    fi
    echo "RUNNER_TOKEN=$RUNNER_TOKEN" >> "$ENV_FILE"
fi

if ! grep -q "CORS_ORIGIN=" "$ENV_FILE" 2>/dev/null; then
    CORS_ORIGIN=$(prompt_value "Enter production CORS origin (your domain)" "http://localhost:$PORT")
    echo "CORS_ORIGIN=$CORS_ORIGIN" >> "$ENV_FILE"
fi

if ! grep -q "NEXT_PUBLIC_API_URL=" "$ENV_FILE" 2>/dev/null; then
    NEXT_PUBLIC_API_URL=$(prompt_value "Enter production API URL" "http://localhost:$SERVER_PORT")
    echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" >> "$ENV_FILE"
fi

if ! grep -q "NEXT_PUBLIC_RUNNER_BASE_URL=" "$ENV_FILE" 2>/dev/null; then
    NEXT_PUBLIC_RUNNER_BASE_URL=$(prompt_value "Enter production Runner base URL" "http://localhost:$RUNNER_PORT")
    echo "NEXT_PUBLIC_RUNNER_BASE_URL=$NEXT_PUBLIC_RUNNER_BASE_URL" >> "$ENV_FILE"
fi

step "Step 4: Production Build"
if prompt_user "Would you like to build the application for production"; then
    echo "Building production application..."
    echo "This may take several minutes..."
    
    npm run build
    
    echo "✓ Production build completed successfully"
else
    echo "Skipping production build (you can run 'npm run build' later)"
fi

step "Step 5: Port Configuration & Validation"
LANDING_PORT=6868
UI_PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "80")
SERVER_PORT=$(grep "^SERVER_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3001")
RUNNER_PORT=$(grep "^RUNNER_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3002")

echo "Production service configuration:"
echo "  Landing: http://localhost:$LANDING_PORT"
echo "  UI:      http://localhost:$UI_PORT"
echo "  API:     http://localhost:$SERVER_PORT"
echo "  Runner:  http://localhost:$RUNNER_PORT"
echo ""

echo "Checking port availability..."
PORTS_OK=true
for port in $LANDING_PORT $UI_PORT $SERVER_PORT $RUNNER_PORT; do
    if ! check_port $port "Service"; then
        PORTS_OK=false
    fi
done

if [ "$PORTS_OK" = false ]; then
    echo "⚠️  Some ports are already in use."
    if prompt_user "Would you like to continue anyway (services may fail to start)"; then
        echo "Continuing with port conflicts..."
    else
        die "Port conflicts detected. Please resolve before continuing."
    fi
fi

step "Step 6: Service Management Setup"
SERVICE_NAME="aiwebapp-production"
if prompt_user "Would you like to create Windows service management scripts"; then
    echo "Creating service management scripts..."
    
    cat > "start-production.bat" << 'EOF'
@echo off
echo Starting AIWebApp Production Services...
cd /d "%~dp0"
set NODE_ENV=production
set ENV_FILE=.env.production

start "Landing Service" cmd /c "node landing/server.mjs > logs\landing-production.log 2>&1"
start "Server Service" cmd /c "npm --prefix server start > logs\server-production.log 2>&1"
start "Runner Service" cmd /c "npm --prefix runner start > logs\runner-production.log 2>&1"
start "UI Service" cmd /c "npm --prefix ui start > logs\ui-production.log 2>&1"

echo Services started. Check logs in logs/ directory.
echo Press any key to stop services...
pause > nul

echo Stopping services...
taskkill /F /IM node.exe > nul 2>&1
echo Services stopped.
pause
EOF

    cat > "stop-production.bat" << 'EOF'
@echo off
echo Stopping AIWebApp Production Services...
taskkill /F /IM node.exe > nul 2>&1
echo Services stopped.
pause
EOF

    cat > "status-production.bat" << 'EOF'
@echo off
echo Checking AIWebApp Production Service Status...
echo.
echo Landing Service:
tasklist /FI "WINDOWTITLE eq Landing Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED
echo.
echo Server Service:
tasklist /FI "WINDOWTITLE eq Server Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED
echo.
echo Runner Service:
tasklist /FI "WINDOWTITLE eq Runner Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED
echo.
echo UI Service:
tasklist /FI "WINDOWTITLE eq UI Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED
echo.
pause
EOF

    chmod +x start-production.bat stop-production.bat status-production.bat
    echo "✓ Service management scripts created"
    echo "  - start-production.bat: Start all services"
    echo "  - stop-production.bat: Stop all services"
    echo "  - status-production.bat: Check service status"
else
    echo "Skipping service management setup"
fi

step "Step 7: Production Deployment"
if prompt_user "Would you like to start the production services now"; then
    echo "Starting production services..."
    echo "Logs will be written to logs/ directory"
    echo ""
    echo "Service URLs:"
    echo "  Landing: http://localhost:$LANDING_PORT"
    echo "  UI:      http://localhost:$UI_PORT"
    echo "  API:     http://localhost:$SERVER_PORT"
    echo "  Runner:  http://localhost:$RUNNER_PORT"
    echo ""
    
    export NODE_ENV=production
    export ENV_FILE=.env.production
    
    node landing/server.mjs > "$LOG_DIR/landing-production.log" 2>&1 &
    LANDING_PID=$!
    echo "✓ Landing service started (PID: $LANDING_PID)"
    
    npm --prefix server start > "$LOG_DIR/server-production.log" 2>&1 &
    SERVER_PID=$!
    echo "✓ Server service started (PID: $SERVER_PID)"
    
    npm --prefix runner start > "$LOG_DIR/runner-production.log" 2>&1 &
    RUNNER_PID=$!
    echo "✓ Runner service started (PID: $RUNNER_PID)"
    
    npm --prefix ui start > "$LOG_DIR/ui-production.log" 2>&1 &
    UI_PID=$!
    echo "✓ UI service started (PID: $UI_PID)"
    
    echo ""
    echo "🎉 Production deployment started!"
    echo "Services are running. Check the logs above for any issues."
    echo ""
    echo "To stop all services, press Ctrl+C"
    
    wait
else
    echo "Production setup complete!"
    echo ""
    echo "To start services later:"
    echo "  1. Run: start-production.bat"
    echo "  2. Or manually start each service:"
    echo "     - node landing/server.mjs"
    echo "     - npm --prefix server start"
    echo "     - npm --prefix runner start"
    echo "     - npm --prefix ui start"
    echo ""
    echo "Production environment file: .env.production"
    echo "Service management scripts: start-production.bat, stop-production.bat, status-production.bat"
fi

echo ""
echo "✅ Production deployment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Configure your firewall to allow the configured ports"
echo "  2. Set up reverse proxy (nginx/Apache) if needed"
echo "  3. Configure SSL certificates for HTTPS"
echo "  4. Set up monitoring and logging"
echo "  5. Configure automatic startup (Windows Task Scheduler)"
echo ""
echo "For help, check the documentation or open an issue on GitHub."