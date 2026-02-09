#!/bin/bash

# Function to prompt for input
prompt_input() {
  local prompt_message=$1
  local input_variable
  read -p "$prompt_message" input_variable
  echo $input_variable
}

# For testing, use default credentials
USERNAME="admin"
PASSWORD="password"

# Define the authentication endpoint
AUTH_URL="http://localhost:3001/auth/login"

# Make the POST request to get the token
RESPONSE=$(curl -s -X POST $AUTH_URL \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

# Print the raw response for debugging
echo "Raw response: $RESPONSE"

# Check if the response is valid JSON
if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
  # Extract the token from the response
  TOKEN=$(echo $RESPONSE | jq -r '.token')

  # Check if the token was retrieved successfully
  if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo "Authentication successful!"
    echo "Your token is: $TOKEN"
  else
    echo "Authentication failed. Token not found in response."
  fi
else
  echo "Error: Invalid JSON response from server."
fi