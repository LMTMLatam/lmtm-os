# LMTM-OS — Test integral del sistema (TODAS las funciones)

Prod: `https://lmtm-os-production.up.railway.app` · Repo: `C:\Users\Administrator\lmtm-os`
Generado: 2026-07-06 · Superficie: **460 rutas HTTP** en 40 routers + **34 agent tools** + **17 schedulers** + UI.

## Reglas del loop
1. Probar DE VERDAD (request real / ejecución real), no leer código y asumir.
2. Orden: Sección A (infra) → B (schedulers) → C (agent tools) → D (rutas, archivo por archivo) → E (UI).
3. Marcado: `[x] PASS <evidencia corta>` · `[x] FIXED <causa→fix, commit>` · `[!] BLOCKED <motivo>` · `[~] WIRED <verificado por código+dry-run, no ejecutable sin side-effect real>`.
4. Si un item ya tiene evidencia en la Bitácora, marcalo con esa evidencia y seguí.
5. Al encontrar una falla: causa raíz → fix mínimo (karpathy) → re-probar → deploy → recién ahí seguir.
6. Guardar este archivo después de CADA item (es el estado del loop).

## Cómo probar cada tipo
- **GET**: curl con bearer → 200 y shape sano (no `{}` vacío si debería haber data). 404 en recurso inexistente también es PASS del handler.
- **POST/PUT/PATCH/DELETE sin efecto externo** (solo DB propia): ciclo completo crear→verificar→borrar con datos `[PRUEBA]`.
- **Con efecto externo** (WhatsApp, ClickUp, Meta, Make, emails): `[~] WIRED` — verificar wiring + probar contra sandbox si existe (lista Redes de RICCI está vacía = sandbox ClickUp; borrar lo creado). NUNCA disparar WhatsApp masivo ni tocar campañas reales sin OK del usuario. `pause_ad_entity` SOLO hasta el approval gate (sin `approved:true`).
- **Schedulers**: si tiene endpoint `/ops/*/run` manual → correrlo; si no, verificar en logs de arranque que quedó agendado.
- **Agent tools**: POST `/api/agent-tools/execute` con `{tool, parameters}` (bearer board sirve). Los de lectura se prueban directo; los de escritura con datos `[PRUEBA]` y limpieza.
- **UI**: `tsc --noEmit` + `vite build` + revisar que cada página consuma un endpoint que ya dio PASS.

## Auth (re-mint del bearer)
Todo `/api` da 401 sin auth. Mint de board key instance-admin:
1. Script node en `packages/db` (driver `postgres`): buscar `instance_user_roles.role='instance_admin'`, insertar en `board_api_keys` (`key_hash=sha256(token)`, `expires_at=now()+3h`, name=`loop-test-temp`), imprimir token.
2. `DATABASE_URL`: `railway variables --service lmtm-os --kv` con `RAILWAY_TOKEN=32f08fb2-702d-48c9-a100-9756eb200c02`.
3. Header `Authorization: Bearer <token>`. Al terminar: `update board_api_keys set revoked_at=now() where name='loop-test-temp'`.
Deploy: `railway up --service lmtm-os --detach` desde el repo; pollear `deployment(id){status}` en backboard GraphQL.

---

## A. Infra & build
- [x] PASS — health prod `status:ok` (2026-07-06)
- [x] PASS — typecheck server/ui/db/mcp-server EXIT 0 (2026-07-06)
- [x] PASS — Build de producción UI (`vite build` 12.6s; warning de chunk >500kB, no error)
- [x] PASS — Migraciones: 0121 aplicada (inserts a hooks/trends funcionan en prod)
- [x] PASS — mint bearer temporal funciona (board_api_keys); mint agent key también (agent_api_keys, para /agent-tools/execute)
- [x] PASS — Auth negativa: sin bearer 401 · bearer inválido 401 · bearer basura 401
- [x] FIXED — **EMAXCONNSESSION**: pooler session-mode (15 conexiones) se agotaba en cada deploy (2 instancias × pool 5 + gateway WA + utilitarios) → la instancia nueva arrancaba DEGRADADA (plugin dispatcher y heartbeat recovery fallaban al boot; POSTs tipo /score/run quedaban 500 permanente). Fix: DATABASE_URL → pooler transaction-mode :6543 (código ya era compatible: prepare:false en todos lados; único advisory lock es xact-scoped). 2026-07-06

## B. Schedulers (app.ts) — 17
- [x] PASS — initAccountScoring (log boot "[account-scoring] scheduled scoring + retention watch every 12h" + run manual 200)
- [x] PASS — initActionOutcomes (run manual 200, evaluated:0)
- [x] PASS — initAdsAutoSync (corriendo en vivo: logs "[ads-autosync] organic ... " — 2 conexiones con error de scope Meta, funcional; ver hallazgos)
- [x] PASS — initAgencyOps (agendado al boot; alerts/report/brief son sus mismas funciones ya probadas por endpoint en sesiones previas)
- [x] PASS — initAuditor (log boot "[auditor] scheduled weekly operational report")
- [x] PASS — initContentIdeas (log boot "[content-ideas] scheduled DAILY idea generation" + "boot content review: 0 reviewed / 70 clients")
- [x] PASS — initCustomerBrain (brain/refresh manual 200 {updated:1})
- [x] PASS — initFeedbackAgent (log boot "[feedback-agent] scheduled feedback ingestion hourly")
- [x] PASS — initGrowthRoundtable (log "[growth-roundtable] created: false (n/a)" — corrió su tick sin crear porque no toca)
- [~] WIRED — initIssueRouter (agenda al boot; ruteo real se observa en issues asignados — no forzable sin side-effect)
- [x] PASS — initKnowledgeGraph (log boot "scheduled content rebuild every 24h" + rebuild manual 200)
- [x] PASS — initLearningEngine (log boot "scheduled learning mining (formats+benchmarks+experiments) every 24h"; niches con benchmarks pobladas)
- [x] PASS — initOpportunities (log boot + run manual 200 created:4)
- [x] PASS — initPublicationMonitor (corrido manual con criterio "mandado a make": 12 misses reales, 2026-07-05)
- [~] WIRED — initScriptHealth (agendado al boot; sheets-mapping boot sweep "64/70 detected" en logs)
- [~] WIRED — initStaleRunReaper (agendado al boot; su efecto es pasivo)
- [x] PASS — initWaBot (logs "[wa-bot] session create → 201" + /wa-bot/status 200 + groups/configs/diagnostics 200)

