---
name: lmtm-tool-reference
displayName: Referencia de herramientas
description: Las tools MCP REALES de LMTM-OS, qué hace cada una y de dónde salen los datos del cliente.
required: false
---

# Referencia de herramientas (MCP — lo que REALMENTE existe)

Trabajás como Claude Code con dos MCPs: `paperclip` (plataforma + datos de clientes)
y `make` (automatización Make.com — scenarios, hooks, connections, data stores).
No hay endpoints `/api/lmtm/*`, no hay CRM externo (Kommo y similares).
No adivines paths ni esperes tools que no están acá.

## Control plane (Paperclip)

- `paperclipGetIssue` — detalle de un issue (issueId = env PAPERCLIP_TASK_ID).
- `paperclipGetHeartbeatContext` — contexto del run / heartbeat.
- `paperclipListIssues` — listar issues (filtros, búsqueda).
- `paperclipListComments` / `paperclipAddComment` — leer / comentar un issue.
- `paperclipUpdateIssue` — cambiar status (`done` / `in_progress` / `blocked`), priority, assignee.
- `paperclipCheckoutIssue` — tomar un issue.
- `paperclipApiRequest` — fallback genérico a la API de Paperclip (NO inventes rutas LMTM con esto).

## Datos del cliente (las ÚNICAS fuentes válidas)

Los datos de un cliente salen SOLO de Meta, del brain y del Enfoque Técnico:

- `lmtmListClients` — clientes activos (id, nombre, slug). Encontrá el clientId por nombre acá.
- `lmtmGetClientBrain` — **memoria viva del cliente + Enfoque Técnico**. Leelo SIEMPRE primero.
- `lmtmGetClientAdsPerformance` — métricas REALES de Meta (spend, impresiones, clicks, leads, reach, CTR, CPL, CPC) en una ventana de días.
- `lmtmGetClientBalance` — **saldo/presupuesto REAL de la cuenta de Meta**: spend_cap, amount_spent y `remaining` (lo que queda antes del tope). ESTO es el "presupuesto" y el "límite de crédito" del cliente — no existe en ningún otro lado. Si detectás saldo bajo, usá `lmtmSendBalanceAlert` (NO issues).
- `lmtmGetClientOrganicPosts` — publicaciones orgánicas reales (IG + FB) en las últimas N horas.
- `lmtmGetClientScheduledContent` — contenido programado en la lista de Redes de ClickUp (qué se planeó publicar y cuándo).
- `lmtmGetClientCompetitors` — competidores cargados.
- `lmtmGetClientScores` — score de salud de cuenta y operativo.
- `lmtmRememberAboutClient` — guardar un aprendizaje DURABLE en la memoria del cliente.
- `lmtmSendBalanceAlert` — **envía alerta de saldo bajo por WhatsApp al equipo**. Usala SIEMPRE que detectes saldo bajo / spend_cap agotado / pauta frenada. NUNCA crees issues para alertas de saldo.
- `lmtmSendWhatsappReport` — **envía un reporte/mensaje genérico por WhatsApp al equipo** (message + title opcional). Usala cuando el equipo te pide reportar/avisar algo por WhatsApp. Sí podés mandar WhatsApp.
- `lmtmCreateClientTask` — crear una tarea para un cliente (internas se crean activas; externas quedan para aprobar). **NO la uses para alertas de saldo** — esas van por WhatsApp con `lmtmSendBalanceAlert`.

## Reglas de oro

1. **Fuentes de datos del cliente = solo Meta (tools lmtm*) + brain + Enfoque Técnico.** Nada más. No hay planilla ni CRM externo. No los busques ni los uses como excusa para bloquear.
2. **Presupuesto / saldo / límite de crédito = `lmtmGetClientBalance`** (spend_cap, amount_spent, remaining). No busques un "presupuesto cargado en ARS" en otro lado.
3. **Alertas de saldo → WhatsApp, NUNCA issues.** Si detectás saldo bajo / spend_cap agotado / pauta frenada, usá `lmtmSendBalanceAlert` para avisar al equipo por WhatsApp. NO crees tareas/issues para esto.
4. **Nunca bloquees por data faltante.** Si una tool devuelve 0/vacío o el cliente no está mapeado, anotá el gap y resolvé con el brain + Enfoque Técnico. Entregá la mejor respuesta posible y cerrá en `done`. `blocked` es solo para algo genuinamente imposible.
5. **No generalices desde un cliente.** Un 0 es de ESE cliente (no mapeado / sin pauta), no del pipeline.
6. **Si podés llamar a una tool, no inventes ni asumas.** Pero si una tool no existe, NO la esperes: usá las que sí están.
7. **Siempre buscá la resolución con las herramientas que tenés, incluido el browser.** Tenés `WebFetch`, `WebSearch` y `Bash` (curl) habilitados. Si una tool/API no te da el dato, buscalo por otra vía antes de marcar "sin verificar"/blocked.

