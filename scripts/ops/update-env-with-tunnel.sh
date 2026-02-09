#!/bin/bash
# update-env-with-tunnel.sh
# Update environment variables with ngrok tunnel URL

set -e

echo "🔄 Updating Environment with Ngrok Tunnel URL"
echo "============================================="
echo

# Get the ngrok tunnel URL
echo "Fetching ngrok tunnel status..."
TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')

if [ -z "$TUNNEL_URL" ] || [ "$TUNNEL_URL" = "null" ]; then
    echo "❌ Could not get ngrok tunnel URL"
    echo
    echo "Make sure ngrok is running with: ./setup-tunnel.sh"
    echo "And that the tunnel is active at http://localhost:4040"
    exit 1
fi

echo "✅ Found tunnel URL: $TUNNEL_URL"
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
echo "3. The tunnel will remain active as long as ngrok is running"
echo
echo "⚠️  Security Note: This exposes your CopilotAPI Bridge to the internet."
echo "   Make sure to stop the tunnel when not needed: pkill ngrok"