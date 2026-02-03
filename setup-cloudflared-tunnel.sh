#!/bin/bash
# setup-cloudflared-tunnel.sh
# Create a Cloudflare Tunnel to expose CopilotAPI Bridge for remote access

set -e

echo "🌐 Setting up Cloudflare Tunnel for CopilotAPI Bridge"
echo "==================================================="
echo

# Check if cloudflared is authenticated
if ! cloudflared tunnel list >/dev/null 2>&1; then
    echo "❌ Cloudflared is not authenticated or no tunnels exist."
    echo
    echo "To set up cloudflared:"
    echo "1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/"
    echo "2. Authenticate: cloudflared tunnel login"
    echo "3. Create a tunnel: cloudflared tunnel create <tunnel-name>"
    echo "4. Configure DNS: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/"
    echo
    echo "Or use the quick setup:"
    echo "cloudflared tunnel --url http://localhost:4000"
    echo
    exit 1
fi

echo "✅ Cloudflared is authenticated"
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

# Get existing tunnels
echo "Available tunnels:"
cloudflared tunnel list
echo

# Ask user to select or create a tunnel
read -p "Enter tunnel name (or 'quick' for temporary tunnel): " tunnel_name

if [ "$tunnel_name" = "quick" ]; then
    echo "🚀 Starting quick cloudflared tunnel on port 4000..."
    echo "This will create a temporary tunnel to the internet"
    echo "Press Ctrl+C to stop the tunnel"
    echo
    echo "⚠️  Note: Quick tunnels don't have custom domains"
    echo "     Use a named tunnel for production use"
    echo
    cloudflared tunnel --url http://localhost:4000
else
    # Check if tunnel exists
    if cloudflared tunnel list | grep -q "$tunnel_name"; then
        echo "✅ Tunnel '$tunnel_name' exists"
    else
        echo "Creating tunnel '$tunnel_name'..."
        cloudflared tunnel create "$tunnel_name"
    fi

    echo "🚀 Starting named tunnel '$tunnel_name'..."
    echo "Make sure DNS is configured for this tunnel"
    echo "Press Ctrl+C to stop the tunnel"
    echo
    cloudflared tunnel run "$tunnel_name"
fi