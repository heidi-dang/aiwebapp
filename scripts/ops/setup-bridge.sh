#!/bin/bash
# setup-bridge.sh
# Helper script to configure bridge connection to VS Code Copilot CLI

set -e

echo "🤖 Setting up Bridge Connection to VS Code Copilot CLI"
echo "=================================================="
echo

# Check if VS Code is running with the extension
echo "📋 Prerequisites:"
echo "1. VS Code must be running"
echo "2. Your custom VS Code extension must be installed and active"
echo "3. The extension should expose a bridge API (typically on http://127.0.0.1:3210)"
echo "4. You should have a bridge token from the extension"
echo

read -p "Do you have the bridge URL? (default: http://127.0.0.1:3210) " bridge_url
bridge_url=${bridge_url:-http://127.0.0.1:3210}

read -p "Do you have the bridge token? " bridge_token

if [ -z "$bridge_token" ]; then
    echo "❌ Bridge token is required. Please get it from your VS Code extension."
    exit 1
fi

echo
echo "🔧 Configuring runner/.env..."

# Update runner/.env
if [ -f runner/.env ]; then
    # Remove existing bridge config
    sed -i '/^BRIDGE_/d' runner/.env
fi

echo "BRIDGE_URL=$bridge_url" >> runner/.env
echo "BRIDGE_TOKEN=$bridge_token" >> runner/.env

echo "✅ Bridge configuration added to runner/.env"
echo
echo "🚀 Next steps:"
echo "1. Restart the services: ./hotreload-test.sh"
echo "2. Test with a chat message - you should see real file operations instead of simulation"
echo "3. Check runner logs for bridge connection status"
echo
echo "🔍 To verify it's working:"
echo "- Look for 'Using bridge client' in runner logs"
echo "- Chat responses should show real file reads/edits instead of 'analyzeRequest/searchCode/generateResponse'"
echo
echo "💡 If bridge fails, it will automatically fall back to simulation mode."