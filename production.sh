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
    echo "Starting server..."
    cd server && npm run start &
    SERVER_PID=$!
    echo "Server started (PID: $SERVER_PID)"

    echo "Starting UI..."
    cd ui && npm run start &
    UI_PID=$!
    echo "UI started (PID: $UI_PID)"

    echo "Starting runner..."
    cd runner && npm run start &
    RUNNER_PID=$!
    echo "Runner started (PID: $RUNNER_PID)"

    echo ""
    echo "✅ All services started!"
    echo ""
    echo "🌐 Access URLs:"
    echo "   UI: http://localhost:3000"
    echo "   Server API: http://localhost:3001"
    echo "   Runner: http://localhost:3002"
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