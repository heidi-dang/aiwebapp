#!/bin/bash

# Production Deployment Script (UI on port 3006)
# This is an opt-in variant that does not modify the default production.sh behavior.

set -e

echo "🚀 AI Web App Production Deployment (UI 3006)"
echo "============================================="
echo ""

prompt_user() {
    local message="$1"
    local default="${2:-y}"
    local response

    read -p "$message (y/n) [$default]: " response
    response=${response:-$default}

    case "$response" in
        [Yy]|[Yy][Ee][Ss]) return 0 ;;
        [Nn]|[Nn][Oo]) return 1 ;;
        *)
            echo "Please answer yes or no."
            prompt_user "$message" "$default"
            ;;
    esac
}

if [ ! -d "server" ] || [ ! -d "ui" ] || [ ! -d "runner" ]; then
    echo "❌ Error: This script must be run from the aiwebapp root directory"
    exit 1
fi

echo "📍 Current directory: $(pwd)"
echo ""

echo "📦 Step 1: Installing dependencies"
if prompt_user "Install dependencies for all services?"; then
    cd server && npm ci && cd ..
    cd ui && npm ci && cd ..
    cd runner && npm ci && cd ..
    echo "✅ Dependencies installed"
else
    echo "⏭️  Skipping dependency installation"
fi

echo ""

echo "🔨 Step 2: Building services"
if prompt_user "Build all services?"; then
    cd server && npm run build && cd ..
    cd ui && npm run build && cd ..
    cd runner && npm run build && cd ..
    echo "✅ All services built"
else
    echo "⏭️  Skipping build"
fi

echo ""

echo "⚙️  Step 3: Environment configuration"
if prompt_user "Set up environment variables?"; then
    if [ ! -f "server/.env" ] && [ -f "server/.env.example" ]; then
        cp server/.env.example server/.env
        echo "📝 Created server/.env from example"
    fi

    if [ ! -f "ui/.env.local" ] && [ -f "ui/.env.example" ]; then
        cp ui/.env.example ui/.env.local
        echo "📝 Created ui/.env.local from example"
    fi

    if [ ! -f "runner/.env" ] && [ -f "runner/.env.example" ]; then
        cp runner/.env.example runner/.env
        echo "📝 Created runner/.env from example"
    fi

    echo "✅ Environment files prepared"
else
    echo "⏭️  Skipping environment setup"
fi

echo ""

echo "🚀 Step 4: Starting production services"
if prompt_user "Start all services in production mode?"; then
    cd server && npm run start &
    SERVER_PID=$!

    cd ui && npm run start:3006 &
    UI_PID=$!

    cd runner && npm run start &
    RUNNER_PID=$!

    echo ""
    echo "✅ All services started!"
    echo ""
    echo "🌐 Access URLs:"
    echo "   UI: http://localhost:3006"
    echo "   Server API: http://localhost:3001"
    echo "   Runner: http://localhost:3002"
    echo ""
    echo "📊 Process IDs:"
    echo "   Server: $SERVER_PID"
    echo "   UI: $UI_PID"
    echo "   Runner: $RUNNER_PID"
    echo ""
    echo "💡 To stop services, run: kill $SERVER_PID $UI_PID $RUNNER_PID"

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
