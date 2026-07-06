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
- [ ] initAccountScoring — scores diarios (hay `/clients/:id/score/run` manual)
- [x] PASS — initActionOutcomes (corrido manual `/ops/action-outcomes/run` en sesión previa)
- [ ] initAdsAutoSync — sync periódico de ads
- [ ] initAgencyOps — alertas/reportes/brief agendados
- [ ] initAuditor — auditoría operativa diaria
- [ ] initContentIdeas — generación semanal de ideas
- [ ] initCustomerBrain — refresh de brains
- [ ] initFeedbackAgent — procesamiento de feedback
- [ ] initGrowthRoundtable — mesa semanal (hay `/growth/roundtable/run`)
- [ ] initIssueRouter — ruteo de issues a agentes
- [ ] initKnowledgeGraph — grafo de conocimiento
- [ ] initLearningEngine — benchmarks/formatos por nicho
- [ ] initOpportunities — oportunidades por cliente (hay `/clients/:id/opportunities/run`)
- [x] PASS — initPublicationMonitor (corrido manual con criterio "mandado a make": 12 misses reales, 2026-07-05)
- [ ] initScriptHealth — salud de Apps Scripts
- [ ] initStaleRunReaper — limpieza de runs colgados
- [ ] initWaBot — bot de WhatsApp (estado de sesión)

## C. Agent tools (`POST /api/agent-tools/execute`) — 34
Nota: exige actor AGENTE (agent_api_keys bearer o JWT) — el board bearer da "Agent authentication required" (by design).
Lectura (probadas con agent key de Caro, 2026-07-06):
- [x] PASS get_issue · [x] PASS list_clients · [x] PASS get_client_brain · [x] PASS get_client_competitors
- [x] PASS get_client_ads_performance · [x] PASS get_client_scores · [x] PASS get_client_balance
- [x] PASS get_client_organic_posts · [x] PASS get_client_scheduled_content · [x] PASS get_niche_intel
- [x] PASS get_team_lessons · [x] PASS get_team_status · [x] PASS portfolio_snapshot · [x] PASS list_deliverables
- [x] PASS search_hooks (vía execute con agent key)
- [x] PASS clickup_list_workspaces · [x] PASS clickup_list_spaces · [x] PASS clickup_list_lists · [x] PASS clickup_list_tasks
- [ ] sheets_read
Escritura (ciclo [PRUEBA] + limpieza):
- [x] FIXED — post_comment: 500 cuando el actor no trae run-id (actorContext coercea a "" y addComment usaba ?? null → insert de '' como uuid). Fix `|| null` en issues.ts (commit del 2026-07-06). Re-verificar post-deploy.
- [x] PASS set_issue_status (LMTM-1370 → cancelled) · [x] PASS get_issue
- [x] PASS remember_about_client · [x] PASS remember_team_lesson (datos [PRUEBA] — limpiar al final)
- [x] PASS — save_hook (ciclo completo crear→usar→borrar en prod; + vía execute)
- [x] PASS — save_trend (crear→retag→ignorar)
- [ ] save_deliverable
- [x] PASS create_client_task (creó LMTM-1370 [PRUEBA], cancelado después)
- [~] clickup_create_task — WIRED (mismo backend que compose, verificado)
- [ ] sheets_append (⚠️ sheet real — usar rango de prueba o WIRED)
Con efecto externo / gates:
- [x] PASS (parcial) pause_ad_entity — guard de ownership OK (rechaza entidad ajena con mensaje claro). Falta: gate approvalRequired con campaña real propia (sin approved).
- [~] send_whatsapp_report / send_balance_alert — WIRED salvo OK del usuario
- [!] crm_request — BLOCKED: credencial CRM inválida (pendiente usuario)

## D. Rutas HTTP — 460 (por archivo; método + path)
Regla rápida por método: GET directo · POST/PATCH/DELETE según taxonomía de arriba.

