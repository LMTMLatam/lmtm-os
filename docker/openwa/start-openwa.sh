#!/bin/sh
# start-openwa.sh - boot wa-automate Easy API with the right flags.
#
# We pass --config to load a JSON file that controls the runtime. This is
# the official way to set useChrome, executablePath, qrTimeout, authTimeout
# and chromiumArgs. The CLI flag --use-chrome does NOT exist in 4.76.0's
# official CLI surface — only the config object accepts useChrome.
#
# Important env vars (set in render.yaml):
#   WA_AUTOMATE_PORT       port to bind (default 8080, NOT $PORT)
#   WA_AUTOMATE_API_KEY    api key for the HTTP server
#   WA_AUTOMATE_SESSION_ID session name
#   PAPERCLIP_AUTH_PUBLIC_BASE_URL   used to derive the webhook URL

set -e

# wa-automate binds to --port. Use WA_AUTOMATE_PORT (we explicitly set this
# to 8080 in render.yaml) instead of $PORT — Render injects $PORT=10000 for
# the LMTM-OS server, but openwa should listen on 8080.
OPENWA_PORT="${WA_AUTOMATE_PORT:-8080}"
ARGS="--port ${OPENWA_PORT} --config /app/openwa.config.json --session-id ${WA_AUTOMATE_SESSION_ID:-lmtm}"

# Use the same API key the LMTM-OS server uses.
API_KEY="${WA_AUTOMATE_API_KEY:-${OPENWA_API_KEY:-}}"
if [ -n "$API_KEY" ]; then
  ARGS="$ARGS --api-key $API_KEY"
fi

# Webhook from LMTM-OS to OpenWA (events go back).
if [ -n "$PAPERCLIP_AUTH_PUBLIC_BASE_URL" ]; then
  WA_WEBHOOK="${PAPERCLIP_AUTH_PUBLIC_BASE_URL%/}/api/wa-bot/webhook"
  ARGS="$ARGS --webhook $WA_WEBHOOK"
  echo "[openwa] webhook set to $WA_WEBHOOK"
fi

# Debug: print what we're about to do
echo "[openwa] chrome: $(google-chrome --version 2>/dev/null || echo 'NOT FOUND')"
echo "[openwa] config file: $(ls -la /app/openwa.config.json 2>&1)"
echo "[openwa] ARGS: $ARGS"
echo "[openwa] listening on 0.0.0.0:${OPENWA_PORT} (api key: $([ -n "$API_KEY" ] && echo 'set' || echo 'MISSING'))"

echo "[openwa] starting: npx @open-wa/wa-automate@${WA_AUTOMATE_VERSION:-4.76.0} $ARGS"
exec npx @open-wa/wa-automate@${WA_AUTOMATE_VERSION:-4.76.0} $ARGS
