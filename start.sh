#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Verify import WITH --conditions=production ──
echo "--- testing @paperclipai/db import ---"
node --conditions=production -e "
import('@paperclipai/db').then(m => {
  console.log('@paperclipai/db OK exports:', Object.keys(m).length);
}).catch(e => {
  console.error('@paperclipai/db FAILED:', e.message);
  process.exit(1);
});
" 2>&1
if [ $? -ne 0 ]; then
  echo "WARN: import test failed, but will still try server..."
fi

# ── Phase 2: Start LMTM-OS server ──
echo "--- starting LMTM-OS server ---"
# Restart loop: if server exits (crash), wait 5s and try again.
# This keeps the container alive for Render's health check
# even if the server has a transient startup error.
while true; do
  echo "--- starting at $(date -u) ---"
  node --conditions=production server/dist/index.js 2>&1
  RC=$?
  echo "--- server exit code $RC at $(date -u); restart in 5s ---"
  sleep 5
done
