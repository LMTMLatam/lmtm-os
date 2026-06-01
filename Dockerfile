# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# Multi-stage build: install+build in a large build stage, copy the
# runtime artifacts to a minimal production stage.
# Memory budget: Render Starter = 512MB. The critical tunings:
#   - --no-frozen-lockfile (not --frozen-lockfile): the lockfile may have
#     been generated on a different platform (Windows). Pnpm
#     re-resolves platform-specific binary URLs on install, so we let
#     it. Reproducibility is slightly weaker, but the alternative is a
#     hard failure on every Linux build.
#   - --ignore-scripts: skip package postinstall hooks. Saves memory by
#     not spawning child Node processes that can double peak usage.
#   - NODE_OPTIONS=--max-old-space-size=400: V8 heap can't exceed 400MB,
#     leaving headroom for the OS, Docker, and pnpm's non-V8 memory.

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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

# See header comment for the --no-frozen-lockfile rationale.
RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline

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
