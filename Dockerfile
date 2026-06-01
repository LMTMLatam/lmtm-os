# syntax=docker/dockerfile:1.20
# LMTM OS - Minimal Paperclip Server for Render + Supabase.
# Optimized for Render Starter (512MB RAM):
#   - node-linker=hoisted in .npmrc (flat node_modules, far less pnpm memory)
#   - pnpm fetch in its own layer (downloads tarballs without install)
#   - pnpm install --offline --ignore-scripts (installs from local store, no
#     postinstall scripts that could spike memory)
#   - NODE_OPTIONS=350MB in .npmrc (V8 heap can't blow past the cgroup limit)
#
# If this still OOMs on Starter, the next escalation is Render Standard
# (2GB / $25/mo). The plan:pay ratio is: free for 512MB, $7 for 512MB no-sleep,
# $25 for 2GB. We stay on $7 because you only deploy occasionally.

FROM node:20-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install -g pnpm@9.15.4 \
  && npm install -g tsx@4.19.2

# ─────────────────────────────────────────────────────────────────────────────
# deps stage: download every tarball into pnpm's local content-addressable
# store. No install, no symlinks, no postinstall scripts. Memory footprint is
# the smallest possible pnpm operation.
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
ENV NODE_ENV=development
ENV PATH="/app/node_modules/.bin:${PATH}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

RUN pnpm fetch --reporter=append-only

# ─────────────────────────────────────────────────────────────────────────────
# build stage: install from the local store (no network), then build each
# workspace package. With node-linker=hoisted this install is much lighter.
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS build
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --reporter=append-only

# Build plugin-sdk (foundation for plugin-driven adapters)
RUN pnpm --filter @paperclipai/plugin-sdk build

# Build the M3 first-class adapter (LMTM-OS default runtime)
RUN pnpm --filter @paperclipai/adapter-minimax-local build

# Build server. DB package is consumed via TS source through workspace
# exports; SQL migrations are committed to packages/db/src/migrations/.
RUN pnpm --filter @paperclipai/server build

# Prune to production-only deps for the runtime image. This drops devDeps
# (typescript, vitest, @types/*, etc.) which saves a chunk of disk and
# keeps node_modules from drifting from what's actually used at runtime.
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
