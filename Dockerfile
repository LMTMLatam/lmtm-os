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
# Build the Meta Marketing API plugin (Graph API v21.0, 9 tools).
# Auth: per-company OAuth via ctx.ads.resolveToken("meta", companyId).
RUN pnpm --filter @paperclipai/lmtm-meta-ads build
# Build the Google Ads plugin (REST API v17, 8 tools).
# Auth: per-company OAuth + developer_token via ctx.ads.resolveToken("google", companyId).
RUN pnpm --filter @paperclipai/lmtm-google-ads build

# Archive node_modules to preserve symlinks across multi-stage COPY.
# Docker COPY --from (BuildKit) does not reliably preserve pnpm's
# symlinks for hoisted dependencies or workspace packages. tar does.
RUN tar cf /tmp/node_modules.tar -C /app node_modules

# ─────────────────────────────────────────────────────────────────────────────
# wa-gateway-builder stage — installs deps for the lean Baileys WhatsApp
# gateway (Express + @whiskeysockets/baileys, no NestJS/Redis). Build tools
# are present here so any native dep compiles; the resulting node_modules are
# copied into the runtime stage (same node:20 ABI).
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS wa-gateway-builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /wa-gateway
COPY docker/wa-gateway/package.json ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error
COPY docker/wa-gateway/server.mjs ./

# ─────────────────────────────────────────────────────────────────────────────
# runtime stage
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl procps git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 --no-audit --no-fund

# Claude Code CLI: the `claude_local` adapter spawns the `claude` CLI per agent
# run. Agents point ANTHROPIC_BASE_URL at MiniMax's Anthropic-compatible endpoint
# (set per-agent in adapter_config.env). git is required by the CLI.
RUN npm install -g @anthropic-ai/claude-code --no-audit --no-fund --loglevel=error

# MCP config so the `claude` CLI exposes Paperclip's tools (issues, comments,
# client data via paperclipApiRequest, self-learning). The MCP subprocess
# inherits PAPERCLIP_API_URL/KEY/AGENT_ID/COMPANY_ID/RUN_ID from the claude
# process env, which the adapter sets per run.
COPY docker/claude-mcp.json /app/claude-mcp.json

ENV NODE_OPTIONS=--max-old-space-size=380 \
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
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
COPY --from=builder /tmp/node_modules.tar /tmp/node_modules.tar

# Extract node_modules with symlinks preserved. Docker COPY --from
# does not reliably preserve pnpm's symlinks for workspace packages
# or for hoisted dependencies (express, drizzle-orm, etc.) in newer
# BuildKit versions. Using tar ensures every symlink is intact.
RUN tar xf /tmp/node_modules.tar -C /app && rm /tmp/node_modules.tar

# Recreate workspace package symlinks in case tar wasn't used (fallback)
RUN mkdir -p /app/node_modules/@paperclipai && \
    for pkg in db shared adapter-utils plugin-sdk mcp-server create-paperclip-plugin; do \
      if [ -d /app/packages/$pkg ] && [ ! -L /app/node_modules/@paperclipai/$pkg ]; then \
        ln -sfn /app/packages/$pkg /app/node_modules/@paperclipai/$pkg && \
        echo "linked @paperclipai/$pkg"; \
      fi; \
    done && \
    for pkg in lmtm-clickup lmtm-n8n lmtm-meta-ads lmtm-google-ads plugin-fake-sandbox; do \
      if [ -d /app/packages/plugins/$pkg ] && [ ! -L /app/node_modules/@paperclipai/$pkg ]; then \
        ln -sfn /app/packages/plugins/$pkg /app/node_modules/@paperclipai/$pkg && \
        echo "linked @paperclipai/$pkg"; \
      fi; \
    done

# Install production-only deps on top of the tar restore. pnpm does not
# hoist all transitive deps to the root node_modules/ by default (only
# packages used by 2+ workspace packages are hoisted). Single-use deps
# like express (used only by @paperclipai/server) live in .pnpm/ and
# are linked only from the consuming package's own module graph. But
# Node's ESM resolver walks up from the importing file and looks for
# node_modules/ in each parent directory — it does NOT search .pnpm/.
# Running pnpm install --prod here ensures every missing symlink gets
# created, because pnpm's linker sees the full dependency graph and
# creates root-level symlinks for all production deps.
# NOTE: no `| tail` pipe here — piping makes the RUN exit code come from
# `tail` (always 0), which would silently mask a failed pnpm install and
# ship a broken image. The append-only reporter already keeps output terse.
RUN pnpm install --prod --no-frozen-lockfile --reporter=append-only

