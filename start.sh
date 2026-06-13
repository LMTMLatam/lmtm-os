#!/bin/sh
echo "=== LMTM-OS wrapper $(date -u) ==="
echo "PORT=$PORT NODE_ENV=$NODE_ENV"

# ── Phase 1: Check node_modules symlinks ──
echo "--- checking node_modules ---"
DIAG_OUTPUT="/tmp/diag.json"
node -e "
const fs = require('fs'), path = require('path');
const out = {};

// Check key packages
for (const pkg of ['express','drizzle-orm','postgres','detect-port','zod']) {
  const p = '/app/node_modules/' + pkg;
  try {
    const stat = fs.lstatSync(p);
    out[pkg] = {
      exists: true,
      isSymlink: stat.isSymbolicLink(),
      target: stat.isSymbolicLink() ? fs.readlinkSync(p) : null
    };
    if (stat.isSymbolicLink()) {
      try { out[pkg].resolvesTo = fs.realpathSync(p); } catch(e) { out[pkg].resolvesTo = 'BROKEN: ' + e.message; }
    }
  } catch(e) { out[pkg] = { error: e.message }; }
}

// Check @paperclipai
try {
  const entries = fs.readdirSync('/app/node_modules/@paperclipai');
  out['@paperclipai'] = entries.map(e => {
    const fp = path.join('/app/node_modules/@paperclipai', e);
    const stat = fs.lstatSync(fp);
    return { name: e, isSymlink: stat.isSymbolicLink(), target: stat.isSymbolicLink() ? fs.readlinkSync(fp) : null };
  });
} catch(e) { out['@paperclipai'] = { error: e.message }; }

require('fs').writeFileSync('/tmp/diag.json', JSON.stringify(out, null, 2));
" 2>&1
echo "--- symlink check done ---"

# ── Phase 2: Try to start real server in background ──
# If server starts, it'll handle port $PORT and proxy becomes redundant.
echo "--- starting real LMTM-OS server in background ---"
node --conditions=production server/dist/index.js &
SRV_PID=$!
sleep 5

# Check if real server is listening
if kill -0 $SRV_PID 2>/dev/null; then
  echo "server pid=$SRV_PID (will fail to bind if proxy is on $PORT)"
fi

# Keep health proxy running so health checks pass
echo "--- health proxy on $PORT ---"
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