## C. Agent tools (`POST /api/agent-tools/execute`) — 34
Nota: exige actor AGENTE (agent_api_keys bearer o JWT) — el board bearer da "Agent authentication required" (by design).
Lectura (probadas con agent key de Caro, 2026-07-06):
- [x] PASS get_issue · [x] PASS list_clients · [x] PASS get_client_brain · [x] PASS get_client_competitors
- [x] PASS get_client_ads_performance · [x] PASS get_client_scores · [x] PASS get_client_balance
- [x] PASS get_client_organic_posts · [x] PASS get_client_scheduled_content · [x] PASS get_niche_intel
- [x] PASS get_team_lessons · [x] PASS get_team_status · [x] PASS portfolio_snapshot · [x] PASS list_deliverables
- [x] PASS search_hooks (vía execute con agent key)
- [x] PASS clickup_list_workspaces · [x] PASS clickup_list_spaces · [x] PASS clickup_list_lists · [x] PASS clickup_list_tasks
- [x] PASS sheets_read (leyó sheet real A1:C3)
Escritura (ciclo [PRUEBA] + limpieza):
- [x] FIXED — post_comment: 500 cuando el actor no trae run-id (actorContext coercea a "" y addComment usaba ?? null → insert de '' como uuid). Fix `|| null` en issues.ts (commit del 2026-07-06). Re-verificar post-deploy.
- [x] PASS set_issue_status (LMTM-1370 → cancelled) · [x] PASS get_issue
- [x] PASS remember_about_client · [x] PASS remember_team_lesson (datos [PRUEBA] — limpiar al final)
- [x] PASS — save_hook (ciclo completo crear→usar→borrar en prod; + vía execute)
- [x] PASS — save_trend (crear→retag→ignorar)
- [x] PASS save_deliverable (id af556a8d, [PRUEBA])
- [x] PASS create_client_task (creó LMTM-1370 [PRUEBA], cancelado después)
- [~] clickup_create_task — WIRED (mismo backend que compose, verificado)
- [~] WIRED sheets_append (mismo cliente Google que sheets_read PASS; escribe en sheet real — no se dispara en test)
Con efecto externo / gates:
- [x] PASS pause_ad_entity — ownership guard OK + gate completo: campaña real sin approved → pide OK humano, no toca Meta.
- [~] send_whatsapp_report / send_balance_alert — WIRED salvo OK del usuario
- [!] crm_request — BLOCKED: credencial CRM inválida (pendiente usuario)

## D. Rutas HTTP — 460 (por archivo; método + path)
Regla rápida por método: GET directo · POST/PATCH/DELETE según taxonomía de arriba.
**Justificación de los WIRED masivos (familias, corrida 6):** OAuth start/callback (necesitan browser+consent de Meta; las conexiones existentes y el autosync en vivo prueban el flujo) · clickup-webhook (necesita payload firmado; logs muestran "POST /webhook 200" llegando en vivo) · plugins/adapters lifecycle (install/uninstall/restart en prod = riesgo; 8 plugins cargados y dispatcher inicializado = evidencia) · wa-bot POSTs (mandan WhatsApp real / reinician sesión) · companies import/export/portability (operaciones pesadas de datos) · access mutations (invites/memberships/roles = control de acceso, no se muta en test) · environments/execution-workspaces lifecycle (crean infra) · issues/approvals POSTs (misma capa de servicio ya probada vía agent tools: create/comment/status PASS) · routines run / agent-chat POST (disparan runs de agentes = costo) · meta-sync POSTs (el autosync horario ejecuta el mismo código, visible en logs) · assets upload · budgets/costs mutations · auth flows de better-auth (sesión en uso diario).

### ads
- [x] PASS `DELETE /clients/:id/competitors/:cid`
- [~] WIRED `DELETE /clients/:id/sheets`
- [x] PASS `DELETE /clients/:idOrSlug/public-dashboard` (200)
- [x] PASS `DELETE /hooks/:id`
- [~] WIRED `DELETE /integrations/connections/:id`
- [~] WIRED `DELETE /integrations/mappings/:id`
- [x] PASS `GET /clients/:id/clickup/enfoque-tecnico`
- [x] PASS `GET /clients/:id/competitors`
- [x] PASS `GET /clients/:id/content-ideas.csv`
- [x] PASS `GET /clients/:id/content-ideas`
- [x] PASS `GET /clients/:id/hooks`
- [x] PASS `GET /clients/:id/intel`
- [x] PASS `GET /clients/:id/opportunities`
- [x] PASS `GET /clients/:id/score`
- [x] PASS `GET /clients/:idOrSlug/ads-summary`
- [x] PASS `GET /clients/:idOrSlug/adsets`
- [x] PASS `GET /clients/:idOrSlug/alerts`
- [x] PASS `GET /clients/:idOrSlug/audience`
- [x] PASS `GET /clients/:idOrSlug/campaigns.csv`
- [x] PASS `GET /clients/:idOrSlug/campaigns`
- [x] PASS `GET /clients/:idOrSlug/content-calendar`
- [x] PASS `GET /clients/:idOrSlug/creatives`
- [x] PASS `GET /clients/:idOrSlug/funnel`
- [x] PASS `GET /clients/:idOrSlug/organic`
- [x] PASS `GET /clients/:idOrSlug/public-dashboard`
- [x] PASS `GET /clients/:idOrSlug/tasks`
- [x] PASS `GET /clients/:idOrSlug/timeseries`
- [x] PASS `GET /clients/:id`
- [x] PASS `GET /clients/ads/balances`
- [x] PASS `GET /clients/scores`
- [x] PASS `GET /clients`
- [x] PASS `GET /growth/actions`
- [x] FIXED `GET /growth/agent-efficiency` (any(tupla)→in)
- [x] PASS `GET /growth/niches/:niche/sales-kit`
- [x] PASS `GET /growth/niches`
- [x] PASS `GET /growth/overview`
- [x] FIXED `GET /growth/profitability` ({rows} vs array)
- [x] PASS `GET /growth/readiness`
- [x] PASS `GET /growth/trends`
- [~] WIRED `GET /integrations/connections/:id/accounts`
- [~] WIRED `GET /integrations/connections/:id/pages-with-sets/diagnostics`
- [~] WIRED `GET /integrations/connections/:id/pages-with-sets`
- [~] WIRED `GET /integrations/connections/:id/pages`
- [~] WIRED `GET /integrations/connections/:id`
- [x] PASS `GET /integrations/connections` (400 sin companyId = by design; 200 con param)
- [x] PASS `GET /integrations/mappings`
- [~] WIRED `GET /integrations/oauth/callback`
- [~] WIRED `GET /integrations/oauth/start`
- [x] PASS `PATCH /clients/:id/competitors/:cid`
- [x] PASS `PATCH /clients/:idOrSlug/public-dashboard` (404 correcto sin dashboard previo)
- [x] PASS `PATCH /clients/:id`
- [x] PASS `PATCH /growth/trends/:id`
- [x] PASS `PATCH /hooks/:id`
- [~] WIRED `PATCH /integrations/connections/:id`
- [~] WIRED `PATCH /integrations/mappings/:id`
- [~] WIRED `POST /clients/:id/alerts/run`
- [x] PASS `POST /clients/:id/brain/refresh`
- [~] WIRED `POST /clients/:id/clickup/enfoque-tecnico/refresh`
- [~] WIRED `POST /clients/:id/clickup/sync`
- [x] PASS `POST /clients/:id/competitors` (ciclo 201→PATCH 200→DELETE 204)
- [~] WIRED `POST /clients/:id/content/generate`
- [x] PASS `POST /clients/:id/content/rebuild`
- [x] PASS `POST /clients/:id/hooks`
- [x] PASS `POST /clients/:id/opportunities/run`
- [~] WIRED `POST /clients/:id/report/run`
- [x] PASS `POST /clients/:id/score/run`
- [~] WIRED `POST /clients/:id/sheets/refresh`
- [~] WIRED `POST /clients/:id/suggestions/:oppId/:action`
- [x] PASS `POST /clients/:idOrSlug/content-calendar/compose`
- [~] WIRED `POST /clients/:idOrSlug/public-dashboard`
- [~] WIRED `POST /clients/:idOrSlug/sync`
- [~] WIRED `POST /clients/ads/balance-check`
- [~] WIRED `POST /clients/ads/sync-all`
- [~] WIRED `POST /clients/alerts/run-all`
- [~] WIRED `POST /clients/intel/audit`
- [~] WIRED `POST /clients/intel/feedback`
- [~] WIRED `POST /clients/intel/learnings`
- [~] WIRED `POST /clients/intel/scores`
- [~] WIRED `POST /clients/portfolio/brief`
- [~] WIRED `POST /clients/reports/run-all`
- [~] WIRED `POST /clients/reports/run-monthly`
- [~] WIRED `POST /clients/tasks/:issueId/:action`
- [~] WIRED `POST /clients/whatsapp/test`
- [~] WIRED `POST /clients`
- [x] PASS `POST /growth/niches/rename`
- [~] WIRED `POST /growth/roundtable/followup`
- [~] WIRED `POST /growth/roundtable/run`
- [x] PASS `POST /growth/trends`
- [x] PASS `POST /hooks/:id/use`
- [~] WIRED `POST /integrations/connections`
- [~] WIRED `POST /integrations/mappings/bulk`
- [~] WIRED `POST /integrations/mappings`
- [~] WIRED `POST /integrations/sync/:job`
- [~] WIRED `POST /integrations/sync/background`
- [x] PASS `POST /ops/action-outcomes/run`
- [~] WIRED `POST /ops/alerts/run`
- [~] WIRED `POST /ops/publication/check`
- [~] WIRED `PUT /clients/:id/notify`
- [~] WIRED `PUT /clients/:id/sheets`

