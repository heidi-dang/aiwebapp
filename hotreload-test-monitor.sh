#!/bin/bash

# hotreload-test.sh
# Starts UI, server, and runner with hot-reload in development,
# optionally opens Bottom (btm) for monitoring, and has live logs option.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

MAX_PORT=3050
USE_BTM=false
BTM_CONFIG=""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --logs|-l)
            LIVE_LOGS=true
            shift
            ;;
        --btm|-b)
            USE_BTM=true
            shift
            ;;
        --btm-config=*)
            BTM_CONFIG="${arg#*=}"
            USE_BTM=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -l, --logs           Show live logs"
            echo "  -b, --btm            Open Bottom (btm) for monitoring after starting"
            echo "  --btm-config=FILE    Use custom btm config file"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                     # Just start services"
            echo "  $0 -l                  # Start services and show live logs"
            echo "  $0 -b                  # Start services and open Bottom for monitoring"
            echo "  $0 -l -b               # Start services, show logs, then open Bottom"
            exit 0
            ;;
    esac
done

# Check if Bottom (btm) is available
check_btm() {
    if command -v btm >/dev/null 2>&1; then
        return 0
    else
        echo -e "${YELLOW}Warning: Bottom (btm) is not installed.${NC}"
        echo -e "${YELLOW}Install with:${NC}"
        echo -e "  ${CYAN}cargo install bottom${NC} (Rust/Cargo)"
        echo -e "  ${CYAN}brew install bottom${NC} (macOS Homebrew)"
        echo -e "  ${CYAN}sudo apt install bottom${NC} (Ubuntu/Debian)"
        echo -e "  ${CYAN}Or download from: https://github.com/ClementTsang/bottom${NC}"
        return 1
    fi
}

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
    echo -e "\n${YELLOW}Stopping services...${NC}"
    
    # Kill all child processes
    kill $(jobs -p) 2>/dev/null || true
    sleep 1
    
    # Force kill if still running
    for pid in "${SERVER_PID:-}" "${UI_PID:-}" "${RUNNER_PID:-}"; do
        [ -n "${pid:-}" ] && kill -9 "$pid" 2>/dev/null || true
    done
    
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup INT TERM EXIT

echo -e "${BOLD}📍 aiwebapp root: $ROOT_DIR${NC}"

if [ ! -d server ] || [ ! -d ui ] || [ ! -d runner ]; then
    echo -e "${RED}❌ This script must be run from the aiwebapp root directory containing server, ui, runner${NC}"
    exit 1
fi

if prompt_user "Install dependencies for all services now?" "n"; then
    echo -e "${CYAN}Installing dependencies...${NC}"
    (cd server && npm ci)
    (cd ui && npm ci)
    (cd runner && npm ci)
    echo -e "${GREEN}Dependencies installed.${NC}"
fi

echo -e "${CYAN}Starting services with port fallback (3000..$MAX_PORT)...${NC}"

# Find free ports
UI_PORT=$(find_free_port 3000 "$MAX_PORT") || { echo -e "${RED}No free UI port${NC}"; exit 1; }
SERVER_PORT=$(find_free_port 3001 "$MAX_PORT" "$UI_PORT") || { echo -e "${RED}No free Server port${NC}"; exit 1; }
RUNNER_PORT=$(find_free_port 3002 "$MAX_PORT" "$UI_PORT" "$SERVER_PORT") || { echo -e "${RED}No free Runner port${NC}"; exit 1; }

echo -e "${GREEN}Ports assigned:${NC}"
echo -e "  ${CYAN}UI:${NC}     ${GREEN}$UI_PORT${NC}"
echo -e "  ${CYAN}Server:${NC} ${GREEN}$SERVER_PORT${NC}"
echo -e "  ${CYAN}Runner:${NC} ${GREEN}$RUNNER_PORT${NC}"

echo "Clearing logs..."
: > "$LOG_DIR/server.log"
: > "$LOG_DIR/ui.log"
: > "$LOG_DIR/runner.log"

