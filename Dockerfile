# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
#
# Memory budget: Render Starter = 512MB. We split the install into two
# passes (prod deps first, then dev deps) so the peak memory is roughly
# the larger of the two, not the sum.
#
# We also avoid corepack (uses extra Node processes) and install pnpm/tsx
# directly. NODE_OPTIONS caps V8 at 350MB, leaving 162MB headroom for the
# OS, Docker, and pnpm's non-V8 memory.

FROM node:20-alpine AS base

RUN apk add --no-cache ca-certificates curl
RUN npm install -g pnpm@9.15.4 tsx@4.19.2
ENV NODE_OPTIONS=--max-old-space-size=350

# ─────────────────────────────────────────────────────────────────────────────
# build stage
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
ENV NODE_ENV=development
ENV PATH="/app/node_modules/.bin:${PATH}"

# Copy manifests first so the resolution graph is built before any source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/

# Pass 1: production deps only. Smaller set, less memory.
# --ignore-scripts: skip package postinstall hooks (these can spawn child
#   Node processes that double memory at install time).
# --reporter=append-only: minimal stdout, less I/O overhead.
# --prefer-offline: use the local pnpm store if available (cache hit).
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline || pnpm install --prod --frozen-lockfile --ignore-scripts --reporter=append-only

# Pass 2: dev deps on top. Still isolated install, but pnpm only needs to
# add the missing ones, not re-resolve everything.
RUN pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline || pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only

# Now copy the source and build.
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

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