### ads
- [ ] `DELETE /clients/:id/competitors/:cid`
- [ ] `DELETE /clients/:id/sheets`
- [ ] `DELETE /clients/:idOrSlug/public-dashboard`
- [x] PASS `DELETE /hooks/:id`
- [ ] `DELETE /integrations/connections/:id`
- [ ] `DELETE /integrations/mappings/:id`
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
- [ ] `GET /integrations/connections/:id/accounts`
- [ ] `GET /integrations/connections/:id/pages-with-sets/diagnostics`
- [ ] `GET /integrations/connections/:id/pages-with-sets`
- [ ] `GET /integrations/connections/:id/pages`
- [ ] `GET /integrations/connections/:id`
- [x] PASS `GET /integrations/connections` (400 sin companyId = by design; 200 con param)
- [x] PASS `GET /integrations/mappings`
- [ ] `GET /integrations/oauth/callback`
- [ ] `GET /integrations/oauth/start`
- [ ] `PATCH /clients/:id/competitors/:cid`
- [ ] `PATCH /clients/:idOrSlug/public-dashboard`
- [x] PASS `PATCH /clients/:id`
- [x] PASS `PATCH /growth/trends/:id`
- [x] PASS `PATCH /hooks/:id`
- [ ] `PATCH /integrations/connections/:id`
- [ ] `PATCH /integrations/mappings/:id`
- [ ] `POST /clients/:id/alerts/run`
- [ ] `POST /clients/:id/brain/refresh`
- [ ] `POST /clients/:id/clickup/enfoque-tecnico/refresh`
- [ ] `POST /clients/:id/clickup/sync`
- [ ] `POST /clients/:id/competitors`
- [ ] `POST /clients/:id/content/generate`
- [ ] `POST /clients/:id/content/rebuild`
- [x] PASS `POST /clients/:id/hooks`
- [ ] `POST /clients/:id/opportunities/run`
- [ ] `POST /clients/:id/report/run`
- [ ] `POST /clients/:id/score/run`
- [ ] `POST /clients/:id/sheets/refresh`
- [ ] `POST /clients/:id/suggestions/:oppId/:action`
- [x] PASS `POST /clients/:idOrSlug/content-calendar/compose`
- [ ] `POST /clients/:idOrSlug/public-dashboard`
- [ ] `POST /clients/:idOrSlug/sync`
- [ ] `POST /clients/ads/balance-check`
- [ ] `POST /clients/ads/sync-all`
- [ ] `POST /clients/alerts/run-all`
- [ ] `POST /clients/intel/audit`
- [ ] `POST /clients/intel/feedback`
- [ ] `POST /clients/intel/learnings`
- [ ] `POST /clients/intel/scores`
- [ ] `POST /clients/portfolio/brief`
- [ ] `POST /clients/reports/run-all`
- [ ] `POST /clients/reports/run-monthly`
- [ ] `POST /clients/tasks/:issueId/:action`
- [ ] `POST /clients/whatsapp/test`
- [ ] `POST /clients`
- [x] PASS `POST /growth/niches/rename`
- [ ] `POST /growth/roundtable/followup`
- [ ] `POST /growth/roundtable/run`
- [x] PASS `POST /growth/trends`
- [x] PASS `POST /hooks/:id/use`
- [ ] `POST /integrations/connections`
- [ ] `POST /integrations/mappings/bulk`
- [ ] `POST /integrations/mappings`
- [ ] `POST /integrations/sync/:job`
- [ ] `POST /integrations/sync/background`
- [ ] `POST /ops/action-outcomes/run`
- [ ] `POST /ops/alerts/run`
- [ ] `POST /ops/publication/check`
- [ ] `PUT /clients/:id/notify`
- [ ] `PUT /clients/:id/sheets`

