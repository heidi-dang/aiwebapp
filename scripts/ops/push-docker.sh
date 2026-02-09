#!/bin/bash
set -e

echo "Pushing Docker images to Docker Hub..."

docker push heididang/aiwebapp:ui-v0.01
docker push heididang/aiwebapp:ui-latest

docker push heididang/aiwebapp:server-v0.01
docker push heididang/aiwebapp:server-latest

docker push heididang/aiwebapp:runner-v0.01
docker push heididang/aiwebapp:runner-latest

echo "Push complete!"
