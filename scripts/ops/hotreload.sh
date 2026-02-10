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

get_env_value() {
    local file="$1" key="$2"
    [ -f "$file" ] || return 0
    grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d'=' -f2- || true
}

set_env_value() {
    local file="$1" key="$2" value="$3"
    mkdir -p "$(dirname "$file")"
    touch "$file"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        tmpfile="${file}.tmp.$$"
        sed "s#^${key}=.*#${key}=${value}#" "$file" > "$tmpfile"
        mv "$tmpfile" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$file"
    fi
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

LANDING_PORT=6868
UI_PORT=4000
SERVER_PORT=4001
RUNNER_PORT=4002

step "Hot Reload (Local Dev)"
echo "Ports:"
echo "  Landing: http://localhost:$LANDING_PORT"
echo "  UI:      http://localhost:$UI_PORT"
echo "  API:     http://localhost:$SERVER_PORT"
echo "  Runner:  http://localhost:$RUNNER_PORT"
echo "  Ollama:  http://localhost:11434"
echo "  Proxy:   http://localhost:8080"
echo ""
echo "Root: $ROOT_DIR"

if [ ! -d server ] || [ ! -d ui ] || [ ! -d runner ]; then
    die "This script must be run from the aiwebapp root directory containing server, ui, runner"
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

step "Dependencies"
if prompt_user "Install dependencies for all services now?" "n"; then
    (cd server && npm ci) || die "server npm ci failed"
    (cd ui && npm ci) || die "ui npm ci failed"
    (cd runner && npm ci) || die "runner npm ci failed"
fi

step "Environment Setup"
server_env_file="server/.env"
if [ ! -f "$server_env_file" ] && [ -f "server/.env.example" ]; then
    cp server/.env.example "$server_env_file"
fi

ui_origin_default="http://localhost:$UI_PORT"
server_public_default="http://localhost:$SERVER_PORT"
runner_url_default="http://localhost:$RUNNER_PORT"

existing_cors_origin=$(get_env_value "$server_env_file" "CORS_ORIGIN")
existing_server_public=$(get_env_value "$server_env_file" "SERVER_PUBLIC_URL")
existing_state_secret=$(get_env_value "$server_env_file" "OAUTH_STATE_SECRET")

cors_origin=$(prompt_value "Server CORS_ORIGIN" "${existing_cors_origin:-$ui_origin_default}")
server_public=$(prompt_value "Server SERVER_PUBLIC_URL (OAuth redirect base)" "${existing_server_public:-$server_public_default}")
set_env_value "$server_env_file" "PORT" "$SERVER_PORT"
set_env_value "$server_env_file" "CORS_ORIGIN" "$cors_origin"
set_env_value "$server_env_file" "RUNNER_URL" "$runner_url_default"
set_env_value "$server_env_file" "SERVER_PUBLIC_URL" "$server_public"

if prompt_user "Configure OAuth providers now?" "n"; then
    state_secret=$(prompt_value "Server OAUTH_STATE_SECRET" "${existing_state_secret:-}")
    if [ -n "${state_secret:-}" ]; then
        set_env_value "$server_env_file" "OAUTH_STATE_SECRET" "$state_secret"
    fi

    gh_id=$(prompt_value "GITHUB_CLIENT_ID (leave blank to skip)" "$(get_env_value "$server_env_file" "GITHUB_CLIENT_ID")")
    gh_secret=$(prompt_value "GITHUB_CLIENT_SECRET (leave blank to skip)" "$(get_env_value "$server_env_file" "GITHUB_CLIENT_SECRET")")
    [ -n "${gh_id:-}" ] && set_env_value "$server_env_file" "GITHUB_CLIENT_ID" "$gh_id"
    [ -n "${gh_secret:-}" ] && set_env_value "$server_env_file" "GITHUB_CLIENT_SECRET" "$gh_secret"

    google_id=$(prompt_value "GOOGLE_CLIENT_ID (leave blank to skip)" "$(get_env_value "$server_env_file" "GOOGLE_CLIENT_ID")")
    google_secret=$(prompt_value "GOOGLE_CLIENT_SECRET (leave blank to skip)" "$(get_env_value "$server_env_file" "GOOGLE_CLIENT_SECRET")")
    [ -n "${google_id:-}" ] && set_env_value "$server_env_file" "GOOGLE_CLIENT_ID" "$google_id"
    [ -n "${google_secret:-}" ] && set_env_value "$server_env_file" "GOOGLE_CLIENT_SECRET" "$google_secret"

    ms_id=$(prompt_value "MICROSOFT_CLIENT_ID (leave blank to skip)" "$(get_env_value "$server_env_file" "MICROSOFT_CLIENT_ID")")
    ms_secret=$(prompt_value "MICROSOFT_CLIENT_SECRET (leave blank to skip)" "$(get_env_value "$server_env_file" "MICROSOFT_CLIENT_SECRET")")
    [ -n "${ms_id:-}" ] && set_env_value "$server_env_file" "MICROSOFT_CLIENT_ID" "$ms_id"
    [ -n "${ms_secret:-}" ] && set_env_value "$server_env_file" "MICROSOFT_CLIENT_SECRET" "$ms_secret"

    apple_id=$(prompt_value "APPLE_CLIENT_ID (leave blank to skip)" "$(get_env_value "$server_env_file" "APPLE_CLIENT_ID")")
    apple_secret=$(prompt_value "APPLE_CLIENT_SECRET (leave blank to skip)" "$(get_env_value "$server_env_file" "APPLE_CLIENT_SECRET")")
    [ -n "${apple_id:-}" ] && set_env_value "$server_env_file" "APPLE_CLIENT_ID" "$apple_id"
    [ -n "${apple_secret:-}" ] && set_env_value "$server_env_file" "APPLE_CLIENT_SECRET" "$apple_secret"
fi

step "UI + Runner Local Settings"
: > "$LOG_DIR/server.log"
: > "$LOG_DIR/ui.log"
: > "$LOG_DIR/runner.log"
: > "$LOG_DIR/landing.log"

if [ -f ui/.env.local ]; then
    existing_token=$(grep -m1 '^RUNNER_TOKEN=' ui/.env.local | cut -d'=' -f2- || true)
    existing_ai_api_url=$(grep -m1 '^NEXT_PUBLIC_AI_API_URL=' ui/.env.local | cut -d'=' -f2- || true)
else
    existing_token="change_me"
    existing_ai_api_url=""
fi

AI_API_PUBLIC_URL=${existing_ai_api_url:-http://localhost:8080}
AI_API_URL=${AI_API_PUBLIC_URL:-http://localhost:8080}

cat > ui/.env.local << EOF
# Managed by hotreload-test.sh
# NEXT_PUBLIC_OS_SECURITY_KEY=your_token_here

NEXT_PUBLIC_AI_API_URL=$AI_API_PUBLIC_URL

RUNNER_URL=http://localhost:$RUNNER_PORT
RUNNER_TOKEN=${existing_token:-change_me}
EOF

RUNNER_TOKEN=${existing_token:-change_me}

if [ -f runner/.env ]; then
    bridge_url=$(grep -m1 '^BRIDGE_URL=' runner/.env | cut -d'=' -f2- || true)
    bridge_token=$(grep -m1 '^BRIDGE_TOKEN=' runner/.env | cut -d'=' -f2- || true)
fi
BRIDGE_URL=${bridge_url:-}
BRIDGE_TOKEN=${bridge_token:-}

step "Optional Dependencies Check"
if have_cmd curl; then
    proxy_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:8080" 2>/dev/null || echo 000)
    ollama_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:11434/api/tags" 2>/dev/null || echo 000)
    if [ "$proxy_code" = "000" ]; then
        echo "WARN: Proxy not reachable at http://localhost:8080 (ok if you're not using Copilot API)."
    fi
    if [ "$ollama_code" = "000" ]; then
        echo "WARN: Ollama not reachable at http://localhost:11434 (ok if you're not using Ollama provider)."
    fi
else
    echo "WARN: curl not found; skipping proxy/ollama checks."
fi

run_with_ato() {
    local logfile="$1"; shift
    local cmd="$*"
    local pid
    if command -v ato >/dev/null 2>&1; then
        ato bash -lc "$cmd" >>"$logfile" 2>&1 &
        pid=$!
    else
        nohup bash -lc "$cmd" >>"$logfile" 2>&1 &
        pid=$!
    fi
    printf '%s' "$pid"
}

step "Start Services"
if prompt_user "Start landing server (http://localhost:6868)?" "y"; then
    LANDING_PID=$(run_with_ato "$LOG_DIR/landing.log" "node landing/server.mjs")
    sleep 0.2
fi

echo "Starting API server..."
SERVER_PID=$(run_with_ato "$LOG_DIR/server.log" "cd server && PORT=\"$SERVER_PORT\" RUNNER_URL=\"http://localhost:$RUNNER_PORT\" CORS_ORIGIN=\"$cors_origin\" SERVER_PUBLIC_URL=\"$server_public\" MAX_ITERATIONS=10 REQUEST_TIMEOUT_MS=30000 MAX_PAYLOAD_SIZE=1048576 FEATURE_X_ENABLED=false npm run dev")
sleep 0.2

echo "Starting UI..."
UI_PID=$(run_with_ato "$LOG_DIR/ui.log" "cd ui && MAX_ITERATIONS=10 REQUEST_TIMEOUT_MS=30000 MAX_PAYLOAD_SIZE=1048576 FEATURE_X_ENABLED=false npm run dev")
sleep 0.2

echo "Starting runner..."
RUNNER_PID=$(run_with_ato "$LOG_DIR/runner.log" "cd runner && PORT=\"$RUNNER_PORT\" RUNNER_TOKEN=\"$RUNNER_TOKEN\" AI_API_URL=\"$AI_API_URL\" BRIDGE_URL=\"$BRIDGE_URL\" BRIDGE_TOKEN=\"$BRIDGE_TOKEN\" RUNNER_MAX_CONCURRENCY=${RUNNER_MAX_CONCURRENCY:-2} MAX_ITERATIONS=10 REQUEST_TIMEOUT_MS=30000 MAX_PAYLOAD_SIZE=1048576 FEATURE_X_ENABLED=false npm run dev")
sleep 0.2

echo ""
echo "Started:"
[ -n "${LANDING_PID:-}" ] && echo "  Landing PID: $LANDING_PID"
echo "  Server PID:  $SERVER_PID"
echo "  UI PID:      $UI_PID"
echo "  Runner PID:  $RUNNER_PID"
echo ""
echo "URLs:"
echo "  Landing: http://localhost:$LANDING_PORT"
echo "  UI:      http://localhost:$UI_PORT"
echo "  API:     http://localhost:$SERVER_PORT"
echo "  Runner:  http://localhost:$RUNNER_PORT"

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
            echo "Check logs: tail -n 50 $log"
            return 1
        fi
    fi
    return 0
}

step "Health Checks"
sleep 1
check_service UI "http://localhost:$UI_PORT" "$UI_PID" "$LOG_DIR/ui.log" || true
check_service Server "http://localhost:$SERVER_PORT/health" "$SERVER_PID" "$LOG_DIR/server.log" || true
check_service Runner "http://localhost:$RUNNER_PORT/health" "$RUNNER_PID" "$LOG_DIR/runner.log" || true

step "Smoke Test"
if prompt_user "Run smoke tests now (npm run smoke)?" "n"; then
    npm run smoke || true
fi

step "Logs"
if prompt_user "Tail logs now (Ctrl+C to stop)?" "y"; then
    tail -n +1 -f "$LOG_DIR/landing.log" | sed 's/^/[Landing] /' &
    tail -n +1 -f "$LOG_DIR/server.log" | sed 's/^/[Server]  /' &
    tail -n +1 -f "$LOG_DIR/ui.log" | sed 's/^/[UI]      /' &
    tail -n +1 -f "$LOG_DIR/runner.log" | sed 's/^/[Runner]  /' &
    wait
fi

echo ""
echo "Services are running in the background."
echo "Stop them with:"
echo "  kill $SERVER_PID $UI_PID $RUNNER_PID ${LANDING_PID:-}"
echo "Or press Ctrl+C in this terminal to stop them via the script."

wait