### agents
- [ ] `DELETE /agents/:id/instructions-bundle/file`
- [ ] `DELETE /agents/:id/keys/:keyId`
- [ ] `DELETE /agents/:id`
- [ ] `GET /agents/:id/config-revisions/:revisionId`
- [ ] `GET /agents/:id/config-revisions`
- [ ] `GET /agents/:id/configuration`
- [ ] `GET /agents/:id/instructions-bundle/file`
- [ ] `GET /agents/:id/instructions-bundle`
- [ ] `GET /agents/:id/keys`
- [ ] `GET /agents/:id/runtime-state`
- [ ] `GET /agents/:id/skills`
- [ ] `GET /agents/:id/task-sessions`
- [ ] `GET /agents/:id`
- [ ] `GET /agents/me/inbox-lite`
- [ ] `GET /agents/me/inbox/mine`
- [ ] `GET /agents/me`
- [ ] `GET /companies/:companyId/adapters/:type/detect-model`
- [ ] `GET /companies/:companyId/adapters/:type/model-profiles`
- [ ] `GET /companies/:companyId/adapters/:type/models`
- [ ] `GET /companies/:companyId/agent-configurations`
- [ ] `GET /companies/:companyId/agents`
- [ ] `GET /companies/:companyId/heartbeat-runs`
- [ ] `GET /companies/:companyId/live-runs`
- [ ] `GET /companies/:companyId/org.png`
- [ ] `GET /companies/:companyId/org.svg`
- [ ] `GET /companies/:companyId/org`
- [ ] `GET /heartbeat-runs/:runId/events`
- [ ] `GET /heartbeat-runs/:runId/log`
- [ ] `GET /heartbeat-runs/:runId/workspace-operations`
- [ ] `GET /heartbeat-runs/:runId`
- [ ] `GET /instance/scheduler-heartbeats`
- [ ] `GET /issues/:issueId/active-run`
- [ ] `GET /issues/:issueId/live-runs`
- [ ] `GET /workspace-operations/:operationId/log`
- [ ] `PATCH /agents/:id/instructions-bundle`
- [ ] `PATCH /agents/:id/instructions-path`
- [ ] `PATCH /agents/:id/permissions`
- [ ] `PATCH /agents/:id`
- [ ] `POST /agents/:id/approve`
- [ ] `POST /agents/:id/claude-login`
- [ ] `POST /agents/:id/config-revisions/:revisionId/rollback`
- [ ] `POST /agents/:id/heartbeat/invoke`
- [ ] `POST /agents/:id/keys`
- [ ] `POST /agents/:id/pause`
- [ ] `POST /agents/:id/resume`
- [ ] `POST /agents/:id/runtime-state/reset-session`
- [ ] `POST /agents/:id/terminate`
- [ ] `POST /agents/:id/wakeup`
- [ ] `POST /companies/:companyId/agent-hires`
- [ ] `POST /companies/:companyId/agents`
- [ ] `POST /heartbeat-runs/:runId/cancel`
- [ ] `POST /heartbeat-runs/:runId/watchdog-decisions`
- [ ] `PUT /agents/:id/instructions-bundle/file`

### issues
- [ ] `DELETE /attachments/:attachmentId`
- [ ] `DELETE /issues/:id/approvals/:approvalId`
- [ ] `DELETE /issues/:id/comments/:commentId`
- [ ] `DELETE /issues/:id/documents/:key`
- [ ] `DELETE /issues/:id/inbox-archive`
- [ ] `DELETE /issues/:id/read`
- [ ] `DELETE /issues/:id`
- [ ] `DELETE /labels/:labelId`
- [ ] `DELETE /work-products/:id`
- [ ] `GET /attachments/:attachmentId/content`
- [ ] `GET /companies/:companyId/issues`
- [ ] `GET /companies/:companyId/labels`
- [ ] `GET /companies/:companyId/search`
- [ ] `GET /feedback-traces/:traceId/bundle`
- [ ] `GET /feedback-traces/:traceId`
- [ ] `GET /issues/:id/approvals`
- [ ] `GET /issues/:id/attachments`
- [ ] `GET /issues/:id/comments/:commentId`
- [ ] `GET /issues/:id/comments`
- [ ] `GET /issues/:id/documents/:key/revisions`
- [ ] `GET /issues/:id/documents/:key`
- [ ] `GET /issues/:id/documents`
- [ ] `GET /issues/:id/feedback-traces`
- [ ] `GET /issues/:id/feedback-votes`
- [ ] `GET /issues/:id/heartbeat-context`
- [ ] `GET /issues/:id/interactions`
- [ ] `GET /issues/:id/work-products`
- [ ] `GET /issues/:id`
- [ ] `GET /issues`
- [ ] `PATCH /issues/:id`
- [ ] `PATCH /work-products/:id`
- [ ] `POST /companies/:companyId/issues/:issueId/attachments`
- [ ] `POST /companies/:companyId/issues`
- [ ] `POST /companies/:companyId/labels`
- [ ] `POST /issues/:id/admin/force-release`
- [ ] `POST /issues/:id/approvals`
- [ ] `POST /issues/:id/checkout`
- [ ] `POST /issues/:id/children`
- [ ] `POST /issues/:id/comments`
- [ ] `POST /issues/:id/feedback-votes`
- [ ] `POST /issues/:id/inbox-archive`
- [ ] `POST /issues/:id/interactions`
- [ ] `POST /issues/:id/monitor/check-now`
- [ ] `POST /issues/:id/read`
- [ ] `POST /issues/:id/release`
- [ ] `POST /issues/:id/scheduled-retry/retry-now`
- [ ] `POST /issues/:id/work-products`
- [ ] `PUT /issues/:id/documents/:key`

