#!/usr/bin/env bash
# runner_test.sh — helper to test /run/leadhunter remotely using a local render_key.txt
# Usage: ./runner_test.sh
# Requirements: curl, a file at ~/AppData/Local/Temp/render_key.txt with a Render API key

KEY_FILE="$HOME/AppData/Local/Temp/render_key.txt"
SERVICE_URL="https://automiq-agents.onrender.com/run/leadhunter"

if [ ! -f "$KEY_FILE" ]; then
  echo "render_key.txt not found at $KEY_FILE"
  exit 1
fi

# The script attempts to read WEBHOOK_SECRET from the Render API if possible, but Render masks values.
# This script demonstrates the safe path: it fails if webhook secret isn't provided by user.

read -p "Paste the X-Webhook-Secret value (input hidden): " -s WEBHOOK_SECRET
echo
if [ -z "$WEBHOOK_SECRET" ]; then
  echo "No webhook secret provided; aborting."
  exit 1
fi

curl -s -X POST "$SERVICE_URL" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"dry_run": true}' \
  | jq '.'
