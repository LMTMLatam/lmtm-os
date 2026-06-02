#!/bin/sh
# LMTM-OS startup wrapper - logs node output and keeps container alive on crash
set -e
echo "=== LMTM-OS start wrapper $(date -u) ==="
echo "PORT=$PORT HOST=$HOST NODE_ENV=$NODE_ENV"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"
echo "USER=$(id -u) PWD=$(pwd)"
ls -la /app/server/dist/index.js 2>&1 || echo "MISSING dist/index.js"
echo "--- starting node ---"
node server/dist/index.js 2>&1
NODE_EXIT=$?
echo "--- node exited with code $NODE_EXIT ---"
echo "--- sleeping 300s to keep container alive for log capture ---"
sleep 300
