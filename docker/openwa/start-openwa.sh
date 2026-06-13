#!/bin/sh
# start-openwa.sh - boot custom OpenWA wrapper.
#
# We use a custom Node.js wrapper (custom-openwa.js) instead of the
# official Easy API CLI because the CLI has a hardcoded 30s
# waitForFunction on `window.Debug.VERSION` that fails for fresh
# sessions (the QR page doesn't expose Debug until the user scans,
# which takes minutes — not 30s).
#
# Our wrapper:
#   1. Starts an HTTP server FIRST on $OPENWA_PORT (so healthchecks
#      and /api/qr work immediately, even before WhatsApp auth).
#   2. Calls wa-automate's create() with useChrome + useStealth and
#      qrTimeout/authTimeout/waitForRipeSessionTimeout = 0 (wait forever).
#   3. Exposes /api/qr with the latest QR as a base64 data URL so
#      the LMTM-OS UI can show it.
#   4. Once authenticated, exposes /api/state, /api/groups, etc.

set -e

OPENWA_PORT="${WA_AUTOMATE_PORT:-8080}"

# Webhook from LMTM-OS to OpenWA (events go back).
if [ -n "$PAPERCLIP_AUTH_PUBLIC_BASE_URL" ]; then
  WA_WEBHOOK="${PAPERCLIP_AUTH_PUBLIC_BASE_URL%/}/api/wa-bot/webhook"
  export LMTM_WEBHOOK_URL="$WA_WEBHOOK"
  echo "[openwa] webhook set to $WA_WEBHOOK"
fi

echo "[openwa] chrome: $(google-chrome --version 2>/dev/null || echo 'NOT FOUND')"
echo "[openwa] config file (legacy, now ignored by custom server): $(ls -la /app/openwa.config.json 2>&1)"
echo "[openwa] listening on 0.0.0.0:${OPENWA_PORT} (api key: $([ -n "${WA_AUTOMATE_API_KEY:-${OPENWA_API_KEY:-}}" ] && echo 'set' || echo 'MISSING'))"
echo "[openwa] starting: node /app/custom-openwa.js"

exec node /app/custom-openwa.js
