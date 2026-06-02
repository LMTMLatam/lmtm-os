# syntax=docker/dockerfile:1.20
# LMTM OS - Server for Render + Supabase.
# DIAGNOSTIC BUILD: only apt-get + echo. If this works, the issue
# is in pnpm install (memory, lockfile, registry). If this fails,
# the issue is in the base image pull or apt-get.

FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@9.15.4 --no-audit --no-fund \
  && echo "OK base build"

WORKDIR /app

# Test pnpm with a tiny package
RUN mkdir -p /tmp/test-pkg && cd /tmp/test-pkg && \
  echo '{"name":"x","version":"0.0.0"}' > package.json && \
  pnpm add is-odd --no-lockfile 2>&1 | tail -5 && \
  echo "OK pnpm add"

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3100 \
  DATABASE_URL="${DATABASE_URL}"

EXPOSE 3100

CMD ["sh", "-c", "echo DIAG: build complete; ls /tmp/test-pkg/node_modules | head -5"]
