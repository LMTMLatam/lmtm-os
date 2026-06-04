---
name: lmtm-clickup-conventions
displayName: ClickUp conventions
description: Cómo los agentes de LMTM-OS usan ClickUp como PM/CRM operativo. Estructura actual del workspace, naming, estados, prioridades, qué agentes pueden crear tareas, y migración planeada a "1 Space per client".
required: false
---

# ClickUp — convenciones para LMTM-OS

ClickUp es el **PM/CRM operativo** de la agencia. La estructura real
del workspace LMTM (`team_id = 9013352440`, workspace name "LMTM")
diverge del spec ideal — esta skill documenta **ambas** y la ruta de
migración. Los 14 agentes de LMTM-OS hablan con ClickUp a través del
plugin `@paperclipai/lmtm-clickup` (11 tools, deployed en producción
como `lmtm-clickup:clickup-*`).

## Estado actual (junio 2026)

El workspace tiene 10 Spaces. El relevante para los clientes es
**`Clientes` (id `90131985551`)**, que contiene **67 folders** (uno por
cliente). Cada folder tiene ~9–11 lists, una por workstream/servicio:

```
LMTM Workspace (team_id 9013352440)
├── 📁 LMTM                            (space — admin interno)
├── 📁 Clientes                        (space — 67 clients)  ← ESTE
│   ├── 📁 CAMPO TIMBO                 (folder = 1 client)
│   │   ├── 📋 Servicios de crecimiento
│   │   ├── 📋 OnBoarding
│   │   ├── 📋 📲Redes Sociales
│   │   ├── 📋 📕 Branding
│   │   ├── 📋 Diseño Grafico
│   │   ├── 📋 📺Publicidad
│   │   ├── 📋 Plan de Marketing
│   │   ├── 📋 💻 Email Marketing
│   │   ├── 📋 Produccion de video
│   │   └── 📋 Super Redes Sociales
│   ├── 📁 DUNOD                       (folder = 1 client)
│   │   └── ... (9 lists, mismo patrón)
│   └── ... (65 folders más)
├── 📁 YATO HERRAMIENTAS               (space — agencia YATO)
├── 📁 Growth del dia                  (space — experimentación)
└── ... (otros 6 spaces de soporte)
```

## Estado ideal (target)

```
LMTM Workspace
├── 📁 Operations                      (1 space interno)
│   ├── 📁 2026-06                     (1 folder por mes)
│   │   ├── 📋 Onboarding nuevos clientes
│   │   ├── 📋 Reportes semanales
│   │   └── 📋 Cobranzas
│   └── ...
├── 📁 Cliente A — Acme SA             (1 space por cliente)
│   ├── 📁 2026-06                     (1 folder por mes)
│   │   ├── 📋 Campaña Q2 lanzamiento
│   │   ├── 📋 Reporte mensual
│   │   └── 📋 Optimización landing
│   └── ...
├── 📁 Cliente B — Globex SRL          (1 space por cliente)
│   └── ...
└── 📁 Templates & assets
    └── ...
```

**Decisión**: la estructura actual funciona y los 67 clients ya están
sembrados en Paperclip con `planillaSource="clickup"` y
`planillaExternalId=<folder_id>`. La migración al estado ideal es un
proyecto de Pablo (PM) para Q3 — no bloquea testing.

## Mapeo actual: ClickUp ↔ Paperclip

| ClickUp | Paperclip |
|---------|-----------|
| Folder id (en `Clientes` space) | `clients.planillaExternalId` |
| Folder name | `clients.name` |
| Slug derivado del nombre | `clients.slug` (e.g. `campo-timbo`) |
| "Clientes" space | (no mapeado a nivel Paperclip — la agencia es 1 sola company) |
| List id | (todavía no se mapea — Pablo lo decide) |
| Task id | (todavía no se mapea — el plan es via `issues` de Paperclip) |

El seed script `scripts/seed-clients-from-clickup.cjs` ya pobló los
67 clients en Paperclip. Re-correrlo es idempotente (los slugs ya
existentes se skipean).

## Naming

