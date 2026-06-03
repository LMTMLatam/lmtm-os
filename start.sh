#!/bin/sh
# LMTM-OS startup wrapper - logs node output and keeps container alive on crash
# NO set -e: we want to see node's exit and keep container alive for log capture
echo "=== LMTM-OS start wrapper $(date -u) ==="
echo "PORT=${PORT} HOST=${HOST} NODE_ENV=${NODE_ENV}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"
echo "DATABASE_URL value: ${DATABASE_URL}"
echo "DATABASE_URL length: $(echo -n "$DATABASE_URL" | wc -c)"
echo "USER=$(id -u) PWD=$(pwd)"
ls -la /app/server/dist/index.js 2>&1
echo "--- ui-dist exists? ---"
ls -la /app/ui-dist 2>&1 | head -10
ls -la /app/ui-dist/index.html 2>&1 | head -3
echo "--- starting node ---"
node --conditions=production server/dist/index.js > /tmp/server.log 2>&1
NODE_EXIT=$?
echo "--- node exited with code $NODE_EXIT ---"
echo "--- server.log contents ---"
cat /tmp/server.log
echo "--- end of server.log ---"
echo "--- sleeping 600s to keep container alive ---"
sleep 600
