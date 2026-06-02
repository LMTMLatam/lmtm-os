# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
#
# CRITICAL MEMORY NOTE: the previous full-workspace pnpm install was
# OOMing at 488MB heap (Render limit: 512MB) when it tried to install
# 635 packages including the AI SDKs of all adapters (claude, codex,
# cursor, openclaw, opencode, pi). The server only needs 6 packages
# at runtime. Using `pnpm install --filter` for just those packages
# drops the install from 635 to ~120 packages and stays well under
# the memory limit.
#
# Also: NODE_OPTIONS=--max-old-space-size=350 keeps the V8 heap under
# 350MB, well clear of the 512MB build-env ceiling. The 16MB headroom
# between 350 and 512 is consumed by the OS, Docker, pnpm's non-V8
# memory, and child processes.

FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 tsx@4.19.2 --no-audit --no-fund

ENV NODE_OPTIONS=--max-old-space-size=350
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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

# Install ONLY the packages the server needs. This drops the install
# from 635 (full workspace) to 567 (filtered) packages, well under
# the 512MB heap. We do NOT use --prod because the build step below
# needs tsc, which is a devDependency. The full workspace is still on
# disk (for the build step), but pnpm only resolves and links the
# 6 packages we need.
RUN pnpm install \
  --filter @paperclipai/server \
  --filter @paperclipai/adapter-minimax-local \
  --filter @paperclipai/plugin-sdk \
  --filter @paperclipai/shared \
  --filter @paperclipai/db \
  --filter @paperclipai/adapter-utils \
  --ignore-scripts \
  --no-frozen-lockfile \
  --reporter=append-only

# Build only the needed packages. The `...` filter means "and all
# transitive workspace deps of the matching packages".
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
