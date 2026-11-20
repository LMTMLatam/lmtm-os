# Plan 17/11 (video) — despliegue, en orden

Todo lo de abajo está programado y probado en local (typecheck limpio; 645 tests de servicios + los de `redes/`).
Falta: el token de cuenta de Railway (para desplegar) y lo del QNAP (persona con admin).

## 0. Lo que hace la persona con admin (ver `redes/LEEME.md`)
(18/11: sin permiso de escritura en el NAS; las piezas van solo a Drive.)
1. QNAP: Container Station + contenedor `lmtm-redes` (zip `Downloads/lmtm-redes-1.0.zip`), con su `REDES_TOKEN`.
2. Tailscale: `tag:agentes` → `100.106.250.26` `tcp:5000,8790`.
3. Railway (lmtm-os): `REDES_URL=http://100.106.250.26:8790` y `REDES_TOKEN` (el mismo).

## 1. Deploy de lmtm-os (Claude, con el token de Railway)
- Mirar corridas activas antes (un deploy borra `/tmp/videos`).
- Verificar que nada salga con CRLF (`git ls-files --eol` o contar `\r`): el 17/11 un `start.sh` con CRLF tiró prod.
- `railway up` del servicio lmtm-os **y** de lmtm-render (misma imagen: vtool 1.6).
- Log: `[wrapper] vtool: autotest OK (kit 1.6-lmtm-os)`, migración `0163_video_virales_medicion` aplicada, `/api/health` OK.

## 2. Pruebas en producción (Claude)
1. `lmtmViralesBuscar` red=tiktok query="departamento en venta" pais=AR cantidad=3 → videos con `veces`.
   (Si dice «no está conectada»: faltan las variables; si da 401: el token no coincide.)
2. `lmtmViralesFichar` con un viral de esa búsqueda, nicho=inmobiliaria → fila en `video_virales` con forma y respuestas.
3. `lmtmCrudosPreparar` con la carpeta de BOERO `…/Clip_registro_frenos/CRUDOS` → `INVENTARIO.md`.
4. `lmtmVideoEntregar` de una pieza de prueba → queda en Drive (Super Redes/<cliente>/VIDEOS), no en el NAS.

## 3. Agentes (Claude, por la API)
1. Crear el **Editor de video** con `editor-agente.json`, copiando del Productor (dentro del pedido, nunca a un archivo)
   `ANTHROPIC_API_KEY` y `ANTHROPIC_AUTH_TOKEN`. Pasarlo al motor: `POST /agentes/motor/migrar {agentId, alMotor:true}`.
2. Productor: sumar a `PAPERCLIP_MCP_TOOLS` `lmtmEncargarAlEditor,lmtmTiposDeVideo,lmtmPlantillaVideo` y al
   promptTemplate, en «Qué camino», dos líneas:
   - «CRUDOS de una jornada en el NAS para dejar listos (varias piezas): no son tuyos → lmtmEncargarAlEditor (cliente,
     ruta, pedido) y cerrá la tarea con el número.»
   - «GUION DE GRABACIÓN (qué filmar): lmtmPlantillaVideo del tipo → lista de tomas (plano, acción, frase), una página,
     como comentario. Cuando estén los crudos, pasáselos al Editor.»
   `video-local` se le deja por ahora (material filmado chico de Drive) hasta que el Editor demuestre andar.
3. Carlos (Competitor): sumar `lmtmViralesBuscar,lmtmViralesAutor,lmtmViralesTendencias,lmtmViralesFichar` (fase 6,
   recién después del examen).

## 4. Estudio base → sistema (Claude)
> **Hecho 18/11** (ver estado.md): 1 por HTTP (`/api/agent-tools/execute`, no por MCP); 2 y 3 con `redes/etiquetar.ts`
> (las mismas funciones que `virales_fichar`, sin esperar a la QNAP): 89 % sobre 62; 4 = 5 plantillas «listas»; 5 skill
> desplegada y sumada al Editor; 6 `Documents/estudio-video/informe.pdf`. Repetir 1-4 a medida que el estudio mida más.
1. Cargar los virales y controles medidos (`Documents/estudio-video/fichas.jsonl`) con `lmtmGuardarViral`
   `fuente:"estudio"` y `virales:[…]` (de a 200), con su `medicion`, `forma` y, los mirados, sus `respuestas` (oro).
2. Fichar con el modelo (`lmtmViralesFichar`) los que no se miraron a mano → `etiquetas.jsonl` → `analizar.py`.
3. **Examen:** `lmtmViralesFichar soloComparar=true` sobre 50 del set validado. Promedio ≥ 85 % → se prende la fase 6.
4. Plantillas en borrador (10 generales + rubros con datos) con `lmtmGuardarPlantillaVideo`, citando ids.
5. Skill `reglas-edicion-viral` (docker/video-skills) con las reglas medidas → deploy → la carga el Editor.
6. PDF del informe para el equipo; validan en Producción → Tipos de video.

## 5. Rutina semanal (fase 6, después del examen)
Carlos, lunes 08:00: por rubro prioritario, `lmtmViralesTendencias` (AR, MX), 3 búsquedas con `lmtmViralesBuscar`,
`lmtmViralesFichar` de los ≥ 3× (máx. 10 por rubro) + 1 control por autor; si hay evidencia nueva,
`lmtmGuardarPlantillaVideo` (borrador, citando ids). La aprueba el equipo.
