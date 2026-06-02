# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# Build works. The server starts. The only issue is that the DNS
# for db.<ref>.supabase.co resolves to IPv6 first and Render's
# network in us-west-2 can't route to that IPv6 (ENETUNREACH).
# We use the Supabase pooler (always IPv4) via DATABASE_URL.
# All other build settings are tuned for memory:
#   - --ignore-scripts: no postinstall child processes
#   - --max-old-space-size=380: V8 heap cap
#   - --reporter=append-only: minimal stdout
#   - --no-frozen-lockfile: lockfile has Windows-specific URLs
#     (only an issue with --frozen-lockfile, but kept for safety)

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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline

RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
