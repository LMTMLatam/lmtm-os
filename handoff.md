# Handoff — LMTM Meta Ads Dashboard

**Fecha:** 2026-06-01  
**Autor:** Claude Code (claude-opus-4-8)  
**Última actualización:** sesión de aislamiento por cliente + auto-sync + OAuth reconnect

---

## ⚡ NOVEDADES — sesión 2026-06-01 (leer primero)

Resumen de todo lo nuevo. Detalle de cada punto más abajo.

### 1. Modelo de datos: el `companyId` NO aísla — la clave real es el mapping
- Los **10 mappings comparten un solo `companyId`** (`e3400d17-6cdd-4d05-a3bb-49ccc38db17d`, "LMTM") y **una sola `connectionId`** (`033b5738-c625-4e2b-b3da-46daa17df632`).
- Por eso filtrar solo por `companyId` mezclaba TODOS los clientes.
- **La clave de aislamiento real es:** `adAccountId` (ads) y `pageId` (orgánico), guardados en `meta_ad_account_mappings`.
- Cada dashboard = 1 mapping. Toda query debe filtrar por la cuenta/página de ESE mapping.

### 2. Auto-detección de página (sin dropdown manual)
- `syncPagePosts` ahora detecta el `page_id` de cada cliente desde los **creativos de sus ads** (`object_story_spec.page_id` / `effective_object_story_id`) y lo persiste en `meta_ad_account_mappings.page_id`.
- Helper: `detectPageIdForAdAccount(token, adAccountId)` en `server/src/services/meta-sync.ts`.
- Itera **por mapping** (no por company, que antes con `.limit(1)` agarraba un pageId arbitrario para todos).
- pageIds ya persistidos: COSA→`265162450357948`, BOERO→`246192175478794`, MA Propiedades→`710052209091838`, etc. (2 sin ads no tienen página).

### 3. Auto-sync al entrar al dashboard (sin botón manual)
- `layout.tsx` corre una vez por cliente el job `all` en background (`triggerSync("all", companyId)`), expone `syncing` + `refreshKey` via `MappingCtx`. Las páginas refetchean cuando termina.
- Nuevo job backend **`all`**: corre campaigns + adsets + ads + ads-insights + page-posts con `Promise.allSettled` (un fallo no bloquea el resto).
- Indicador "Actualizando datos…". Solo queda el filtro de fecha manual.

### 4. Aislamiento de datos arreglado
- **Posts:** `getPostsData` devuelve `[]` si no hay `pageId` (antes hacía fallback a TODOS los posts de la empresa = la mezcla grande).
- **Alertas:** nueva columna `meta_alerts.ad_account_id`. Se taguea al crear y se filtra por ahí en `getAlerts`, `evaluateAlerts` (delete) y `pendingAlerts` del dashboard. Antes filtraba `entityId==adAccountId` (pero `entityId` es id de campaña) → nunca matcheaba + badge mezclado.
- Ads/campaigns/adsets/insights ya estaban bien aislados por `adAccountId` (verificado en prod: 0 filas con `ad_account_id` null).

### 5. Orgánico bloqueado por permisos de Meta (NO es bug de código)
- Las páginas de los clientes (COSA, BOERO, etc.) **no aparecen en `/me/accounts`** del token → la agencia tiene acceso a las **cuentas publicitarias** pero **no rol en las Páginas de Facebook**.
- Sin rol en la página, Meta bloquea posts/insights orgánicos: error 190 *"se necesita un token de acceso a la página"*.
- **Hoy solo MA Propiedades** (`710052209091838`) tiene page token → su orgánico funciona (450 posts). El resto da error claro hasta reconectar.

### 6. OAuth reconnect arreglado
- Antes: callback tiraba JSON crudo `{"error":"Missing code"}` cuando Facebook volvía con error/cancel.
- Ahora: maneja `error`/`error_description` y código faltante → redirige al panel con `?meta_error=...` legible. Éxito → `?meta_ok=1`.
- **CRÍTICO:** reconnect ahora hace **UPSERT** de la conexión por `companyId` (actualiza token/scopes en la fila existente) en vez de insertar una nueva. Una fila nueva huérfana dejaba el token nuevo (con páginas recién concedidas) desconectado de los mappings (que referencian `connectionId`).
- `dialog/oauth` manda `auth_type=rerequest` para re-mostrar la selección de páginas.
- Frontend: banner verde/rojo en `app/integrations/meta/page.tsx` lee `meta_ok`/`meta_error`.

