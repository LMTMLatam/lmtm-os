#!/bin/sh
# start.sh - LMTM-OS + OpenWA self-hosted startup wrapper.
#
# OpenWA is built at IMAGE BUILD TIME by docker/openwa-baileys-plugin/build.sh
# (called from Dockerfile). If the build fails there, a placeholder is
# installed and the build log is saved to /tmp/openwa-build.log.
#
# Here at runtime we:
#   1. Check that /app/openwa has a real OpenWA install
#   2. If yes, start it on port 2785 (waits up to 60s for /api/health)
#   3. Start LMTM-OS on port 3100 in the foreground
#
# If OpenWA build failed, LMTM-OS still starts (without WA integration).

set +e

echo "=== LMTM-OS + OpenWA start wrapper $(date -u) ==="
echo "PORT=${PORT} HOST=${HOST} NODE_ENV=${NODE_ENV}"
echo "OPENWA_PORT=${OPENWA_PORT:-2785} ENGINE_TYPE=${ENGINE_TYPE:-baileys}"
echo "OPENWA_URL=${OPENWA_URL}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"

# Sanity: does /app/openwa look like a real OpenWA install?
OPENWA_OK=0
if [ -f /app/openwa/dist/main.js ] && [ -d /app/openwa/node_modules ]; then
  OPENWA_OK=1
elif [ -f /app/openwa/main.js ] && [ -d /app/openwa/node_modules ]; then
  OPENWA_OK=1
fi

# ── 1. Start OpenWA ──
if [ -z "$OPENWA_SELF_HOSTED_DISABLED" ] && [ "$OPENWA_OK" = "1" ]; then
  echo "--- starting OpenWA on port ${OPENWA_PORT:-2785} (engine: ${ENGINE_TYPE:-baileys}) ---"
  cd /app/openwa
  if [ -f /app/openwa/dist/main.js ]; then
    OPENWA_ENTRY="dist/main.js"
  else
    OPENWA_ENTRY="main.js"
  fi
  PORT="${OPENWA_PORT:-2785}" ENGINE_TYPE="${ENGINE_TYPE:-baileys}" node "$OPENWA_ENTRY" > /tmp/openwa.log 2>&1 &
  OPENWA_PID=$!
  echo "openwa pid: $OPENWA_PID"

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
  echo "--- openwa NOT starting: install missing or OPENWA_SELF_HOSTED_DISABLED set ---"
  if [ -n "$OPENWA_SELF_HOSTED_DISABLED" ]; then
    echo "  reason: OPENWA_SELF_HOSTED_DISABLED"
  else
    echo "  reason: /app/openwa has no main.js/dist or no node_modules (build likely failed)"
  fi
  if [ -f /tmp/openwa-build.log ]; then
    echo "  --- last 40 lines of build log ---"
    tail -40 /tmp/openwa-build.log
  fi
fi

# ── 2. Start LMTM-OS server ──
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
echo "--- openwa.log (tail 30) ---"
tail -30 /tmp/openwa.log
echo "--- end openwa.log ---"

if [ -n "$OPENWA_PID" ] && kill -0 $OPENWA_PID 2>/dev/null; then
  echo "--- LMTM-OS exited; leaving openwa (pid $OPENWA_PID) running ---"
fi
echo "--- sleeping 600s to keep container alive ---"
sleep 600
