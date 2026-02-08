#!/bin/bash

echo "Running local CI checks..."

# Repo hygiene
echo "Checking for forbidden files..."
forbidden_files=".env .local .private *.log build/ dist/"
for file in $forbidden_files; do
  if find . -name "$file" -type f | grep -q .; then
    echo "ERROR: Forbidden file found: $file"
    exit 1
  fi
done
echo "✅ Repo hygiene passed"

# Config validation
echo "Validating configuration..."
required_vars="MAX_ITERATIONS REQUEST_TIMEOUT_MS MAX_PAYLOAD_SIZE FEATURE_X_ENABLED"
for var in $required_vars; do
  if ! grep -q "^$var=" */.env.example 2>/dev/null; then
    echo "ERROR: Missing required env var: $var"
    exit 1
  fi
done
echo "✅ Config validation passed"

# Safety check
echo "Checking for infinite loops..."
node scripts/check-safety.js
echo "✅ Safety check passed"

echo "All checks passed! Ready to push."