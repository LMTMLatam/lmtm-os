---
name: lmtm-pipeline
displayName: Pipeline de contenido (Sheet → ClickUp → Make → publicación)
description: Cómo fluye el contenido de LMTM de punta a punta, qué tool usar en cada paso, cómo auto-provisionar un cliente nuevo y cómo reparar cuando un dato no fluye.
required: false
---

# Pipeline de contenido de LMTM

Así publica la agencia. Conocé el flujo completo para operarlo, provisionar clientes
nuevos sin trabajo manual y reparar cuando algo no fluye. Tenés acceso MCP a las cuatro
patas: `google` (Sheets/Drive/Apps Script), `clickup`, `make` y `paperclip`.

## El flujo (de punta a punta)

```
1. Sheet del cliente (Google Sheets)   ← acá se PLANIFICAN/arman los posts
        │  Google Apps Script (bound al Sheet, con trigger)
        ▼
2. ClickUp · lista "Redes Sociales"     ← cada post = una tarea con fecha de inicio
        │  webhook al llegar la fecha de inicio
        ▼
3. Make · scenario "AutoPoster: CU -> Redes sociales"
        │
        ▼
4. Publicación en las redes del cliente (IG/FB/etc.)
```

Scenarios Make de referencia (team 228071):
- **AutoPoster: CU -> Redes sociales** — publica desde ClickUp cuando llega la fecha.
- **AutoPoster: Plantilla Clientes** — plantilla para clonar al dar de alta un cliente.
- **Google sheets -> Click Up** — pasa el Sheet → ClickUp (alternativa/al script).
- **Cronopost | Click Up -> Drive -> Sheets** — sincroniza ClickUp → Drive/Sheets.

Drive: cuenta `grow@bylmtm.com`. Hay **dos pipelines paralelos** (Redes y Producción de video),
cada uno con su carpeta de sheets, su carpeta de scripts y su **planilla plantilla**.

## IDs reales del pipeline (Drive)

Carpeta padre: `1HWKRo_IEks7FA4Gvs4zw6IbjGMbLQNJf` (contiene "Redes -> Click Up" y "Producción -> Click Up").

**REDES (social media):**
- Carpeta de sheets de clientes: `15ZkCu9M2MTi-f3YPTbC1ttNv0DbBcnVQ` ("Redes -> Click Up"). Cada sheet se llama `<CLIENTE> <AÑO>` (ej "ADR Luparini 2025"); tabs típicos: `Cronopost`, `EFEMÉRIDES 📅`.
- Carpeta de scripts (Apps Script standalone, uno por cliente, nombrado por cliente): `1nbhnzZYjeKdlrIGWYBPLyFTFUC16r5pk`.
- **Planilla plantilla**: `Plantilla _Cronopost` → `1D21iXNcBYxez0Mpd4B4BR6aZlVgoERSTyRbMAWJUXRY` (tabs: `Cronopost`, `EFEMÉRIDES 📅`).

**PRODUCCIÓN DE VIDEO:**
- Carpeta de sheets de clientes: `1Rmbx5DJSAsFrNBpZhKsDP4LsmBA0_NKp` ("Producción -> Click Up"). Cada sheet se llama `<CLIENTE> - PRODUCCIÓN`; tab: `Produccion de videos`.
- Carpeta de scripts: `11CzUXYbr4ltaSgIxPfFGqENRhB18H7nX`.
- **Planilla plantilla**: `Plantilla _Produccion de video` → `1niOnE8Vss05mBsCdO4CTnmIC39i7UyUXdXOP2Z775Kw` (tab: `Produccion de videos`).

Cada cliente nuevo SE CREA copiando la planilla plantilla correspondiente. El script
(Apps Script standalone, no bound) lee el sheet del cliente y empuja a ClickUp; al
copiarlo para un cliente nuevo hay que apuntarlo al sheetId nuevo.

## Diagnóstico: ¿dónde se cortó?

