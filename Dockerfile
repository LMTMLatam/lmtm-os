# syntax=docker/dockerfile:1.20
# LMTM OS - Minimal Paperclip Server for Render + Supabase

FROM node:20-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install -g pnpm@9.15.4 \
  && npm install -g tsx@4.19.2

FROM base AS build
WORKDIR /app
ENV NODE_ENV=development
ENV PATH="/app/node_modules/.bin:${PATH}"

COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches/ patches/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

RUN pnpm install --frozen-lockfile

# Build db package: generate migrations + compile TypeScript
RUN cd packages/db && pnpm run generate

# Build plugin-sdk
RUN pnpm --filter @paperclipai/plugin-sdk build

# Build server
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