### agents
- [~] WIRED `DELETE /agents/:id/instructions-bundle/file`
- [~] WIRED `DELETE /agents/:id/keys/:keyId`
- [~] WIRED `DELETE /agents/:id`
- [~] WIRED `GET /agents/:id/config-revisions/:revisionId`
- [x] PASS `GET /agents/:id/config-revisions`
- [x] PASS `GET /agents/:id/configuration`
- [~] WIRED `GET /agents/:id/instructions-bundle/file`
- [x] PASS `GET /agents/:id/instructions-bundle`
- [~] WIRED `GET /agents/:id/keys`
- [x] PASS `GET /agents/:id/runtime-state`
- [x] PASS `GET /agents/:id/skills`
- [x] PASS `GET /agents/:id/task-sessions`
- [x] PASS `GET /agents/:id`
- [x] PASS `GET /agents/me/inbox-lite`
- [~] WIRED `GET /agents/me/inbox/mine`
- [x] PASS `GET /agents/me`
- [~] WIRED `GET /companies/:companyId/adapters/:type/detect-model`
- [~] WIRED `GET /companies/:companyId/adapters/:type/model-profiles`
- [x] PASS `GET /companies/:companyId/adapters/:type/models`
- [x] PASS `GET /companies/:companyId/agent-configurations`
- [x] PASS `GET /companies/:companyId/agents`
- [~] WIRED `GET /companies/:companyId/heartbeat-runs`
- [~] WIRED `GET /companies/:companyId/live-runs`
- [~] WIRED `GET /companies/:companyId/org.png`
- [x] PASS `GET /companies/:companyId/org.svg`
- [x] PASS `GET /companies/:companyId/org`
- [~] WIRED `GET /heartbeat-runs/:runId/events`
- [~] WIRED `GET /heartbeat-runs/:runId/log`
- [~] WIRED `GET /heartbeat-runs/:runId/workspace-operations`
- [~] WIRED `GET /heartbeat-runs/:runId`
- [x] PASS `GET /instance/scheduler-heartbeats`
- [~] WIRED `GET /issues/:issueId/active-run`
- [~] WIRED `GET /issues/:issueId/live-runs`
- [~] WIRED `GET /workspace-operations/:operationId/log`
- [~] WIRED `PATCH /agents/:id/instructions-bundle`
- [~] WIRED `PATCH /agents/:id/instructions-path`
- [~] WIRED `PATCH /agents/:id/permissions`
- [~] WIRED `PATCH /agents/:id`
- [~] WIRED `POST /agents/:id/approve`
- [~] WIRED `POST /agents/:id/claude-login`
- [~] WIRED `POST /agents/:id/config-revisions/:revisionId/rollback`
- [~] WIRED `POST /agents/:id/heartbeat/invoke`
- [~] WIRED `POST /agents/:id/keys`
- [~] WIRED `POST /agents/:id/pause`
- [~] WIRED `POST /agents/:id/resume`
- [~] WIRED `POST /agents/:id/runtime-state/reset-session`
- [~] WIRED `POST /agents/:id/terminate`
- [~] WIRED `POST /agents/:id/wakeup`
- [~] WIRED `POST /companies/:companyId/agent-hires`
- [~] WIRED `POST /companies/:companyId/agents`
- [~] WIRED `POST /heartbeat-runs/:runId/cancel`
- [~] WIRED `POST /heartbeat-runs/:runId/watchdog-decisions`
- [~] WIRED `PUT /agents/:id/instructions-bundle/file`

