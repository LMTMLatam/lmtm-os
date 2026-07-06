# LMTM-OS — Checklist de prueba punto por punto

Prod: `https://lmtm-os-production.up.railway.app` · Repo: `C:\Users\Administrator\lmtm-os`

**Cómo probar cada item (regla):** probar DE VERDAD, no leer código y asumir.
- Endpoints públicos → `curl` directo.
- Endpoints autenticados → bearer token temporal (mint en `agent_api_keys` con el `DATABASE_URL` local; borrar al terminar la corrida).
- Servicios/schedulers → correr su función con un runner puntual o disparar el endpoint `/ops/...` que lo ejecuta.
- UI → `tsc --noEmit` + build; y revisar el flujo del componente contra su endpoint.

**Marcado:** `[ ]` pendiente · `[x] PASS — <evidencia>` · `[x] FIXED — <qué se rompió → qué cambié (commit)>` · `[!] BLOCKED — <por qué / de quién depende>`

---

## Tier 0 — Infra & build (correr primero; si algo acá falla, frenar y arreglar)
- [x] PASS — Prod health autenticado → `GET /api/health` = `status:ok`
- [x] PASS — Deploy feature nichos VIVO → `PATCH /clients/:id` 200 (setea industry correcto, no-op verificado), `POST /growth/niches/rename` 200 (`renamed:0` en nicho inexistente)
- [x] PASS — Server typecheck limpio (EXIT 0)
- [x] PASS — UI typecheck limpio (EXIT 0)
- [ ] Build completo del server (bundle) sin error
- [ ] Migraciones aplicadas sin drift → log de arranque `Migrations: already applied`
- [x] PASS — Auth: mint de bearer temporal funciona (board_api_keys, sha256; token = instance-admin → acceso total)

## Tier 1 — Utilidades core de la agencia (uso diario)
- [x] PASS — Clients — `GET /clients` 200 (70 clientes), `GET /clients/:id` 200, `GET /clients/scores` 200. (POST create: no probado — destructivo)
- [x] PASS — Nichos (NUEVO) — `PATCH /clients/:id {industry}` 200 (RICCI intacto), `rename` 200, `GET /growth/niches` 200 (9 nichos)
- [x] PASS — Readiness — `GET /growth/readiness` 200
- [x] PASS — Growth actions — `GET /growth/actions` 200
- [x] PASS — Sales kit — `GET /growth/niches/construccion-materiales/sales-kit` 200
- [x] PASS — Ads por cliente — `ads-summary/timeseries/campaigns/adsets/creatives/funnel/audience` los 7 = 200
- [ ] Integraciones — `GET /integrations/connections`, `mappings`; verificar auto-include (`included_adsets` vacío = todas)
- [ ] Sync ads — `POST /integrations/sync/all` trae registros ⚠️ side-effect (llama Meta)
- [ ] Dashboards — `GET /clients/:id/public-dashboard`, dashboard live/data del cliente
- [ ] Reporte semanal — `POST /clients/:id/report/run` ⚠️ side-effect (crea tarea ClickUp)
- [ ] Alertas — `POST /clients/:id/alerts/run` ⚠️ side-effect (manda WhatsApp al equipo)
- [ ] Portfolio brief — `POST /clients/portfolio/brief` ⚠️ side-effect (WhatsApp)
- [ ] Publication monitor — `runPublicationCheck`: criterio "mandado a make" ⚠️ side-effect (WhatsApp)
- [ ] Action outcomes — `POST /ops/action-outcomes/run` (mide pausas ≥7d)
- [ ] Balance monitor — saldo/estado de cuentas Meta
- [x] PASS — Finance / Costs — company-scoped `/companies/:id/finance/summary|entries` y `/costs/summary|by-agent` = 200 (el `/api/finance` suelto da 404 por diseño, no es bug)

> ⚠️ **Regla side-effect:** endpoints marcados mandan WhatsApp/ClickUp/Meta reales. NO dispararlos a ciegas: verificar wiring/lógica, y solo ejecutar con OK del usuario o contra un cliente/canal de prueba.

## Tier 2 — Agentes & automatización
- [ ] Agent tools — endpoint ejecutor: `get_niche_intel`, `remember_about_client`, `get_client_ads_performance`
- [ ] Approval gate — pausar ad sin `approved=true` devuelve `approvalRequired`; con approval ejecuta y registra en `agent_actions`
- [ ] Agent chat — responde
- [ ] Routines — listar/correr una rutina
- [ ] Learning engine — mina benchmarks/formatos por nicho
- [ ] Opportunities engine — `POST /clients/:id/opportunities/run`
- [ ] Customer brain — `POST /clients/:id/brain/refresh`
- [ ] WhatsApp bot — estado de sesión (conectado / QR)
- [!] CRM proxy (Ana/Esteban) — `crm-client.ts`: BLOCKED, credencial `agentes@bylmtm.com` inválida (depende del usuario)

## Tier 3 — Plataforma & plumbing
- [ ] Auth/sesión — login, `GET /api/me`/actor
- [ ] Approvals — listar/aprobar
- [ ] Issues — listar/crear/detalle
- [ ] Goals / Projects / Workspaces
- [ ] Environments / Secrets
- [ ] Plugins — cargados al arranque (8 esperados)
- [ ] Activity / Search / Sidebar badges

---

## Receta de auth (re-mint del bearer temporal)
Todo `/api` está detrás de auth global (401). Para testear, mint un board key de instance-admin:
1. `packages/db/_mint_temp.mjs` (postgres driver): busca `instance_user_roles.role='instance_admin'`, inserta en `board_api_keys` (`key_hash = sha256(token)`, `expires_at = now()+3h`), imprime `TOKEN=`.
2. Correr desde `packages/db` con `DATABASE_URL` sacado de Railway:
   `railway variables --service lmtm-os --kv` → `DATABASE_URL` (RAILWAY_TOKEN=`32f08fb2-...`).
3. Usar `-H "Authorization: Bearer <token>"`. Al terminar la corrida: `update board_api_keys set revoked_at=now() where name='loop-test-temp'`.

## Bitácora de la corrida
_(cada iteración agrega: item, resultado, evidencia/fix)_

### 2026-07-06 — corrida 1 (Tier 0 + Tier 1 lado lectura)
- Auth mint OK (board key instance-admin, 3h).
- Health 200; clients 70; niches 9; readiness/actions/sales-kit/scores 200.
- Feature nichos verificado en prod: PATCH setea industry correcto (RICCI intacto), rename `renamed:0`, GET niches 9. **Deploy vivo.**
- Ads por cliente (7 endpoints) 200. Finance/Costs company-scoped 200 (el path suelto 404 = diseño, no bug).
- Server + UI typecheck EXIT 0.
- **0 fallas reales.** Pendiente: side-effecting POSTs (report/alerts/brief/monitor/sync), integraciones/mappings, dashboards, action-outcomes, balance, y Tier 2/3.
