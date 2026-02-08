# hotreload-ui3006.sh
# Starts UI (port 3006), server, and runner with hot-reload in development.
# This is an opt-in variant that does not change the default scripts.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

set -e

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

: > "$LOG_DIR/server-ui3006.log"
: > "$LOG_DIR/ui-3006.log"
: > "$LOG_DIR/runner-ui3006.log"

cleanup() {
  echo "\nStopping services..."
  pkill -P $$ || true
  for pid in "${SERVER_PID:-}" "${UI_PID:-}" "${RUNNER_PID:-}"; do
    [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
  done
  sleep 0.5
}
trap cleanup INT TERM EXIT

echo "📍 aiwebapp root: $ROOT_DIR"

echo "Starting server (PORT=7777) (logs/server-ui3006.log)..."
nohup bash -lc "cd server && PORT=7777 npm run dev" >>"$LOG_DIR/server-ui3006.log" 2>&1 &
SERVER_PID=$!

sleep 0.2

echo "Starting runner (PORT=8788) (logs/runner-ui3006.log)..."
nohup bash -lc "cd runner && PORT=8788 npm run dev" >>"$LOG_DIR/runner-ui3006.log" 2>&1 &
RUNNER_PID=$!

sleep 0.2

echo "Starting UI (PORT=3006) (logs/ui-3006.log)..."
nohup bash -lc "cd ui && npm run dev:3006" >>"$LOG_DIR/ui-3006.log" 2>&1 &
UI_PID=$!

sleep 1

echo "PIDs: server=$SERVER_PID ui=$UI_PID runner=$RUNNER_PID"
echo "Access: UI=http://localhost:3006/register  Server=http://localhost:7777  Runner=http://localhost:8788"

echo "Tailing logs (press Ctrl+C to stop)..."
tail -n +1 -f "$LOG_DIR/server-ui3006.log" | sed 's/^/[Server] /' &
tail -n +1 -f "$LOG_DIR/ui-3006.log" | sed 's/^/[UI3006] /' &
tail -n +1 -f "$LOG_DIR/runner-ui3006.log" | sed 's/^/[Runner] /' &

wait