## Fallback de verificación de posteos (planeado vs publicado)

Si `lmtmGetClientOrganicPosts` viene vacío o el cliente no tiene la página de Meta conectada por API, **NO concluyas "no se puede verificar"**. En vez de eso:
1. Conseguí el handle/URL de IG/FB del cliente desde `lmtmGetClientBrain` (o buscalo con `WebSearch` por el nombre del cliente).
2. Abrí el perfil público con `WebFetch` (o `curl` vía `Bash`).
3. Compará los posteos reales que ves contra `lmtmGetClientScheduledContent` (lo planeado en ClickUp) y reportá qué salió vs qué faltó.

Solo marcá blocked/sin-verificar si REALMENTE agotaste API + brain + browser. Documentá qué vías probaste.

## Aprendizaje automático (la memoria del cliente crece sola)

El sistema aprende de TODO lo que hacen los agentes:
1. **Antes** de trabajar un cliente, leé `lmtmGetClientBrain` para no repetir y construir sobre lo aprendido.
2. **Al terminar**, guardá lo DURADERO y VERIFICADO con `lmtmRememberAboutClient`: qué funcionó/no, decisiones, preferencias, hallazgos confirmados, patrones.
3. Además, cuando marcás un issue de cliente como `done`, el sistema **auto-registra** un evento en la memoria del cliente (queda el rastro de lo resuelto).

**No envenenes la memoria**: nunca guardes gaps transitorios ("hoy dio 0"), suposiciones ni conclusiones sin verificar. Solo hechos comprobados y aprendizajes reutilizables.

(El motor de learnings agrega además patrones por nicho —`learnings`— y el brain se refresca solo cada 12h con identidad + Enfoque Técnico + performance.)

## Make.com (MCP `make`) — automatización del pipeline

Los agentes tienen acceso directo a Make.com vía MCP. Estas tools permiten operar
scenarios, hooks, connections y data stores de la org LMTM (team 228071):

### Scenarios (flujos de automatización)
- `scenarios_list` — listar todos los scenarios del team.
- `scenarios_get` — detalle de un scenario (blueprint, scheduling, status).
- `scenarios_create` / `scenarios_update` / `scenarios_delete` — CRUD de scenarios.
- `scenarios_activate` / `scenarios_deactivate` — prender/apagar un scenario.
- `scenarios_run` — ejecutar un scenario manualmente.

### Ejecuciones
- `executions_list` — listar ejecuciones de un scenario.
- `executions_get` / `executions_get-detail` — detalle de una ejecución.

### Hooks (webhooks)
- `hooks_list` / `hooks_get` — listar/ver webhooks.
- `hooks_create` / `hooks_update` / `hooks_delete` — CRUD de hooks.

### Connections
- `connections_list` / `connections_get` — ver conexiones (Google, ClickUp, Meta, etc.).

### Data Stores
- `data-stores_list` / `data-stores_get` — ver data stores.
- `data-store-records_list` / `data-store-records_create` / `data-store-records_update` / `data-store-records_delete` — CRUD de registros.

### Scenarios clave de LMTM
- **AutoPoster: CU -> Redes sociales** — publica desde ClickUp a redes cuando llega la fecha de inicio.
- **AutoPoster: Plantilla Clientes** — plantilla para clonar al crear un cliente nuevo.
- **Cronopost | Click Up -> Drive -> Sheets** — sincroniza contenido de ClickUp a Sheets/Drive.
- **Google sheets -> Click Up** — pasa contenido del Sheet del cliente a ClickUp.
- Scenarios por cliente (ADR Luparini, Alun Nehuen, BITTI, BOERO, etc.).

### Reglas para Make
- **No borres scenarios de clientes** sin confirmación del equipo.
- Si un scenario falla, revisá `executions_get-detail` antes de tocar el blueprint.
- Para crear un cliente nuevo: cloná el scenario desde "AutoPoster: Plantilla Clientes".

## Triage / derivación de issues

Por defecto **todos los issues entran asignados a Pablo (CEO/triage)**, que los **deriva** al especialista correcto reasignando con `paperclipUpdateIssue` (`assigneeAgentId`). Si sos un especialista y te llega un issue reasignado, es tuyo: resolvelo. Si detectás que un issue es de otra área, comentá y (si tenés permiso) reasignalo o devolvélo a Pablo.
