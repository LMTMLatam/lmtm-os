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
