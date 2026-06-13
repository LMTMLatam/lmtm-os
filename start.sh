#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# Check workspace symlinks are OK
ls -la /app/node_modules/@paperclipai/ 2>&1 | head -15

# Start the real server
echo "--- starting LMTM-OS server ---"
exec node --conditions=production server/dist/index.js 2>&1
