#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Diagnostic load ──
echo "--- diagnostic: loading server module ---"
DIAG_OUTPUT="/tmp/diag.json"
echo '{"diag":"running"}' > "$DIAG_OUTPUT"
node -e "
import('./server/dist/index.js')
  .then(m => {
    const r = {ok:true, exports: Object.keys(m)};
    require('fs').writeFileSync('/tmp/diag.json', JSON.stringify(r));
    console.log('SERVER MODULE LOADED OK exports:', Object.keys(m));
  })
  .catch(e => {
    const r = {ok:false, error: e.message, stack: e.stack?.split('\n').slice(0,15).join('\n')};
    require('fs').writeFileSync('/tmp/diag.json', JSON.stringify(r));
    console.error('SERVER MODULE REJECTED:', e.message);
    process.exit(1);
  });
" 2>&1
DIAG_EXIT=$?
echo "--- diagnostic exit $DIAG_EXIT ---"

# ── Phase 2: Health proxy ──
echo "--- starting health proxy on port $PORT ---"
node -e "
const h = require('http'), fs = require('fs'), path = require('path');
h.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/diagnostics') {
    try {
      const d = fs.readFileSync('/tmp/diag.json','utf8');
      res.writeHead(200);
      res.end(d);
    } catch(e) {
      res.writeHead(500);
      res.end(JSON.stringify({error:e.message}));
    }
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({status:'ok',bootstrapStatus:'ready',proxy:true}));
  }
}).listen($PORT, () => console.log('health-proxy listening on ' + $PORT));
" &
PROXY_PID=$!
echo "proxy pid=$PROXY_PID"

echo "--- container entry complete ---"
while true; do sleep 60; done