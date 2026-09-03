---
name: lmtm-apps-script-repair
displayName: Revisar y arreglar Google Apps Scripts del pipeline
description: Proceso para diagnosticar y reparar los Apps Scripts del pipeline Sheet→ClickUp cuando fallan, usando el MCP de Google (scriptProcesses, scriptGetContent, scriptUpdateContent). Cambios quirúrgicos, nunca reescribir el script entero.
required: false
---

# Revisar y arreglar Google Apps Scripts

El pipeline de contenido es: **Sheet de planificación → Apps Script → ClickUp →
webhook → Make → publicación**. Cuando los posts no llegan a ClickUp, el
sospechoso #1 es el Apps Script del Sheet de ese cliente. Tenés las tools del
MCP de Google para arreglarlo vos: no lo escales sin diagnosticar primero.

## Proceso de diagnóstico (en orden)

1. **Ubicá el Sheet del cliente**: `driveList` buscando por nombre del cliente,
   o el spreadsheetId que esté en el brain (`lmtmGetClientBrain`). El script del
   pipeline suele estar *bound* al Sheet.
2. **Mirá las ejecuciones**: `scriptProcesses` (scriptId) — ¿hay ejecuciones
   recientes? ¿fallan? ¿con qué error? Sin ejecuciones = el **trigger no está
   instalado o se desinstaló** (falla típica, ya vista en LMTM-1313..1320).

   ⚠️ **COMPLETED no significa que ande.** Estos scripts atrapan todos sus
   errores en `try/catch` + `console.error`, así que una corrida que no
   sincronizó ni una fila igual termina COMPLETED. En la auditoría del 25/8/26
   había 59 scripts 100% muertos y los 59 figuraban COMPLETED. Señal de alarma:
   una corrida de **menos de 5 segundos** en un script que debería recorrer
   decenas de filas. Para saber si anda de verdad, mirá si las tareas de ClickUp
   tienen los campos cargados, no el estado de la corrida.
3. **Leé el código**: `scriptGetContent`. Fallas típicas conocidas:
   - `spreadsheetId` en placeholder (ej. "SHEET_NUEVO") — lección de equipo vigente.
   - Trigger onEdit/onChange/time-based sin instalar tras copiar el script.
   - Columnas del Sheet renombradas o corridas (el script referencia por índice o header).
   - Token/URL de ClickUp incorrecto o lista destino equivocada.
   - Cuota de Apps Script excedida (muchas ejecuciones).
4. **Cruzá con el Sheet**: `sheetsMetadata` + `sheetsRead` para confirmar la
   estructura real de columnas contra lo que el script espera.

## Fix

- **Cambio quirúrgico con `scriptUpdateContent`**: corregí SOLO la línea/config
  rota (el spreadsheetId, el nombre de la columna, la URL). **PROHIBIDO
  reescribir el script entero o "mejorarlo" de paso** — updateContent reemplaza
  TODOS los archivos del proyecto: mandá siempre el contenido completo original
  con únicamente tu corrección aplicada.
- Verificá: si el trigger es de tiempo, esperá/consultá `scriptProcesses` de
  nuevo; si es onEdit, agregá una fila de prueba con `sheetsAppend` y confirmá
  que la tarea aparece en ClickUp (después borrá/marca la prueba).

### Reglas que la tool hace cumplir (te va a rechazar el update si las rompés)

`script_update_content` valida el cambio contra la versión que está corriendo.
No son sugerencias: si no pasan, el update no se aplica.

- **La config va declarada.** Si el código usa `FIELD_IDS`, `OPTIONS_MAP`,
  `COLUMNS`, `FIELD_KINDS`, `KEYS_DD`, `KEYS_LABELS` o `NO_BORRAR`, tienen que
  estar declarados en el mismo proyecto. Así murieron los 59 scripts de video:
  ReferenceError en la primera fila.
- **No podés sacar lo que ya estaba.** Si la versión que corre declara una de
  esas tablas o escribe campos personalizados, la nueva también tiene que
  hacerlo. (Hotel San Bernardo terminó sincronizando sólo el nombre de la tarea.)
- **Tres endpoints de ClickUp que NO existen**, verificados contra la API:
  - `POST /task/{id}/field` (bulk, sin fieldId) → **405**. Va uno por campo:
    `POST /task/{id}/field/{fieldId}` con body `{value}`.
  - `PUT /task/{id}` con `custom_fields` → responde **200 y los ignora**.
    `custom_fields` sólo sirve al **crear** la tarea.
  - Campos tipo `phone` y `email` validan formato: rechazan con **400**.
- **Los ids no se copian de otro cliente.** Los campos que ClickUp define por
  carpeta (OKR) cambian por cliente. Sacalos de `GET /list/{listId}/field`.
- **`COLUMNS` sale del header real de la planilla**, nunca de memoria — pero si
  el header no coincide con los datos (pasa: falta una celda de encabezado y
  queda todo corrido), mandan los datos.
- **`ENLACE_DE_PUBLICACION` no se vacía nunca.** Ese campo lo escribe el
  pipeline de contenido directo en ClickUp; por eso está en `NO_BORRAR`.
- **Si el problema es de autorización OAuth del script** (el dueño tiene que
  re-autorizar a mano): eso es humano — escalá con instrucciones exactas
  (qué script, qué pantalla, qué cuenta).

## Cierre

- Documentá en el issue: qué estaba roto, qué cambiaste (diff conceptual), cómo
  verificaste.
- Si es un patrón nuevo (no está en las lecciones), guardalo con
  `lmtmRememberTeamLesson` (área "apps-script").
- Hallazgo durable del cliente (ej. "su Sheet usa columnas custom X") →
  `lmtmRememberAboutClient`.

## Límites

- Solo scripts del pipeline LMTM (Sheet→ClickUp y afines). NO toques scripts
  ajenos que aparezcan en el Drive.
- Cambios mínimos y reversibles. Ante duda de romper algo productivo, comentá
  el diagnóstico exacto y escalá en vez de arriesgar.