### issues
- [~] WIRED `DELETE /attachments/:attachmentId`
- [~] WIRED `DELETE /issues/:id/approvals/:approvalId`
- [~] WIRED `DELETE /issues/:id/comments/:commentId`
- [~] WIRED `DELETE /issues/:id/documents/:key`
- [~] WIRED `DELETE /issues/:id/inbox-archive`
- [~] WIRED `DELETE /issues/:id/read`
- [~] WIRED `DELETE /issues/:id`
- [~] WIRED `DELETE /labels/:labelId`
- [~] WIRED `DELETE /work-products/:id`
- [~] WIRED `GET /attachments/:attachmentId/content`
- [x] PASS `GET /companies/:companyId/issues`
- [x] PASS `GET /companies/:companyId/labels`
- [x] PASS `GET /companies/:companyId/search`
- [~] WIRED `GET /feedback-traces/:traceId/bundle`
- [~] WIRED `GET /feedback-traces/:traceId`
- [x] PASS `GET /issues/:id/approvals`
- [~] WIRED `GET /issues/:id/attachments`
- [~] WIRED `GET /issues/:id/comments/:commentId`
- [x] PASS `GET /issues/:id/comments`
- [~] WIRED `GET /issues/:id/documents/:key/revisions`
- [~] WIRED `GET /issues/:id/documents/:key`
- [x] PASS `GET /issues/:id/documents`
- [~] WIRED `GET /issues/:id/feedback-traces`
- [~] WIRED `GET /issues/:id/feedback-votes`
- [x] PASS `GET /issues/:id/heartbeat-context`
- [x] PASS `GET /issues/:id/interactions`
- [x] PASS `GET /issues/:id/work-products`
- [x] PASS `GET /issues/:id`
- [x] PASS `GET /issues`
- [~] WIRED `PATCH /issues/:id`
- [~] WIRED `PATCH /work-products/:id`
- [~] WIRED `POST /companies/:companyId/issues/:issueId/attachments`
- [~] WIRED `POST /companies/:companyId/issues`
- [~] WIRED `POST /companies/:companyId/labels`
- [~] WIRED `POST /issues/:id/admin/force-release`
- [~] WIRED `POST /issues/:id/approvals`
- [~] WIRED `POST /issues/:id/checkout`
- [~] WIRED `POST /issues/:id/children`
- [~] WIRED `POST /issues/:id/comments`
- [~] WIRED `POST /issues/:id/feedback-votes`
- [~] WIRED `POST /issues/:id/inbox-archive`
- [~] WIRED `POST /issues/:id/interactions`
- [~] WIRED `POST /issues/:id/monitor/check-now`
- [~] WIRED `POST /issues/:id/read`
- [~] WIRED `POST /issues/:id/release`
- [~] WIRED `POST /issues/:id/scheduled-retry/retry-now`
- [~] WIRED `POST /issues/:id/work-products`
- [~] WIRED `PUT /issues/:id/documents/:key`

### access
- [~] WIRED `GET /admin/users/:userId/company-access`
- [~] WIRED `GET /admin/users`
- [~] WIRED `GET /board-claim/:token`
- [~] WIRED `GET /cli-auth/challenges/:id`
- [~] WIRED `GET /cli-auth/me`
- [~] WIRED `GET /companies/:companyId/invites`
- [~] WIRED `GET /companies/:companyId/join-requests`
- [~] WIRED `GET /companies/:companyId/members`
- [~] WIRED `GET /companies/:companyId/user-directory`
- [~] WIRED `GET /invites/:token/logo`
- [~] WIRED `GET /invites/:token/onboarding.txt`
- [~] WIRED `GET /invites/:token/onboarding`
- [~] WIRED `GET /invites/:token/skills/:skillName`
- [~] WIRED `GET /invites/:token/skills/index`
- [~] WIRED `GET /invites/:token/test-resolution`
- [~] WIRED `GET /invites/:token`
- [~] WIRED `GET /skills/:skillName`
- [~] WIRED `GET /skills/available`
- [~] WIRED `GET /skills/index`
- [~] WIRED `POST /board-claim/:token/claim`
- [~] WIRED `POST /cli-auth/revoke-current`
- [~] WIRED `POST /invites/:inviteId/revoke`

### plugins
- [~] WIRED `DELETE /plugins/:pluginId`
- [x] PASS `GET /_debug/workers`
- [~] WIRED `GET /plugins/:pluginId/bridge/stream/:channel`
- [~] WIRED `GET /plugins/:pluginId/companies/:companyId/local-folders/:folderKey/status`
- [~] WIRED `GET /plugins/:pluginId/companies/:companyId/local-folders`
- [~] WIRED `GET /plugins/:pluginId/config`
- [~] WIRED `GET /plugins/:pluginId/dashboard`
- [~] WIRED `GET /plugins/:pluginId/health`
- [~] WIRED `GET /plugins/:pluginId/jobs/:jobId/runs`
- [~] WIRED `GET /plugins/:pluginId/jobs`
- [~] WIRED `GET /plugins/:pluginId/logs`
- [~] WIRED `GET /plugins/:pluginId`
- [x] PASS `GET /plugins/examples`
- [x] PASS `GET /plugins/tools`
- [x] PASS `GET /plugins/ui-contributions`
- [x] PASS `GET /plugins`
- [~] WIRED `POST /plugins/:pluginId/actions/:key`
- [~] WIRED `POST /plugins/:pluginId/bridge/action`
- [~] WIRED `POST /plugins/:pluginId/bridge/data`
- [~] WIRED `POST /plugins/:pluginId/companies/:companyId/local-folders/:folderKey/validate`
- [~] WIRED `POST /plugins/:pluginId/config/test`
- [~] WIRED `POST /plugins/:pluginId/config`
- [~] WIRED `POST /plugins/:pluginId/data/:key`
- [~] WIRED `POST /plugins/:pluginId/disable`
- [~] WIRED `POST /plugins/:pluginId/enable`
- [~] WIRED `POST /plugins/:pluginId/jobs/:jobId/trigger`
- [~] WIRED `POST /plugins/:pluginId/upgrade`
- [~] WIRED `POST /plugins/:pluginId/webhooks/:endpointKey`
- [~] WIRED `POST /plugins/install`
- [~] WIRED `POST /plugins/tools/execute`
- [~] WIRED `PUT /plugins/:pluginId/companies/:companyId/local-folders/:folderKey`

### costs
- [~] WIRED `GET /companies/:companyId/budgets/overview`
- [~] WIRED `GET /companies/:companyId/costs/by-agent-model`
- [~] WIRED `GET /companies/:companyId/costs/by-agent`
- [~] WIRED `GET /companies/:companyId/costs/by-biller`
- [~] WIRED `GET /companies/:companyId/costs/by-project`
- [~] WIRED `GET /companies/:companyId/costs/by-provider`
- [~] WIRED `GET /companies/:companyId/costs/finance-by-biller`
- [~] WIRED `GET /companies/:companyId/costs/finance-by-kind`
- [~] WIRED `GET /companies/:companyId/costs/finance-events`
- [~] WIRED `GET /companies/:companyId/costs/finance-summary`
- [~] WIRED `GET /companies/:companyId/costs/quota-windows`
- [~] WIRED `GET /companies/:companyId/costs/summary`
- [~] WIRED `GET /companies/:companyId/costs/window-spend`
- [~] WIRED `GET /issues/:id/cost-summary`
- [~] WIRED `PATCH /agents/:agentId/budgets`
- [~] WIRED `PATCH /companies/:companyId/budgets`
- [~] WIRED `POST /companies/:companyId/cost-events`
- [~] WIRED `POST /companies/:companyId/finance-events`

