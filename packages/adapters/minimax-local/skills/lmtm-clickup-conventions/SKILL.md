---
name: lmtm-clickup-conventions
displayName: ClickUp conventions
description: Cómo los agentes de LMTM-OS usan ClickUp como PM/CRM operativo. Estructura del workspace, naming, estados, prioridades, qué agentes pueden crear tareas.
required: false
---

# ClickUp — convenciones para LMTM-OS

ClickUp es el **PM/CRM operativo** de la agencia. Acá centralizamos:
- 1 Space por cliente
- 1 Folder por mes (para campañas activas, reports, etc.)
- 1 List por proyecto o workstream dentro del mes
- Tasks = unidad de trabajo concreta (con assignee, due date, status)

Los **14 agentes de LMTM-OS** no hablan directo con ClickUp — el bridge
es el package `@paperclipai/mcp-clickup` que se corre como subprocess
stdío desde Claude Desktop, Cursor, o cualquier MCP client. Esta skill
documenta las convenciones para que los agentes entiendan la
estructura cuando se las mencionan, o propongan cambios consistentes.

## Estructura del workspace

```
LMTM Workspace (id lo devuelve list_workspaces)
├── 📁 Operations                (Space — tareas internas de la agencia)
│   ├── 📁 2026-06                (Folder por mes)
│   │   ├── 📋 Onboarding nuevos clientes
│   │   ├── 📋 Reportes semanales
│   │   └── 📋 Cobranzas
│   └── 📁 Folderless lists
│       └── 📋 Backlog de priorities
│
├── 📁 Cliente A — Acme SA       (Space — 1 por cliente)
│   ├── 📁 2026-06
│   │   ├── 📋 Campaña Q2 lanzamiento
│   │   ├── 📋 Reporte mensual
│   │   └── 📋 Optimización landing
│   └── 📁 2026-07
│       └── ...
│
├── 📁 Cliente B — Globex SRL     (Space — 1 por cliente)
│   └── ...
│
└── 📁 Templates & assets         (Space con templates reutilizables)
    ├── 📋 Plantilla reporte mensual
    ├── 📋 Plantilla kickoff
    └── 📋 Plantilla post-mortem
```

## Naming

- **Spaces (clientes)**: `Cliente [Letter] — [Razón Social]` (ej. `Cliente A — Acme SA`)
  - El "Cliente X" se mapea con la planilla en la skill `lmtm-clients-planilla`
- **Folders (meses)**: `YYYY-MM` (ej. `2026-06`)
- **Lists (proyectos)**: nombre del proyecto / workstream en minúsculas (ej. `campaña q2 lanzamiento`, `reporte mensual`, `optimización landing`)
- **Tasks**: Title Case con verbo al inicio (ej. "Auditar campaign de Black Friday", "Mandar reporte mensual a Acme")

## Estados de tareas

Las lists tienen 4 estados standard:

| Estado | Color | Cuándo |
|--------|-------|--------|
| `to do` | gris | recién creada, no empezada |
| `in progress` | azul | assignee la está trabajando |
| `review` | amarillo | esperando approval del cliente o del PM |
| `done` | verde | terminada y aprobada |

Las **listas recurrentes** (ej. `Reporte mensual`) usan un template
que crea automáticamente las 4 tasks del mes.

## Prioridades

ClickUp usa valores numéricos:

- `1` = urgent (🔥)
- `2` = high (🟠)
- `3` = normal (default — no poner)
- `4` = low (gris)

**Regla LMTM**: solo poner prioridad si es 1 o 2. El default 3 es "lo
hacemos en orden de llegada".

## Assignees

- Las **tareas recurrentes** (reportes, ongoings) tienen 1 assignee fijo
  (Milo, Roxana, etc.)
- Las **tareas de proyecto** se asignan en la planning meeting del lunes
  según capacity
- Las **tareas bloqueadas** se mueven a `in progress` + assignee vacio + comment explicando el blocker

## Due dates

- Tareas recurrentes: día fijo del mes (ej. "reporte mensual" → día 5)
- Tareas de proyecto: deadline interno (1-2 días antes del deadline con cliente)
- Tareas urgentes: mismo día, con priority 1

## Tags

Tags standard a nivel de Space (no de List):

- `cliente:[slug]` (ej. `cliente:acme`)
- `mes:[YYYY-MM]` (ej. `mes:2026-06`)
- `tipo:reporte` / `tipo:campaign` / `tipo:optimizacion` / `tipo:admin` / `tipo:cliente-directo`
- `q1` / `q2` / `q3` / `q4`

Permiten filtrar rápido con `list_tasks({ assignees: [...], status: [...] })`
o con search (`search_tasks({ query: "tag:cliente:acme" })`).

## Qué puede hacer cada agente

Esto es **documentación para que el PM (Pablo) sepa qué delegar**.
Los agentes no crean tareas solos — un humano en el MCP client las crea
basado en la planificación. Pero los agentes **proponen** tareas via
comentarios o via issues en Paperclip que después se traducen a tasks.

| Agente | Puede crear en ClickUp | Notas |
|--------|------------------------|-------|
| Luna (CMO) | Operations/backlog | Estrategias de Q, OKRs trimestrales |
| Pablo (PM) | Cualquiera | El principal. Crea tasks de proyecto, asigna, prioriza |
| Milo (Paid Media) | Space del cliente, list de campaña | Optimizaciones, nuevos anuncios |
| Camila (Content) | Space del cliente, list de contenido | Posts, copies, briefs |
| Roxana (Reports) | Operations/reportes | Tasks de reportes semanales/mensuales |
| Ana (CRM Analyst) | Operations/cobranzas | Tickets de soporte, follow-up de clientes |
| Esteban (CRM Engineer) | Operations/tech | Tickets técnicos |
| Otros (Sergio, Delfina, Dario, Nicolas, Bianca, Carlos, Carla) | Casi nunca | Solo si Pablo lo delega explícitamente |

## Cómo lo conectás a los agentes

Los agentes **no llaman ClickUp directamente** — el bridge es el
package MCP. Para activarlo:

1. **Build el package** (en el repo): `pnpm --filter @paperclipai/mcp-clickup build`
2. **Generate un API token** en ClickUp → Settings → Apps → API Token
3. **Configurá el MCP client** (Claude Desktop, Cursor, etc.) con:
   ```json
   {
     "mcpServers": {
       "clickup": {
         "command": "npx",
         "args": ["lmtm-mcp-clickup"],
         "env": { "CLICKUP_API_TOKEN": "pk_..." }
       }
     }
   }
   ```
4. Cuando un humano (vos, Pablo, Luna) usa el MCP client, los tools
   aparecen automáticamente y puede ejecutar `list_spaces`, `list_tasks`,
   `create_task`, etc.

## Cuándo NO usar ClickUp

- **No** para notas rápidas → usar el inbox de Paperclip
- **No** para OKRs / strategic planning → usar goals en Paperclip
- **No** para reporting / dashboards → los dashboards de LMTM-OS son la fuente
- **No** para feedback de cliente → usar la sección de comments en el cliente (planilla)

## Frecuencia de revisión

- **Lunes AM (planning)**: Pablo revisa `list_tasks({ listId: planning, status: ["to do"] })`
- **Miércoles PM (mid-week check)**: status update de cada assignee
- **Viernes AM (review)**: lo que no se entregó se mueve a la semana siguiente con comment
