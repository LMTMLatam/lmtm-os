# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# Debug build: each major step prints a marker so the dashboard
# log shows where the build fails (Render API doesn't return build
# logs, so the only way to debug is via the dashboard's log view).

FROM node:20-slim AS base

RUN echo "===[$(date +%s)] step 1: apt-get===" && \
  apt-get update && \
  apt-get install -y --no-install-recommends ca-certificates curl && \
  rm -rf /var/lib/apt/lists/* && \
  echo "===[$(date +%s)] step 1: done==="

RUN echo "===[$(date +%s)] step 2: pnpm global===" && \
  npm install -g pnpm@9.15.4 tsx@4.19.2 --no-audit --no-fund && \
  echo "===[$(date +%s)] step 2: done==="

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

RUN echo "===[$(date +%s)] step 3: pnpm install start===" && \
  pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only --prefer-offline 2>&1 | tail -30; \
  echo "===[$(date +%s)] step 3: pnpm install exit=${PIPESTATUS[0]}==="

RUN echo "===[$(date +%s)] step 4: sdk build===" && \
  pnpm --filter @paperclipai/plugin-sdk build 2>&1 | tail -10; \
  echo "===[$(date +%s)] step 4: sdk build exit=${PIPESTATUS[0]}==="

RUN echo "===[$(date +%s)] step 5: m3 build===" && \
  pnpm --filter @paperclipai/adapter-minimax-local build 2>&1 | tail -10; \
  echo "===[$(date +%s)] step 5: m3 build exit=${PIPESTATUS[0]}==="

RUN echo "===[$(date +%s)] step 6: server build===" && \
  pnpm --filter @paperclipai/server build 2>&1 | tail -10; \
  echo "===[$(date +%s)] step 6: server build exit=${PIPESTATUS[0]}==="

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