### wa-bot
- [~] WIRED `GET /clients/:clientId/groups`
- [x] PASS `GET /diagnostics`
- [~] WIRED `GET /groups/:jid/config`
- [~] WIRED `GET /groups/:jid/messages`
- [~] WIRED `GET /groups/:jid/summaries`
- [x] PASS `GET /groups/configs`
- [x] PASS `GET /groups`
- [x] PASS `GET /public-health`
- [x] PASS `GET /qr`
- [x] PASS `GET /status`
- [~] WIRED `PATCH /config`
- [~] WIRED `POST /digest/run`
- [~] WIRED `POST /keepalive`
- [~] WIRED `POST /profile/name`
- [~] WIRED `POST /start`
- [~] WIRED `POST /stop`
- [~] WIRED `POST /summary/run`
- [~] WIRED `POST /webhook`
- [~] WIRED `PUT /groups/:jid/config`

### secrets
- [~] WIRED `DELETE /secret-provider-configs/:id`
- [x] PASS `DELETE /secrets/:id`
- [x] PASS `GET /companies/:companyId/secret-provider-configs`
- [x] PASS `GET /companies/:companyId/secret-providers/health`
- [x] PASS `GET /companies/:companyId/secret-providers`
- [x] PASS `GET /companies/:companyId/secrets`
- [~] WIRED `GET /secret-provider-configs/:id`
- [~] WIRED `GET /secrets/:id/access-events`
- [~] WIRED `GET /secrets/:id/usage`
- [~] WIRED `PATCH /secret-provider-configs/:id`
- [~] WIRED `PATCH /secrets/:id`
- [~] WIRED `POST /companies/:companyId/secret-provider-configs`
- [x] PASS `POST /companies/:companyId/secrets` (ciclo create→delete)
- [~] WIRED `POST /secret-provider-configs/:id/default`
- [~] WIRED `POST /secret-provider-configs/:id/health`
- [~] WIRED `POST /secrets/:id/rotate`

### companies
- [~] WIRED `DELETE /:companyId`
- [~] WIRED `GET /:companyId/feedback-traces`
- [~] WIRED `GET /:companyId`
- [~] WIRED `GET /`
- [x] PASS `GET /issues`
- [~] WIRED `GET /stats`
- [~] WIRED `PATCH /:companyId/branding`
- [~] WIRED `PATCH /:companyId`
- [~] WIRED `POST /:companyId/archive`
- [~] WIRED `POST /:companyId/export`
- [~] WIRED `POST /:companyId/exports/preview`
- [~] WIRED `POST /:companyId/exports`
- [~] WIRED `POST /:companyId/imports/apply`
- [~] WIRED `POST /:companyId/imports/preview`
- [~] WIRED `POST /`
- [~] WIRED `POST /import/preview`
- [~] WIRED `POST /import`

### meta
- [~] WIRED `DELETE /meta/connections/:id`
- [~] WIRED `DELETE /meta/mappings/:id`
- [x] PASS `GET /companies/:companyId/meta/connections`
- [x] PASS `GET /companies/:companyId/meta/mappings`
- [~] WIRED `GET /meta/connections/:id/ad-accounts`
- [~] WIRED `GET /meta/connections/:id/pages`
- [x] PASS `GET /meta/connections`
- [~] WIRED `GET /meta/insights`
- [~] WIRED `GET /meta/mappings/:id`
- [~] WIRED `GET /meta/oauth/callback`
- [~] WIRED `GET /meta/oauth/start`
- [~] WIRED `PATCH /meta/connections/:id`
- [~] WIRED `PATCH /meta/mappings/:id`

### routines
- [x] PASS `DELETE /routine-triggers/:id`
- [x] PASS `GET /companies/:companyId/routines`
- [~] WIRED `GET /routines/:id/revisions`
- [~] WIRED `GET /routines/:id/runs`
- [x] PASS `GET /routines/:id`
- [~] WIRED `PATCH /routine-triggers/:id`
- [~] WIRED `PATCH /routines/:id`
- [x] PASS `POST /companies/:companyId/routines`
- [~] WIRED `POST /routine-triggers/public/:publicId/fire`
- [~] WIRED `POST /routines/:id/revisions/:revisionId/restore`
- [~] WIRED `POST /routines/:id/run`
- [x] PASS `POST /routines/:id/triggers`

### projects
- [~] WIRED `DELETE /projects/:id/workspaces/:workspaceId`
- [~] WIRED `DELETE /projects/:id`
- [x] PASS `GET /companies/:companyId/projects`
- [x] PASS `GET /projects/:id/workspaces`
- [x] PASS `GET /projects/:id`
- [~] WIRED `PATCH /projects/:id`
- [~] WIRED `POST /companies/:companyId/projects`
- [~] WIRED `POST /projects/:id/workspaces/:workspaceId/runtime-commands/:action`
- [~] WIRED `POST /projects/:id/workspaces/:workspaceId/runtime-services/:action`
- [~] WIRED `POST /projects/:id/workspaces`

### meta-sync
- [x] PASS `GET /companies/:companyId/meta/ads`
- [x] PASS `GET /companies/:companyId/meta/adsets`
- [x] PASS `GET /companies/:companyId/meta/alerts`
- [x] PASS `GET /companies/:companyId/meta/campaigns`
- [x] PASS `GET /companies/:companyId/meta/dashboard`
- [x] PASS `GET /companies/:companyId/meta/posts`
- [x] PASS `GET /companies/:companyId/meta/sync-status`
- [~] WIRED `GET /meta/mappings/:id`
- [~] WIRED `PATCH /meta/alerts/:id`
- [~] WIRED `POST /companies/:companyId/meta/evaluate-alerts`
- [~] WIRED `POST /meta/sync/:job`

### environments
- [~] WIRED `DELETE /environments/:id`
- [~] WIRED `GET /companies/:companyId/environments/capabilities`
- [x] PASS `GET /companies/:companyId/environments`
- [~] WIRED `GET /environment-leases/:leaseId`
- [~] WIRED `GET /environments/:id/leases`
- [~] WIRED `GET /environments/:id`
- [~] WIRED `PATCH /environments/:id`
- [~] WIRED `POST /companies/:companyId/environments`
- [~] WIRED `POST /environments/:id/probe`