# Install the LMTM-bundled plugins into the runtime plugin dir.
# The plugin loader scans ${LMTM_LOCAL_PLUGIN_DIR} on startup and
# will discover lmtm-clickup and lmtm-n8n.
#
# We use `cp -rL` to dereference symlinks: pnpm's symlinks inside
# the plugin's node_modules are relative to /app/packages/plugins/
# and become broken when the plugin is copied to a new location.
# Dereferencing them turns the symlinks into real copies of the
# target packages.
#
# After the copy, the plugin worker (at
# /app/.paperclip/plugins/.../lmtm-clickup/dist/worker.js) imports
# @paperclipai/plugin-sdk. Node ESM resolver finds the local copy
# and then needs to resolve the SDK's transitive deps (zod and
# @paperclipai/shared) via walk-up. Because pnpm does NOT hoist
# these in NODE_ENV=production (root package.json has no
# production deps), we manually symlink them into /app/node_modules/
# so they're findable from the SDK's real path anywhere in the
# filesystem.
#
# The tsx loader is skipped in production (see plugin-loader.ts:1837-1843),
# so standard Node ESM resolution is what runs.
RUN mkdir -p /app/.paperclip/plugins && \
    mkdir -p /app/.paperclip/plugins/node_modules/@paperclipai && \
    # ── lmtm-clickup ──
    cp -rL /app/packages/plugins/lmtm-clickup /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup && \
    echo "Installed lmtm-clickup plugin:" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-clickup/dist/ && \
    # ── lmtm-n8n (HTTP MCP bridge to n8n) ──
    cp -rL /app/packages/plugins/lmtm-n8n /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n && \
    echo "Installed lmtm-n8n plugin:" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/dist/ && \
    # ── lmtm-meta-ads (Graph API v21.0, 9 tools) ──
    cp -rL /app/packages/plugins/lmtm-meta-ads /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-meta-ads && \
    echo "Installed lmtm-meta-ads plugin:" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-meta-ads/dist/ && \
    # ── lmtm-google-ads (Google Ads REST API v17, 8 tools) ──
    cp -rL /app/packages/plugins/lmtm-google-ads /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-google-ads && \
    echo "Installed lmtm-google-ads plugin:" && ls /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-google-ads/dist/ && \
    # Hoist the SDK's transitive deps into /app/node_modules/ so
    # the SDK can find them via the standard ESM walk-up from
    # anywhere it's loaded. We create real symlinks pointing to
    # pnpm's virtual store.
    ZOD_SRC=$(ls -d /app/node_modules/.pnpm/zod@*/node_modules/zod 2>/dev/null | head -1) && \
    SHARED_SRC=$(ls -d /app/node_modules/.pnpm/@paperclipai+shared@*/node_modules/@paperclipai/shared 2>/dev/null | head -1) && \
    if [ -n "$ZOD_SRC" ]; then \
      ln -sf "$ZOD_SRC" /app/node_modules/zod && echo "hoisted zod -> $ZOD_SRC"; \
    else \
      echo "WARN: zod not found in /app/node_modules/.pnpm/"; \
    fi && \
    if [ -n "$SHARED_SRC" ]; then \
      mkdir -p /app/node_modules/@paperclipai && \
      ln -sf "$SHARED_SRC" /app/node_modules/@paperclipai/shared && echo "hoisted shared -> $SHARED_SRC"; \
    else \
      echo "WARN: @paperclipai/shared not found in /app/node_modules/.pnpm/"; \
    fi && \
    # Sanity check
    echo "SDK resolution sanity check:" && \
    echo "  /app/node_modules/zod: $(test -L /app/node_modules/zod && readlink /app/node_modules/zod || echo MISSING)" && \
    echo "  /app/node_modules/@paperclipai/shared: $(test -L /app/node_modules/@paperclipai/shared && readlink /app/node_modules/@paperclipai/shared || echo MISSING)" && \
    echo "  /app/node_modules/@paperclipai/plugin-sdk: $(test -L /app/node_modules/@paperclipai/plugin-sdk && readlink /app/node_modules/@paperclipai/plugin-sdk || echo MISSING)"

# ── Lean Baileys WhatsApp gateway (replaces heavy OpenWA/NestJS+Redis) ──
# Runs as a second process on port 8080; the server talks to it via
# OPENWA_URL=http://localhost:8080. Session/creds persist under /app/data.
COPY --from=wa-gateway-builder /wa-gateway /app/wa-gateway
RUN mkdir -p /app/data/wa-session

# NOTE: no `VOLUME ["/paperclip"]` — Railway's builder rejects the VOLUME
# instruction, and it's a no-op on Render (ephemeral FS). The app writes to
# /paperclip directly regardless; durable state lives in Postgres, not the FS.
EXPOSE 3100 8080

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