### access
- [ ] `GET /admin/users/:userId/company-access`
- [ ] `GET /admin/users`
- [ ] `GET /board-claim/:token`
- [ ] `GET /cli-auth/challenges/:id`
- [ ] `GET /cli-auth/me`
- [ ] `GET /companies/:companyId/invites`
- [ ] `GET /companies/:companyId/join-requests`
- [ ] `GET /companies/:companyId/members`
- [ ] `GET /companies/:companyId/user-directory`
- [ ] `GET /invites/:token/logo`
- [ ] `GET /invites/:token/onboarding.txt`
- [ ] `GET /invites/:token/onboarding`
- [ ] `GET /invites/:token/skills/:skillName`
- [ ] `GET /invites/:token/skills/index`
- [ ] `GET /invites/:token/test-resolution`
- [ ] `GET /invites/:token`
- [ ] `GET /skills/:skillName`
- [ ] `GET /skills/available`
- [ ] `GET /skills/index`
- [ ] `POST /board-claim/:token/claim`
- [ ] `POST /cli-auth/revoke-current`
- [ ] `POST /invites/:inviteId/revoke`

### plugins
- [ ] `DELETE /plugins/:pluginId`
- [ ] `GET /_debug/workers`
- [ ] `GET /plugins/:pluginId/bridge/stream/:channel`
- [ ] `GET /plugins/:pluginId/companies/:companyId/local-folders/:folderKey/status`
- [ ] `GET /plugins/:pluginId/companies/:companyId/local-folders`
- [ ] `GET /plugins/:pluginId/config`
- [ ] `GET /plugins/:pluginId/dashboard`
- [ ] `GET /plugins/:pluginId/health`
- [ ] `GET /plugins/:pluginId/jobs/:jobId/runs`
- [ ] `GET /plugins/:pluginId/jobs`
- [ ] `GET /plugins/:pluginId/logs`
- [ ] `GET /plugins/:pluginId`
- [ ] `GET /plugins/examples`
- [ ] `GET /plugins/tools`
- [ ] `GET /plugins/ui-contributions`
- [ ] `GET /plugins`
- [ ] `POST /plugins/:pluginId/actions/:key`
- [ ] `POST /plugins/:pluginId/bridge/action`
- [ ] `POST /plugins/:pluginId/bridge/data`
- [ ] `POST /plugins/:pluginId/companies/:companyId/local-folders/:folderKey/validate`
- [ ] `POST /plugins/:pluginId/config/test`
- [ ] `POST /plugins/:pluginId/config`
- [ ] `POST /plugins/:pluginId/data/:key`
- [ ] `POST /plugins/:pluginId/disable`
- [ ] `POST /plugins/:pluginId/enable`
- [ ] `POST /plugins/:pluginId/jobs/:jobId/trigger`
- [ ] `POST /plugins/:pluginId/upgrade`
- [ ] `POST /plugins/:pluginId/webhooks/:endpointKey`
- [ ] `POST /plugins/install`
- [ ] `POST /plugins/tools/execute`
- [ ] `PUT /plugins/:pluginId/companies/:companyId/local-folders/:folderKey`

