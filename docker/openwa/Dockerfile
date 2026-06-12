# OpenWA self-hosted - WhatsApp API via wa-automate-nodejs
# Bundled with LMTM-OS as a sidecar process.
#
# Built from the official wa-automate Docker image; we wrap it in a
# healthcheck endpoint that LMTM-OS's wa-bot service can poll.

FROM node:20-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl dumb-init \
  && rm -rf /var/lib/apt/lists/*

# wa-automate (pinned to stable v4.76.0)
ARG WA_AUTOMATE_VERSION=4.76.0
ENV WA_AUTOMATE_VERSION=${WA_AUTOMATE_VERSION}

WORKDIR /app

# Install wa-automate globally so the start script can use npx
RUN npm install -g @open-wa/wa-automate@${WA_AUTOMATE_VERSION} --no-audit --no-fund

# Default config (overridden at runtime)
ENV PORT=8080
ENV WA_AUTOMATE_HOST=0.0.0.0
ENV WA_AUTOMATE_PORT=8080
ENV WA_AUTOMATE_API_KEY=""
ENV WA_AUTOMATE_SESSION_ID="lmtm"
ENV WA_AUTOMATE_WEBHOOK_URL=""

# Tiny healthcheck wrapper script
COPY start-openwa.sh /app/start-openwa.sh
RUN chmod +x /app/start-openwa.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -sf http://localhost:${PORT}/api/health || exit 1

# dumb-init handles zombie processes (same as openwa/wa-automate recommendation)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/app/start-openwa.sh"]
