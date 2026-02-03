#!/bin/bash
# setup-tunnel.sh
# Create a secure tunnel to expose CopilotAPI Bridge for remote access

set -e

echo "🌐 Setting up Ngrok Tunnel for CopilotAPI Bridge"
echo "==============================================="
echo

# Check if ngrok is authenticated
if ! ngrok config check >/dev/null 2>&1; then
    echo "❌ Ngrok is not authenticated."
    echo
    echo "To set up ngrok:"
    echo "1. Go to https://ngrok.com and create an account"
    echo "2. Get your auth token from https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "3. Run: ngrok config add-authtoken YOUR_TOKEN_HERE"
    echo
    echo "After authentication, run this script again."
    exit 1
fi

echo "✅ Ngrok is authenticated"
echo

# Check if CopilotAPI Bridge is running
if ! curl -s http://localhost:4000/v1/models >/dev/null 2>&1; then
    echo "❌ CopilotAPI Bridge is not running on localhost:4000"
    echo
    echo "Please ensure:"
    echo "1. VS Code is running"
    echo "2. CopilotAPI Bridge extension is active"
    echo "3. The bridge is exposing API on http://localhost:4000"
    echo
    exit 1
fi

echo "✅ CopilotAPI Bridge is running"
echo

# Start ngrok tunnel
echo "🚀 Starting ngrok tunnel on port 4000..."
echo "This will expose your local CopilotAPI Bridge to the internet"
echo "Press Ctrl+C to stop the tunnel"
echo

ngrok http 4000