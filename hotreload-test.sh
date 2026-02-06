# hotreload-test.sh - Optimized Low Resource Footprint Version
# Starts UI, server, and runner with hot-reload in development,
# captures logs, chooses fallback ports (3000-3050) to avoid EADDRINUSE,
# and tails logs with minimal resource usage.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

MAX_PORT=3050

# Cache for port checking to reduce lsof calls
declare -A PORT_CACHE

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

# Optimized port checking with caching
is_port_free() {
    local port=$1
    # Check cache first
    if [[ -n "${PORT_CACHE[$port]:-}" ]]; then
        return "${PORT_CACHE[$port]}"
    fi

    # Use netstat for faster checking (less overhead than lsof)
    if command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            PORT_CACHE[$port]=1
            return 1
        fi
    else
        # Fallback to ss if netstat not available
        if command -v ss >/dev/null 2>&1; then
            if ss -tuln 2>/dev/null | grep -q ":$port "; then
                PORT_CACHE[$port]=1
                return 1
            fi
        else
            # Last resort: lsof
            if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
                PORT_CACHE[$port]=1
                return 1
            fi
        fi
    fi

    PORT_CACHE[$port]=0
    return 0
}

find_free_port() {
    local start=$1
    local max=${2:-$MAX_PORT}
    shift 2 || true
    local exclude=("$@")
    local port=$start

    while [ "$port" -le "$max" ]; do
        # Check exclusions first (fast)
        local skip=0
        for e in "${exclude[@]}"; do
            [ "$e" = "$port" ] && skip=1 && break
        done
        [ "$skip" -eq 1 ] && port=$((port+1)) && continue

        # Check if port is free
        if is_port_free "$port"; then
            printf '%s' "$port"
            return 0
        fi
        port=$((port+1))
    done
    return 1
}

