# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
#
# Optimized for Render Starter (512MB RAM). The critical changes:
#  - pnpm install --ignore-scripts: skip postinstall hooks (these can
#    spawn child Node processes that double peak memory).
#  - NODE_OPTIONS=--max-old-space-size=400: cap V8 heap at 400MB, leaving
#    ~110MB for OS + Docker + pnpm's non-V8 memory.
#  - First pnpm install with --prefer-offline, fall back to fresh install.
#
# Subsequent rebuilds re-use the cached pnpm install layer (node_modules
# doesn't change) and only re-run tsc — which is much lighter.

FROM node:20-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install -g pnpm@9.15.4 \
  && npm install -g tsx@4.19.2

ENV NODE_OPTIONS=--max-old-space-size=400

# ─────────────────────────────────────────────────────────────────────────────
# build stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
ENV NODE_ENV=development
ENV PATH="/app/node_modules/.bin:${PATH}"

# Copy only manifests and the source tree (the install layer can be
# cached separately on rebuilds).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

# Single pnpm install. --ignore-scripts is the memory win.
# --prefer-offline uses the local pnpm store when possible.
RUN pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline || pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only

# Build the foundation + the new M3 adapter + the server.
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

# Drop devDeps for the runtime image.
RUN pnpm prune --prod

# ─────────────────────────────────────────────────────────────────────────────
# production stage: only runtime artifacts.
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app
COPY --from=build /app /app

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=false \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=lmtm \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=public \
  DATABASE_URL="${DATABASE_URL}"

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
