#!/bin/sh
# LMTM-OS + OpenWA self-hosted startup wrapper.
# - Starts OpenWA (Baileys engine) on port 2785 in the background
# - Waits for it to be ready (max 60s)
# - Starts LMTM-OS server on port 3100 in the foreground
# - If either crashes, the container exits so Render restarts it.
#
# Logs are written to /tmp/*.log and echoed to stdout (Render's log stream).

set +e

echo "=== LMTM-OS + OpenWA start wrapper $(date -u) ==="
echo "PORT=${PORT} HOST=${HOST} NODE_ENV=${NODE_ENV}"
echo "OPENWA_PORT=${OPENWA_PORT:-2785} ENGINE_TYPE=${ENGINE_TYPE:-baileys}"
echo "OPENWA_URL=${OPENWA_URL}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"

# ── 1. Start OpenWA ──
if [ -z "$OPENWA_SELF_HOSTED_DISABLED" ]; then
  echo "--- starting OpenWA on port ${OPENWA_PORT:-2785} (engine: ${ENGINE_TYPE:-baileys}) ---"

  # Run the built OpenWA from /app/openwa
  cd /app/openwa
  PORT="${OPENWA_PORT:-2785}" node dist/main.js > /tmp/openwa.log 2>&1 &
  OPENWA_PID=$!
  echo "openwa pid: $OPENWA_PID"

  # Wait for the healthcheck to come up (OpenWA exposes /api/health)
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    sleep 2
    if curl -sf "http://localhost:${OPENWA_PORT:-2785}/api/health" > /dev/null 2>&1; then
      echo "openwa ready after ${i}x2s"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "::warning::openwa did not become ready in 60s; continuing anyway. last log:"
      tail -40 /tmp/openwa.log
    fi
  done
else
  echo "OPENWA_SELF_HOSTED_DISABLED set - skipping openwa startup"
fi

# ── 2. Start LMTM-OS server ──
echo "--- starting LMTM-OS server on port ${PORT:-3100} ---"
cd /app
ls -la /app/server/dist/index.js 2>&1
ls -la /app/ui-dist/index.html 2>&1 | head -3
node --conditions=production server/dist/index.js > /tmp/server.log 2>&1
SERVER_EXIT=$?
echo "--- node exited with code $SERVER_EXIT ---"
echo "--- server.log contents ---"
cat /tmp/server.log
echo "--- end of server.log ---"
echo "--- openwa.log contents (last 60) ---"
tail -60 /tmp/openwa.log
echo "--- end of openwa.log ---"

# If node died, do NOT kill openwa — let it keep running so
# the next container restart (or LMTM-OS auto-reconnect) can use it.
if [ -n "$OPENWA_PID" ] && kill -0 $OPENWA_PID 2>/dev/null; then
  echo "--- LMTM-OS exited; leaving openwa (pid $OPENWA_PID) running ---"
fi

# Keep container alive for log capture
echo "--- sleeping 600s to keep container alive ---"
sleep 600
