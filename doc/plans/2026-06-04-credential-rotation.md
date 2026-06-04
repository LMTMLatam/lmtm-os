---
title: Credential rotation runbook
date: 2026-06-04
slug: credential-rotation
status: live
owner: pablo-pm
---

# Credential rotation runbook

**Why this doc exists**: as of 2026-06-04, multiple production credentials
have been shared in chat history and are therefore considered compromised.
This runbook is the one-stop procedure to rotate them all, in order,
without taking the LMTM-OS service offline for more than the time it
takes Render to redeploy (~3 minutes).

**Order matters**: rotate secrets that are *internal* (Render, Supabase)
before rotating secrets that are *external* (GitHub, M3, Meta). The
external services might have IP-allowlists or webhook signatures tied
to the old tokens, so we want the internal stack on the new values
first.

**Do not** run this runbook without reading the entire file first.
The `restore-env.cjs` script at the end will overwrite the entire
Render env-var list — losing any secret not in the backup JSON.

---

## Phase 0 — Inventory

Read `C:\Users\Administrator\AppData\Local\Temp\env-backup.json`. It
has 27 vars, 1 placeholder (`BETTER_AUTH_SECRET`) for the user to fill
in. This is the "current state" of the Render env-var list **before**
the user re-enters it via `restore-env.cjs`.

The credentials below are the ones that **must be rotated** because
they have appeared in chat:

| Credential | Where used | Why rotate |
|------------|------------|------------|
| GitHub PAT (`ghp_oQzWVk...`) | `git push` over https | Used as auth for repo write + GHCR |
| Render API token (`rnd_2vvly9IEU...`) | Render REST API | Full read/write to the LMTM service |
| `META_APP_SECRET` (`4c4e8d4e...`) | Meta OAuth + webhooks | Could allow a third party to forge OAuth flows |
| `META_WEBHOOK_VERIFY_TOKEN` (`lmtm-webhook-verify-2026`) | Meta webhooks | Could allow forged webhook events |
| `BETTER_AUTH_SECRET` (unknown) | Better Auth signing | Could allow forged session tokens |
| `MINIMAX_API_KEY` (`sk-cp-3jLvDp0ins...`) | M3 API | Allows arbitrary LLM usage against the agency account |
| `N8N_MCP_TOKEN` (JWT `eyJ...Bkxpn...`) | n8n MCP HTTP | Allows arbitrary workflow calls on the n8n workspace |
| `CLICKUP_API_TOKEN` (`pk_96835660_...`) | ClickUp | Allows full read/write of the LMTM workspace |
| Supabase DB password (`U8-%B!mfQZ9Q%2BuT`) | `DATABASE_URL` | Full read/write to the agency DB |

The following are **not** considered compromised because they were not
in chat (or are tied to a service that is read-only):

- M3 base URL (`https://api.minimax.io/v1`) — public endpoint, no auth
- Meta app id (`2987466634949953`) — public, not a secret
- ClickUp team id / space id / folder ids — public, not secrets
- Render service id (`srv-d8f59pbeo5us73bg5jdg`) — public
- GHCR image name (`ghcr.io/lmtmlatam/lmtm-os`) — public
- Workspace UUID (`tea-d80v83vavr4c73atuakg`) — internal id, not auth

---

## Phase 1 — Rotate external / 3rd-party credentials

### 1.1 GitHub PAT (fine-grained)

1. Go to https://github.com/settings/personal-access-tokens
2. Click "Generate new token" → "Fine-grained token"
3. Resource owner: `LMTMLatam`
4. Repository access: only `LMTMLatam/lmtm-os`
5. Permissions:
   - Contents: Read and write
   - Packages: Read and write
   - Metadata: Read-only (default)
   - Workflows: Read and write (so we can re-trigger Docker)
6. Generate, copy the new token (`ghp_NEW...`)
7. Save the new token in a password manager. **Do not** put it in chat.
8. Update the local git remote: `git remote set-url origin https://LMTMLatam:<NEW_PAT>@github.com/LMTMLatam/lmtm-os.git`
9. Verify: `git fetch origin`

