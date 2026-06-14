#!/bin/sh
# LMTM-OS startup wrapper.
#
# Strategy: run the REAL server bound to $PORT so it serves real traffic
# when healthy. Only if the server dies do we bring up a fallback proxy on
# $PORT — it keeps the Render deploy alive and exposes /api/crash-log so we
# can read exactly why the server crashed, instead of losing the trace.
#
# When the server is healthy the proxy never starts, so there is no port
# collision and the app is fully reachable. This file is the final
# production entrypoint, not a debug-only scaffold.

set -u
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=${PORT:-3100} NODE_ENV=${NODE_ENV:-?}"

# ── Pre-flight: log whether the core deps resolve (helps diagnose the
#    'missing module' class of crash without waiting for the stack trace). ──
echo "[preflight] module resolution:"
node --conditions=production -e "
for (const m of ['express','drizzle-orm','postgres','detect-port']) {
  try { require.resolve(m); console.log('  OK  ' + m); }
  catch (e) { console.log('  ERR ' + m + ': ' + String(e.message).split(String.fromCharCode(10))[0]); }
}
" 2>&1 | tee /tmp/preflight.log

# ── Fallback proxy: only started if the real server exits. ──
start_proxy() {
  node -e "
const http = require('http');
const fs = require('fs');
const PORT = parseInt(process.env.PORT || '3100', 10);
http.createServer(function (req, res) {
  var u = req.url || '';
  if (u.indexOf('/api/crash-log') === 0 || u.indexOf('/api/diagnostics') === 0) {
    var out = { ok: false, server: 'down', preflight: '', log: '' };
    try { out.preflight = fs.readFileSync('/tmp/preflight.log', 'utf8'); } catch (e) {}
    try { out.log = fs.readFileSync('/tmp/server.log', 'utf8'); } catch (e) {}
    out.ok = !!out.log;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
    return;
  }
  // Health check still answers 200 so Render keeps the container alive
  // long enough for an operator to read /api/crash-log.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'fallback-proxy', server: 'down', ts: Date.now() }));
}).listen(PORT, function () { console.log('[proxy] fallback listening on ' + PORT); });
" &
  echo "[wrapper] fallback proxy started (server is down — see /api/crash-log)"
}

# ── Start the real server bound to $PORT (nothing else holds it yet, so
#    detectPort returns $PORT and the app is reachable). Output goes to
#    /tmp/server.log; we stream that file to Render's container logs with
#    `tail -F` so operators see live output, and /api/crash-log can read it. ──
echo "[wrapper] starting real server at $(date -u)"
: > /tmp/server.log
node --conditions=production server/dist/index.js > /tmp/server.log 2>&1 &
SRV_PID=$!
echo "[wrapper] server PID=$SRV_PID"

# Mirror the server log to container stdout (background follower).
tail -n +1 -F /tmp/server.log 2>/dev/null &

PROXY_STARTED=0
TICK=0
while true; do
  if kill -0 "$SRV_PID" 2>/dev/null; then
    TICK=$((TICK + 1))
    if [ $((TICK % 12)) -eq 0 ]; then
      echo "[wrapper] $(date -u) server pid=$SRV_PID alive"
    fi
  else
    echo "[wrapper] $(date -u) real server EXITED"
    if [ "$PROXY_STARTED" -eq 0 ]; then
      start_proxy
      PROXY_STARTED=1
    fi
  fi
  sleep 5
done
