#!/bin/sh
# start.sh - LMTM-OS startup wrapper.
#
# We use custom-openwa.cjs (wa-automate) as the WhatsApp backend.
# OpenWA self-hosted (Baileys) is deferred — see doc/plans.
#
# Layout after this script:
#   /tmp/server.log — server runtime log

set +e

echo "=== LMTM-OS start wrapper $(date -u) ==="
echo "PORT=${PORT} HOST=${HOST} NODE_ENV=${NODE_ENV}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"

# ── Start LMTM-OS server ──
echo "--- starting LMTM-OS server on port ${PORT:-3100} ---"
cd /app
ls -la /app/server/dist/index.js 2>&1
ls -la /app/ui-dist/index.html 2>&1 | head -3
node --conditions=production server/dist/index.js > /tmp/server.log 2>&1
SERVER_EXIT=$?
echo "--- node exited with code $SERVER_EXIT ---"
echo "--- server.log (tail 60) ---"
tail -60 /tmp/server.log
echo "--- end server.log ---"
