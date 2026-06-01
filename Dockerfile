# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# Minimal: pnpm installed via npm (avoids corepack), no pnpm fetch,
# single pnpm install with --no-frozen-lockfile to bypass the
# Windows-specific lockfile entries that broke the Linux build.

FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 tsx@4.19.2 --no-audit --no-fund

ENV NODE_OPTIONS=--max-old-space-size=380
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=false \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=lmtm \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=public \
  DATABASE_URL="${DATABASE_URL}"

WORKDIR /app

# Copy manifests first (Docker layer cache).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

# pnpm install. --no-frozen-lockfile because the lockfile has Windows-specific
# binary URLs. --ignore-scripts to skip postinstall hooks (memory saver).
# --reporter=append-only for minimal stdout.
RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only --omit=dev || pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only

# Build the foundation + the new M3 adapter + the server.
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

# Reinstall full deps (the omit=dev above dropped devDeps, but we just
# built with them; this restores everything for the runtime image).
RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
