# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# Single-stage build optimized for Render Starter (512MB).
# Multi-stage was OOMing because the build stage had to install + build in
# the same layer, hitting memory pressure. Single-stage is simpler: we
# install ALL deps, build, and let Docker COPY the artifacts forward.

FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install -g pnpm@9.15.4 \
  && npm install -g tsx@4.19.2

ENV NODE_OPTIONS=--max-old-space-size=400
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

# Copy everything (small files first for layer cache).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

# Install (this is the heavy step).
RUN pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline || pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only

# Build the foundation + the new M3 adapter + the server.
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

# Prune to production-only.
RUN pnpm prune --prod

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
