#!/bin/sh
# start-openwa.sh - boot wa-automate Easy API with the right flags.
#
# Flags we always set:
#   --port       $PORT
#   --api-key    $WA_AUTOMATE_API_KEY (or $OPENWA_API_KEY as fallback)
#   --session-id $WA_AUTOMATE_SESSION_ID
#   --webhook    $WA_AUTOMATE_WEBHOOK_URL (if set; pushes events to LMTM-OS)
#
# We exec npx so signals (SIGTERM) reach the node process and
# graceful shutdown works under docker stop.

set -e

ARGS="--port ${PORT} --session-id ${WA_AUTOMATE_SESSION_ID}"

# Use the same API key the LMTM-OS server uses. Either env var name works.
# OPENWA_API_KEY is what the wa-bot service reads.
# WA_AUTOMATE_API_KEY is what we historically called the openwa runtime key.
API_KEY="${WA_AUTOMATE_API_KEY:-${OPENWA_API_KEY:-}}"
if [ -n "$API_KEY" ]; then
  ARGS="$ARGS --api-key $API_KEY"
fi

# Webhook from LMTM-OS to OpenWA (events go back).
# PAPERCLIP_AUTH_PUBLIC_BASE_URL is set in render.yaml.
if [ -n "$PAPERCLIP_AUTH_PUBLIC_BASE_URL" ]; then
  WA_WEBHOOK="${PAPERCLIP_AUTH_PUBLIC_BASE_URL%/}/api/wa-bot/webhook"
  ARGS="$ARGS --webhook $WA_WEBHOOK"
  echo "[openwa] webhook set to $WA_WEBHOOK"
fi

echo "[openwa] starting: npx @open-wa/wa-automate@${WA_AUTOMATE_VERSION:-4.76.0} $ARGS"
exec npx @open-wa/wa-automate@${WA_AUTOMATE_VERSION:-4.76.0} $ARGS
