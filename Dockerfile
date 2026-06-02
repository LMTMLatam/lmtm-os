# syntax=docker/dockerfile:1.20
# LMTM OS - Server.
#
# Multi-stage build:
#   - builder: does the heavy pnpm install (full workspace) and runs
#     tsc on the packages. The full install needs ~1.5GB of memory
#     (Render Starter is 512MB), so this stage only runs in
#     GitHub Actions (7GB). The resulting image is pushed to GHCR
#     and Render pulls it, skipping its own Docker build entirely.
#   - runtime: a slim image with just the built artifacts and runtime
#     deps. This stage is what Render actually runs.

# ─────────────────────────────────────────────────────────────────────────────
# builder stage
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 --no-audit --no-fund

ENV NODE_OPTIONS=--max-old-space-size=3000
ENV NODE_ENV=development

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY server/ server/
COPY packages/ packages/
COPY cli/ cli/

# Full workspace install. The full install (~635 packages) is too
# heavy for Render's 512MB build env, but GitHub Actions has 7GB so
# it completes in a few minutes. The resulting artifacts are baked
# into the runtime image.
RUN pnpm install --no-frozen-lockfile --ignore-scripts --reporter=append-only

# Build the foundation + the new M3 adapter + the server.
RUN pnpm --filter @paperclipai/shared build
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/adapter-minimax-local build
RUN pnpm --filter @paperclipai/server build

# ─────────────────────────────────────────────────────────────────────────────
# runtime stage
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

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

# Copy manifests + code from the builder. Skip the devDeps (which
# are not needed at runtime) by re-installing with --prod.
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/tsconfig.json /app/tsconfig.base.json ./
COPY --from=builder /app/patches/ patches/
COPY --from=builder /app/scripts/ scripts/
COPY --from=builder /app/server/ server/
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/cli/ cli/

# Install only the runtime deps (no devDeps) for the 6 packages we
# need. This is the lightweight install (~120 packages) that doesn't
# OOM in Render's runtime. tsc is in devDeps and not needed at
# runtime, so we use --omit=dev here.
RUN pnpm install \
  --filter @paperclipai/server \
  --filter @paperclipai/adapter-minimax-local \
  --filter @paperclipai/plugin-sdk \
  --filter @paperclipai/shared \
  --filter @paperclipai/db \
  --filter @paperclipai/adapter-utils \
  --ignore-scripts \
  --no-frozen-lockfile \
  --reporter=append-only \
  --omit=dev

VOLUME ["/paperclip"]
EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