# Setup UI environment
if [ -f ui/.env.local ]; then
    existing_token=$(grep -m1 '^RUNNER_TOKEN=' ui/.env.local | cut -d'=' -f2- || true)
    existing_ai_api_url=$(grep -m1 '^NEXT_PUBLIC_AI_API_URL=' ui/.env.local | cut -d'=' -f2- || true)
else
    existing_token="change_me"
    existing_ai_api_url=""
fi

AI_API_PUBLIC_URL=${existing_ai_api_url:-https://copilot.heidiai.com.au}
AI_API_URL=${AI_API_PUBLIC_URL:-http://192.168.1.16:8080}

# Create/update .env.local for UI
cat > ui/.env.local << EOF
# Managed by hotreload-test.sh
# Optional: UI auth token for AgentOS requests
# NEXT_PUBLIC_OS_SECURITY_KEY=your_token_here

# API URL set to the actual server port
NEXT_PUBLIC_AI_API_URL=$AI_API_PUBLIC_URL

RUNNER_URL=http://localhost:$RUNNER_PORT
RUNNER_TOKEN=${existing_token:-change_me}
EOF

RUNNER_TOKEN=${existing_token:-change_me}

# Read bridge config
if [ -f runner/.env ]; then
    bridge_url=$(grep -m1 '^BRIDGE_URL=' runner/.env | cut -d'=' -f2- || true)
    bridge_token=$(grep -m1 '^BRIDGE_TOKEN=' runner/.env | cut -d'=' -f2- || true)
fi
BRIDGE_URL=${bridge_url:-}
BRIDGE_TOKEN=${bridge_token:-}

# Helper to run a command
run_with_ato() {
    local logfile="$1"; shift
    local cmd="$*"
    local pid
    
    if command -v ato >/dev/null 2>&1; then
        echo "[$(date '+%H:%M:%S')] Starting via ato: $cmd" >> "$logfile"
        ato bash -lc "$cmd" >>"$logfile" 2>&1 &
        pid=$!
    else
        echo "[$(date '+%H:%M:%S')] Starting via nohup: $cmd" >> "$logfile"
        nohup bash -lc "$cmd" >>"$logfile" 2>&1 &
        pid=$!
    fi
    printf '%s' "$pid"
}

# Start services
echo -e "\n${CYAN}Starting services...${NC}"

echo -e "${YELLOW}Starting server on port $SERVER_PORT...${NC}"
SERVER_PID=$(run_with_ato "$LOG_DIR/server.log" "cd server && PORT=\"$SERVER_PORT\" RUNNER_URL=\"http://localhost:$RUNNER_PORT\" npm run dev")
sleep 1

echo -e "${YELLOW}Starting UI on port $UI_PORT...${NC}"
UI_PID=$(run_with_ato "$LOG_DIR/ui.log" "cd ui && PORT=\"$UI_PORT\" npm run dev")
sleep 1

echo -e "${YELLOW}Starting runner on port $RUNNER_PORT...${NC}"
RUNNER_PID=$(run_with_ato "$LOG_DIR/runner.log" "cd runner && PORT=\"$RUNNER_PORT\" RUNNER_TOKEN=\"$RUNNER_TOKEN\" AI_API_URL=\"$AI_API_URL\" BRIDGE_URL=\"$BRIDGE_URL\" BRIDGE_TOKEN=\"$BRIDGE_TOKEN\" npm run dev")
sleep 1

echo -e "\n${GREEN}Services started successfully!${NC}"
echo -e "${BOLD}PIDs:${NC}"
echo -e "  ${CYAN}Server:${NC} ${YELLOW}$SERVER_PID${NC}"
echo -e "  ${CYAN}UI:${NC}     ${YELLOW}$UI_PID${NC}"
echo -e "  ${CYAN}Runner:${NC} ${YELLOW}$RUNNER_PID${NC}"

echo -e "\n${BOLD}Access URLs:${NC}"
echo -e "  ${CYAN}UI:${NC}     ${GREEN}http://localhost:$UI_PORT${NC}"
echo -e "  ${CYAN}Server:${NC} ${GREEN}http://localhost:$SERVER_PORT${NC}"
echo -e "  ${CYAN}Runner:${NC} ${GREEN}http://localhost:$RUNNER_PORT${NC}"

echo -e "\n${BOLD}Log files:${NC}"
echo -e "  ${CYAN}Server:${NC} ${YELLOW}$LOG_DIR/server.log${NC}"
echo -e "  ${CYAN}UI:${NC}     ${YELLOW}$LOG_DIR/ui.log${NC}"
echo -e "  ${CYAN}Runner:${NC} ${YELLOW}$LOG_DIR/runner.log${NC}"

# Quick health check
check_service() {
    local name=$1 url=$2 pid=$3
    local status=""
    
    # Check if process is running
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}✗${NC}"
        return 1
    fi
    
    # Try HTTP check if curl is available
    if command -v curl >/dev/null 2>&1; then
        if curl -s -f --max-time 3 "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠${NC}"
            return 0
        fi
    else
        echo -e "${YELLOW}?${NC}"
        return 0
    fi
}

echo -e "\n${CYAN}Initial health check...${NC}"
echo -n "  UI: "; check_service UI "http://localhost:$UI_PORT" "$UI_PID"
echo -n "  Server: "; check_service Server "http://localhost:$SERVER_PORT/health" "$SERVER_PID"
echo -n "  Runner: "; check_service Runner "http://localhost:$RUNNER_PORT/health" "$RUNNER_PID"

# Create a custom btm config for monitoring our services
create_btm_config() {
    local config_file="$1"
    cat > "$config_file" << 'BTMCONFIG'
# Bottom configuration for aiwebapp monitoring
flags = { default = true, dot_marker = false, 
          group_processes = false, hide_table_gap = true, 
          current_usage = true, mem_as_value = false, 
          tree = true, show_disks = false, 
          unnormalized_cpu = false, process_command = false, 
          process_memory = true, process_cpu = true, 
          process_time = true }

# CPU and Memory display
table = { collapsible = false }

# Colors
color = "default"

# Widgets layout
row = [
    [{type="cpu", default=true}, {type="mem", default=true}],
    [{type="proc", default=true}],
    [{type="temp", default=true}, {type="disk", default=true}]
]

[disk_filter]
is_list_ignored = true
list = ["/dev/loop", "tmpfs", "udev", "/dev/sr", "overlay"]

[process_filter]
case_sensitive = false
whole_word = false
regex = false

[process]
tree = true
group = false

[cpu]
default = true
hide_avg = false
graph_legend = false

[memory]
default = true
graph_legend = false

[network]
default = false

[disk]
default = true
mount_filter = { is_list_ignored = false, list = [] }

[temperature]
default = true

[battery]
default = false
BTMCONFIG
}

# Function to start Bottom monitoring
start_btm_monitoring() {
    if check_btm; then
        echo -e "\n${CYAN}Starting Bottom (btm) for monitoring...${NC}"
        echo -e "${YELLOW}Press 'q' to quit btm and return to this terminal.${NC}"
        echo -e "${YELLOW}Press '?' in btm for help and available commands.${NC}"
        
        # Create a custom config if requested
        local btm_args=""
        if [ -n "$BTM_CONFIG" ] && [ -f "$BTM_CONFIG" ]; then
            btm_args="--config $BTM_CONFIG"
            echo -e "${CYAN}Using custom config: $BTM_CONFIG${NC}"
        else
            # Create a temporary config file
            local temp_config="/tmp/btm_aiwebapp_$$.toml"
            create_btm_config "$temp_config"
            btm_args="--config $temp_config"
        fi
        
        # Add process filtering to show our services
        local proc_filter="(node|npm|next|server|runner|ui)"
        
        echo -e "\n${GREEN}=== Bottom Monitoring Started ===${NC}"
        echo -e "${CYAN}Monitoring processes:${NC} ${proc_filter}"
        echo -e "${CYAN}Log files:${NC} ${LOG_DIR}/{server,ui,runner}.log"
        echo -e "${CYAN}Press 'q' in btm to exit monitoring${NC}"
        echo -e "${GREEN}================================${NC}\n"
        
        # Start btm with our filter
        if command -v btm >/dev/null 2>&1; then
            btm $btm_args --process_command "$proc_filter"
            
            # Clean up temp config if we created one
            [ -n "$temp_config" ] && [ -f "$temp_config" ] && rm -f "$temp_config"
            
            echo -e "\n${CYAN}Bottom monitoring ended.${NC}"
            echo -e "${YELLOW}Services are still running in the background.${NC}"
            echo -e "${YELLOW}Run 'tail -f logs/*.log' to view logs.${NC}"
        fi
    else
        echo -e "${YELLOW}Falling back to log monitoring...${NC}"
        start_log_monitoring
    fi
}

# Function for basic log monitoring
start_log_monitoring() {
    echo -e "\n${CYAN}Starting log monitoring...${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop monitoring (services will keep running).${NC}"
    echo -e "${GREEN}=== Service Logs ===${NC}\n"
    
    # Use tail with line buffering
    tail -n 20 -f "$LOG_DIR/server.log" | while read line; do
        echo -e "${BLUE}[Server]${NC} $line"
    done &
    TAIL1_PID=$!
    
    tail -n 20 -f "$LOG_DIR/ui.log" | while read line; do
        echo -e "${GREEN}[UI]${NC}     $line"
    done &
    TAIL2_PID=$!
    
    tail -n 20 -f "$LOG_DIR/runner.log" | while read line; do
        echo -e "${YELLOW}[Runner]${NC} $line"
    done &
    TAIL3_PID=$!
    
    # Wait for Ctrl+C
    wait
    
    # Clean up tail processes
    kill $TAIL1_PID $TAIL2_PID $TAIL3_PID 2>/dev/null || true
}

# Show quick monitoring options
show_monitoring_options() {
    echo -e "\n${BOLD}Monitoring Options:${NC}"
    echo -e "  1. ${CYAN}Open Bottom (btm) for system monitoring${NC}"
    echo -e "  2. ${CYAN}Watch live logs${NC}"
    echo -e "  3. ${CYAN}Exit and leave services running${NC}"
    echo -e "  4. ${RED}Stop all services and exit${NC}"
    echo -n -e "\n${YELLOW}Choose an option [1-4]: ${NC}"
    
    read -r choice
    case $choice in
        1)
            start_btm_monitoring
            ;;
        2)
            start_log_monitoring
            ;;
        3)
            echo -e "\n${GREEN}Services are running in the background.${NC}"
            echo -e "${CYAN}To view logs:${NC} tail -f $LOG_DIR/*.log"
            echo -e "${CYAN}To stop services:${NC} kill $SERVER_PID $UI_PID $RUNNER_PID"
            exit 0
            ;;
        4)
            cleanup
            ;;
        *)
            echo -e "${YELLOW}Invalid choice. Exiting.${NC}"
            exit 0
            ;;
    esac
}

# Main execution flow
if [ "$USE_BTM" = true ]; then
    # Start Bottom immediately if requested
    start_btm_monitoring
elif [ "${LIVE_LOGS:-false}" = true ]; then
    # Show logs immediately if requested
    start_log_monitoring
else
    # Interactive mode
    echo -e "\n${GREEN}✅ All services are now running!${NC}"
    echo -e "${CYAN}What would you like to do next?${NC}"
    
    # Check if btm is available
    if check_btm; then
        echo -e "${YELLOW}Tip: Bottom (btm) is available for advanced monitoring.${NC}"
    fi
    
    # Give a brief moment for services to fully start
    sleep 2
    
    # Show monitoring options
    show_monitoring_options
fi

# If we reach here and services are still running, wait for them
echo -e "\n${YELLOW}Services are running. Press Ctrl+C to stop all services.${NC}"
wait