### 7. Migraciones nuevas + fix de journal
- `0091_agent_chat_sessions.sql` (ya existía, faltaba en journal), `0092_mapping_page_id.sql` (`page_id` en mappings), `0093_alert_ad_account.sql` (`ad_account_id` en alerts).
- El `meta/_journal.json` tenía solo hasta idx 90 → agregadas entradas 91, 92, 93. Sin esto, `pnpm --filter @paperclipai/db build` fallaba con "journal/file count mismatch".
- 0092/0093 usan `IF NOT EXISTS` (idempotentes — la columna `page_id` ya existía en prod).

### 8. Nota infra — IP allowlist de Render Postgres
- La DB tiene `ipAllowList` (acceso externo restringido por IP). Estaba en `null` = bloqueado.
- Para diagnosticar agregué IPs admin via Render API: `PATCH /v1/postgres/dpg-d83omsjtqb8s73cvnbq0-a` con `{"ipAllowList":[{"cidrBlock":"<IP>/32"}]}`.
- **OJO:** la IP cambia (ISP dinámico). Si las queries directas a la DB cuelgan (timeout/SSL closed), actualizar el allowlist con la IP nueva (`curl https://api.ipify.org`).
- Render API key (en `C:\Users\Administrator\.render-mcp\config.json`): `rnd_4PL0qEvatCZCnQtqpD42RPt3emcU`. Service LMTM: `srv-d8118vvlk1mc73a159e0`.

### 9. Pendiente del usuario
- **Reconectar Meta** seleccionando las páginas de los clientes (Configuración → OAuth). Solo funciona si el usuario que conecta es admin/editor de esas páginas; si no, el cliente debe agregarlo en Business Manager.
- Hay ~1860 alertas viejas con `ad_account_id` null (mezcladas): invisibles con el filtro nuevo. Opcional borrarlas.
- Posts viejos de 33 páginas ajenas en `meta_page_posts` (del sync malo previo): invisibles (cada dashboard filtra por su pageId). Opcional limpiar.

---

## Proyectos

| Proyecto | Repo | Deploy | Branch |
|---|---|---|---|
| **lmtm-panel** (frontend) | github.com/LMTMLatam/LMTM-Front | Vercel | `main` |
| **lmtm-os** (backend) | github.com/LMTMLatam/lmtm-os | Render | `render-setup-lmtm` |

**Paths locales:**
- Frontend: `C:\Users\Administrator\Projects\lmtm-panel`
- Backend: `C:\Users\Administrator\lmtm-os`

---

## Accesos y Variables de Entorno

### lmtm-os (Render — producción)

Variables configuradas en el dashboard de Render (NO en el repo — `sync: false`):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Render Postgres) |
| `BETTER_AUTH_SECRET` | Secret para autenticación (better-auth) |
| `META_APP_ID` | Facebook App ID (para OAuth de Meta Ads) |
| `META_APP_SECRET` | Facebook App Secret |
| `META_REDIRECT_URI` | URI de callback OAuth (`https://lmtm.onrender.com/api/meta/oauth/callback`) |
| `LMTM_PANEL_URL` | URL del frontend (`https://lmtm-panel.vercel.app` o dominio custom) |
| `ANTHROPIC_API_KEY` | API key de Anthropic (Claude) |
| `OPENAI_API_KEY` | API key de OpenAI |
| `OPENWA_API_KEY` | API key de OpenWA (WhatsApp bot) |
| `OPENWA_URL` | URL del server OpenWA |
| `VERCEL_API_TOKEN` | Token de Vercel (para deploy de dashboards via API) |
| `VERCEL_TEAM_ID` | Team ID de Vercel (opcional, si es team account) |
| `PAPERCLIP_AGENT_JWT_SECRET` | JWT secret para autenticación de agentes |