### costs
- [ ] `GET /companies/:companyId/budgets/overview`
- [ ] `GET /companies/:companyId/costs/by-agent-model`
- [ ] `GET /companies/:companyId/costs/by-agent`
- [ ] `GET /companies/:companyId/costs/by-biller`
- [ ] `GET /companies/:companyId/costs/by-project`
- [ ] `GET /companies/:companyId/costs/by-provider`
- [ ] `GET /companies/:companyId/costs/finance-by-biller`
- [ ] `GET /companies/:companyId/costs/finance-by-kind`
- [ ] `GET /companies/:companyId/costs/finance-events`
- [ ] `GET /companies/:companyId/costs/finance-summary`
- [ ] `GET /companies/:companyId/costs/quota-windows`
- [ ] `GET /companies/:companyId/costs/summary`
- [ ] `GET /companies/:companyId/costs/window-spend`
- [ ] `GET /issues/:id/cost-summary`
- [ ] `PATCH /agents/:agentId/budgets`
- [ ] `PATCH /companies/:companyId/budgets`
- [ ] `POST /companies/:companyId/cost-events`
- [ ] `POST /companies/:companyId/finance-events`

### wa-bot
- [ ] `GET /clients/:clientId/groups`
- [ ] `GET /diagnostics`
- [ ] `GET /groups/:jid/config`
- [ ] `GET /groups/:jid/messages`
- [ ] `GET /groups/:jid/summaries`
- [ ] `GET /groups/configs`
- [ ] `GET /groups`
- [ ] `GET /public-health`
- [ ] `GET /qr`
- [ ] `GET /status`
- [ ] `PATCH /config`
- [ ] `POST /digest/run`
- [ ] `POST /keepalive`
- [ ] `POST /profile/name`
- [ ] `POST /start`
- [ ] `POST /stop`
- [ ] `POST /summary/run`
- [ ] `POST /webhook`
- [ ] `PUT /groups/:jid/config`

### secrets
- [ ] `DELETE /secret-provider-configs/:id`
- [ ] `DELETE /secrets/:id`
- [ ] `GET /companies/:companyId/secret-provider-configs`
- [ ] `GET /companies/:companyId/secret-providers/health`
- [ ] `GET /companies/:companyId/secret-providers`
- [ ] `GET /companies/:companyId/secrets`
- [ ] `GET /secret-provider-configs/:id`
- [ ] `GET /secrets/:id/access-events`
- [ ] `GET /secrets/:id/usage`
- [ ] `PATCH /secret-provider-configs/:id`
- [ ] `PATCH /secrets/:id`
- [ ] `POST /companies/:companyId/secret-provider-configs`
- [ ] `POST /companies/:companyId/secrets`
- [ ] `POST /secret-provider-configs/:id/default`
- [ ] `POST /secret-provider-configs/:id/health`
- [ ] `POST /secrets/:id/rotate`

### companies
- [ ] `DELETE /:companyId`
- [ ] `GET /:companyId/feedback-traces`
- [ ] `GET /:companyId`
- [ ] `GET /`
- [ ] `GET /issues`
- [ ] `GET /stats`
- [ ] `PATCH /:companyId/branding`
- [ ] `PATCH /:companyId`
- [ ] `POST /:companyId/archive`
- [ ] `POST /:companyId/export`
- [ ] `POST /:companyId/exports/preview`
- [ ] `POST /:companyId/exports`
- [ ] `POST /:companyId/imports/apply`
- [ ] `POST /:companyId/imports/preview`
- [ ] `POST /`
- [ ] `POST /import/preview`
- [ ] `POST /import`

### meta
- [ ] `DELETE /meta/connections/:id`
- [ ] `DELETE /meta/mappings/:id`
- [ ] `GET /companies/:companyId/meta/connections`
- [ ] `GET /companies/:companyId/meta/mappings`
- [ ] `GET /meta/connections/:id/ad-accounts`
- [ ] `GET /meta/connections/:id/pages`
- [ ] `GET /meta/connections`
- [ ] `GET /meta/insights`
- [ ] `GET /meta/mappings/:id`
- [ ] `GET /meta/oauth/callback`
- [ ] `GET /meta/oauth/start`
- [ ] `PATCH /meta/connections/:id`
- [ ] `PATCH /meta/mappings/:id`

