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

cleanup() {
    echo ""
    echo "Stopping services..."
    pkill -P $$ || true
    for pid in "${LANDING_PID:-}" "${SERVER_PID:-}" "${UI_PID:-}" "${RUNNER_PID:-}"; do
        [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
    done
    sleep 0.5
    exit 0
}

trap cleanup INT TERM EXIT

step "Windows Development Setup"
echo "This script will guide you through setting up the development environment on Windows."
echo ""
echo "Prerequisites:"
echo "  - Git for Windows (https://git-scm.com/download/win)"
echo "  - Node.js 20+ (https://nodejs.org/)"
echo "  - PowerShell or Git Bash terminal"
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

step "Step 3: Environment Configuration"
ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    echo "Found existing .env file"
    if prompt_user "Would you like to review/update environment variables"; then
        echo "Current environment variables:"
        cat "$ENV_FILE"
        echo ""
    fi
else
    echo "Creating new .env file..."
    touch "$ENV_FILE"
fi

if ! grep -q "PORT=" "$ENV_FILE" 2>/dev/null; then
    PORT=$(prompt_value "Enter UI port" "3000")
    echo "PORT=$PORT" >> "$ENV_FILE"
fi

if ! grep -q "SERVER_PORT=" "$ENV_FILE" 2>/dev/null; then
    SERVER_PORT=$(prompt_value "Enter Server port" "3001")
    echo "SERVER_PORT=$SERVER_PORT" >> "$ENV_FILE"
fi

if ! grep -q "RUNNER_PORT=" "$ENV_FILE" 2>/dev/null; then
    RUNNER_PORT=$(prompt_value "Enter Runner port" "3002")
    echo "RUNNER_PORT=$RUNNER_PORT" >> "$ENV_FILE"
fi

if ! grep -q "RUNNER_TOKEN=" "$ENV_FILE" 2>/dev/null; then
    RUNNER_TOKEN=$(prompt_value "Enter Runner token (or press Enter for auto-generated)" "")
    if [ -z "$RUNNER_TOKEN" ]; then
        RUNNER_TOKEN=$(openssl rand -hex 16 2>/dev/null || date | md5sum | head -c 32)
    fi
    echo "RUNNER_TOKEN=$RUNNER_TOKEN" >> "$ENV_FILE"
fi

step "Step 4: Dependency Installation"
if prompt_user "Would you like to install/update dependencies"; then
    echo "Installing dependencies..."
    echo "This may take a few minutes..."
    
    npm install
    npm --prefix server install
    npm --prefix runner install
    npm --prefix ui install
    
    echo "✓ Dependencies installed successfully"
else
    echo "Skipping dependency installation"
fi

step "Step 5: Port Availability Check"
LANDING_PORT=6868
UI_PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3000")
SERVER_PORT=$(grep "^SERVER_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3001")
RUNNER_PORT=$(grep "^RUNNER_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3002")

check_port() {
    local port=$1
    local service=$2
    if netstat -an | grep -q ":$port "; then
        echo "⚠️  Port $port is already in use for $service"
        if prompt_user "Would you like to use a different port"; then
            local new_port=$(prompt_value "Enter new port for $service" "$((port + 100))")
            return 1
        else
            die "Port conflict: $port is already in use"
        fi
    fi
    return 0
}

echo "Checking port availability..."
check_port $LANDING_PORT "Landing" || LANDING_PORT=$(prompt_value "Enter new landing port" "$((LANDING_PORT + 100))")
check_port $UI_PORT "UI" || UI_PORT=$(prompt_value "Enter new UI port" "$((UI_PORT + 100))")
check_port $SERVER_PORT "Server" || SERVER_PORT=$(prompt_value "Enter new server port" "$((SERVER_PORT + 100))")
check_port $RUNNER_PORT "Runner" || RUNNER_PORT=$(prompt_value "Enter new runner port" "$((RUNNER_PORT + 100))")

echo ""
echo "Service URLs:"
echo "  Landing: http://localhost:$LANDING_PORT"
echo "  UI:      http://localhost:$UI_PORT"
echo "  API:     http://localhost:$SERVER_PORT"
echo "  Runner:  http://localhost:$RUNNER_PORT"
echo "  Ollama:  http://localhost:11434"
echo "  Proxy:   http://localhost:8080"

step "Step 6: Starting Services"
echo "Starting all services with hot reload..."
echo "Logs will be written to $LOG_DIR/"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

export PORT=$UI_PORT
export SERVER_PORT=$SERVER_PORT
export RUNNER_PORT=$RUNNER_PORT
export RUNNER_URL="http://localhost:$RUNNER_PORT"
export CORS_ORIGIN="http://localhost:$UI_PORT"
export NEXT_PUBLIC_API_URL="http://localhost:$SERVER_PORT"
export NEXT_PUBLIC_RUNNER_BASE_URL="http://localhost:$RUNNER_PORT"

node landing/server.mjs > "$LOG_DIR/landing.log" 2>&1 &
LANDING_PID=$!
echo "✓ Landing service started (PID: $LANDING_PID)"

npm --prefix server run dev > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "✓ Server service started (PID: $SERVER_PID)"

npm --prefix runner run dev > "$LOG_DIR/runner.log" 2>&1 &
RUNNER_PID=$!
echo "✓ Runner service started (PID: $RUNNER_PID)"

npm --prefix ui run dev > "$LOG_DIR/ui.log" 2>&1 &
UI_PID=$!
echo "✓ UI service started (PID: $UI_PID)"

echo ""
echo "🎉 All services are starting up!"
echo "This may take 30-60 seconds for initial compilation..."
echo ""
echo "Monitor logs:"
echo "  tail -f $LOG_DIR/landing.log"
echo "  tail -f $LOG_DIR/server.log"
echo "  tail -f $LOG_DIR/runner.log"
echo "  tail -f $LOG_DIR/ui.log"
echo ""
echo "Access your application:"
echo "  Main UI: http://localhost:$UI_PORT"
echo ""
echo "Waiting for services to be ready..."

sleep 5

echo ""
echo "✅ Development environment is ready!"
echo "Services are running. Check the logs above for any issues."
echo ""
echo "To stop all services, press Ctrl+C"

wait