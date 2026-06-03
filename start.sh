#!/bin/sh
# LMTM-OS startup wrapper. Logs node output and exits on crash so
# Render's deploy status reflects the real failure. The previous
# version slept 600s after a crash which kept the container alive
# but hid the actual error from Render's deploy status (it just
# showed "update_failed" with no reason).
echo "=== LMTM-OS start wrapper $(date -u) ==="
echo "PORT=${PORT} HOST=${HOST} NODE_ENV=${NODE_ENV}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"
echo "DATABASE_URL length: $(echo -n "$DATABASE_URL" | wc -c)"
echo "USER=$(id -u) PWD=$(pwd)"
ls -la /app/server/dist/index.js 2>&1
echo "--- starting node ---"
node --conditions=production server/dist/index.js 2>&1 | tee /tmp/server.log
NODE_EXIT=${PIPESTATUS[0]}
echo "--- node exited with code $NODE_EXIT ---"
exit $NODE_EXIT
