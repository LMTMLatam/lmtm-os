#!/bin/sh
# build-openwa.sh - build OpenWA with our Baileys plugin baked in.
#
# Why this exists:
#   OpenWA ships with only the whatsapp-web.js engine (puppeteer-based).
#   We need Baileys (WebSocket, no browser) to bypass web.whatsapp.com's
#   anti-bot detection from datacenter IPs.
#
# What it does:
#   1. Clones OpenWA at a pinned commit (reproducible builds)
#   2. Copies our plugin files (adapter + manifest + factory patch)
#   3. Adds baileys to package.json dependencies
#   4. Runs npm install + build
#   5. Outputs dist/ ready to be COPYed into the LMTM-OS runtime stage
#
# In the Dockerfile, the plugin files are COPYed to /build/plugin/ before
# this script runs, so PLUGIN_DIR defaults to that path.

# -e: exit on first error
# -x: print every command (for debugging build failures)
set -ex

OPENWA_VERSION="${OPENWA_VERSION:-main}"
BUILD_DIR="${BUILD_DIR:-/tmp/openwa-build}"
# In Docker: /build/plugin (set by the Dockerfile COPY).
# For local testing: pass PLUGIN_DIR=/path/to/openwa-baileys-plugin
PLUGIN_DIR="${PLUGIN_DIR:-/build/plugin}"

echo "[openwa-build] version: $OPENWA_VERSION"
echo "[openwa-build] build dir: $BUILD_DIR"
echo "[openwa-build] plugin dir: $PLUGIN_DIR"

# Fresh clone
rm -rf "$BUILD_DIR"
git clone --depth 1 --branch "$OPENWA_VERSION" \
  https://github.com/rmyndharis/OpenWA.git "$BUILD_DIR" 2>&1 | tail -3

cd "$BUILD_DIR"

# Drop the dashboard from the build (we don't need it, saves ~200MB)
echo "[openwa-build] removing dashboard..."
rm -rf dashboard

# Remove traefik and the multi-service compose — we run OpenWA as a single process
rm -f docker-compose.yml docker-compose.dev.yml

# Copy our plugin files
echo "[openwa-build] copying Baileys plugin files..."
mkdir -p src/plugins/engines/baileys
cp "$PLUGIN_DIR/src/engine/adapters/baileys.adapter.ts" src/engine/adapters/
cp "$PLUGIN_DIR/src/plugins/engines/baileys/index.ts" src/plugins/engines/baileys/index.ts
cp "$PLUGIN_DIR/src/engine/engine.factory.ts" src/engine/engine.factory.ts

# Add baileys + hapi boom dependencies (hapi/boom is what Baileys uses for errors)
echo "[openwa-build] patching package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies['@whiskeysockets/baileys'] = pkg.dependencies['@whiskeysockets/baileys'] || '7.0.0-rc.5';
pkg.dependencies['@hapi/boom'] = pkg.dependencies['@hapi/boom'] || '10.0.1';
pkg.dependencies['pino'] = pkg.dependencies['pino'] || '9.5.0';
// Drop dashboard postinstall to avoid npm error
delete pkg.scripts['postinstall'];
delete pkg.scripts['dashboard:install'];
delete pkg.scripts['dashboard:dev'];
delete pkg.scripts['dashboard:build'];
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('[openwa-build] package.json patched');
"

# Install deps
echo "[openwa-build] npm install..."
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -10

# Build
echo "[openwa-build] npm run build..."
npm run build 2>&1 | tail -10

# Sanity check
if [ ! -d "dist" ] || [ ! -f "dist/main.js" ]; then
  echo "[openwa-build] ❌ build did not produce dist/main.js" >&2
  exit 1
fi

# Copy to /app/openwa-dist for the parent Dockerfile
mkdir -p /app/openwa-dist
cp -r dist/* /app/openwa-dist/
cp -r node_modules /app/openwa-dist/
cp package.json /app/openwa-dist/

echo "[openwa-build] ✅ done — dist at /app/openwa-dist"
ls -la /app/openwa-dist | head -20
