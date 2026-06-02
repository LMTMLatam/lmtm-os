# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# Debug build: minimal steps to isolate which step is failing.
# Each RUN writes a marker file so we can see how far the build got.

FROM node:20-slim

RUN echo "step 1: base image ok" && date > /tmp/m1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && echo "step 2: apt install ok" && date > /tmp/m2

RUN npm install -g pnpm@9.15.4 tsx@4.19.2 --no-audit --no-fund \
  && echo "step 3: pnpm install ok" && date > /tmp/m3

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

# Copy manifests first.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
RUN echo "step 4: manifests copied" && date > /tmp/m4

COPY patches/ patches/
COPY scripts/ scripts/
RUN echo "step 5: patches/scripts copied" && date > /tmp/m5

COPY server/ server/
RUN echo "step 6: server copied" && date > /tmp/m6

COPY packages/ packages/
RUN echo "step 7: packages copied" && date > /tmp/m7

COPY cli/ cli/
RUN echo "step 8: cli copied" && date > /tmp/m8

# Real install step. --no-frozen-lockfile bypasses Windows-specific URLs.
RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only 2>&1 | tee /tmp/pnpm.log; echo "step 9: pnpm install exit=$?" && date > /tmp/m9

RUN pnpm --filter @paperclipai/plugin-sdk build 2>&1 | tail -20; echo "step 10: sdk build exit=$?" && date > /tmp/m10
RUN pnpm --filter @paperclipai/adapter-minimax-local build 2>&1 | tail -20; echo "step 11: m3 build exit=$?" && date > /tmp/m11
RUN pnpm --filter @paperclipai/server build 2>&1 | tail -20; echo "step 12: server build exit=$?" && date > /tmp/m12

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["sh", "-c", "ls /tmp/m* /tmp/pnpm.log; cat /tmp/pnpm.log | tail -50; node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js"]