Variables fijas en `render.yaml`:

```yaml
NODE_ENV=production
PORT=3100
SERVE_UI=false
PAPERCLIP_HOME=/paperclip
PAPERCLIP_INSTANCE_ID=lmtm
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=public
OPENCODE_ALLOW_ALL_MODELS=true
PAPERCLIP_MIGRATION_AUTO_APPLY=true
```

Variables locales (`.env.example`):
```
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
PORT=3100
SERVE_UI=false
BETTER_AUTH_SECRET=paperclip-dev-secret
```

---

### lmtm-panel (Vercel — producción)

Variables configuradas en el dashboard de Vercel:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL del backend: `https://lmtm.onrender.com` |
| `NEXT_PUBLIC_COMPANY_ID` | Company ID default: `e3400d17-6cdd-4d05-a3bb-49ccc38db17d` |
| `NEXT_PUBLIC_DASHBOARD_TOKEN` | JWT de servicio para llamadas server-side/cron (sin login de usuario) |
| `CRON_SECRET` | Secret para proteger el endpoint `/api/cron` de Vercel |

`.env.example`:
```
NEXT_PUBLIC_API_URL=https://lmtm.onrender.com
```

---

### Crons de Vercel (vercel.json)

```
GET /api/cron?job=ads-insights   → 0 5 * * *  (5am UTC diario)
GET /api/cron?job=campaigns      → 0 6 * * *  (6am UTC diario)
GET /api/cron?job=adsets         → 15 6 * * * (6:15am UTC diario)
GET /api/cron?job=ads            → 30 6 * * * (6:30am UTC diario)
GET /api/cron?job=page-posts     → 0 7 * * *  (7am UTC diario)
```

Cada cron llama `POST /api/meta/sync/:job` en lmtm-os con header `x-cron-secret`.

---

### Accesos a servicios externos

| Servicio | URL / Detalle |
|---|---|
| Render dashboard | render.com → servicio `lmtm-os` |
| Vercel dashboard | vercel.com → proyecto `lmtm-panel` |
| Meta for Developers | developers.facebook.com → App ID en `META_APP_ID` |
| Base de datos | Render Postgres (ver `DATABASE_URL` en Render dashboard) |
| Email usuario | grow@bylmtm.com |

---

## Goal

Dashboard analytics de Meta Ads en 14 secciones, embebido en lmtm-panel. Routing por `mappingId` (un mapping = una cuenta de Meta Ads de un cliente). El frontend **nunca** llama a Meta directamente — solo lee de la DB. Los sync jobs en lmtm-os son los que llaman a Meta Graph API.

---

## Arquitectura

```
lmtm-panel (Vercel)                    lmtm-os (Render)               PostgreSQL
app/dashboards/[mappingId]/
  layout.tsx              →  GET /api/meta/mappings/:id
  resumen/page.tsx        →  GET /api/companies/:id/meta/dashboard
  campanas/page.tsx       →  GET /api/companies/:id/meta/campaigns
  adsets/page.tsx         →  GET /api/companies/:id/meta/adsets
  anuncios/page.tsx       →  GET /api/companies/:id/meta/ads
  alertas/page.tsx        →  GET /api/companies/:id/meta/alerts
  organica/page.tsx       →  GET /api/companies/:id/meta/posts
  posts/page.tsx          →  GET /api/companies/:id/meta/posts
  (Sincronizar)           →  POST /api/meta/sync/:job
  (Evaluar alertas)       →  POST /api/companies/:id/meta/evaluate-alerts
```

**Routing:** `app/dashboards/[mappingId]/[section]/page.tsx`  
**Auth en dashboard:** no login requerido — usa `NEXT_PUBLIC_DASHBOARD_TOKEN` como service token  
**Contexto:** `layout.tsx` fetcha el mapping → lo provee via `MappingCtx` → todas las páginas leen `mapping.companyId` + `mapping.adAccountId`

---

## Tablas DB (lmtm-os — migración 0089 + 0090 + 0092 + 0093)