### 1.2 Render API token

1. Go to https://dashboard.render.com/u/settings/api-keys
2. Click "Create API Key"
3. Name: `lmtm-os-rotation-<date>`
4. Copy the new key (`rnd_NEW...`)
5. Update `restore-env.cjs` in `C:\Users\Administrator\AppData\Local\Temp\` — change the `RENDER_TOKEN` constant
6. Test: `node -e "const https=require('https'); https.request({hostname:'api.render.com',path:'/v1/services',headers:{Authorization:'Bearer rnd_NEW...'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(r.statusCode,d.slice(0,100)))}).end()"`

### 1.3 Meta app secret + webhook verify token

1. Go to https://developers.facebook.com/apps/2987466634949953/settings/basic/
2. Click "Show" on App Secret → enter password → copy the new secret
3. Generate a new random `META_WEBHOOK_VERIFY_TOKEN` (e.g. `lmtm-webhook-verify-2026-07` with the new month)
4. Save both in the password manager
5. In Render (after Phase 2 deploy), update:
   - `META_APP_SECRET` = new secret
   - `META_WEBHOOK_VERIFY_TOKEN` = new token
6. Re-test OAuth flow: `https://lmtm.onrender.com/api/meta/oauth/start?companyId=00000000-0000-4000-8000-000000000001&label=Meta+Test`
7. Re-test webhook: `curl "https://lmtm.onrender.com/api/meta/webhook?hub.mode=subscribe&hub.verify_token=<NEW_TOKEN>&hub.challenge=42"` → expect 42

### 1.4 M3 API key (MiniMax)

1. Go to https://api.minimax.io → Settings → API Keys (or the equivalent
   in the M3 console — exact URL depends on the dashboard layout)
2. Click "Create new key"
3. Name: `lmtm-os-rotation-<date>`
4. Copy the new key (`sk-cp-NEW...`)
5. Save in password manager
6. In Render (after Phase 2), update `MINIMAX_API_KEY` to the new value
7. Verify: `curl https://lmtm.onrender.com/api/health` should still return ok
8. (Optional) Old key: revoke it once the deploy is confirmed working

### 1.5 n8n MCP token

1. Go to https://lmtmlatam.app.n8n.cloud → Settings → MCP Server → Regenerate token
2. Copy the new JWT
3. Save in password manager
4. In Render (after Phase 2), update `N8N_MCP_TOKEN` to the new value
5. Verify: invoke `n8n-ping` tool via `POST /api/plugins/tools/execute`

### 1.6 ClickUp API token

1. Go to https://app.clickup.com → Settings → Apps → API Token → Generate
2. Copy the new token (`pk_NEW...`)
3. Save in password manager
4. Update `CLICKUP_API_TOKEN` in Render
5. Update `scripts/seed-clients-from-clickup.cjs` (the `CLICKUP_TOKEN` constant)
6. Re-run seed to verify

### 1.7 Supabase database password

1. Go to https://supabase.com/dashboard/project/nxlxrdrcptlvdxkonvcv/settings/database
2. Click "Reset database password" → confirm
3. Copy the new password (it will be shown once)
4. **Before** you change Render's `DATABASE_URL`, **immediately** change the password on the Supabase side (otherwise the live service will lose connection for the few seconds between password change and Render redeploy)
5. Reconstruct the new connection string: `postgresql://postgres.nxlxrdrcptlvdxkonvcv:<NEW_PWD>@aws-1-us-west-2.pooler.supabase.com:5432/postgres`
   - URL-encode `@` as `%40`, `!` as `%21`, etc. (Supabase passwords typically contain `@` and `!`)
6. In Render (after Phase 2), update `DATABASE_URL` to the new connection string
7. Verify: `GET /api/health` → `bootstrapStatus: "ready"`

---

## Phase 2 — Rotate the auth secret

### 2.1 Generate a new `BETTER_AUTH_SECRET`