### routines
- [ ] `DELETE /routine-triggers/:id`
- [ ] `GET /companies/:companyId/routines`
- [ ] `GET /routines/:id/revisions`
- [ ] `GET /routines/:id/runs`
- [ ] `GET /routines/:id`
- [ ] `PATCH /routine-triggers/:id`
- [ ] `PATCH /routines/:id`
- [ ] `POST /companies/:companyId/routines`
- [ ] `POST /routine-triggers/public/:publicId/fire`
- [ ] `POST /routines/:id/revisions/:revisionId/restore`
- [ ] `POST /routines/:id/run`
- [ ] `POST /routines/:id/triggers`

### projects
- [ ] `DELETE /projects/:id/workspaces/:workspaceId`
- [ ] `DELETE /projects/:id`
- [ ] `GET /companies/:companyId/projects`
- [ ] `GET /projects/:id/workspaces`
- [ ] `GET /projects/:id`
- [ ] `PATCH /projects/:id`
- [ ] `POST /companies/:companyId/projects`
- [ ] `POST /projects/:id/workspaces/:workspaceId/runtime-commands/:action`
- [ ] `POST /projects/:id/workspaces/:workspaceId/runtime-services/:action`
- [ ] `POST /projects/:id/workspaces`

### meta-sync
- [ ] `GET /companies/:companyId/meta/ads`
- [ ] `GET /companies/:companyId/meta/adsets`
- [ ] `GET /companies/:companyId/meta/alerts`
- [ ] `GET /companies/:companyId/meta/campaigns`
- [ ] `GET /companies/:companyId/meta/dashboard`
- [ ] `GET /companies/:companyId/meta/posts`
- [ ] `GET /companies/:companyId/meta/sync-status`
- [ ] `GET /meta/mappings/:id`
- [ ] `PATCH /meta/alerts/:id`
- [ ] `POST /companies/:companyId/meta/evaluate-alerts`
- [ ] `POST /meta/sync/:job`

### environments
- [ ] `DELETE /environments/:id`
- [ ] `GET /companies/:companyId/environments/capabilities`
- [ ] `GET /companies/:companyId/environments`
- [ ] `GET /environment-leases/:leaseId`
- [ ] `GET /environments/:id/leases`
- [ ] `GET /environments/:id`
- [ ] `PATCH /environments/:id`
- [ ] `POST /companies/:companyId/environments`
- [ ] `POST /environments/:id/probe`

### company-skills
- [ ] `DELETE /companies/:companyId/skills/:skillId`
- [ ] `GET /companies/:companyId/skills/:skillId/files`
- [ ] `GET /companies/:companyId/skills/:skillId/update-status`
- [ ] `GET /companies/:companyId/skills/:skillId`
- [ ] `GET /companies/:companyId/skills`
- [ ] `POST /companies/:companyId/skills/:skillId/install-update`

### approvals
- [ ] `GET /approvals/:id/comments`
- [ ] `GET /approvals/:id/issues`
- [ ] `GET /approvals/:id`
- [ ] `GET /companies/:companyId/approvals`
- [ ] `POST /approvals/:id/approve`
- [ ] `POST /approvals/:id/comments`
- [ ] `POST /approvals/:id/reject`
- [ ] `POST /approvals/:id/resubmit`
- [ ] `POST /companies/:companyId/approvals`

### adapters
- [ ] `DELETE /adapters/:type`
- [ ] `GET /adapters/:type/config-schema`
- [ ] `GET /adapters/:type/ui-parser.js`
- [ ] `GET /adapters`
- [ ] `PATCH /adapters/:type/override`
- [ ] `PATCH /adapters/:type`
- [ ] `POST /adapters/:type/reinstall`
- [ ] `POST /adapters/:type/reload`
- [ ] `POST /adapters/install`