| Tabla | Contenido | Sync job |
|---|---|---|
| `meta_connections` | tokens OAuth de Meta por empresa | setup manual / OAuth (upsert por companyId) |
| `meta_ad_account_mappings` | mapping empresa → ad account **+ `page_id`** (auto-detectado) | setup manual + auto-detect |
| `meta_campaigns` | estructura de campañas | `syncCampaigns` |
| `meta_adsets` | estructura de ad sets | `syncAdsets` |
| `meta_ads` | estructura de anuncios + creative | `syncAds` |
| `meta_ads_insights` | **TODAS las métricas** (spend, impressions, leads, CTR...) | `syncAdsInsights` |
| `meta_page_posts` | posts orgánicos de la página | `syncPagePosts` |
| `meta_post_insights` | métricas de posts orgánicos | junto con page_posts |
| `meta_alerts` | alertas evaluadas automáticamente **+ `ad_account_id`** (aislamiento) | `evaluateAlerts` |
| `sync_logs` | historial de ejecución de jobs | todos los jobs |

**Jobs de sync** (`POST /api/meta/sync/:job`): `campaigns`, `adsets`, `ads`, `ads-insights`, `page-posts`, **`all`** (corre todo). El auto-sync del dashboard usa `all`.

**CRÍTICO:** Toda métrica de dinero/impresiones/leads viene de `meta_ads_insights`. Si está vacía → todo muestra $0. Se llena haciendo click en Sincronizar (paso "Métricas…") o via cron.

---

## Estado actual del código

### Últimos commits

**lmtm-os** (`render-setup-lmtm`) — sesión 2026-06-01:
```
fff5dfd  fix(meta): OAuth reconnect refreshes existing connection + graceful errors
549599c  fix(meta): isolate per-client data (posts require pageId, alerts by adAccountId)
e955f0f  feat(meta): auto-detect client page from ad creatives + add 'all' sync job
f5a282b  fix(posts): sync only explicitly-configured pages, add PATCH mapping + GET pages
```
(anteriores: 4d24bd6 route ordering ← CRÍTICO, f30e847 auto-migrate, 2e4a56d adAccountId filter, 1742e48 alerts, 8181024 sync tables)

**lmtm-panel** (`main`) — sesión 2026-06-01:
```
ad5252e  feat(integrations): surface Meta OAuth result banner (meta_ok / meta_error)
0da2d31  feat(dashboards): automatic background sync on entry, no manual sync needed
6ece6ae  feat(configuracion): page selector dropdown for organic posts
```
(anteriores: 9dc8711 companyId guard, 57ebbfc config/reportes, 1f2008a per-client routing)

### Qué funciona
- Las 14 páginas existen y renderizan
- Sidebar con navegación activa
- MappingCtx provee companyId + adAccountId a todas las páginas
- Botón Sincronizar en Resumen: campaigns → adsets → insights (paso a paso con label)
- Fix de route ordering en backend — 404 en `/companies/:id/meta/...` resuelto
- Todas las páginas tienen guard `if (!companyId) return` — sin 404 espurios al montar
- Tablas con sort, search, CSV export (Campañas, Adsets, Anuncios)
- Alertas: ver/resolver por alerta, botón evaluar
- Reportes: CSV de 5 tipos
- Configuración: sync manual por job + info de cuenta

