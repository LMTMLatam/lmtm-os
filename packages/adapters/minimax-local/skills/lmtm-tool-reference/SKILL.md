---
name: lmtm-tool-reference
displayName: Referencia de herramientas
description: Las tools MCP REALES de LMTM-OS, qué hace cada una y de dónde salen los datos del cliente.
required: false
---

# Referencia de herramientas (MCP — lo que REALMENTE existe)

Trabajás como Claude Code con cuatro MCPs: `paperclip` (plataforma + datos de clientes),
`make` (automatización Make.com), `google` (Sheets · Drive · Apps Script) y `clickup`
(tareas/listas nativas). Juntos cubren TODO el pipeline de contenido (ver skill `lmtm-pipeline`).
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
- `lmtmGetClientScheduledContent` — contenido programado en la lista de Redes de ClickUp. `plannedDate` = Fecha de inicio (cuándo dispara a Make); `published`/`sentToMake` = etiqueta "mandado/enviado a make" (la ÚNICA señal de publicación — NO mirar el status de ClickUp).
- `lmtmGetClientCompetitors` — competidores cargados.
- `lmtmGetClientScores` — score de salud de cuenta y operativo.
- `lmtmPortfolioSnapshot` — **foto AGREGADA de toda la agencia** (últimos 7 días: clientes activos, spend/leads totales, cuántos tienen alertas abiertas). Usalo ANTES de escalar un problema para saber si es sistémico o solo de tu cliente.
- `lmtmRememberAboutClient` — guardar un aprendizaje DURABLE en la memoria del cliente.
- `lmtmSendBalanceAlert` — **envía alerta de saldo bajo por WhatsApp al equipo**. Usala SIEMPRE que detectes saldo bajo / spend_cap agotado / pauta frenada. NUNCA crees issues para alertas de saldo.
- `lmtmSendWhatsappReport` — **envía un reporte/mensaje genérico por WhatsApp al equipo** (message + title opcional). Usala cuando el equipo te pide reportar/avisar algo por WhatsApp. Sí podés mandar WhatsApp.
- `lmtmCreateClientTask` — crear una tarea para un cliente (internas se crean activas; externas quedan para aprobar). **NO la uses para alertas de saldo** — esas van por WhatsApp con `lmtmSendBalanceAlert`.

## Inteligencia de equipo y nichos

- `lmtmGetNicheIntel` — **inteligencia del rubro del cliente**: benchmark (CTR/CPL promedio vs meta alcanzable del mejor cuartil), formato ganador en orgánico y en ads, mejores campañas reales, experimento sugerido y el **plan de acción minado a diario** (subir CTR / bajar CPL / escalar / activar pauta, por cliente). Usalo como base de TODO diagnóstico de pauta en vez de improvisar.
- `lmtmGetTeamStatus` — qué está haciendo cada agente del equipo ahora.
- `lmtmGetTeamLessons` / `lmtmRememberTeamLesson` — **lecciones de equipo compartidas** (limitaciones del sistema, patrones, errores a no repetir). Consultá ANTES de diagnosticar problemas raros o escalar; guardá lo que descubras.
- `lmtmSaveDeliverable` / `lmtmListDeliverables` — entregables reutilizables (copys finales, specs, reportes). Chequeá antes de armar algo de cero.
- `lmtmSaveHook` / `lmtmSearchHooks` — **Baúl de Ganchos**: ganchos probados por nicho/cliente (hay +50 sembrados del catálogo del equipo — ver skill `lmtm-ganchos-virales`). Buscá antes de titular un post; guardá los que funcionen.
- `lmtmSaveTrend` — tendencias diarias etiquetadas por nicho (van al panel, NO a WhatsApp).

## Reglas de oro

