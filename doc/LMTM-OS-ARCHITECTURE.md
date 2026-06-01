# LMTM-OS — Arquitectura v2

> **Estado:** en construcción, branch `feat/lmtm-v2-m3-agents`
> **Stack:** Render Starter + Supabase (Postgres) + Vercel (dominio `*.vercel.app`) + MiniMax M3
> **Migración:** big-bang, datos limpios

## TL;DR

LMTM-OS es una reescritura del fork de Paperclip para soportar una agencia
de marketing multi-plataforma (Meta + Google + TikTok + LinkedIn), con un
equipo de **14 agentes de IA proactivos** corriendo con **MiniMax M3** y
un **dashboard por cliente** que se genera solo a partir de una planilla.

## Decisiones clave

| Decisión | Por qué | Consecuencia |
|---|---|---|
| Multi-plataforma desde día 1 | La agencia maneja 4 plataformas, no solo Meta | `AdsProvider` interface, 4 implementaciones (Meta completa, otras 3 stub) |
| Tabla `clients` nueva, separada de `companies` | `companies` es el tenant boundary de Paperclip; `clients` es un concepto de agencia | FK `client_id` en `ads_*` y `ads_account_mappings` |
| Migración big-bang | El usuario confirmó que se puede empezar limpio | Las 94 migraciones de Paperclip + 4 nuevas (0094-0097) |
| MiniMax M3 para todos los agentes | M3 rinde bien, es barato, y ya hay API key | Adapter `minimax_cloud` ya soporta M3 (default), falta construir `minimax_local` de primera clase con session/skills/JWT |
| Path-based URLs (`/c/<slug>`) | Sin comprar dominio custom arranca 100% gratis | Migración a subdominios reales es trivial cuando se compre el dominio |
| Rebranding del UI de Paperclip a LMTM | Un solo producto, no mantener `lmtm-panel` separado | Cambios en `ui/`, `ui-branding.ts`, branding a negro/blanco |
| Path-based access para clientes | Magic links firmados, sin password | `client_dashboard_links` con `token_hash` + `expires_at` |

## Estructura nueva del código

```
server/src/
  services/ads/
    types.ts                   ← interfaz AdsProvider (contrato platform-agnostic)
    registry.ts                ← dispatch platform → provider
    aggregator.ts              ← sync orchestrator (idempotente, loguea en sync_logs)
    providers/
      meta.ts                  ← COMPLETO: Graph API v21.0, normalizado
      google.ts                ← STUB: instrucciones para completar
      tiktok.ts                ← STUB: instrucciones para completar
      linkedin.ts              ← STUB: instrucciones para completar
  routes/
    ads.ts                     ← NUEVO: /api/ads/*, /api/clients/*
    meta.ts                    ← LEGACY: alias-compat (sigue funcionando)
    meta-sync.ts               ← LEGACY: alias-compat (sigue funcionando)

packages/db/src/
  schema/
    clients.ts                 ← NUEVO
    ads_connections.ts         ← RENOMBRADO (de meta_connections.ts)
    ads_account_mappings.ts    ← RENOMBRADO
    ads_data.ts                ← RENOMBRADO (campaigns/adsets/creatives/insights/posts/alerts)
    planilla.ts                ← NUEVO: planilla_sync_state + client_dashboard_links
  migrations/
    0094_ads_rename.sql        ← renombra meta_* → ads_*, agrega platform column
    0095_clients_table.sql     ← nueva tabla clients + FKs
    0096_planilla_and_dashboard_links.sql ← nuevas tablas
    0097_lmtm_seed.sql         ← seed: company LMTM + 14 agents + goals
```

## El equipo de 14 agentes

| # | Nombre | Rol | Heartbeat | Budget mensual (cents) |
|---|---|---|---|---|
| 1 | Luna | CMO | 6h | 50,000 |
| 2 | Milo | Paid Media Manager | 2h | 80,000 |
| 3 | Camila | Content Strategist | on-demand | 40,000 |
| 4 | Sergio | SEO Specialist | 24h | 30,000 |
| 5 | Delfina | Data Analyst | 2h | 60,000 |
| 6 | Dario | Dashboard Builder | on-demand | 20,000 |
| 7 | Nicolas | n8n Orchestrator | on-demand | 20,000 |
| 8 | Ana | CRM Analyst | 30min | 30,000 |
| 9 | Esteban | CRM Engineer | on-demand | 20,000 |
| 10 | Carla | Conversion Specialist | on-demand | 25,000 |
| 11 | Bianca | Brand Guardian | on-demand | 15,000 |
| 12 | Carlos | Competitor Intel | 6h | 20,000 |
| 13 | Roxana | Reporting | 24h | 15,000 |
| 14 | Pablo | PM/Coordinator | 4h | 25,000 |