1. On Windows PowerShell:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Copy the 64-char hex string
3. Save in password manager

### 2.2 Set it in `env-backup.json`

1. Open `C:\Users\Administrator\AppData\Local\Temp\env-backup.json`
2. Replace `"__FILL_BETTER_AUTH_SECRET__"` with the new value
3. Save the file

### 2.3 Run `restore-env.cjs` (with --deploy)

```powershell
cd C:\Users\Administrator\AppData\Local\Temp
node restore-env.cjs --deploy
```

The script will:
1. Read `env-backup.json` (27 vars)
2. PUT the entire list to Render `/v1/services/:id/env-vars` (replaces all)
3. POST a deploy with `imageTag=feat-lmtm-v2` and `clearCache=do_not_clear`
4. Print the new deploy id

### 2.4 Watch the deploy

```powershell
$hdr = @{ Authorization = "Bearer rnd_NEW..." }; Invoke-WebRequest -Uri "https://api.render.com/v1/services/srv-d8f59pbeo5us73bg5jdg/deploys?limit=1" -Headers $hdr -UseBasicParsing | Select-Object -ExpandProperty Content
```

Wait until `status=live` (typically 2–3 minutes).

### 2.5 Verify the service is up

```powershell
curl https://lmtm.onrender.com/api/health
# expect: {"status":"ok","bootstrapStatus":"ready",...}
```

### 2.6 Verify all 4 plugins are running

```powershell
$cookie = (Get-Content C:\Users\Administrator\AppData\Local\Temp\lmtm-cookie.txt).Trim()
$h = @{ Cookie = $cookie; Origin = "https://lmtm.onrender.com"; Referer = "https://lmtm.onrender.com/" }
(Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/_debug/workers" -Headers $h -UseBasicParsing).Content
# expect: 4 workers, all "running"
```

### 2.7 Re-login (the old session cookie is signed with the old secret)

The session token cookie is signed with `BETTER_AUTH_SECRET`. After
rotating, the old cookie is invalid. Log in again:

```powershell
$body = '{"email":"admin@lmtm.agency","password":"lmtm2026!"}'
Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/auth/sign-in/email" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
```

This will return a new `set-cookie` header. Save it to
`C:\Users\Administrator\AppData\Local\Temp\lmtm-cookie.txt` and
`C:\Users\Administrator\lmtm-os\scripts\lmtm-cookie.txt`.

---

## Phase 3 — Smoke test

### 3.1 List clients

```powershell
$cookie = (Get-Content C:\Users\Administrator\AppData\Local\Temp\lmtm-cookie.txt).Trim()
$h = @{ Cookie = $cookie; Origin = "https://lmtm.onrender.com"; Referer = "https://lmtm.onrender.com/" }
(Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/clients?status=active" -Headers $h -UseBasicParsing).Content
# expect: 67 clients
```

### 3.2 List agents

```powershell
(Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/companies/00000000-0000-4000-8000-000000000001/agents" -Headers $h -UseBasicParsing).Content
# expect: 14 agents
```

### 3.3 Test the meta-ads plugin (requires a real Meta connection to be set up)

```powershell
$body = '{"tool":"lmtm-meta-ads:meta-list-ad-accounts","parameters":{},"runContext":{"agentId":"11111111-0000-4000-8000-000000000002","runId":"00000000-0000-4000-8000-000000000099","companyId":"00000000-0000-4000-8000-000000000001","projectId":"00000000-0000-4000-8000-000000000123"}}'
Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/plugins/tools/execute" -Method POST -Body $body -ContentType "application/json" -Headers $h -UseBasicParsing
# expect: a JSON list of ad accounts, OR a clear error like
#   "No active Meta connection for company ..."
```

### 3.4 Test the google-ads plugin

Same as above but with `tool: "lmtm-google-ads:google-list-accounts"`.

### 3.5 Test the clickup plugin

