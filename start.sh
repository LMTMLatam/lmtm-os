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

# ── CRM VPS SSH key ──────────────────────────────────────────────────────────
# The CRM Engineer agent (Esteban) operates the OWN LMTM CRM (FastAPI+React on
# VPS 82.29.56.162:2222). If CRM_SSH_KEY is provided, materialize it so the
# agent's Bash can `ssh -i /app/.ssh/crm_claude -p 2222 root@82.29.56.162`.
if [ -n "${CRM_SSH_KEY:-}" ]; then
  mkdir -p /app/.ssh && chmod 700 /app/.ssh
  printf '%s\n' "$CRM_SSH_KEY" > /app/.ssh/crm_claude
  chmod 600 /app/.ssh/crm_claude
  # Accept the host key on first use (avoids interactive prompt).
  ssh-keyscan -p 2222 82.29.56.162 >> /app/.ssh/known_hosts 2>/dev/null || true
  echo "[wrapper] CRM SSH key materialized at /app/.ssh/crm_claude"
else
  echo "[wrapper] CRM_SSH_KEY not set — CRM agent VPS access disabled"
fi

# NOTE: do NOT add a `require.resolve()` module preflight here. The server
# loads its deps via ESM `import`, which resolves them through pnpm's
# server/node_modules + .pnpm store correctly. A CommonJS `require.resolve`
# from /app gives FALSE "module not found" errors for express/drizzle-orm/
# etc. — that false signal sent a previous debugging session down a multi-
# hour Docker/symlink rabbit hole when the real crash was a config error.
# The /api/crash-log below is the source of truth: read the actual stack.

# ── WhatsApp gateway (lean Baileys) on $OPENWA_URL port (default 8080) ────────
# Independent of the main server: if it crashes we restart it without touching
# the server. The server reaches it via OPENWA_URL=http://localhost:8080.
if [ -f /app/wa-gateway/server.mjs ]; then
  (
    while true; do
      echo "[wa-gateway] starting at $(date -u)"
      node /app/wa-gateway/server.mjs >> /tmp/wa-gateway.log 2>&1
      echo "[wa-gateway] exited rc=$? at $(date -u); restart in 10s" >> /tmp/wa-gateway.log
      sleep 10
    done
  ) &
  echo "[wrapper] wa-gateway supervisor started"
else
  echo "[wrapper] no wa-gateway present — skipping"
fi

# ── LiteLLM router sidecar (NVIDIA primary + MiniMax fallback) on :4000 ───────
# Only pilot agents point ANTHROPIC_BASE_URL at http://127.0.0.1:4000; the rest
# hit MiniMax directly, so if this sidecar is down only the pilot agents are
# affected (never the main server). Gated on config + the required secrets.
if [ -f /app/litellm-config.yaml ] && [ -x /opt/litellm/bin/litellm ] \
   && [ -n "${NVIDIA_API_KEY:-}" ] && [ -n "${LITELLM_MASTER_KEY:-}" ] \
   && [ -n "${MINIMAX_API_KEY:-}" ]; then
  (
    while true; do
      echo "[litellm] starting at $(date -u)"
      env -u DATABASE_URL -u DIRECT_URL -u STORE_MODEL_IN_DB \
        /opt/litellm/bin/litellm --config /app/litellm-config.yaml --host 127.0.0.1 --port 4000 2>&1 | sed 's/^/[litellm] /'
      echo "[litellm] exited rc=$? at $(date -u); restart in 10s" >> /tmp/litellm.log
      sleep 10
    done
  ) &
  echo "[wrapper] litellm router supervisor started on 127.0.0.1:4000"
else
  echo "[wrapper] litellm router disabled (missing config/binary/NVIDIA_API_KEY/LITELLM_MASTER_KEY/MINIMAX_API_KEY)"
fi

# ── Hermes Agent config (~/.hermes): provider MiniMax + MCP de Paperclip ─────
# The hermes_local adapter spawns `hermes chat` per run; hermes reads its model,
# provider credentials and MCP servers from ~/.hermes. The paperclip MCP child
# inherits the PAPERCLIP_* env the adapter sets on the hermes process.
if command -v hermes >/dev/null 2>&1 && [ -n "${MINIMAX_API_KEY:-}" ]; then
  # Persist Hermes's self-learned skills/memory/sessions across deploys: the
  # container FS is ephemeral but the Railway volume at /data survives. The
  # whole point of Hermes is that it improves with time — don't wipe that.
  if [ -d /data ]; then
    mkdir -p /data/hermes
    if [ ! -L "${HOME:-/root}/.hermes" ]; then
      rm -rf "${HOME:-/root}/.hermes" 2>/dev/null || true
      ln -sfn /data/hermes "${HOME:-/root}/.hermes"
    fi
  fi
  mkdir -p "${HOME:-/root}/.hermes"
  printf 'MINIMAX_API_KEY=%s\n' "$MINIMAX_API_KEY" > "${HOME:-/root}/.hermes/.env"
  chmod 600 "${HOME:-/root}/.hermes/.env"
  cat > "${HOME:-/root}/.hermes/config.yaml" <<'HERMESCFG'
model:
  default: MiniMax-M3
  provider: minimax
mcp_servers:
  paperclip:
    command: "node"
    args: ["--conditions=production", "/app/packages/mcp-server/dist/stdio.js"]
HERMESCFG
  echo "[wrapper] hermes agent config materialized (provider=minimax + paperclip MCP)"
else
  echo "[wrapper] hermes agent config skipped (no hermes binary or MINIMAX_API_KEY)"
fi

# ── Daily Postgres self-backup to the /data volume ────────────────────────────
# Railway's raw postgres image has no managed backups. Dump daily (compressed,
# custom format) and keep the last 7. Survives redeploys on the volume; a real
# restore is `pg_restore -d $DATABASE_URL /data/backups/<file>`.
if command -v pg_dump >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ] && [ -d /data ]; then
  mkdir -p /data/backups
  (
    sleep 300  # let the boot settle before the first dump
    while true; do
      TS=$(date -u +%Y%m%d-%H%M)
      if pg_dump "$DATABASE_URL" -Fc -Z 6 -f "/data/backups/db-$TS.dump" 2>>/tmp/pg-backup.log; then
        echo "[pg-backup] OK db-$TS.dump ($(du -h "/data/backups/db-$TS.dump" | cut -f1))"
        ls -1t /data/backups/db-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
      else
        echo "[pg-backup] FAILED at $TS (see /tmp/pg-backup.log)"
      fi
      sleep 86400
    done
  ) &
  echo "[wrapper] pg-backup daily loop started (retención 7, /data/backups)"
else
  echo "[wrapper] pg-backup disabled (no pg_dump/DATABASE_URL//data)"
fi

# ── Fallback proxy: only started if the real server exits. ──
start_proxy() {
  node -e "
const http = require('http');
const fs = require('fs');
const PORT = parseInt(process.env.PORT || '3100', 10);
http.createServer(function (req, res) {
  var u = req.url || '';
  if (u.indexOf('/api/crash-log') === 0 || u.indexOf('/api/diagnostics') === 0) {
    var out = { ok: false, server: 'down', log: '' };
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
