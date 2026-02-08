#!/bin/bash

# Production Deployment Script for AI Web App
# This script builds and deploys all services (server, ui, runner) for production

set -e

echo "🚀 AI Web App Production Deployment"
echo "=================================="
echo ""

# Function to prompt user
prompt_user() {
    local message="$1"
    local default="${2:-y}"
    local response

    read -p "$message (y/n) [$default]: " response
    response=${response:-$default}

    case "$response" in
        [Yy]|[Yy][Ee][Ss])
            return 0
            ;;
        [Nn]|[Nn][Oo])
            return 1
            ;;
        *)
            echo "Please answer yes or no."
            prompt_user "$message" "$default"
            ;;
    esac
}

# Port configuration
MAX_PORT=3050

# Function to find a free port
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

# Check if we're in the right directory
if [ ! -d "server" ] || [ ! -d "ui" ] || [ ! -d "runner" ]; then
    echo "❌ Error: This script must be run from the aiwebapp root directory"
    exit 1
fi

echo "📍 Current directory: $(pwd)"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies"
if prompt_user "Install dependencies for all services?"; then
    echo "Installing server dependencies..."
    cd server && npm ci && cd ..

    echo "Installing UI dependencies..."
    cd ui && npm ci && cd ..

    echo "Installing runner dependencies..."
    cd runner && npm ci && cd ..

    echo "✅ Dependencies installed"
else
    echo "⏭️  Skipping dependency installation"
fi
echo ""

# Step 2: Build services
echo "🔨 Step 2: Building services"
if prompt_user "Build all services?"; then
    echo "Building server..."
    cd server && npm run build && cd ..

    echo "Building UI..."
    cd ui && npm run build && cd ..

    echo "Building runner..."
    cd runner && npm run build && cd ..

    echo "✅ All services built"
else
    echo "⏭️  Skipping build"
fi
echo ""

# Step 3: Configure environment
echo "⚙️  Step 3: Environment configuration"
if prompt_user "Set up environment variables?"; then
    # Check for .env files
    if [ ! -f "server/.env" ]; then
        if [ -f "server/.env.example" ]; then
            cp server/.env.example server/.env
            echo "📝 Created server/.env from example"
            echo "⚠️  Please edit server/.env with your production values"
        fi
    fi

    if [ ! -f "ui/.env.local" ]; then
        if [ -f "ui/.env.example" ]; then
            cp ui/.env.example ui/.env.local
            echo "📝 Created ui/.env.local from example"
            echo "⚠️  Please edit ui/.env.local with your production values"
        fi
    fi

    if [ ! -f "runner/.env" ]; then
        if [ -f "runner/.env.example" ]; then
            cp runner/.env.example runner/.env
            echo "📝 Created runner/.env from example"
            echo "⚠️  Please edit runner/.env with your production values"
        fi
    fi

    echo "✅ Environment files prepared"
else
    echo "⏭️  Skipping environment setup"
fi
echo ""

# Step 4: Start services
echo "🚀 Step 4: Starting production services"
if prompt_user "Start all services in production mode?"; then
    # Find available ports starting from defaults
    echo "Finding available ports (3000..$MAX_PORT)..."
    UI_PORT=$(find_free_port 3000 "$MAX_PORT") || { echo "No free UI port"; exit 1; }
    SERVER_PORT=$(find_free_port 3001 "$MAX_PORT" "$UI_PORT") || { echo "No free Server port"; exit 1; }
    RUNNER_PORT=$(find_free_port 3002 "$MAX_PORT" "$UI_PORT" "$SERVER_PORT") || { echo "No free Runner port"; exit 1; }
    echo "Ports: UI=$UI_PORT, Server=$SERVER_PORT, Runner=$RUNNER_PORT"

    # Set environment variables for runner limits and Ollama config
    export MAX_ITERATIONS=50
    export MAX_TOKENS=5000
    export MAX_TIME_SECONDS=300
    export OLLAMA_BASE_URL=http://localhost:11434
    export OLLAMA_MODEL=llama3.2

    echo "Starting server..."
    cd server && PORT=$SERVER_PORT npm run start &
    SERVER_PID=$!
    echo "Server started (PID: $SERVER_PID)"

    echo "Starting UI..."
    cd ui && PORT=$UI_PORT npm run start &
    UI_PID=$!
    echo "UI started (PID: $UI_PID)"

    echo "Starting runner..."
    cd runner && PORT=$RUNNER_PORT npm run start &
    RUNNER_PID=$!
    echo "Runner started (PID: $RUNNER_PID)"

    echo ""
    echo "✅ All services started!"
    echo ""
    echo "🌐 Access URLs:"
    echo "   UI: http://localhost:$UI_PORT"
    echo "   Server API: http://localhost:$SERVER_PORT"
    echo "   Runner: http://localhost:$RUNNER_PORT"
    echo ""
    echo "📊 Process IDs:"
    echo "   Server: $SERVER_PID"
    echo "   UI: $UI_PID"
    echo "   Runner: $RUNNER_PID"
    echo ""
    echo "💡 To stop services, run: kill $SERVER_PID $UI_PID $RUNNER_PID"

    # Wait for user input to stop
    echo ""
    read -p "Press Enter to stop all services..."
    echo "Stopping services..."
    kill $SERVER_PID $UI_PID $RUNNER_PID 2>/dev/null || true
    echo "✅ Services stopped"
else
    echo "⏭️  Skipping service startup"
fi

echo ""
echo "🎉 Production deployment complete!"
echo "Check the access URLs above to verify everything is working."