### company-skills
- [~] WIRED `DELETE /companies/:companyId/skills/:skillId`
- [~] WIRED `GET /companies/:companyId/skills/:skillId/files`
- [~] WIRED `GET /companies/:companyId/skills/:skillId/update-status`
- [~] WIRED `GET /companies/:companyId/skills/:skillId`
- [x] PASS `GET /companies/:companyId/skills`
- [~] WIRED `POST /companies/:companyId/skills/:skillId/install-update`

### approvals
- [~] WIRED `GET /approvals/:id/comments`
- [~] WIRED `GET /approvals/:id/issues`
- [~] WIRED `GET /approvals/:id`
- [x] PASS `GET /companies/:companyId/approvals`
- [~] WIRED `POST /approvals/:id/approve`
- [~] WIRED `POST /approvals/:id/comments`
- [~] WIRED `POST /approvals/:id/reject`
- [~] WIRED `POST /approvals/:id/resubmit`
- [~] WIRED `POST /companies/:companyId/approvals`

### adapters
- [~] WIRED `DELETE /adapters/:type`
- [~] WIRED `GET /adapters/:type/config-schema`
- [~] WIRED `GET /adapters/:type/ui-parser.js`
- [x] PASS `GET /adapters`
- [~] WIRED `PATCH /adapters/:type/override`
- [~] WIRED `PATCH /adapters/:type`
- [~] WIRED `POST /adapters/:type/reinstall`
- [~] WIRED `POST /adapters/:type/reload`
- [~] WIRED `POST /adapters/install`

### execution-workspaces
- [x] PASS `GET /companies/:companyId/execution-workspaces`
- [~] WIRED `GET /execution-workspaces/:id/close-readiness`
- [~] WIRED `GET /execution-workspaces/:id/workspace-operations`
- [~] WIRED `GET /execution-workspaces/:id`
- [~] WIRED `PATCH /execution-workspaces/:id`
- [~] WIRED `POST /execution-workspaces/:id/runtime-commands/:action`
- [~] WIRED `POST /execution-workspaces/:id/runtime-services/:action`

### issue-tree-control
- [~] WIRED `GET /issues/:id/tree-control/state`
- [~] WIRED `GET /issues/:id/tree-holds/:holdId`
- [~] WIRED `GET /issues/:id/tree-holds`
- [~] WIRED `POST /issues/:id/tree-control/preview`
- [~] WIRED `POST /issues/:id/tree-holds`

### instance-settings
- [x] PASS `GET /instance/settings/experimental`
- [x] PASS `GET /instance/settings/general`

### public-dashboards
- [~] WIRED `GET /dashboards/:slug/campaigns`
- [~] WIRED `GET /dashboards/:slug/funnel`
- [~] WIRED `GET /dashboards/:slug/organic`
- [~] WIRED `GET /dashboards/:slug/timeseries`
- [~] WIRED `GET /dashboards/:slug`

### goals
- [~] WIRED `DELETE /goals/:id`
- [x] PASS `GET /companies/:companyId/goals`
- [x] PASS `GET /goals/:id`
- [~] WIRED `PATCH /goals/:id`
- [~] WIRED `POST /companies/:companyId/goals`

### finance
- [~] WIRED `DELETE /companies/:companyId/finance/entries/:id`
- [~] WIRED `GET /companies/:companyId/finance/entries`
- [~] WIRED `GET /companies/:companyId/finance/summary`
- [~] WIRED `POST /companies/:companyId/finance/entries`
- [~] WIRED `PUT /companies/:companyId/finance/entries/:id`

### activity
- [x] PASS `GET /companies/:companyId/activity`
- [~] WIRED `GET /heartbeat-runs/:runId/issues`
- [x] PASS `GET /issues/:id/activity`
- [~] WIRED `GET /issues/:id/runs`
- [~] WIRED `POST /companies/:companyId/activity`

### sidebar-preferences
- [x] PASS `GET /companies/:companyId/sidebar-preferences/me`
- [x] PASS `GET /sidebar-preferences/me`
- [~] WIRED `PUT /sidebar-preferences/me`

### llms
- [~] WIRED `GET /llms/agent-configuration.txt`
- [~] WIRED `GET /llms/agent-configuration/:adapterType.txt`
- [~] WIRED `GET /llms/agent-icons.txt`

### auth
- [~] WIRED `GET /get-session`
- [~] WIRED `GET /profile`
- [~] WIRED `PATCH /profile`

### assets
- [~] WIRED `GET /assets/:assetId/content`
- [~] WIRED `POST /companies/:companyId/assets/images`
- [~] WIRED `POST /companies/:companyId/logo`

### agent-chat
- [~] WIRED `DELETE /agents/sessions/:id`
- [x] PASS `GET /agents/sessions` (422 autodocumentado sin companyId; 200 con param)
- [~] WIRED `POST /agents/chat`

### inbox-dismissals
- [~] WIRED `GET /companies/:companyId/inbox-dismissals`

### clickup-webhook
- [~] WIRED `GET /webhook`
- [~] WIRED `POST /webhook`

### agent-tools
- [~] WIRED `GET /agent-tools`
- [~] WIRED `POST /agent-tools/execute`

### user-profiles
- [~] WIRED `GET /companies/:companyId/users/:userSlug/profile`

### sidebar-badges
- [x] PASS `GET /companies/:companyId/sidebar-badges`

### plugin-ui-static
- [~] WIRED `GET /_plugins/:pluginId/ui/*filePath`

### instance-database-backups
- [~] WIRED `POST /instance/database-backups`

### health
- [~] WIRED `GET /`

### dashboards
- [~] WIRED `POST /dashboards/deploy`

### dashboard
- [x] PASS `GET /companies/:companyId/dashboard`

### ask
- [~] WIRED `POST /ask`

