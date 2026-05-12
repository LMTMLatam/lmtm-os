# syntax=docker/dockerfile:1.20
# LMTM OS - Minimal Paperclip Server for Render + Supabase

FROM node:20-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install -g pnpm@9.15.4 \
  && npm install -g tsx

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ patches/
COPY server/package.json server/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY cli/package.json cli/

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
# Skip preflight:workspace-links - it recreates workspace symlinks for dev,
# but in a fresh Docker build everything is installed from scratch with correct links.
# The --frozen-lockfile in deps stage already installed everything correctly.
RUN pnpm --filter @paperclipai/db generate
RUN pnpm --filter @paperclipai/server build

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