```powershell
$body = '{"tool":"lmtm-clickup:clickup-list-folders","parameters":{"spaceId":"90131985551"},"runContext":{"agentId":"11111111-0000-4000-8000-00000000000e","runId":"00000000-0000-4000-8000-000000000098","companyId":"00000000-0000-4000-8000-000000000001","projectId":"00000000-0000-4000-8000-000000000123"}}'
Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/plugins/tools/execute" -Method POST -Body $body -ContentType "application/json" -Headers $h -UseBasicParsing
# expect: list of 67 folders
```

### 3.6 Test the n8n plugin

```powershell
$body = '{"tool":"lmtm-n8n:n8n-ping","parameters":{},"runContext":{"agentId":"11111111-0000-4000-8000-000000000007","runId":"00000000-0000-4000-8000-000000000097","companyId":"00000000-0000-4000-8000-000000000001","projectId":"00000000-0000-4000-8000-000000000123"}}'
Invoke-WebRequest -Uri "https://lmtm.onrender.com/api/plugins/tools/execute" -Method POST -Body $body -ContentType "application/json" -Headers $h -UseBasicParsing
# expect: {"result":"ok"} or similar
```

### 3.7 Test the UI

Open in a browser:
- https://lmtm.onrender.com/ → should land on the login page
- Log in as `admin@lmtm.agency` / `lmtm2026!`
- Navigate to https://lmtm.onrender.com/company/settings/integrations/ads
- Click "Connect" on the Meta card → OAuth flow opens
- After granting, the callback redirects back; refresh to see the new connection
- Navigate to https://lmtm.onrender.com/c/lmtm-company → should see the LMTM company dashboard
- Click any of the 14 agents → should see their chat / instructions

---

## Phase 4 — Update the docs

After rotation, update:
1. `doc/plans/2026-06-04-credential-rotation.md` (this file) — strike through rotated credentials
2. `agents/luna-cmo/AGENTS.md` and the other 13 — if any of them reference a specific credential in their "Primary tools" section
3. `C:\Users\Administrator\AppData\Local\Temp\env-backup.json` — update with the new (now-committed) values
4. `restore-env.cjs` — the new Render API token

---

## Appendix A — verify-creds.cjs

A helper script that pings every external service with the current
creds and reports which ones are still working. Lives at
`scripts/verify-creds.cjs`. Run it any time you suspect a credential
has been compromised.

```bash
node scripts/verify-creds.cjs
node scripts/verify-creds.cjs --json   # machine-readable output
```

The script reads env vars from `scripts/env-backup.json` (Render-style
envelope `[{key, value}]` is flattened automatically). For credentials
that should never live in Render (GitHub PAT, Render API token) it
falls back to:
1. `scripts/local-secrets.json` (gitignored)
2. `process.env`

Output is a table (or `--json`):

```
SERVICE                  STATUS    NOTE
------------------------------------------------------------------------
GitHub PAT              ok        user=LMTMLatam (https://github.com/LMTMLatam)
Render API              ok        1 service(s) visible
M3 API                  ok        chat completions reachable (200, code 0)
n8n MCP                 ok        server=? tools=27
ClickUp                 ok        user=Marcos Lewis
Supabase DB             ok        db=postgres
Meta app                ok        app auth reachable (expected: invalid grant)
LMTM-OS /api/health     ok        bootstrapStatus=ready
```

If any row is `FAIL`, the runbook Phase 1 step for that service is the
immediate next step. `skip` means the credential isn't loaded in the
current shell (still in env-backup.json or local-secrets.json).

---

## Appendix B — restore-env.cjs

A script that PUTs the entire env-var list from `env-backup.json` to
the Render service. Body is a plain array `[{key, value}]` (NOT wrapped
in `{envVars: [...]}` — the wrapped form returns 400 from Render).

```bash
node C:\Users\Administrator\AppData\Local\Temp\restore-env.cjs --dry-run   # check vars
node C:\Users\Administrator\AppData\Local\Temp\restore-env.cjs              # PUT only
node C:\Users\Administrator\AppData\Local\Temp\restore-env.cjs --deploy    # PUT + deploy
```

See the script header for details.
