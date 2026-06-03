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
# Build the n8n MCP bridge plugin (uses HTTP transport against
# https://lmtmlatam.app.n8n.cloud/mcp-server/http).
RUN pnpm --filter @paperclipai/lmtm-n8n build

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
# will discover lmtm-clickup.
#
# Approach: copy the entire plugin source (with its pnpm-managed
# node_modules) into the runtime plugin dir. The source's
# node_modules uses pnpm's symlinks pointing to the virtual store
# at /app/node_modules/.pnpm/... which IS present in the runtime
# image (copied by `COPY --from=builder /app/node_modules/
# node_modules/` above).
#
# After the copy, we also explicitly copy zod into the plugin's
# local node_modules because the SDK's compiled dist imports it
# as a transitive dep, and pnpm's nested symlinks don't always
# resolve cleanly in the tsx loader context. Copying zod
# directly into the plugin's node_modules zod/ folder
# guarantees resolution.
RUN mkdir -p /app/.paperclip/plugins && \
    mkdir -p /app/.paperclip/plugins/node_modules/@paperclipai && \
    # ── lmtm-clickup ──
    cp -r /app/packages/plugins/lmtm-clickup /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup && \
    # zod: plugin-sdk's dist/index.js does `export { z } from "zod"`. Node's
    # ESM resolver walks up from the symlinked SDK path
    # (/app/.paperclip/.../plugin-sdk/dist/index.js) and looks for zod at
    # each level's node_modules. We pre-populate two locations to make
    # resolution succeed in all import paths:
    #   1. The plugin's own node_modules/zod (so a copy of the source
    #      plugin-sdk's zod symlink chain dereferences to real files).
    #   2. The plugin-sdk's own node_modules/zod (so the SDK's own
    #      dist/index.js resolves zod from its parent dir directly).
    cp -rL /app/packages/plugins/lmtm-clickup/node_modules/zod /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/zod && \
    cp -rL /app/packages/plugins/lmtm-clickup/node_modules/@paperclipai/plugin-sdk/node_modules/zod /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/@paperclipai/plugin-sdk/node_modules/zod 2>/dev/null || true && \
    echo "Installed lmtm-clickup plugin:" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/dist/ && \
    echo "  zod at: $(ls -d /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/zod 2>&1)" && \
    echo "  zod pkg main: $(cat /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/node_modules/zod/package.json 2>/dev/null | grep -oE '\"(main|module|type)\":[^,}]*' | head -3 || echo MISSING)" && \
    # ── lmtm-n8n (HTTP MCP bridge to n8n) ──
    cp -r /app/packages/plugins/lmtm-n8n /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n && \
    cp -rL /app/packages/plugins/lmtm-n8n/node_modules/zod /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/node_modules/zod && \
    cp -rL /app/packages/plugins/lmtm-n8n/node_modules/@paperclipai/plugin-sdk/node_modules/zod /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/node_modules/@paperclipai/plugin-sdk/node_modules/zod 2>/dev/null || true && \
    echo "Installed lmtm-n8n plugin:" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/dist/ && \
    echo "  zod at: $(ls -d /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/node_modules/zod 2>&1)" && \
    echo "  zod pkg main: $(cat /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/node_modules/zod/package.json 2>/dev/null | grep -oE '\"(main|module|type)\":[^,}]*' | head -3 || echo MISSING)"

VOLUME ["/paperclip"]
EXPOSE 3100

# Production node: use --conditions=production so packages with the
# production conditional load dist/ (compiled JS) instead of src/ (.ts).
# The /app/start.sh wrapper logs everything to Render's log stream.
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
