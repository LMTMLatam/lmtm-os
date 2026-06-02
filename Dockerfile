# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
#
# Render Docker build: pnpm install has been OOMing on the build
# environment (which has its own memory budget, separate from the
# runtime plan). Last successful approach: install with
# --no-frozen-lockfile (lockfile has Windows-specific URLs) and let
# pnpm re-resolve, which is the only way past the build-env OOM.
#
# The build is structured to use a slim base image and minimize
# memory pressure: --ignore-scripts (no postinstall child processes),
# NODE_OPTIONS=--max-old-space-size=380 (V8 heap cap), and
# --reporter=append-only (minimal stdout buffering).

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

# pnpm install. The install is the heavy step.
# --no-frozen-lockfile because the lockfile was generated on Windows.
# --ignore-scripts to skip postinstall hooks (memory saver).
RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline

# Build the foundation + the new M3 adapter + the server.
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
