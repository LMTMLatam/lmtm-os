#!/bin/sh
# start.sh - LMTM-OS + OpenWA self-hosted startup wrapper.
#
# We build OpenWA AT RUNTIME (not at image build time) for two reasons:
#   1. The build involves cloning a 100MB repo and running npm install,
#      which we want to debug interactively. If the build fails, the
#      log is at /tmp/openwa-build.log and visible via /api/wa-bot/diagnostics.
#   2. We avoid storing the build artifacts in the Docker image,
#      keeping the image lean.
#
# Trade-off: ~30-60s added to first container start while OpenWA builds.
# Subsequent restarts use the same /app/openwa (rebuilt only if missing).
#
# Layout after this script:
#   /app/openwa/         — built OpenWA (main.js, dist/, node_modules/)
#   /tmp/openwa-build.log — full build log
#   /tmp/openwa.log       — runtime log of the openwa process

set +e

echo "=== LMTM-OS + OpenWA start wrapper $(date -u) ==="
echo "PORT=${PORT} HOST=${HOST} NODE_ENV=${NODE_ENV}"
echo "OPENWA_PORT=${OPENWA_PORT:-2785} ENGINE_TYPE=${ENGINE_TYPE:-baileys}"
echo "OPENWA_URL=${OPENWA_URL}"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo yes || echo NO)"

# ── 1. Build OpenWA if not already built ──
if [ -z "$OPENWA_SELF_HOSTED_DISABLED" ] && [ ! -d /app/openwa/node_modules ]; then
  echo "--- building OpenWA (first boot) ---"
  if bash /build/plugin/build.sh 2>&1 | tee /tmp/openwa-build.log; then
    echo "--- openwa build OK ---"
    # Copy to /app/openwa
    mkdir -p /app/openwa
    cp -r /app/openwa-dist/. /app/openwa/
    echo "--- copied to /app/openwa ---"
  else
    BUILD_EXIT=$?
    echo "--- openwa build FAILED (exit $BUILD_EXIT) — see /tmp/openwa-build.log ---"
  fi
fi

# ── 2. Start OpenWA ──
OPENWA_OK=0
if [ -d /app/openwa/node_modules ] && [ -f /app/openwa/package.json ]; then
  if [ -f /app/openwa/dist/main.js ]; then
    OPENWA_OK=1
  elif [ -f /app/openwa/main.js ]; then
    OPENWA_OK=1
  fi
fi

OPENWA_PID=""
if [ -z "$OPENWA_SELF_HOSTED_DISABLED" ] && [ "$OPENWA_OK" = "1" ]; then
  echo "--- starting OpenWA on port ${OPENWA_PORT:-2785} ---"
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
  echo "--- openwa NOT starting (install missing or OPENWA_SELF_HOSTED_DISABLED) ---"
  if [ -f /tmp/openwa-build.log ]; then
    echo "  build log tail:"
    tail -20 /tmp/openwa-build.log | sed 's/^/    /'
  fi
fi

# ── 3. Start LMTM-OS server ──
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
echo "--- sleeping 600s ---"
sleep 600
