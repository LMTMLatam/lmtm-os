#!/bin/sh
# start-openwa.sh - boot wa-automate Easy API with the right flags.
#
# Flags we always set:
#   --port       $PORT
#   --api-key    $WA_AUTOMATE_API_KEY (if set; protects against public abuse)
#   --session-id $WA_AUTOMATE_SESSION_ID
#   --webhook    $WA_AUTOMATE_WEBHOOK_URL (if set; pushes events to LMTM-OS)
#
# We exec npx so signals (SIGTERM) reach the node process and
# graceful shutdown works under docker stop.

set -e

ARGS="--port ${PORT} --session-id ${WA_AUTOMATE_SESSION_ID}"

if [ -n "$WA_AUTOMATE_API_KEY" ]; then
  ARGS="$ARGS --api-key $WA_AUTOMATE_API_KEY"
fi

if [ -n "$WA_AUTOMATE_WEBHOOK_URL" ]; then
  ARGS="$ARGS --webhook $WA_AUTOMATE_WEBHOOK_URL"
fi

echo "[openwa] starting: npx @open-wa/wa-automate $ARGS"
exec npx @open-wa/wa-automate@${WA_AUTOMATE_VERSION:-4.76.0} $ARGS
