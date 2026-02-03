# hotreload-test.sh
# Starts UI, server, and runner with hot-reload in development,
# captures logs, chooses fallback ports (3000-3050) to avoid EADDRINUSE,
# and tails logs with a cleanup trap.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

MAX_PORT=3050

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

find_free_port() {
    local start=$1
    local max=${2:-$MAX_PORT}
    shift 2 || true
    local exclude=("$@")
    local port=$start
    while [ "$port" -le "$max" ]; do
        # skip excluded ports
        local skip=0
        for e in "${exclude[@]}"; do
            [ "$e" = "$port" ] && skip=1 && break
        done
        [ "$skip" -eq 1 ] && port=$((port+1)) && continue

        if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            printf '%s' "$port"
            return 0
        fi
        port=$((port+1))
    done
    return 1
}

cleanup() {
    echo "\nStopping services..."
    # kill background tails/processes launched by this script
    pkill -P $$ || true
    for pid in "${SERVER_PID:-}" "${UI_PID:-}" "${RUNNER_PID:-}"; do
        [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
    done
    sleep 0.5
    exit 0
}

trap cleanup INT TERM EXIT

echo "📍 aiwebapp root: $ROOT_DIR"

if [ ! -d server ] || [ ! -d ui ] || [ ! -d runner ]; then
    echo "❌ This script must be run from the aiwebapp root directory containing server, ui, runner"
    exit 1
fi

if prompt_user "Install dependencies for all services now?" "n"; then
    (cd server && npm ci)
    (cd ui && npm ci)
    (cd runner && npm ci)
fi

echo "Starting services with port fallback (3000..$MAX_PORT)..."

# UI: prefers 3000
UI_PORT=$(find_free_port 3000 "$MAX_PORT") || { echo "No free UI port"; exit 1; }
# Server: prefers 3001, avoid UI_PORT
SERVER_PORT=$(find_free_port 3001 "$MAX_PORT" "$UI_PORT") || { echo "No free Server port"; exit 1; }
# Runner: prefers 3002, avoid UI and Server
RUNNER_PORT=$(find_free_port 3002 "$MAX_PORT" "$UI_PORT" "$SERVER_PORT") || { echo "No free Runner port"; exit 1; }

echo "UI -> $UI_PORT, Server -> $SERVER_PORT, Runner -> $RUNNER_PORT"

echo "Clearing logs..."
: > "$LOG_DIR/server.log"
: > "$LOG_DIR/ui.log"
: > "$LOG_DIR/runner.log"

# Ensure UI's env points to the runner started by this script.
# Preserve existing values if present.
if [ -f ui/.env.local ]; then
    existing_token=$(grep -m1 '^RUNNER_TOKEN=' ui/.env.local | cut -d'=' -f2- || true)
    existing_ai_api_url=$(grep -m1 '^NEXT_PUBLIC_AI_API_URL=' ui/.env.local | cut -d'=' -f2- || true)
else
    existing_token="change_me"
    existing_ai_api_url=""
fi

# Default AI API URL should work for both local dev and remote clients.
# If you don't have a tunnel/domain, override in ui/.env.local before running this script.
AI_API_PUBLIC_URL=${existing_ai_api_url:-https://copilot.heidiai.com.au}
echo "# Managed by hotreload-test.sh" > ui/.env.local
echo "# Optional: UI auth token for AgentOS requests" >> ui/.env.local
echo "# NEXT_PUBLIC_OS_SECURITY_KEY=your_token_here" >> ui/.env.local
echo >> ui/.env.local
echo "# Leave NEXT_PUBLIC_API_URL empty to use dynamic detection based on hostname" >> ui/.env.local
echo "NEXT_PUBLIC_API_URL=" >> ui/.env.local
echo "NEXT_PUBLIC_AI_API_URL=$AI_API_PUBLIC_URL" >> ui/.env.local
echo >> ui/.env.local
echo "RUNNER_URL=http://localhost:$RUNNER_PORT" >> ui/.env.local
echo "RUNNER_TOKEN=${existing_token:-change_me}" >> ui/.env.local

# Set RUNNER_TOKEN for the runner process
RUNNER_TOKEN=${existing_token:-change_me}

# Read bridge config from runner/.env if present
if [ -f runner/.env ]; then
    bridge_url=$(grep -m1 '^BRIDGE_URL=' runner/.env | cut -d'=' -f2- || true)
    bridge_token=$(grep -m1 '^BRIDGE_TOKEN=' runner/.env | cut -d'=' -f2- || true)
fi
BRIDGE_URL=${bridge_url:-}
BRIDGE_TOKEN=${bridge_token:-}

# Helper to run a command using `ato` if available, otherwise fall back to nohup+disown.
# Usage: run_with_ato <logfile> <command-as-string>
run_with_ato() {
    local logfile="$1"; shift
    local cmd="$*"
    if command -v ato >/dev/null 2>&1; then
        echo "[ATO] running via ato: $cmd"
        # try to use ato to run the command; capture pid
        ato bash -lc "$cmd" >>"$logfile" 2>&1 &
        pid=$!
    else
        echo "[ATO-fallback] running via nohup: $cmd"
        nohup bash -lc "$cmd" >>"$logfile" 2>&1 &
        pid=$!
    fi
    printf '%s' "$pid"
}

echo "Starting server (logs/server.log)..."
SERVER_PID=$(run_with_ato "$LOG_DIR/server.log" "cd server && PORT=\"$SERVER_PORT\" npm run dev")
sleep 0.2

echo "Starting UI (logs/ui.log)..."
# pass -p for Next
UI_PID=$(run_with_ato "$LOG_DIR/ui.log" "cd ui && npm run dev")
sleep 0.2

echo "Starting runner (logs/runner.log)..."
RUNNER_PID=$(run_with_ato "$LOG_DIR/runner.log" "cd runner && PORT=\"$RUNNER_PORT\" RUNNER_TOKEN=\"$RUNNER_TOKEN\" BRIDGE_URL=\"$BRIDGE_URL\" BRIDGE_TOKEN=\"$BRIDGE_TOKEN\" npm run dev")
sleep 0.2

echo "PIDs: server=$SERVER_PID ui=$UI_PID runner=$RUNNER_PID"
echo "Access: UI=http://localhost:$UI_PORT  Server=http://localhost:$SERVER_PORT  Runner=http://localhost:$RUNNER_PORT"

check_service() {
    local name=$1 url=$2 pid=$3 log=$4
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "[$name] process $pid not running"
        return 1
    fi
    if command -v curl >/dev/null 2>&1; then
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null || echo 000)
        echo "[$name] HTTP $code -> $url"
        if [ "$code" = "000" ] || [ "$code" -ge 400 ]; then
            echo "  Check logs: tail -n 50 $log"
            return 1
        fi
    fi
    return 0
}

sleep 1
check_service UI "http://localhost:$UI_PORT" "$UI_PID" "$LOG_DIR/ui.log" || true
check_service Server "http://localhost:$SERVER_PORT/health" "$SERVER_PID" "$LOG_DIR/server.log" || true
check_service Runner "http://localhost:$RUNNER_PORT/health" "$RUNNER_PID" "$LOG_DIR/runner.log" || true

echo "Tailing logs (press Ctrl+C to stop)..."
tail -n +1 -f "$LOG_DIR/server.log" | sed 's/^/[Server] /' &
tail -n +1 -f "$LOG_DIR/ui.log" | sed 's/^/[UI]     /' &
tail -n +1 -f "$LOG_DIR/runner.log" | sed 's/^/[Runner] /' &

wait