cleanup() {
    echo -e "\n🛑 Stopping services..."
    # Kill all child processes efficiently
    pkill -P $$ 2>/dev/null || true
    # Kill specific PIDs if still running
    for pid in "${SERVER_PID:-}" "${UI_PID:-}" "${RUNNER_PID:-}"; do
        [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
    done
    exit 0
}

trap cleanup INT TERM EXIT

echo "📍 aiwebapp root: $ROOT_DIR"

# Quick directory check
[ ! -d server ] || [ ! -d ui ] || [ ! -d runner ] && {
    echo "❌ This script must be run from the aiwebapp root directory containing server, ui, runner"
    exit 1
}

# Optional dependency installation
if prompt_user "Install dependencies for all services now?" "n"; then
    echo "📦 Installing dependencies..."
    (cd server && npm ci --silent) &
    (cd ui && npm ci --silent) &
    (cd runner && npm ci --silent) &
    wait
fi

echo "🔍 Finding available ports (3000..$MAX_PORT)..."

# Find ports efficiently
UI_PORT=$(find_free_port 3000 "$MAX_PORT") || { echo "❌ No free UI port found"; exit 1; }
SERVER_PORT=$(find_free_port 3001 "$MAX_PORT" "$UI_PORT") || { echo "❌ No free Server port found"; exit 1; }
RUNNER_PORT=$(find_free_port 3002 "$MAX_PORT" "$UI_PORT" "$SERVER_PORT") || { echo "❌ No free Runner port found"; exit 1; }

echo "✅ Ports assigned: UI=$UI_PORT, Server=$SERVER_PORT, Runner=$RUNNER_PORT"

# Clear logs efficiently (truncate instead of redirect)
echo -n "" > "$LOG_DIR/server.log"
echo -n "" > "$LOG_DIR/ui.log"
echo -n "" > "$LOG_DIR/runner.log"

# Environment setup - cache file reads
ENV_CACHE=""
if [ -f ui/.env.local ]; then
    ENV_CACHE=$(<ui/.env.local)
fi

# Extract values efficiently using parameter expansion
existing_token=${ENV_CACHE#*RUNNER_TOKEN=}
existing_token=${existing_token%%$'\n'*}
existing_token=${existing_token:-change_me}

existing_ai_api_url=${ENV_CACHE#*NEXT_PUBLIC_AI_API_URL=}
existing_ai_api_url=${existing_ai_api_url%%$'\n'*}
existing_ai_api_url=${existing_ai_api_url:-}

# Default AI API URL
AI_API_PUBLIC_URL=${existing_ai_api_url:-https://copilot.heidiai.com.au}
AI_API_URL=${AI_API_PUBLIC_URL:-http://192.168.1.16:8080}

# Write environment file efficiently (single write operation)
cat > ui/.env.local << EOF
# Managed by hotreload-test.sh
# Optional: UI auth token for AgentOS requests
# NEXT_PUBLIC_OS_SECURITY_KEY=your_token_here

# API URL set to the actual server port
NEXT_PUBLIC_AI_API_URL=$AI_API_PUBLIC_URL

RUNNER_URL=http://localhost:$RUNNER_PORT
RUNNER_TOKEN=$existing_token
EOF

# Set runner token
RUNNER_TOKEN=$existing_token

# Read bridge config efficiently
BRIDGE_CACHE=""
[ -f runner/.env ] && BRIDGE_CACHE=$(<runner/.env)
bridge_url=${BRIDGE_CACHE#*BRIDGE_URL=}
bridge_url=${bridge_url%%$'\n'*}
bridge_token=${BRIDGE_CACHE#*BRIDGE_TOKEN=}
bridge_token=${bridge_token%%$'\n'*}
BRIDGE_URL=${bridge_url:-}
BRIDGE_TOKEN=${bridge_token:-}

# Optimized process launcher - use direct background execution
run_service() {
    local logfile="$1"; shift
    local cmd="$*"
    echo "🚀 Starting: $cmd"
    # Direct background execution (lighter than nohup/ato)
    (exec bash -c "$cmd" >>"$logfile" 2>&1) &
    printf '%s' "$!"
}

echo "🔧 Starting services..."

# Start services with minimal delay
SERVER_PID=$(run_service "$LOG_DIR/server.log" "cd server && PORT=$SERVER_PORT RUNNER_URL=http://localhost:$RUNNER_PORT npm run dev")
UI_PID=$(run_service "$LOG_DIR/ui.log" "cd ui && npm run dev")
RUNNER_PID=$(run_service "$LOG_DIR/runner.log" "cd runner && PORT=$RUNNER_PORT RUNNER_TOKEN=$RUNNER_TOKEN AI_API_URL=$AI_API_URL BRIDGE_URL=$BRIDGE_URL BRIDGE_TOKEN=$BRIDGE_TOKEN npm run dev")

echo "📊 PIDs: server=$SERVER_PID, ui=$UI_PID, runner=$RUNNER_PID"
echo "🌐 Access URLs:"
echo "   UI:    http://localhost:$UI_PORT"
echo "   Server: http://localhost:$SERVER_PORT"
echo "   Runner: http://localhost:$RUNNER_PORT"

# Lightweight health check using timeout and basic connectivity
quick_health_check() {
    local name=$1 url=$2 pid=$3 log=$4
    # Check if process is still running (fast)
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "❌ [$name] process $pid not running"
        return 1
    fi

    # Quick connectivity check (faster than full curl)
    if command -v timeout >/dev/null 2>&1 && command -v nc >/dev/null 2>&1; then
        if timeout 2 nc -z localhost "${url#http://localhost:}" 2>/dev/null; then
            echo "✅ [$name] responding on ${url#http://localhost:}"
            return 0
        fi
    fi

    echo "⚠️  [$name] status unknown (check logs: tail -n 20 $log)"
    return 0  # Don't fail on unknown status
}

echo "🏥 Health checks..."
quick_health_check UI "http://localhost:$UI_PORT" "$UI_PID" "$LOG_DIR/ui.log"
quick_health_check Server "http://localhost:$SERVER_PORT" "$SERVER_PID" "$LOG_DIR/server.log"
quick_health_check Runner "http://localhost:$RUNNER_PORT" "$RUNNER_PID" "$LOG_DIR/runner.log"

echo "📋 Tailing logs (Ctrl+C to stop)..."

# Optimized log tailing - single process with awk for formatting
# This reduces from 3 tail processes to 1, saving significant resources
tail -n +1 -f "$LOG_DIR/server.log" "$LOG_DIR/ui.log" "$LOG_DIR/runner.log" | awk '
/==> logs\/server.log <==/ { prefix="[Server] "; next }
/==> logs\/ui.log <==/ { prefix="[UI]     "; next }
/==> logs\/runner.log <==/ { prefix="[Runner] "; next }
{ print prefix $0 }
'

wait
