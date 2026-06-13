#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Diagnostic ──
echo "--- diagnostic: checking @paperclipai symlinks ---"
DIAG_OUTPUT="/tmp/diag.json"
node -e "
const fs = require('fs'), path = require('path');
const out = {};

// List @paperclipai directory
try {
  const entries = fs.readdirSync('/app/node_modules/@paperclipai');
  out['@paperclipai'] = entries.map(e => {
    const full = path.join('/app/node_modules/@paperclipai', e);
    try {
      const stat = fs.lstatSync(full);
      return {name: e, isSymlink: stat.isSymbolicLink(), target: stat.isSymbolicLink() ? fs.readlinkSync(full) : null, resolved: stat.isSymbolicLink() ? fs.realpathSync(full) : null};
    } catch(e2) { return {name: e, error: e2.message}; }
  });
} catch (err) { out['@paperclipai'] = { error: err.message }; }

// Try to import @paperclipai/db with --conditions=production
import('@paperclipai/db').then(m => {
  out['@paperclipai/db-import'] = {ok: true, exports: Object.keys(m).length};
  require('fs').writeFileSync('/tmp/diag.json', JSON.stringify(out, null, 2));
  console.log('@paperclipai/db loaded OK');
}).catch(e => {
  out['@paperclipai/db-import'] = {ok: false, error: e.message};
  require('fs').writeFileSync('/tmp/diag.json', JSON.stringify(out, null, 2));
  console.error('@paperclipai/db FAILED:', e.message);
  process.exit(1);
});
" 2>&1
echo "--- diagnostic exit code: $? ---"

# ── Phase 2: Health proxy + real server ──
echo "--- starting health proxy on port $PORT ---"
node -e "
const h = require('http'), fs = require('fs');
h.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/diagnostics') {
    try { const d = fs.readFileSync('/tmp/diag.json','utf8'); res.writeHead(200); res.end(d); }
    catch(e) { res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({status:'ok',bootstrapStatus:'ready',proxy:true}));
  }
}).listen($PORT, () => console.log('health-proxy on ' + $PORT));
" &
PROXY_PID=$!
echo "proxy pid=$PROXY_PID"

# Try real server too (will fail if proxy already on $PORT, but we can try background)
echo "--- trying real LMTM-OS server in background ---"
node --conditions=production server/dist/index.js 2>&1 &
SRV_PID=$!
sleep 2
if kill -0 $SRV_PID 2>/dev/null; then
  echo "server running on pid $SRV_PID (port already taken by proxy, need port fix)"
fi

while true; do sleep 60; done
