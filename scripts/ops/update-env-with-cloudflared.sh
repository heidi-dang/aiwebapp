#!/bin/bash
# update-env-with-cloudflared.sh
# Update environment variables with Cloudflare Tunnel URL

set -e

echo "🔄 Updating Environment with Cloudflare Tunnel URL"
echo "=================================================="
echo

# Ask user for the tunnel URL
echo "Cloudflare Tunnel URLs:"
echo "- For named tunnels: Your custom domain (e.g., https://api.yourdomain.com)"
echo "- For quick tunnels: The URL shown when you started the tunnel"
echo

read -p "Enter your Cloudflare Tunnel URL (including https://): " TUNNEL_URL

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Tunnel URL is required"
    exit 1
fi

# Validate URL format
if [[ ! "$TUNNEL_URL" =~ ^https:// ]]; then
    echo "❌ URL must start with https://"
    exit 1
fi

echo "✅ Using tunnel URL: $TUNNEL_URL"
echo

# Test the tunnel
echo "Testing tunnel connection..."
if ! curl -s "$TUNNEL_URL/v1/models" >/dev/null 2>&1; then
    echo "⚠️  Could not reach $TUNNEL_URL/v1/models"
    echo "   Make sure the tunnel is running and routing to localhost:4000"
    echo "   Continuing anyway..."
else
    echo "✅ Tunnel is accessible"
fi
echo

# Update runner/.env
echo "Updating runner/.env..."
if [ -f runner/.env ]; then
    # Remove existing AI_API_URL
    sed -i '/^AI_API_URL=/d' runner/.env
fi

echo "AI_API_URL=$TUNNEL_URL" >> runner/.env
echo "✅ Updated runner/.env"
echo

# Update ui/.env.local if it exists
if [ -f ui/.env.local ]; then
    echo "Updating ui/.env.local..."
    # Remove existing AI_API_URL
    sed -i '/^AI_API_URL=/d' ui/.env.local
    echo "AI_API_URL=$TUNNEL_URL" >> ui/.env.local
    echo "✅ Updated ui/.env.local"
fi

echo
echo "🎉 Environment updated!"
echo "Tunnel URL: $TUNNEL_URL"
echo
echo "Next steps:"
echo "1. Restart the services: npm run dev"
echo "2. Access your app remotely and test CopilotAPI models"
echo "3. Keep the cloudflared tunnel running for remote access"
echo
echo "To stop the tunnel: Find the cloudflared process and kill it"