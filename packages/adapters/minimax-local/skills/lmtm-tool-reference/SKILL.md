---
name: lmtm-tool-reference
displayName: Referencia de herramientas
description: Qué tools existen en LMTM-OS, qué hace cada una, cuándo usarla.
required: false
---

# Referencia de herramientas

## Paperclip (built-in)

Operaciones de control plane (issues, projects, agents, etc):

- `paperclip.list_issues` — listar issues con filtros
- `paperclip.get_issue` — detalle de un issue
- `paperclip.create_issue` — crear issue (asignar a un agente o proyecto)
- `paperclip.update_issue` — cambiar status, priority, assignee
- `paperclip.add_comment` — comentar en un issue
- `paperclip.list_agents` — ver agentes activos y su estado
- `paperclip.get_agent` — detalle de un agente
- `paperclip.wakeup_agent` — despertar un agente con un mensaje
- `paperclip.list_companies` — listar companies
- `paperclip.get_company` — detalle de una company
- `paperclip.list_projects` — listar proyectos
- `paperclip.create_project` — crear proyecto

## lmtm_ads (custom plugin)

Datos de las plataformas de ads. Solo disponible después de que el plugin
`lmtm-ads-tools` esté instalado y configurado.

- `lmtm_ads.list_clients` — lista de clientes LMTM
- `lmtm_ads.list_connections` — conexiones OAuth configuradas (Meta, Google, etc)
- `lmtm_ads.list_ad_accounts` — cuentas de ads disponibles
- `lmtm_ads.list_campaigns` — campañas por cliente/plataforma
- `lmtm_ads.get_campaign` — detalle de una campaña
- `lmtm_ads.get_insights` — métricas de performance (spend, ROAS, CTR, etc)
- `lmtm_ads.list_creatives` — creativos por campaña
- `lmtm_ads.list_pages` — páginas de Facebook conectadas

**Parámetros típicos**:
- `client_slug` (e.g. `acme-corp`)
- `platform` (`meta` | `google` | `tiktok` | `linkedin`)
- `date_preset` (`last_7d` | `last_30d` | `this_month` | `last_month`)
- `date_range` (`{"since": "2026-01-01", "until": "2026-01-31"}`)

## lmtm_planilla (próximamente)

Datos de la planilla de clientes (no leer de archivos, leer de la DB):

- `lmtm_planilla.list_clients`
- `lmtm_planilla.get_client`
- `lmtm_planilla.list_active_clients`

## lmtm_crm (próximamente, vía plugin de Hostinger)

Datos del CRM propio de LMTM:

- `lmtm_crm.list_leads`
- `lmtm_crm.list_deals`
- `lmtm_crm.get_pipeline`

## Cuándo usar cada cosa

- **Necesito data de un cliente** → `lmtm_planilla.get_client` (no
  preguntar al humano).
- **Necesito métricas de ads** → `lmtm_ads.get_insights` (no asumir,
  leer de la plataforma).
- **Necesito asignar trabajo** → `paperclip.create_issue` con assignee.
- **Necesito escalar al humano** → `paperclip.create_comment` en el issue
  + wakeup_agent al PM.
- **Necesito un reporte** → usar las tools + formato de
  `lmtm-reporting-cadence`.

## Regla de oro

> **Si podés llamar a una tool para obtener el dato, no inventes ni
> asumas.** Las tools existen para tener data real.