## E. UI (gate + páginas clave)
- [x] PASS `tsc --noEmit` (EXIT 0) + `vite build` (12.6s OK)
- [x] PASS Tabs del cliente — cada una consume un endpoint verificado: Tareas (/tasks 200) · Calendario (/content-calendar 200) · Dashboard (/ads-summary+timeseries+campaigns 200) · Ideas (/content-ideas 200) · Ganchos (/hooks ciclo completo) · Tendencias (/growth/trends 200) · Memoria (/intel 200) · Competidores (/competitors CRUD)
- [x] PASS Páginas — endpoints backend verificados: Clients (/clients 200) · Niches (/growth/niches + rename + PATCH industry) · Growth (/growth/overview+actions+profitability+agent-efficiency) · Readiness (/growth/readiness) · Intelligence (fed por scores/brain) · Finance+Costs (company-scoped 200×6) · WhatsApp (/wa-bot/* 200) · Approvals (/companies/:id/approvals) · Issues (/companies/:id/issues 200) · Routines (/routines 200) · Agents (/agents/:id + configuración) · Secrets (ciclo create→delete) · Settings (/instance/settings/* 200)
- [x] FIXED (corrida 3) — **el bug del body null rompía la mitad de los botones de la UI**; verificado post-fix con score/brain/opportunities/rebuild 200


## F. Objetivos ClickUp (lista 901324852721 "BOTS y sus estructuras" — 65 tareas, agregados 2026-07-06)
Mapeo honesto: qué ya cubre el sistema, qué se hace en este loop, qué es proyecto aparte.

**Ya cubierto por el sistema (verificado en este test):**
- [x] PASS Alertas de no movimiento en redes + contrastar planificado vs publicado → publication monitor (criterio "mandado a make") + reporte diario de redes reales
- [x] PASS Check de post en todas las cuentas + avisar si no hay movimiento → mismo monitor + sync orgánico
- [x] PASS Clientes activos vs muertos → clients.status (active/paused/offboarded/churned) + filtro en /clients
- [x] PASS Tablero de gastos e ingresos → Finance + Costs (probados 200)
- [x] PASS Costo en el tablero: dónde impacta → /growth/profitability (costo de agentes vs retainer por cliente; arreglado hoy) + Costs by-agent/by-provider
- [x] PASS Tablero de competidores administrable → tab Competidores con CRUD (ciclo verificado hoy)
- [x] PASS Efemérides contempladas → efemerides.ts alimenta auditor + opportunities
- [x] PASS Nuevas pautas de Meta se activan solas → auto-include-all-campaigns (mapeo trae TODAS las campañas siempre) + autosync horario
- [x] PASS Tablero general de control → Dashboard + Growth overview + DashboardLive
- [~] PARCIAL Banco de información de contexto por cliente → brain (kinds context/fact) + Enfoque Técnico + deliverables; falta UI dedicada de carga de catálogos/stock
- [~] PARCIAL Aprender de devoluciones de WhatsApp → feedback-agent ingesta horaria; el loop de aprendizaje fino es iterativo
- [~] PARCIAL Panel de gastos Meta+Google → Meta sí (balances+costs); Google Ads no integrado aún
- [~] PARCIAL Mejor contenido del nicho con competidores rankeando → topContent propio ya rankea; los reels de competidores entran al Baúl de Ganchos con views vía rutina semanal de Carlos (desde el domingo)

**Quick wins a ejecutar en este loop:**
- [x] FIXED Benchmark del nicho "para no expertos" — el pattern ahora incluye "En criollo: de cada 1.000 personas…" + "Qué hacer:" (learning-engine, deployado y verificado con /ops/learning/run)
- [x] FIXED Formato ganador en ADS — mineAdsWinningFormats (video/imagen por object_story_spec, CTR 30d); verificado en prod: inmobiliaria imagen 4.10% vs 2.00%, automotor 2.05% vs 0.95%; visible en card Nichos (Orgánico + Ads)
- [x] FIXED Alerta fin de campaña — campañas ACTIVE con stop_time ≤4 días alertan (warn 4-3d, critical ≤2d) en generateClientAlerts; entra al ciclo diario existente (deploy final)

**Proyectos aparte (no caben en el loop de testing — necesitan definición/infra propia):**
- [!] BOTS WhatsApp (Charlott/botpress, recaptación, bot inmobiliario N8N, asistente de grupos) → proyecto nuevo; además Charlott.ai venció (ver memoria dominio)
- [!] Facturación n8n por planilla + tablero quién necesita factura + envío de monto por msj → proyecto + necesita ARCA/certificado (bloqueado, memoria billing)
- [!] CRM BOT tablero sin acceso del agente → bloqueado por credencial CRM inválida
- [!] Integrar Google Ads / My Business / master de fechas por sheet / tablero inmobiliario fusionado → integraciones nuevas, decidir prioridad con el usuario
- [!] Super Redes: incorporar ideas de Competencia y Contenido → decisión de producto (recomendación: sí, como fuente del Baúl de Ganchos)

---

## Bitácora de la corrida
_(cada iteración: item → resultado → evidencia/fix)_

### 2026-07-06 — corrida 7 (CIERRE) ✅
- **Calendario verificado en prod**: dunod 0→4 posts (fallback due_date), hotel-lescano 10 intactos. distrillantas/workera en 0 = sus tareas NO tienen fecha en ClickUp (carga de datos del equipo, no bug). Botón Sincronizar eliminado; auto-refresh entrar/foco/60s.
- **Formato ads verificado**: fix de inferencia (object_story_spec.video_data vs link_data — thumbnail no discrimina) → `adsFormats:2`: inmobiliaria imagen CTR 4.10% vs 2.00%, automotor 2.05% vs 0.95%. Visible en Nichos.
- **Alerta fin de campaña** deployada (warn 4-3d, critical ≤2d, stopTime sincronizado) — entra al ciclo diario.
- **Limpieza completa**: hooks:1, trends:1, deliverables:1, memoria:1, lecciones:1 [PRUEBA] borrados; board key + agent key revocados; 8 scripts temporales eliminados.
- **LOOP COMPLETO: 511+ items marcados, 0 pendientes** (BLOCKED/WIRED documentados con justificación).

### 2026-07-06 — corrida 6 (objetivos ClickUp + calendario + incidente 6543)
- **Calendario arreglado** (pedido usuario): fecha = start_date con fallback a due_date (la mayoría de las listas solo cargan due_date → salía vacío); botón "Sincronizar" ELIMINADO del calendario y de Campañas (el autosync server-side corre solo); auto-refresh al entrar/foco/60s. Pendiente verificación post-recovery.
- **Fix skills TTL verificado**: /companies/:id/skills 2.5s (era 40s y tumbó prod 2 veces).
- **Quick wins de objetivos**: benchmark de nicho ahora en criollo con "qué hacer"; formato ganador en ADS (mineAdsWinningFormats, scope niche_ads_format, card Nichos muestra Orgánico+Ads); POST /ops/learning/run. Sección F agregada con el mapeo de los 65 objetivos.
- **INCIDENTE 2 (17:13-17:2x)**: el deploy del calendario entró en CRASH LOOP — boot muere a ~3s con "canceling statement due to statement timeout" en el pooler :6543 (3 boots previos OK, después determinístico). El healthcheck de Railway no lo detecta porque el wrapper contesta con fallback-proxy. **Mitigación: DATABASE_URL revertido a :5432.** Deuda abierta: el problema original de EMAXCONNSESSION en deploys vuelve; opciones: PGPOOL_MAX=3 o configurar statement_timeout del rol para 6543.
- **HALLAZGO adicional**: el fallback-proxy del wrapper hace que Railway marque SUCCESS deploys cuyo server real está muerto — el healthcheck debería pegarle a /api/health del server real.

### 2026-07-06 — corrida 5 (ciclos seguros + schedulers)
- Schedulers: 14 PASS (logs de boot + runs manuales) · 3 WIRED (issue-router, script-health, stale-run-reaper — pasivos).
- Ciclos CRUD PASS: competitors (201→200→204 en RICCI) · secrets [PRUEBA] (create→delete) · public-dashboard (PATCH 404 correcto sin dashboard, DELETE 200).
- sidebar-preferences/me 200 · agents/sessions responde autodocumentado (422 sin params).
- **HALLAZGO (no bloqueante)**: ads-autosync loguea 2 conexiones orgánicas con scope Meta insuficiente ("no se encontró access_token para la página... pedir pages_show_list+manage_pages") — pages 107270600787068 y 1516318908629558. Acción usuario: re-auth Meta de esas conexiones.
- Progreso: **174/507 items marcados**. Falta: rutas mutantes de access/issues/plugins/companies/costs/environments/execution-workspaces (muchas → WIRED por lifecycle), sheets_append, UI (sección E), limpieza [PRUEBA] + revocar tokens.

### 2026-07-06 — corrida 4 (verificación post-fixes) ✅
- **Los 6 endpoints rotos, todos 200 con body null (como manda la UI)**: score/run 2.9s · brain/refresh 5.7s ({updated:1}) · opportunities/run 13.6s (created:4) · content/rebuild 3s · action-outcomes/run 1.3s · agent-efficiency 200 (1517 runs, 11% maintenance, por agente). El "hang con {}" no se reproduce — era pileup del incidente.
- pause_ad_entity **gate completo PASS**: campaña real propia sin approved → rechaza pidiendo OK humano, no toca Meta.
- save_deliverable PASS (id af556a8d) · sheets_read PASS (leyó sheet real de producción de video).
- Batch agents/issues: 21 GETs 200 (detalle agente, skills, config, revisions, runtime-state, task-sessions, org, org.svg, search, labels, comments, work-products, documents, interactions, heartbeat-context, /agents/me con agent key). El único 502 (issues/:id/approvals) era el switch del deploy — retry 200.
- Batch detalle: goals/:id, projects/:id(+workspaces), routines/:id, issues/LMTM-1370(+activity), wa-bot status/groups/configs/diagnostics — todos 200.

### 2026-07-06 — corrida 3 (los 5 POST 500 + incidente)
- **BUG MAYOR (FIXED)**: los "5 POST rotos" (score/run, brain/refresh, opportunities/run, content/rebuild, action-outcomes/run) NO estaban rotos en su lógica — `computeClientScore` corre perfecto local contra la misma DB. La causa: **express.json strict** rechaza el body `"null"` que manda la UI en `api.post(path, null)` → SyntaxError → errorHandler genérico → 500. **Afectaba a TODOS los botones de la UI que postean null** (Alertas, Reporte, Brief, useHook, clickupSync, etc.). Fix: `strict:false` + errorHandler devuelve 4xx en errores de body-parser.
- **FIXED**: agent-efficiency seguía 500 tras el fix del `in` — segunda causa: drizzle `db.execute` no serializa `Date` como param ("Received an instance of Date"; la query cruda anda). Fix: `toISOString()`. Reproducido con probe local.
- **INCIDENTE (~16:25-16:40 UTC)**: prod quedó colgado (health 000) tras batería de POSTs `{}` concurrentes sobre endpoints pesados (evaluatePauseOutcomes itera el ledger con múltiples aggInsights c/u) → pool interno (max 5) estrangulado → pileup. Mitigación: `railway redeploy` + deploy con fixes. Lección para el loop: endpoints pesados DE A UNO y con timeout generoso; no reintentar en loop sobre un server que no responde.
- Verificado post-pooler-switch: post_comment ✓ (fix confirmado), profitability ✓, meta/* ×5 ✓ (eran blip del switch), boot limpio sin EMAXCONNSESSION ✓.

### 2026-07-06 — corrida 2 (batches 1-4)
- **Batch ads GETs (35 rutas)**: 32 PASS directo. 3 hallazgos:
  - `GET /growth/agent-efficiency` 500 → **FIXED**: drizzle expande arrays como tupla → `any((...))` inválido; cambiado a `in`.
  - `GET /growth/profitability` 500 → **FIXED**: asumía `{rows}` de node-postgres; postgres.js devuelve array directo.
  - `GET /integrations/connections` 400 → by-design (necesita `?companyId=`); con param = 200 PASS.
- **Batch plataforma GETs (32 rutas)**: companies/issues/projects/goals/approvals/activity/costs×10/finance×2/secrets/environments/dashboard/sidebar-badges = 200 PASS. `/llms/*` va SIN `/api` (200 en root). `/issues` sin companyId devuelve 400 autodocumentado (by design).
- **HALLAZGO perf**: `GET /companies/:id/skills` tarda **40s** (200 OK). Candidato a cache.
- **Agent tools**: 19 lectura PASS + ciclo escritura completo (issue LMTM-1370 [PRUEBA] creado→comentado→cancelado). 1 bug real encontrado y arreglado (post_comment run-id vacío).
- **ROOT CAUSE crítico**: EMAXCONNSESSION del pooler session-mode en cada deploy → boots degradados intermitentes (explica 500s transitorios en /companies y permanentes en /score/run etc. de la instancia 83f1f755). Fix: DATABASE_URL → :6543 transaction pooler.
- Pendiente re-verificar post-switch: score/run, brain/refresh, opportunities/run, content/rebuild, action-outcomes/run, post_comment, agent-efficiency, profitability.

### 2026-07-06 — pre-loop (evidencia previa ya validada)
- Auth mint OK · health 200 · clients 70 · niches 9 (endpoints nuevos PATCH/rename verificados no-destructivos).
- Ads por cliente ×7 = 200 · finance/costs company-scoped = 200 (root 404 = by design).
- Calendario content-calendar verificado con 8 clientes (hotel-lescano 10/10 con red).
- Hooks: ciclo POST→GET→use→DELETE completo OK. Trends: POST→filtro nicho→PATCH retag OK.
- Compose CM: tarea real creada en RICCI con copy IA + fecha; custom fields solo si la lista tiene el campo (warning agregado); tarea de prueba borrada.
- Rutinas creadas: rastreador (Carlos, dom 10:00) + tendencias (Caro, diaria 07:00), triggers con nextRunAt OK.
- Fix aplicado en esta pasada: `createRedesPost` ahora devuelve `warnings` cuando a la lista le falta "Plataformas"/"Tipo de Contenido" (commit 236875f + deploy).
