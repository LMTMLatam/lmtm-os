# 2026-06-04 Evening Deploy Saga

## TL;DR

- **Service is LIVE** at https://lmtm.onrender.com with **2/4 plugins** running
  (lmtm-clickup, lmtm-n8n). lmtm-meta-ads and lmtm-google-ads code is built
  and pushed to GHCR but not active in the live instance.
- **The Docker build was pushing 3 manifests per build** (final image + SLSA
  provenance + SBOM). Render's deploy API was picking one of the untagged
  manifests (the provenance or SBOM, not the final image), which caused
  `update_failed` deploys and `earlyExit: true` on the new instance.
- **The fix** (commit `1ea1123`): `provenance: false` and `sbom: false` in
  `docker.yml` so only the final tagged image is pushed. GHCR now contains
  exactly 1 manifest per build, and Render's deploy API picks the correct one
  (verified: deploy `dep-d8gqsrd7vvec7398tfvg` used SHA `509869125806...`
  which matches the tagged image).
- **Deploys are still slow / hanging** on 2026-06-04 16:57-17:30. New instance
  starts but the health check takes >10 min to pass. Likely the
  `autoInstallLocalPlugins()` IIFE installing all 4 plugins in sequence.
  Render's health check grace period is 10 min — might be timing out.

## What was working before this evening

- Service was live (commit `98da3c0` from earlier deploy)
- 2/4 plugins active (lmtm-clickup, lmtm-n8n)
- 67 clients seeded in DB
- 14 agents
- Login working
- Smoke test 6/8 pass (the 2 fails were expected — no Meta/Google OAuth yet)

## What I tried

1. **`PUT /v1/services/:id/env-vars`** to restore 27 env vars → worked, all
   env vars now in Render
2. **`POST /v1/services/:id/deploys`** with `imageTag: "feat-lmtm-v2"` →
   returned 202 but the deploy's `image.sha` was a stale cache layer
   (`aabd689cd5df`, `5c0948b73092`, etc.) — **not** the actual `feat-lmtm-v2`
   image in GHCR (`5dbd093a...`, `3ebfcd6e...`, `509869125806...`)
3. **`POST /v1/services/:id/deploys`** with `imageDigest: "sha256:..."` →
   ignored, still used the wrong SHA
4. **`POST /v1/services/:id/deploys`** with `imageRef: "ghcr.io/.../feat-lmtm-v2-20260604-165357"` →
   ignored, still used `feat-lmtm-v2` ref
5. **`PATCH /v1/services/:id`** with `imagePath: "..."` → ignored,
   `imagePath` is read-only via the API
6. **GitHub Actions** (commits `cf0c517`, `bf3eda7`, `1ea1123`, `6c0801b`,
   `bf3eda7`, `1ea1123`) → 4 builds, all succeeded
7. **Removed `cache-to: type=gha,mode=max`** in commit `bf3eda7` → did NOT
   help, the extra manifests persisted
8. **Added `provenance: false` and `sbom: false`** in commit `1ea1123` → THIS
   fixed it; GHCR now only contains 1 manifest per build

## Current state (2026-06-04 17:35)

- HEAD: `1ea1123` (pushed to `feat/lmtm-v2-m3-agents`)
- Render service `srv-d8f59pbeo5us73bg5jdg` is live with image
  `dep-d8gce0vlk1mc73eo1jj0` (the OLD image, 2 plugins only)
- A new deploy `dep-d8gr85rtqb8s73bu9eog` is `update_in_progress` with
  the correct image SHA `509869125806...` (has all 4 plugins)
- 2 instances: `9dlxk` (old, ready=True, serving traffic) and `q4rv5` (new,
  ready=False, not yet serving)

## What user needs to do

1. **Wait for the in-progress deploy** to complete (or fail). If it
   completes, all 4 plugins will be active. If it fails (earlyExit),
   open Render dashboard → lmtm service → Manual Deploy → Clear build
   cache & deploy, and watch the deploy logs to see why the new instance
   is exiting.

2. **If deploy fails with earlyExit**, the likely cause is the
   `autoInstallLocalPlugins()` IIFE in `server/src/app.ts:483` taking
   too long. Workaround: bump Render's health check grace period, or
   move the auto-install to a setImmediate(0) so it doesn't block the
   server startup.

3. **Connect Meta + Google ad accounts** via OAuth flows once all 4
   plugins are active:
   - Meta: `/api/meta/oauth/start?companyId=00000000-0000-4000-8000-000000000001&label=LMTM-test`
     (returns to `/company/settings/integrations/ads`)
   - Google: needs developer token + OAuth client first

## Files changed

- `.github/workflows/docker.yml` — added `provenance: false`, `sbom: false`;
  removed `cache-to: type=gha,mode=max` (no-op once provenance/sbom are off)
- `scripts/.deploy-trigger` — marker file to trigger GH Actions (can delete)
