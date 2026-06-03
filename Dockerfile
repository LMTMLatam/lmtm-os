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
COPY ui/ ui/

# Patch all workspace package.jsons BEFORE the install so any postinstall
# scripts see the production conditions. (Currently no postinstall
# scripts, but this keeps the resolution stable.)
RUN node /app/scripts/patch-package-exports.mjs /app

# Full workspace install. Needs ~1.5GB of memory which is too much for
# Render Starter (512MB) but fine in GitHub Actions (7GB). We do NOT
# use --ignore-scripts here because several workspace packages have
# native bindings (sqlite3, embedded-postgres native libs) that need
# to be compiled at install time on the same Linux platform that the
# runtime container will use.
RUN pnpm install --no-frozen-lockfile --reporter=append-only

# Re-apply the package.json patch AFTER pnpm install, because pnpm may
# re-resolve links and rewrite some package.json files during install.
# After this, every workspace package.json has a "production" conditional
# in its exports pointing to the compiled dist/*.js.
RUN node /app/scripts/patch-package-exports.mjs /app

# Build everything the runtime needs. We build every workspace
# package that the server's adapter registry imports statically,
# because the production condition in their exports points to
# dist/*.js.
RUN pnpm -r --filter "./packages/**" build
RUN pnpm --filter @paperclipai/server build
# Build the React/Vite UI so the server can serve it as a SPA on `/`.
# vite build needs ~1.5GB of heap for our 14 LMTM routes; fine in GH Actions.
RUN pnpm --filter @paperclipai/ui build
# Build the LMTM bundled plugins (e.g. lmtm-clickup). They are
# installed into /app/.paperclip/plugins/ in the runtime stage
# below.
RUN pnpm --filter @paperclipai/lmtm-clickup build

# ─────────────────────────────────────────────────────────────────────────────
# runtime stage
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 --no-audit --no-fund

ENV NODE_OPTIONS=--max-old-space-size=380
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=lmtm \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=public \
  LMTM_LOCAL_PLUGIN_DIR=/app/.paperclip/plugins

WORKDIR /app

# Copy the entire pnpm-resolved workspace from the builder: the
# pnpm-lock.yaml, all package.jsons (already patched with the
# "production" conditional), and node_modules with every workspace
# package's prod deps. We do NOT re-run pnpm install here because
# the full install OOMs even with 380MB heap limits.
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/tsconfig.json /app/tsconfig.base.json ./
COPY --from=builder /app/patches/ patches/
COPY --from=builder /app/scripts/ scripts/
COPY --from=builder /app/server/ server/
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/cli/ cli/
COPY --from=builder /app/ui/dist/ server/ui-dist/
COPY --from=builder /app/node_modules/ node_modules/

# Install the LMTM-bundled plugins into the runtime plugin dir.
# The plugin loader scans ${LMTM_LOCAL_PLUGIN_DIR} on startup and
# will discover lmtm-clickup. We copy the built dist/ + package.json
# AND the SDK peer dependency's dist/ directly into the plugin's
# local node_modules, avoiding any multi-hop symlink that pnpm
# or the tsx loader might fail to resolve.
#
# Why copy instead of symlink: pnpm's virtual store uses
# /app/node_modules/.pnpm/<name>@<ver>/node_modules/... and the
# public path /app/node_modules/@paperclipai/plugin-sdk is itself
# a symlink. Node's ESM loader with tsx sometimes doesn't follow
# multi-hop symlinks correctly during package resolution. Copying
# the actual files guarantees resolution works.
RUN mkdir -p /app/.paperclip/plugins && \
    mkdir -p /app/.paperclip/plugins/node_modules/@paperclipai && \
    cp -r /app/packages/plugins/lmtm-clickup /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup && \
    rm -rf /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules && \
    mkdir -p /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/@paperclipai/plugin-sdk && \
    cp -r /app/packages/plugins/sdk/dist /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/@paperclipai/plugin-sdk/dist && \
    cp /app/packages/plugins/sdk/package.json /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/@paperclipai/plugin-sdk/package.json && \
    echo "Installed lmtm-clickup plugin (SDK copied):" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/dist/ && \
    echo "--- SDK files ---" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/@paperclipai/plugin-sdk/

VOLUME ["/paperclip"]
EXPOSE 3100

# Production node: use --conditions=production so packages with the
# production conditional load dist/ (compiled JS) instead of src/ (.ts).
# The /app/start.sh wrapper logs everything to Render's log stream.
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
