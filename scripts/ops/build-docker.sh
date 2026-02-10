#!/bin/bash
set -e

echo "Building Docker images with tags v0.01 and latest..."

docker build -t heididang/aiwebapp:ui-v0.01 -t heididang/aiwebapp:ui-latest ./ui
docker build -t heididang/aiwebapp:server-v0.01 -t heididang/aiwebapp:server-latest ./server
docker build -t heididang/aiwebapp:runner-v0.01 -t heididang/aiwebapp:runner-latest ./runner

echo "Build complete!"