Todos corren con `adapterType: minimax_cloud` y `model: MiniMax-M3` (default).

**Org chart:** todos reportan a Pablo (PM), Pablo reporta a Luna (CMO).

## Roadmap de implementación

| Fase | Status | Entregable |
|---|---|---|
| 0 — Decisiones | ✅ | Stack confirmado, colores confirmados (negro/blanco LMTM) |
| 1 — Repo + migraciones + AdsProvider | 🚧 | Branch creada, 4 migraciones nuevas, Meta provider completo, Google/TikTok/LinkedIn stubs, schema actualizado |
| 2 — Adapter M3 de primera clase | ⏳ | `packages/adapters/minimax-local/` con sessionCodec, syncSkills, JWT (el actual `minimax_cloud` es one-shot) |
| 3 — Equipo de 14 agentes | ⏳ | Seed SQL listo (0097), falta ejecutar contra Supabase |
| 4 — Plugins n8n + CRM | ⏳ | Pendiente |
| 5 — Dashboards por cliente | ⏳ | Frontend multi-tenant en Vercel, magic links en `client_dashboard_links` |
| 6 — Multi-plataforma completo | ⏳ | Implementar los 3 stubs de provider |
| 7 — Hardening | ⏳ | Tests, docs, runbooks |

## Lo que falta para que arranque

1. **Vos:** pagar Render Starter ($7/mes) → bloqueante para deploy
2. **Vos:** correr `opencode mcp auth supabase` en tu terminal → bloqueante para aplicar las 97 migraciones
3. **Vos:** darme el `BETTER_AUTH_SECRET` para el ambiente de Render (no-secreto: el resto se setea en el dashboard de Render)
4. **Yo apenas se destrabe:** aplicar las 97 migraciones a Supabase, refactorizar las rutas para que `meta.ts` use el nuevo `ads.*` internamente, mergear `meta-sync.ts` → `services/ads/aggregator.ts`

## Convenciones que seguimos

- **Toda la lógica de Meta se queda dentro de `services/ads/providers/meta.ts`.** El resto del código no importa `meta_*` ni `graph.facebook.com`.
- **Las migraciones son idempotentes** (`IF NOT EXISTS` + `DO $$ ... $$`) para que se puedan re-aplicar sin romper.
- **Los Drizzle schemas son la fuente de verdad.** El SQL de migración es secundario; si agregás una columna, hacelo en el schema file primero.
- **Los nombres en español** para copy, skills, tools, endpoints visibles al usuario. Los nombres técnicos (tablas, columnas, tipos) en inglés.
- **El branding LMTM es negro y blanco** (confirmado por el usuario). El UI de Paperclip se rebrandea con paleta `#000000` / `#FFFFFF`, tipografía sans-serif bold para headlines.

## Contactos y accesos (a documentar en env)

| Servicio | Variable | Dónde setear |
|---|---|---|
| Render | `DATABASE_URL` | Render dashboard, sync: false |
| Render | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Render dashboard, sync: false |
| Render | `MINIMAX_API_KEY` | Render dashboard, sync: false |
| Render | `BETTER_AUTH_SECRET` | Render dashboard, sync: false |
| Render | `PAPERCLIP_AGENT_JWT_SECRET` | Render dashboard, sync: false |
| Vercel | `NEXT_PUBLIC_API_URL` (Vercel solo cuando montemos el frontend de los dashboards) | Vercel dashboard |
| Google Ads | `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` | Render dashboard, sync: false (cuando implementemos) |
| TikTok | `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET` | Render dashboard, sync: false (cuando implementemos) |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Render dashboard, sync: false (cuando implementemos) |
| n8n | `N8N_API_URL`, `N8N_API_KEY` | Render dashboard, sync: false (cuando implementemos) |
| CRM LMTM | `LMTM_CRM_API_URL`, `LMTM_CRM_API_KEY` | Render dashboard, sync: false (cuando implementemos) |
