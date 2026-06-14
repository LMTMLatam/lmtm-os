#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Health proxy (keeps Render deploy alive) + crash log endpoint ─────────────
# /api/health     → 200 OK (Render health check)
# /api/crash-log  → contents of /tmp/server.log (server stdout+stderr)
node -e "
const http = require('http');
const fs = require('fs');
const PORT = parseInt(process.env.PORT || '3100', 10);
http.createServer(function(req, res) {
  if (req.url && req.url.indexOf('/api/crash-log') === 0) {
    try {
      const log = fs.readFileSync('/tmp/server.log', 'utf8');
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true, len: log.length, log: log}));
    } catch (e) {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: false, error: e.message, log: ''}));
    }
  } else {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({status: 'proxy-ok', ts: Date.now()}));
  }
}).listen(PORT, function() {
  console.log('[proxy] listening on port ' + PORT);
});
" &

# ── Pre-flight: check if key modules resolve ──────────────────────────────────
echo "[preflight] checking module resolution..."
node --conditions=production -e "
const mods = ['express','drizzle-orm','postgres','detect-port'];
for (const m of mods) {
  try { require.resolve(m); console.log('OK  ' + m); }
  catch(e) { console.log('ERR ' + m + ': ' + e.message.split('\n')[0]); }
}
" 2>&1

# ── Real server with full output capture ──────────────────────────────────────
echo "[wrapper] starting real server at $(date -u)"
node --conditions=production server/dist/index.js > /tmp/server.log 2>&1 &
SRV_PID=$!
echo "[wrapper] server PID=$SRV_PID"

# ── Keep-alive loop: report server status every 30s ──────────────────────────
while true; do
  sleep 30
  if kill -0 "$SRV_PID" 2>/dev/null; then
    echo "[wrapper] $(date -u) server pid=$SRV_PID alive"
  else
    echo "[wrapper] $(date -u) server pid=$SRV_PID EXITED — last 30 lines:"
    tail -30 /tmp/server.log 2>/dev/null || echo "(no log)"
  fi
done
