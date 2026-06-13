#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Diagnostic load ──
echo "--- diagnostic: checking filesystem ---"
DIAG_OUTPUT="/tmp/diag.json"
echo '{"diag":"running"}' > "$DIAG_OUTPUT"
node -e "
const fs = require('fs'), path = require('path');
const out = {};

// Check node_modules/@paperclipai structure
const pkgDir = '/app/node_modules/@paperclipai';
try {
  const entries = fs.readdirSync(pkgDir);
  out['@paperclipai'] = { entries };
  out['@paperclipai'].symlinks = {};
  for (const e of entries) {
    const full = path.join(pkgDir, e);
    try {
      const stat = fs.lstatSync(full);
      out['@paperclipai'].symlinks[e] = {
        isSymlink: stat.isSymbolicLink(),
        target: stat.isSymbolicLink() ? fs.readlinkSync(full) : null,
        isDir: stat.isDirectory()
      };
    } catch (err) { out['@paperclipai'].symlinks[e] = { error: err.message }; }
  }
} catch (err) { out['@paperclipai'] = { error: err.message }; }

// Check if packages/db exists and has package.json
try {
  const dbPkg = '/app/packages/db';
  const dbStat = fs.lstatSync(dbPkg);
  out['packages/db'] = { exists: true, isSymlink: dbStat.isSymbolicLink() };
  const pj = JSON.parse(fs.readFileSync(dbPkg + '/package.json', 'utf8'));
  out['packages/db'].name = pj.name;
  out['packages/db'].exports = JSON.stringify(pj.exports, null, 2);
} catch (err) { out['packages/db'] = { error: err.message }; }

require('fs').writeFileSync('/tmp/diag.json', JSON.stringify(out, null, 2));
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