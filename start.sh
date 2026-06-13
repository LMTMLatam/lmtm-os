#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Import test WITH --conditions=production ──
echo "--- testing @paperclipai/db import ---"
DIAG_OUTPUT="/tmp/diag.json"
echo '{"diag":"running"}' > "$DIAG_OUTPUT"

node --conditions=production -e "
const fs = require('fs');
Promise.all([
  import('@paperclipai/db').then(m => ({ok:true, exports: Object.keys(m).length})).catch(e => ({ok:false, error:e.message, stack:e.stack?.split('\n').slice(0,8).join('\n')})),
  import('@paperclipai/shared').then(m => ({ok:true, exports: Object.keys(m).length})).catch(e => ({ok:false, error:e.message})),
  import('drizzle-orm').then(m => ({ok:true})).catch(e => ({ok:false, error:e.message})),
  import('express').then(m => ({ok:true})).catch(e => ({ok:false, error:e.message})),
]).then(results => {
  const out = {
    '@paperclipai/db': results[0],
    '@paperclipai/shared': results[1],
    'drizzle-orm': results[2],
    'express': results[3],
  };
  fs.writeFileSync('/tmp/diag.json', JSON.stringify(out, null, 2));
  console.log('import test results:', JSON.stringify(out));
  if (!results[0].ok || !results[1].ok) process.exit(1);
});
" 2>&1
echo "--- import test exit: $? ---"

# ── Phase 2: Health proxy ──
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
echo "--- container ready ---"
while true; do sleep 60; done