- **Folders (clients)**: nombre comercial tal cual lo carga el equipo
  humano (puede tener mayúsculas, espacios, números). El script de seed
  los slugifica (lowercase, sin acentos, guiones).
- **Lists (services)**: 9–11 listas fijas por cliente. NO agregar
  listas nuevas sin discutirlo con Pablo (romper el patrón rompe el
  script de seed).
- **Tasks**: Title Case con verbo al inicio (ej. "Auditar campaign de
  Black Friday", "Mandar reporte mensual a Acme")

## Estados de tasks

ClickUp standard:

| Estado | Cuándo |
|--------|--------|
| `to do` | recién creada, no empezada |
| `in progress` | assignee la está trabajando |
| `review` | esperando approval del cliente o del PM |
| `done` | terminada y aprobada |
| `closed` | cancelada / descartada |

**Regla LMTM**: si una task queda en `in progress` por más de 5 días
hábiles, Pablo la mueve a `review` y le pone comment explicando el
blocker.

## Prioridades

ClickUp usa valores numéricos:

- `1` = urgent (🔥)
- `2` = high
- `3` = normal (default — no poner)
- `4` = low

**Regla LMTM**: solo poner prioridad si es 1 o 2. Default 3 es "lo
hacemos en orden de llegada".

## Qué puede hacer cada agente

Los agentes **sí** pueden crear / actualizar tasks directo via el
plugin `lmtm-clickup:clickup-*` (no necesitan un humano en un MCP
client). La tabla siguiente documenta **qué puede** cada agente, no
qué **debe**:

| Agente | Scope recomendado | Tareas típicas |
|--------|-------------------|----------------|
| Pablo (PM) | Cualquier folder | Planning, asignaciones, re-priorización |
| Luna (CMO) | Folder de Operations | OKRs trimestrales, scope de nuevos clientes |
| Milo (Paid Media) | Folder del cliente, list `📺Publicidad` | Optimizaciones, nuevos anuncios |
| Camila (Content) | Folder del cliente, list `📲Redes Sociales` | Posts, copies, briefs |
| Bianca (Brand) | Folder del cliente, list `📕 Branding` | Revisión de assets, briefs de diseño |
| Roxana (Reports) | Folder del cliente, list `Plan de Marketing` | Tasks de reportes semanales/mensuales |
| Ana (CRM Analyst) | Folder de Operations, list `Cobranzas` | Follow-up de pagos, soporte |
| Esteban (CRM Engineer) | Folder de Operations, list `Tech` | Tickets técnicos, integraciones |
| Sergio, Delfina, Dario, Nicolas, Carla, Carlos | Casi nunca | Solo si Pablo lo delega explícitamente |

## Cómo lo conectás a los agentes

El bridge es el **plugin `@paperclipai/lmtm-clickup`** (desplegado en
producción). Los 11 tools son:

- `clickup-list-workspaces`
- `clickup-list-spaces`
- `clickup-list-folders`
- `clickup-list-folderless-lists`
- `clickup-list-lists`
- `clickup-list-tasks`
- `clickup-get-task`
- `clickup-search-tasks`
- `clickup-create-task`
- `clickup-update-task`
- `clickup-add-comment`

El plugin worker se inicializa con la env var `CLICKUP_API_TOKEN` (en
Render). La API token actual pertenece a Marcos Lewis (owner del
workspace LMTM).

## Frecuencia de revisión

- **Lunes AM (planning)**: Pablo revisa `list_tasks` con
  `assignees=["<agente-slug>"]` + `status=["to do"]` por cada agente.
- **Miércoles PM (mid-week check)**: Pablo pide status update a cada
  agente via `agent-chat`.
- **Viernes AM (review)**: Roxana corre el script de reporte semanal,
  Pablo mueve lo que no se entregó a la semana siguiente con comment.

## Cuándo NO usar ClickUp

- **No** para notas rápidas → usar el inbox de Paperclip
- **No** para OKRs / strategic planning → usar goals en Paperclip
- **No** para reporting / dashboards → los dashboards de LMTM-OS son la fuente
- **No** para feedback de cliente → usar la sección de comments en el cliente (planilla)
