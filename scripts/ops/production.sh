#!/usr/bin/env bash
set -e

prompt_user() {
    local message="$1"
    local default="${2:-y}"
    local response

    read -r -p "$message (y/n) [$default]: " response
    response=${response:-$default}

    case "$response" in
        [Yy]|[Yy][Ee][Ss]) return 0 ;;
        [Nn]|[Nn][Oo]) return 1 ;;
        *) echo "Please answer yes or no."; prompt_user "$message" "$default" ;;
    esac
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }
step() { echo ""; echo "== $1 =="; }
die() { echo "ERROR: $1"; exit 1; }

ROOT_DIR="$(pwd)"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"

LANDING_PORT=6868
UI_PORT=4000
SERVER_PORT=4001
RUNNER_PORT=4002

cleanup() {
    echo ""
    echo "Stopping services..."
    for pid in "${LANDING_PID:-}" "${SERVER_PID:-}" "${UI_PID:-}" "${RUNNER_PID:-}"; do
        [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
    done
    exit 0
}

trap cleanup INT TERM EXIT

echo "AI Web App - Guided Production Run"
echo ""
echo "Root: $ROOT_DIR"
echo "Ports:"
echo "  Landing: http://localhost:$LANDING_PORT"
echo "  UI:      http://localhost:$UI_PORT"
echo "  API:     http://localhost:$SERVER_PORT"
echo "  Runner:  http://localhost:$RUNNER_PORT"
echo "  Ollama:  http://localhost:11434"
echo "  Proxy:   http://localhost:8080"

if [ ! -d "server" ] || [ ! -d "ui" ] || [ ! -d "runner" ]; then
    die "This script must be run from the aiwebapp root directory"
fi

step "Preflight Checks"
if ! have_cmd npm; then
    die "npm is required (install Node.js first)."
fi
if have_cmd lsof; then
    for p in "$LANDING_PORT" "$UI_PORT" "$SERVER_PORT" "$RUNNER_PORT"; do
        if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
            die "Port $p is already in use. Stop the process using it and retry."
        fi
    done
else
    echo "WARN: lsof not found; skipping port availability checks."
fi

step "Step 1: Install Dependencies"
if prompt_user "Install dependencies for all services?" "y"; then
    (cd server && npm ci) || die "server npm ci failed"
    (cd ui && npm ci) || die "ui npm ci failed"
    (cd runner && npm ci) || die "runner npm ci failed"
else
    echo "Skipping dependency installation"
fi

step "Step 2: Create Env Files"
if prompt_user "Create local env files from examples (safe defaults)?" "y"; then
    npm run init:env || true
else
    echo "Skipping env creation"
fi

step "Step 3: Build Services"
if prompt_user "Build all services?" "y"; then
    (cd server && npm run build) || die "server build failed"
    (cd ui && npm run build) || die "ui build failed"
    (cd runner && npm run build) || die "runner build failed"
else
    echo "Skipping build"
fi

step "Step 4: Start Services"
if prompt_user "Start landing + API + runner + UI in production mode?" "y"; then
    export MAX_ITERATIONS=50
    export MAX_TOKENS=5000
    export MAX_TIME_SECONDS=300
    export OLLAMA_BASE_URL=http://localhost:11434
    export OLLAMA_MODEL=llama3.2

    (PORT=$LANDING_PORT node landing/server.mjs) >>"$LOG_DIR/landing-prod.log" 2>&1 &
    LANDING_PID=$!

    (cd server && PORT=$SERVER_PORT npm run start) >>"$LOG_DIR/server-prod.log" 2>&1 &
    SERVER_PID=$!

    (cd runner && PORT=$RUNNER_PORT npm run start) >>"$LOG_DIR/runner-prod.log" 2>&1 &
    RUNNER_PID=$!

    (cd ui && PORT=$UI_PORT npm run start) >>"$LOG_DIR/ui-prod.log" 2>&1 &
    UI_PID=$!

    echo ""
    echo "Services started!"
    echo "PIDs:"
    echo "  Landing: $LANDING_PID"
    echo "  Server:  $SERVER_PID"
    echo "  Runner:  $RUNNER_PID"
    echo "  UI:      $UI_PID"
    echo ""
    echo "URLs:"
    echo "  Landing: http://localhost:$LANDING_PORT"
    echo "  UI:      http://localhost:$UI_PORT"
    echo "  API:     http://localhost:$SERVER_PORT"
    echo "  Runner:  http://localhost:$RUNNER_PORT"

    step "Step 5: Verify Health"
    if have_cmd curl; then
        curl -s -o /dev/null -w "Landing HTTP %{http_code}\n" --max-time 3 "http://localhost:$LANDING_PORT/" 2>/dev/null || true
        curl -s -o /dev/null -w "API /health HTTP %{http_code}\n" --max-time 3 "http://localhost:$SERVER_PORT/health" 2>/dev/null || true
        curl -s -o /dev/null -w "Runner /health HTTP %{http_code}\n" --max-time 3 "http://localhost:$RUNNER_PORT/health" 2>/dev/null || true
        curl -s -o /dev/null -w "UI HTTP %{http_code}\n" --max-time 3 "http://localhost:$UI_PORT/" 2>/dev/null || true
    else
        echo "WARN: curl not found; skipping HTTP checks."
    fi

    step "Step 6: Smoke Test"
    if prompt_user "Run smoke tests now (npm run smoke)?" "n"; then
        npm run smoke || true
    fi

    step "Step 7: Finish"
    echo "Logs:"
    echo "  $LOG_DIR/landing-prod.log"
    echo "  $LOG_DIR/server-prod.log"
    echo "  $LOG_DIR/runner-prod.log"
    echo "  $LOG_DIR/ui-prod.log"
    echo ""
    echo "Stop:"
    echo "  kill $LANDING_PID $SERVER_PID $RUNNER_PID $UI_PID"
    echo ""
    read -r -p "Press Enter to stop all services..." _
    cleanup
else
    echo "Skipping service startup"
fi

echo ""
echo "Done."