Cuando "un post no salió" o "un dato no llegó", recorré el pipeline en orden y aislá el paso:

1. **Sheet** — `sheets_metadata` + `sheets_read` del tab de planificación. ¿La fila existe y está completa (fecha, copy, asset)?
2. **ClickUp** — `clickup search_tasks` / `list_tasks` en la lista "Redes Sociales". ¿Se creó la tarea para esa fila? ¿Tiene la fecha de inicio bien?
3. **Make** — `executions_list` + `executions_get-detail` del scenario AutoPoster del cliente. ¿Disparó el webhook? ¿Falló un módulo?
4. **Publicación** — verificá la red real (ver fallback de posteos en `lmtm-tool-reference`: `lmtmGetClientOrganicPosts` o browser).

Reportá en qué paso se cortó y qué viste, no solo "no salió".

## Reparar (auto-healing) — siempre con las tools

- **Fila en Sheet que NO pasó a ClickUp** → transcribila vos: leé con `sheets_read`, creá la tarea con `clickup create_task` en la lista correcta con la fecha de inicio. Si el script está roto, inspeccionalo con `script_get_content` y arreglalo con `script_update_content`.
- **Tarea en ClickUp con fecha/dato mal** → `clickup update_task`.
- **Scenario Make que falla** → `executions_get-detail` para ver el error antes de tocar nada; recién después `scenarios_get`/`scenarios_update`. NO borres scenarios de clientes sin confirmación.
- **Dato que quedó desincronizado Sheet↔ClickUp** → corregí en la fuente (Sheet) y replicá a ClickUp, o al revés según dónde esté el dato bueno. Dejá nota de qué corregiste.

## Onboarding de cliente nuevo (sin trabajo manual)

Cuando se crea un cliente nuevo (o te lo piden), provisioná todo el andamiaje. Definí
primero si es **Redes**, **Video** o ambos, y usá los IDs de arriba según corresponda:

1. **Sheet de planificación** → `drive_copy` de la planilla plantilla a la carpeta de sheets del pipeline, renombrado:
   - Redes: copiá `Plantilla _Cronopost` (`1D21iXNcBYxez0Mpd4B4BR6aZlVgoERSTyRbMAWJUXRY`) a la carpeta `15ZkCu9M2MTi-f3YPTbC1ttNv0DbBcnVQ`, nombre `<CLIENTE> <AÑO>`.
   - Video: copiá `Plantilla _Produccion de video` (`1niOnE8Vss05mBsCdO4CTnmIC39i7UyUXdXOP2Z775Kw`) a `1Rmbx5DJSAsFrNBpZhKsDP4LsmBA0_NKp`, nombre `<CLIENTE> - PRODUCCIÓN`.
2. **Apps Script** → los scripts son standalone (uno por cliente en la carpeta de scripts). Tomá el de un cliente existente como base con `script_get_content`, creá el del cliente nuevo con `script_create` + `script_update_content`, y **apuntá el sheetId al sheet nuevo** del paso 1. Verificá su trigger.
3. **Scenario en Make** → cloná **AutoPoster: Plantilla Clientes** con `scenarios_create` (blueprint de la plantilla) y ajustá la conexión/lista del cliente; activá con `scenarios_activate`.
4. **Lista en ClickUp** → si no existe, `clickup` para crear la lista "Redes Sociales" del cliente (o el space).
5. Probá una fila de punta a punta y dejá registrado en el brain del cliente (`lmtmRememberAboutClient`) los IDs (sheetId, scriptId, scenarioId, listId) para futuras reparaciones.

## Reglas

- **Buscá siempre la resolución con las tools** (incluido browser) antes de marcar blocked.
- **No borres** Sheets, scenarios ni tareas de clientes sin confirmación del equipo.
- Guardá los **IDs del andamiaje** de cada cliente en su brain — son la llave para reparar rápido.
- Si te piden reportar el estado del pipeline de un cliente, podés mandarlo por WhatsApp con `lmtmSendWhatsappReport`.
