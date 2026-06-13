#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="

# Start server in background, restart on crash
while true; do
  echo "--- starting server ---"
  node --conditions=production server/dist/index.js 2>&1
  EXIT=$?
  echo "--- server exited with code $EXIT at $(date -u); restarting in 5s ---"
  sleep 5
done