1. **Fuentes de datos del cliente = solo Meta (tools lmtm*) + brain + Enfoque Técnico.** Nada más. No hay planilla ni CRM externo. No los busques ni los uses como excusa para bloquear.
2. **Presupuesto / saldo / límite de crédito = `lmtmGetClientBalance`** (spend_cap, amount_spent, remaining). No busques un "presupuesto cargado en ARS" en otro lado.
3. **Alertas de saldo → WhatsApp, NUNCA issues.** Si detectás saldo bajo / spend_cap agotado / pauta frenada, usá `lmtmSendBalanceAlert` para avisar al equipo por WhatsApp. NO crees tareas/issues para esto.
4. **Nunca bloquees por data faltante.** Si una tool devuelve 0/vacío o el cliente no está mapeado, anotá el gap y resolvé con el brain + Enfoque Técnico. Entregá la mejor respuesta posible y cerrá en `done`. `blocked` es solo para algo genuinamente imposible.
5. **No generalices desde un cliente.** Un 0 es de ESE cliente (no mapeado / sin pauta), no del pipeline. **Antes de escalar un problema como "outage" o falla sistémica, chequeá `lmtmPortfolioSnapshot`:** si el agregado de la agencia está normal y solo tu cliente cayó, es de ESE cliente — no escales un falso outage.
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

## Google (MCP `google`) — Sheets · Drive · Apps Script

Acceso directo a la cuenta `grow@bylmtm.com` (OAuth2). Es la planificación REAL del contenido.

### Sheets (planilla de planificación por cliente)
- `sheets_metadata` — título + tabs de un spreadsheet (sheetId, título, dimensiones). Usalo ANTES de leer para ubicar el tab correcto (ej: "Cronopost").
- `sheets_read` — leer un rango A1 (ej `'Cronopost!A1:F100'`). Devuelve filas.
- `sheets_append` — agregar filas al final de un rango.
- `sheets_update` — sobrescribir un rango exacto. Usalo para **transcribir/arreglar** una fila que no pasó a ClickUp.
- `sheets_create` — crear un spreadsheet vacío (preferí `drive_copy` de la plantilla para onboarding).

### Drive
- `drive_list` — buscar/listar archivos con query `q` (ej `"name contains 'Plantilla'"`, `"'<folderId>' in parents"`). Para encontrar la carpeta del cliente, la plantilla o las planillas.
- `drive_copy` — copiar un archivo (ej duplicar la **plantilla de Sheet**) a una carpeta con nombre nuevo. Núcleo del onboarding de cliente.
- `drive_get` — metadata de un archivo (nombre, mimeType, parents, dueño, link).
- `drive_create_folder` — crear carpeta (ej la del cliente bajo `AALMTMLATAM`).

### Apps Script (el script que empuja el Sheet → ClickUp)
- `script_create` — crear proyecto Apps Script, opcionalmente bound a un Sheet (`parentId`). Para provisionar el script Sheet→ClickUp de un cliente nuevo.
- `script_get_content` — ver los archivos (código + manifest) de un proyecto. Para inspeccionar/reparar.
- `script_update_content` — reemplaza TODOS los archivos del proyecto (incluí el manifest `appsscript`). Para arreglar o instalar el script.

## ClickUp (MCP `clickup`) — tareas y listas nativas

Acceso directo a la API de ClickUp (workspace LMTM, team_id 9013352440). Complementa `lmtmGetClientScheduledContent`. Convenciones de listas/campos/etiquetas: skill `lmtm-clickup-conventions`.
- `list_workspaces` / `list_spaces` / `list_folders` / `list_lists` / `list_folderless_lists` — descubrir la jerarquía. Cada space suele ser un cliente.
- `list_tasks` / `get_task` / `search_tasks` — leer tareas (ej la lista "Redes Sociales").
- `create_task` / `update_task` / `add_comment` — crear/editar tareas. Usalo para **transcribir** una tarea que no se creó desde el Sheet, o corregir fechas.

## Triage / derivación de issues

Por defecto **todos los issues entran asignados a Pablo (CEO/triage)**, que los **deriva** al especialista correcto reasignando con `paperclipUpdateIssue` (`assigneeAgentId`). Si sos un especialista y te llega un issue reasignado, es tuyo: resolvelo. Si detectás que un issue es de otra área, comentá y (si tenés permiso) reasignalo o devolvélo a Pablo.