### execution-workspaces
- [ ] `GET /companies/:companyId/execution-workspaces`
- [ ] `GET /execution-workspaces/:id/close-readiness`
- [ ] `GET /execution-workspaces/:id/workspace-operations`
- [ ] `GET /execution-workspaces/:id`
- [ ] `PATCH /execution-workspaces/:id`
- [ ] `POST /execution-workspaces/:id/runtime-commands/:action`
- [ ] `POST /execution-workspaces/:id/runtime-services/:action`

### issue-tree-control
- [ ] `GET /issues/:id/tree-control/state`
- [ ] `GET /issues/:id/tree-holds/:holdId`
- [ ] `GET /issues/:id/tree-holds`
- [ ] `POST /issues/:id/tree-control/preview`
- [ ] `POST /issues/:id/tree-holds`

### instance-settings
- [ ] `GET /instance/settings/experimental`
- [ ] `GET /instance/settings/general`

### public-dashboards
- [ ] `GET /dashboards/:slug/campaigns`
- [ ] `GET /dashboards/:slug/funnel`
- [ ] `GET /dashboards/:slug/organic`
- [ ] `GET /dashboards/:slug/timeseries`
- [ ] `GET /dashboards/:slug`

### goals
- [ ] `DELETE /goals/:id`
- [ ] `GET /companies/:companyId/goals`
- [ ] `GET /goals/:id`
- [ ] `PATCH /goals/:id`
- [ ] `POST /companies/:companyId/goals`

### finance
- [ ] `DELETE /companies/:companyId/finance/entries/:id`
- [ ] `GET /companies/:companyId/finance/entries`
- [ ] `GET /companies/:companyId/finance/summary`
- [ ] `POST /companies/:companyId/finance/entries`
- [ ] `PUT /companies/:companyId/finance/entries/:id`

### activity
- [ ] `GET /companies/:companyId/activity`
- [ ] `GET /heartbeat-runs/:runId/issues`
- [ ] `GET /issues/:id/activity`
- [ ] `GET /issues/:id/runs`
- [ ] `POST /companies/:companyId/activity`

### sidebar-preferences
- [ ] `GET /companies/:companyId/sidebar-preferences/me`
- [ ] `GET /sidebar-preferences/me`
- [ ] `PUT /sidebar-preferences/me`

### llms
- [ ] `GET /llms/agent-configuration.txt`
- [ ] `GET /llms/agent-configuration/:adapterType.txt`
- [ ] `GET /llms/agent-icons.txt`

### auth
- [ ] `GET /get-session`
- [ ] `GET /profile`
- [ ] `PATCH /profile`

### assets
- [ ] `GET /assets/:assetId/content`
- [ ] `POST /companies/:companyId/assets/images`
- [ ] `POST /companies/:companyId/logo`

### agent-chat
- [ ] `DELETE /agents/sessions/:id`
- [ ] `GET /agents/sessions`
- [ ] `POST /agents/chat`

### inbox-dismissals
- [ ] `GET /companies/:companyId/inbox-dismissals`

### clickup-webhook
- [ ] `GET /webhook`
- [ ] `POST /webhook`

### agent-tools
- [ ] `GET /agent-tools`
- [ ] `POST /agent-tools/execute`

### user-profiles
- [ ] `GET /companies/:companyId/users/:userSlug/profile`

### sidebar-badges
- [ ] `GET /companies/:companyId/sidebar-badges`

### plugin-ui-static
- [ ] `GET /_plugins/:pluginId/ui/*filePath`

### instance-database-backups
- [ ] `POST /instance/database-backups`

### health
- [ ] `GET /`

### dashboards
- [ ] `POST /dashboards/deploy`

### dashboard
- [ ] `GET /companies/:companyId/dashboard`

### ask
- [ ] `POST /ask`

## E. UI (gate + páginas clave)
- [ ] `tsc --noEmit` + `vite build` de ui sin error
- [ ] Cada tab del cliente carga contra endpoint PASS: Tareas · Calendario · Dashboard · Ideas · Ganchos · Tendencias · Memoria · Competidores
- [ ] Páginas: Clients · Niches (gestión de nichos) · Growth · Readiness · Intelligence · Finance · Costs · WhatsApp · Approvals · Issues · Routines · Agents · Secrets · Settings

---

## Bitácora de la corrida
_(cada iteración: item → resultado → evidencia/fix)_

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
