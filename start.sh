#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# Start LMTM-OS server directly. If it crashes, restart after 5s.
while true; do
  echo "--- starting server at $(date -u) ---"
  node --conditions=production server/dist/index.js 2>&1
  RC=$?
  echo "--- server exited with code $RC at $(date -u); restart in 5s ---"
  sleep 5
done