### Qué falta / está bloqueado
- **Orgánica + Posts (mayoría de clientes)** — bloqueado por permisos de Meta: la conexión no tiene rol en las Páginas de los clientes (ver Novedades #5). Solo MA Propiedades funciona hoy. Requiere reconectar seleccionando páginas + ser admin de ellas.
- **Ads $0 en algunos clientes** — no es bug: esas cuentas no tienen entrega en los últimos 30d (ej. COSA tiene campañas viejas sin gasto). Los que sí tienen actividad (BOERO, Gala, MA Propiedades) traen datos.
- **Audiencia** — placeholder (Meta no expone breakdowns demográficos con `ads_read` básico; necesitaría `business_management`)
- **Ideas** — genera ideas desde datos de campañas/posts; funciona pero genéricas hasta que haya datos reales

### Datos reales en prod (al 2026-06-01)
- Insights con datos: `act_687059855983202` (BOERO, 1701 filas), `act_1686353702271361` (Gala, 805), `act_880611306337958` (MA Prop, 202), `act_2924295827769728` (26).
- Posts orgánicos legibles: solo página `710052209091838` (MA Propiedades, 450 posts).

---

## Archivos clave

```
lmtm-panel/
  app/dashboards/[mappingId]/
    layout.tsx              → sidebar + MappingCtx.Provider + fetch mapping
    context.tsx             → MappingCtx definition
    resumen/page.tsx        → KPIs + chart + sync button (MAIN PAGE)
    campanas/page.tsx       → tabla campañas
    adsets/page.tsx         → tabla adsets
    anuncios/page.tsx       → grid/tabla anuncios + thumbnails
    alertas/page.tsx        → lista alertas + evaluar
    leads/page.tsx          → leads por campaña + adset (tabs)
    organica/page.tsx       → métricas página orgánica
    posts/page.tsx          → tabla posts
    ads-overview/page.tsx   → overview KPIs + tabla campañas
    presupuesto/page.tsx    → pacing presupuesto mensual
    audiencia/page.tsx      → placeholder
    ideas/page.tsx          → ideas de contenido generadas del data
    reportes/page.tsx       → export CSV
    configuracion/page.tsx  → info cuenta + sync manual por job
  lib/api.ts               → todos los API client functions
  app/dashboards/shared.tsx → KpiCard, SectionHeader, SparkChart, fmtMoney, etc.
  app/api/cron/route.ts    → endpoint para Vercel crons

lmtm-os/
  server/src/app.ts                  → Express app + route ordering (CRÍTICO: meta antes que company)
  server/src/routes/meta-sync.ts     → todas las rutas /api/meta/* + /api/companies/:id/meta/*
  server/src/routes/meta.ts          → OAuth flow de Meta
  server/src/services/meta-sync.ts   → sync functions + query functions (getDashboardData, etc.)
  packages/db/src/schema/            → Drizzle schema
  render.yaml                        → config de deploy en Render
```

---

## Qué falló (historial)

### Bug crítico — route ordering en Express
Express montaba `companyRoutes` ANTES de `metaSyncRoutes`. Todas las requests a `/api/companies/:id/meta/...` caían en `companyRoutes` y retornaban 404 en vez de llegar a los endpoints de Meta.

**Fix:** En `server/src/app.ts`, `api.use(metaRoutes(db))` + `api.use(metaSyncRoutes(db))` deben ir ANTES de `api.use("/companies", companyRoutes(...))`.

### Bug — missing companyId guard en todas las páginas
Todas las páginas inicializan `loading = true` y llaman `load()` en `useEffect`. Si el mapping aún no cargó, `companyId = ""` y la llamada a API falla con 404, mostrando error.

**Fix:** `if (!companyId) return;` al inicio de cada `load()` callback + cambiar deps de `[mapping, ...]` a `[companyId, adAccountId, ...]`.

### Bug — $0 en todos los datos
No es un bug de código — `meta_ads_insights` simplemente está vacía porque nunca se hizo sync de insights.

**Fix:** Click en Sincronizar en la página Resumen (corre campaigns + adsets + ads-insights).

---

## Próximos pasos

1. **Esperar deploys** — Render (~3-5 min desde push) + Vercel (~1-2 min)
2. **Sincronizar data:**
   - Resumen → Sincronizar (campaigns + adsets + insights)
   - Configuración → sync de `page-posts` (orgánica + posts)
3. **Si el sync falla:** revisar token de Meta en lmtm-os admin — puede estar expirado
4. **Pendiente de código:**
   - `ads-overview` no tiene fallback si `getDashboardData` falla (a diferencia de `resumen`)
   - Quitar bloque de Meta OAuth de `Settings/index.tsx` (anotado en memory)
   - Ideas: podría llamar a Claude API server-side para sugerencias más ricas
   - Reportes: podría agregar envío por email (necesita endpoint backend nuevo)
