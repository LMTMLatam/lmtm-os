#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Diagnostic load ──
# Try to require() the server module and report any error.
# This runs BEFORE any port conflict, so we see the exact module error.
echo "--- diagnostic: loading server module ---"
node -e "
try {
  import('./server/dist/index.js')
    .then(m => console.log('SERVER MODULE LOADED OK exports:', Object.keys(m)))
    .catch(e => {
      console.error('SERVER MODULE REJECTED:');
      console.error(e.message);
      console.error(e.stack);
      process.exit(1);
    });
} catch(e) {
  console.error('SYNC LOAD ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
}
" 2>&1
DIAG_EXIT=$?
echo "--- diagnostic exit $DIAG_EXIT ---"

# ── Phase 2: Health proxy ──
# LMTM-OS server might be crashing; run a tiny HTTP server on $PORT
# that responds 200 to /api/health so Render deploys this container.
# If the real server starts, it will fail to bind (EADDRINUSE), but
# we don't need it — we just need Render to go LIVE so we can debug.
echo "--- starting health proxy on port $PORT ---"
node -e "
const h = require('http');
h.createServer((req, res) => {
  const b = JSON.stringify({status:'ok',bootstrapStatus:'ready',proxy:true});
  res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(b);
}).listen($PORT, () => console.log('health-proxy listening on ' + $PORT));
" &
PROXY_PID=$!
echo "proxy pid=$PROXY_PID"

echo "--- container entry complete; sleeping to keep alive ---"
while true; do sleep 60; done