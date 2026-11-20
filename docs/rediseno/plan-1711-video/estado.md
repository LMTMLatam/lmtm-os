# Plan 17/11 (video) — estado y bitácora

Plan: `PLAN.md`.

## Decisiones (17/11)
- D1 dos agentes (Productor + Editor nuevo) · D2 salida en Drive y NAS · D3 estudio base primero, después los
  agentes · D4 valida el equipo a pedido · D5 (Claude) el Editor queda en la flota; lo pesado en lmtm-render.
- **Cambio del 17/11 (tarde):** el estudio es de **virales en general de LatAm, en TikTok e Instagram**, no de la
  competencia de los clientes; con una herramienta que después usan los agentes.
- **Cambio del 17/11 (noche):** sin gasto. D6 = herramienta PROPIA (Playwright + yt-dlp), se descartan ScrapeCreators y Apify.

## Línea de base (17/11)
| Medida | Valor |
|---|---|
| Videos de competencia medidos | ~4.300 de ~180 cuentas, 20 rubros (inmobiliaria 2.633 / 43 cuentas) |
| Virales ≥3× (90 d) | inmobiliaria ~75; los demás rubros 1–4 |
| `video_virales` / `video_plantillas` | 0 / 0 (45 celdas «sin plantilla») |
| Veredictos «¿Sirve?» | 0 en toda la historia |
| Productor | 16 en revisión, 9 bloqueadas, 13 hechas, 2 por hacer; 4 de los últimos 25 entregables son video |
| Disco lmtm-os | 5 GB, 68 % (15/11) |

## Bitácora
- **17/11:** `yt-dlp` 2026.10.26 instalado en esta PC (`uv tool`). Baja reels públicos de Instagram sin login
  (prueba: 720×1280, 79 s, 18 MB, me gusta y comentarios; vistas y duración null).
- **17/11:** kit de video de esta PC (`C:\LMTM\video-kit`, Python 3.14, faster-whisper 1.2.1, ctranslate2 4.9.0):
  **segfault al cargar WhisperModel** (CPU int8/float32/int8_float32 y 1 hilo; el modelo small está completo,
  483 MB). Bloquea `vtool referencia`. Pendiente fase 0.
- **17/11:** `web_profile_info` desde esta PC devolvió 404 para `cocoscap` (en el servidor ese usuario se mide).
  Sin conclusión sobre `video_view_count`: se prueba en la fase 0.

- **17/11:** yt-dlp no lista perfiles de TikTok sin `curl_cffi` («Unable to extract secondary user ID»).
- **17/11:** ScrapeCreators cubre TikTok (búsqueda por palabra, videos y país del autor, video, transcripción) e
  Instagram (reels por palabra, popular, hashtag, reels del autor con reproducciones, post, transcripción). El
  `region` de TikTok es el país del proxy, no filtra por origen. Cliente genérico `sc()` con costo por endpoint ya
  hecho en `origin/competencia-scrapecreators:server/src/services/scrapecreators.ts` (356bdcf).
- **17/11 (pruebas gratis, desde esta PC, sin login):**
  - TikTok búsqueda por palabra con Playwright: **anda solo con navegador visible** (headless: 0 videos, solo
    sugerencias). «inmobiliaria argentina» → 12 videos con playCount/diggCount/shareCount/collectCount/duración/autor.
    `locationCreated` no viene en la búsqueda.
  - `yt-dlp[curl-cffi] --impersonate chrome` lista perfiles de TikTok con vistas (probado @khaby.lame). El extractor
    de hashtags de TikTok está roto («No working app info»).
  - Instagram `/<usuario>/reels/` con navegador visible: 12 reels con `play_count` en el HTML (luisitocomunica: 0,8–20 M).
    `web_profile_info` desde acá → página de login (404).
  - Creative Center: `/business/creativecenter/...` redirige a `/creative/creativeCenter/trends/hashtag`; datos por POST
    `CreativeOne/KnowledgeAPI/GetHashtagList` `{"timeRange":7,"countryCode":"US","page":1,"limit":20}`. Repetido desde
    la página con AR/MX/CO → 3 hashtags por país sin login. La pestaña de videos pide login.
  - Venv de pruebas: scratchpad `virales/.venv` (playwright + chromium); scripts `prueba_pw.py`, `prueba_cc2.py`,
    `prueba_ig.py` (se pierden con el scratchpad: la herramienta va a `lmtm-os/scripts/virales/`).
- **17/11 (noche):** Naza/usuario: «que lo puedan hacer los agentes… replicá una especie de ScrapeCreators». Pruebas:
  - Railway: `lmtmRedesPublicas` → Instagram 429 (bloqueado). Hace falta la IP de la oficina.
  - Headless (Chromium completo, sin marca de automatización, UA normal): Instagram reels OK; TikTok búsqueda
    «Hubo un problema» (detecta). Páginas `tiktok.com/discover/…`: SSR sin los videos.
  - **Sin navegador:** DuckDuckGo HTML `site:tiktok.com …` → 6 links; `site:instagram.com/reel …` → 10 links (Bing 0).
    `yt-dlp --impersonate chrome -j <video TikTok>` → vistas 717.700, me gusta, compartidos, comentarios, duración.
  - Decisión: API propia `lmtm-redes` (endpoints con nombres de ScrapeCreators) en contenedor del NAS (Container
    Station), llamada por lmtm-os por Tailscale con token. Los agentes no salen por la oficina.
  - No hay WSL ni Docker en esta PC: el contenedor Linux no se pudo probar acá.

### 17/11 noche — OK del usuario; fase 0 y fase 1.0 arrancadas
- **Whisper de esta PC:** el segfault de `ctranslate2` fue INTERMITENTE (6 caídas seguidas, después 3/3 y 2/2 bien sin
  cambiar nada; CPU Raptor Lake, model 186, `libiomp5md.dll`). `vtool referencia` de un reel de 79 s: 24 s la primera
  vez, 3 s con caché. El lote del estudio reintenta si sale con 139.
- **NAS → Railway:** 403 MB en 77 s (`lmtmNasBajar` de `C0645.MP4`) ≈ **42 Mbps** → 5 GB ≈ 16 min, 30 GB ≈ 1,6 h.
  Fase 5 no hace falta por ahora. Quedó `/tmp/videos/prueba-velocidad/C0645.MP4` en lmtm-os (se va con el deploy).
- **Banco de prueba (candidatos, a confirmar con el equipo):**
  1. BOERO `VIDEO/RECURSOS/Recursos_claude/Clip_registro_frenos/CRUDOS` (13 clips de celular, 02/11, automotor, tutorial).
  2. GALA `DISENO/RECURSOS/Avances_Gala_Rock/Etapa 5/Crudos` (drone + celular vertical/horizontal, avance de obra).
  3. Ikigai `VIDEO/PROYECTOS/DIA_NINO_28_7_26_IKI_V1/RECURSOS/CRUDOS - DIA DE LAS INFANCIAS` (~70 clips + voz en off, evento).
  4. (cámara 4K) Lmtm `PRODUCCION/ARCHIVOS/AGENCIA - CRUDOS VIEJOS/Growth Marketing (estrategia)/CLIPS OFICINA NUEVA`.
- **Términos:** `lmtm-os/redes/terminos.json` (6 rubros, comunes + por país; región por buscador). Los corrige el equipo.
- **`lmtm-redes` 1.0 hecho** (`lmtm-os/redes/`: `redes.py`, 15 tests con respuestas reales en `muestras/`, `compose.yml`,
  `LEEME.md`; zip para el QNAP en `Downloads/lmtm-redes-1.0.zip`). Probado en vivo desde esta PC:
  - TikTok búsqueda «departamento en venta» AR: 3 videos con vistas, mediana del autor y veces (palazzoprop 63,9×).
  - Instagram búsqueda: 3 reels; vistas desde los reels del autor (decuspropiedades 125.265, 42,5×); el que no está
    entre sus últimos 12 queda sin vistas.
  - Servidor: /salud, 401 sin token, 404 con la lista de rutas, /descargar (6,4 MB 1080×1920, borra el temporal).
  - **Gotchas:** DuckDuckGo 202 tras ~7 búsquedas en 30 min → rotación Yahoo (regional `ar.search.yahoo.com`) + DDG,
    lentos (15–45 s). Bing/Mojeek/Startpage 0 links, Brave 429. yt-dlp «Your IP address is blocked from accessing
    this post» es de UN video (región/edad), no freno general (`freno_general`). Con `-I`, Python ignora
    PYTHONIOENCODING: la CLI reconfigura stdout a utf-8. Git Bash convierte `/v1/...` en ruta de Windows:
    `MSYS_NO_PATHCONV=1`. El buscador trae videos viejos: el estudio filtra por fecha.
  - Imagen: `mcr.microsoft.com/playwright/python:v1.65.2-noble` (existe; trae Chromium y Xvfb), código montado, pip al
    arrancar, `shm_size 1gb`. **No probado en Linux** (esta PC no tiene Docker/WSL).

### 17/11 noche (2) — «seguí hasta el 100 %»: todo programado y probado, SIN desplegar (falta token de Railway)
- **Servidor (lmtm-os):**
  - Migración 0163: `video_virales` con red, país, vistas, me gusta, comentarios, compartidos, guardados, mediana del
    autor, veces, publicado, texto, control. `viralDeFila` + `sueltos`: los medidos cuentan como evidencia (también en la
    grilla, que antes ignoraba las filas cargadas a mano).
  - `services/redes.ts`: cliente de lmtm-redes por el proxy de Tailscale (IP 100.x) o directo; `medirVideo` mide en el
    momento. Probado contra la API local: palazzoprop 81.000 vistas / mediana 1.267 = 63,93×.
  - Herramientas nuevas: `virales_buscar/autor/tendencias/bajar/fichar`, `crudos_preparar` (NAS → INVENTARIO.md, en
    segundo plano, con control de disco libre), `encargar_al_editor`. MCP: `lmtmViralesBuscar/Autor/Tendencias/Bajar/
    Fichar`, `lmtmCrudosPreparar`, `lmtmEncargarAlEditor`. Equipo: Buscar/Autor/Tendencias.
  - `guardar_viral`: `medir=true` → mide el SERVIDOR (no confía en números de un agente); admin: lote con `medicion`
    y `fuente:"estudio"`; un agente no pisa una fila del estudio validado.
  - `virales_fichar`: lmtm-redes + vtool referencia + subtítulos + hojas + GPT (preguntas de `virales-ficha.ts`,
    27 claves, una sola fuente) + guardar; `soloComparar` = examen contra el set validado.
  - `video_entregar` copia al NAS (`nas.subirNas`: solo `<cliente>/VIDEO/TERMINADOS/NO_SUBIDO/`, no pisa, `If-None-Match`);
    si falla, la entrega por Drive sigue y lo dice.
  - Los cambios a un video vuelven a quien lo hizo (Editor o Productor). Rutas: `/contenido/editor/pedido(s)`,
    `/contenido/crudos-nuevos` (índice nocturno agrupado por carpeta), `/contenido/para-validar`.
  - Panel: «Pedile al Editor» con crudos nuevos, filtro «Videos sin validar», motivos en «No sirve», tarjeta «Videos
    para validar» en Hoy.
  - Verificación: typecheck server/ui/db limpios; 645 tests de servicios OK. En rutas/__tests__ 151 fallas de ENTORNO
    de esta PC (módulos nativos sin compilar por `pnpm install --ignore-scripts`, scripts .sh en Windows); ninguna en lo
    tocado.
- **vtool 1.6-lmtm-os** desde el kit con `docker/video-skills/video-local/desde-kit.py` (anclas verificadas): perfiles,
  `--zoom`, `--sfx`, `referencia`, `vertical --modo cara`; transcribe con HyperFrames si no hay faster-whisper. Autotest OK
  en modo PC y modo contenedor. Reencuadre a la cara probado (x=0,32 en un horizontal armado).
- **Estudio:** `redes/estudio.py` (retomable; si una red frena sigue con la otra; tope de IG del estudio 400), `medir.py`
  (vtool del kit), `mirar.py` (set validado; claves desde el TS), `analizar.py` (virales vs control, lift, reglas),
  `cargar.py` (lotes para el sistema). Corre en segundo plano (log `Documents/estudio-video/corrida.log`). Se suman los
  virales RECIENTES de los perfiles de cada autor (en IG el buscador trae reels viejos sin vistas).
- **Método decidido:** forma medida en todos; set validado mirado por Claude (~120, 20 por rubro); el resto lo ficha el
  modelo del servidor y se mide su coincidencia (examen 85 %).
- **GOTCHAS:** `Path.write_text` de Python en Windows escribe CRLF (pasó con el journal de migraciones): escribir con
  `newline="\n"` o bytes, y contar `\r` por bytes (el `grep $'\r'` de Git Bash no los ve). Heredoc de bash rompe Python
  con comillas: script con Write. El tope diario de IG (150) se consume en ~11 búsquedas del estudio.
- Guía de despliegue en orden: `DESPLIEGUE.md`. Config del Editor (sin claves): `editor-agente.json`.

### 18/11 — desplegado; set validado y examen del modelo aprobado
- **Desplegado en lmtm-os** (DESPLIEGUE.md §1–3): migración 0163, vtool 1.6 (autotest OK), rutas del Editor,
  `/contenido/para-validar` (12 videos), crudos nuevos sin DISEÑO/AVISOS/SUB. `virales_buscar` responde «no está
  conectada» hasta que esté lmtm-redes en la QNAP.
- **Agente «Editor de video»** creado en el motor (ícono wand; la clave del proxy va como `secret_ref` a
  `lmtm_proxy_key` por el modo estricto; el flujo va en `promptTemplate` porque el AGENTS.md administrado se pierde en
  cada deploy). El parche del Productor espera la primera corrida real del Editor.
- **Filtro de relevancia** (`mirar.relevante`, lo usan analizar y cargar): un rubro cuenta si el video habla de él más que
  de otro rubro; «general» exige una palabra de negocio (sin palabras débiles: las letras de canciones dicen «plata» y
  «trabajo») y descarta otras escrituras (coreano, etc.). General quedó en 32 virales / 20 control de 103.
- **Set validado (oro): 55 videos** — inmobiliaria 20 (10 v + 10 c), general 35. Lección: los CTA están al FINAL del
  audio; mirar la transcripción completa, no solo las hojas (7 CTA corregidos después del examen).
- **Examen del modelo** (`redes/etiquetar.ts`: las MISMAS funciones que `virales_fichar`, la misma hoja): 88,4 % →
  **89,0 %** (aprueba con 85). Cambios en la ficha, desplegados: sin preguntas de sonido (25 claves), tipos con su
  descripción y regla de prioridad (formato > lo que se muestra > habla-a-camara), `muestra_resultado` = resultado
  LOGRADO (mostrar lo que se vende no cuenta). El tipo coincide en 33/55 (60 %): los tipos se pisan entre sí; en el
  informe va como orientativo. Etiquetas viejas guardadas como `etiquetas-v1/v2-*.jsonl`.
- `cargar.py` ya no sube fichas fuera de rubro.
- **Cargado al sistema:** 179 filas `fuente estudio` (lote del tablero por HTTP con el token del conector, no por MCP:
  no entra en el contexto). Cada fila dice quién respondió: `estudio:persona` (el oro, 62) o `estudio:modelo`;
  `virales_fichar soloComparar` compara SOLO contra `estudio:persona` (antes comparaba también contra el modelo).
- **Análisis** (`informe.md` + `informe.pdf` en Documents/estudio-video): se agregó una prueba de dos proporciones
  (p < 0,10) porque 2/105 contra 2/69 salía «no hacer». Firmes en el total: número en el gancho ×1,56 (p 0,03),
  precio ×1,77 (p 0,018), voz a cámara ×0,66 (p 0,002, no hacer). El total ya no lo pisa el rubro «general».
- **Plantillas «listas» (las aprueba una persona en Producción → Tipos de video):** inmobiliaria/recorrido
  (45-65 s, un plano cada 4-5 s, dato duro en texto antes del 1 s), todos/habla-a-camara (toma larga, poco b-roll),
  todos/tendencia (descriptiva: 3 normales), todos/tutorial, todos/detras-de-escena. OJO: el perfil `inmobiliario`
  del kit dice 20-45 s y planos de 1,5-3 s; el estudio dice lo contrario (virales 53 s, plano 4,8 s).
- **Skill `reglas-edicion-viral`** (docker/video-skills): las reglas que valen para todos los tipos; la carga el
  Editor (en prod no la tenía: se sumó por PATCH a `paperclipSkillSync.desiredSkills`, resto de la config intacto).
- **Decisión del usuario (18/11): piezas SOLO a Drive, no al NAS.** Fuera `copiarAlNas` (video_entregar) y
  `subirNas`/`rutaTerminado`/`DESTINO_SUBIDA` (nas.ts) con sus tests; texto del panel; prompts del Editor en prod y en
  `editor-agente.json`; LEEME de la QNAP sin el paso de escritura (`Agentes_IA` queda en solo lectura); D2 anotada en el
  PLAN. El NAS sigue para leer crudos.
- **Obsidian = cerebro** (regla del usuario): todo se documenta en la memoria de LMTM y se regenera el vault
  (`_sistema\construir_vault.py`); guía nueva «Estudio de virales y Editor de video» en `Guias de operacion/`.

### 18/11 (tarde) — «seguí hasta el 100 %, después testeá»
- **Al Editor se le pide desde el panel de LMTM** (usuario): se descartó la etiqueta de ClickUp. «Pedile al Editor» ahora
  lista, al elegir un cliente, SUS carpetas de crudos de 60 días (`/contenido/crudos-nuevos?clientId=`), no solo lo nuevo de 7.
- **Fase 4.3 — motivos por plantilla:** `video_entregar tipoVideo=<tipo>` guarda en el entregable qué plantilla valía
  (la resuelve el servidor: cliente → rubro → general, con versión). `plantillaDe` devuelve `validacion` (sirvieron / no
  / motivos del botón «No sirve»); la muestran `lmtmPlantillaVideo` y Producción → Tipos de video.
- **Fase 2.1 — `vtool luz`** (desde `desde-kit.py`): aclara un crudo oscuro (nunca oscurece); `--blanco` corrige el tinte
  medido en los píxeles casi grises (opcional: una pared beige no es un tinte). Probado con clips sintéticos (0,30 → 0,38;
  tinte cálido → neutro) y en el autotest.
- **Fase 2.2 — tipo de toma** en el INVENTARIO de crudos (habla-a-camara / testimonio / recorrido / producto / b-roll).
- **Plantillas generales:** 6 de 10 (habla a cámara, tendencia, tutorial, detrás de escena, recorrido, producto) + inmobiliaria/
  recorrido. Promo (4 virales), evento (1), antes y después (1) y testimonio (0) quedan SIN plantilla a propósito: «nada sin
  evidencia»; la rutina de Carlos las propone cuando junte ≥ 5 virales de ≥ 3 cuentas. Los virales de la competencia no sirven
  de evidencia de edición (solo traen el texto del posteo y el tipo sale de ese texto).
- **Fase 6:** a Carlos se le suman las herramientas de virales y la rutina «Estudio semanal de virales» (lunes 08:00).
  El examen de la 6.3 ya está: quien etiqueta es el modelo del servidor (89 %), Carlos solo elige qué fichar.
- **Productor (DESPLIEGUE §3.2):** lmtmEncargarAlEditor, lmtmTiposDeVideo, lmtmPlantillaVideo + líneas de «crudos al Editor»,
  «guion de grabación» y «entregar con tipoVideo». La clave del proxy pasa a `secret_ref` después de la primera corrida real
  del Editor.

### 18/11 (tarde) — PRUEBA de punta a punta (BOERO, Clip_registro_frenos: 12 clips, 155 MB)
- T1 panel: con el cliente elegido lista sus crudos de 60 días (la carpeta de frenos, del 02/11, no salía con 7 días). OK.
- T2 pedido desde el panel → LMTM-7203 al Editor. **Encontró 4 fallas, arregladas y desplegadas:**
  1. El pedido de una persona esperaba al reloj del motor (topes diarios del proveedor, sin aviso; el wakeup de
     paperclip no despierta al motor) → ahora corre a pedido (`aPedido`), como el botón manual del motor.
  2. El motor no resolvía `secret_ref` («Not logged in») → resuelve como el heartbeat.
  3. **La clave maestra de los secretos vivía en disco efímero**: cada deploy dejaba ilegible todo secreto
     («unable to authenticate data») → `PAPERCLIP_SECRETS_MASTER_KEY_FILE=/data/paperclip-secrets/master.key` y
     `lmtm_proxy_key` re-cargada (rotate v2). Memoria: `lmtm-os-secretos-railway`.
  4. **El log de 4xx guardaba el cuerpo con claves** (la del proxy quedó en logs de Railway) → `redactLogValue`;
     verificado en prod. **Rotar la clave del proxy** (persona).
- Estudio actualizado: 317 medidos, 251 con respuestas (66 de persona), examen 88,9 %. Con más datos cambian
  números: firmes humor ×1,94, precio ×1,65, número en el gancho ×1,54; voz a cámara ×0,73 (p 0,004, bajo el umbral).
  Skill y plantillas de habla a cámara y tutorial corregidas (v2). Informe en `docs/estudio-video/informe.md`.
- Siguientes de la prueba: (5) `crudos_preparar` creaba su carpeta como root DESPUÉS del chown del adaptador → el Editor
  no podía escribir → ahora la pasa a `node`. (6) Con el modo estricto el env se guarda `{type:"plain"}` → `cuota-llm`
  dejaba a Carlos sin detectar MiniMax → `valorEnv` + estado de cuota por proveedor. Productor y Carlos ya en `secret_ref`
  con sus herramientas (Carlos corrió con su secreto nuevo después de un deploy: la clave maestra persiste).
- **ElevenLabs: la cuenta no responde** (con la clave se cuelga hasta `/user/subscription`; sin clave la API contesta en
  0,6 s; status «operational»). Lo tiene que mirar una persona en el panel de ElevenLabs (plan, bloqueo, clave). La prueba
  sigue con la voz de Gemini (`"proveedorVoz": "gemini"` en guion.json).
- Error mío: desplegué con una corrida de Carlos en curso (LMTM-7199, radar de nichos) y se cortó; la relancé a pedido.
- **RESULTADO DE LA PRUEBA: OK.** LMTM-7203 entregó una pieza de 25 s en Drive (`tipoVideo=producto`, plantilla
  general producto v1, control de calidad apto 4/5, voz Gemini, sin música), quedó `in_review` con botones Aprobar /
  Pedir cambios; aparece en «Videos sin validar» (13) y la plantilla cuenta `validacion.piezas = 1`. Resolvió solo el
  límite de HDR (7,6 GB contra 4 GB: copias SDR). Es una pieza de PRUEBA: el equipo puede descartarla.
- **ElevenLabs:** la clave nueva quedó en Railway (`ELEVENLABS_API_KEY`, aplicada con redeploy), pero también se
  cuelga, igual que la vieja; una clave inválida contesta 401 en 0,3 s → es la CUENTA de ElevenLabs (facturación,
  suspensión o workspace): revisar en elevenlabs.io. Mientras, la voz de Gemini anda.
- Estudio al cierre del día: 447 medidos, 381 con respuestas (82 de persona), examen 88,8 %. Firmes: humor ×2,08 y
  precio ×1,56; dato en el gancho ×1,47 (p 0,022, apenas bajo el umbral); voz a cámara pasó a señal (×0,83). Skill
  actualizada y desplegada. Turismo e industria se siguen midiendo; set validado: construcción 19, automotor 8.
- **Estudio COMPLETO (medición de los 6 rubros):** 531 medidos, 460 con respuestas, examen 88,8 % (82 de persona).
  **Las reglas cambian por rubro:** en el total valen contraste/antes-después (×2,13) y humor (×1,85); precio ×1,46.
  El dato/número en el gancho es REGLA en inmobiliaria (×1,51) pero NO HACER en turismo (×0,5) e industria (×0,3).
  Skill `reglas-edicion-viral` reescrita con una tabla por rubro (falta desplegarla: otra sesión estaba editando
  `video-agente.ts`). Plantilla todos/recorrido v3 (el dato en el gancho deja de ser regla general).
- **Deploy final (18/11, 17:36 UTC; lmtm-os + lmtm-render, con los cambios de la otra sesión) y pruebas: TODO OK.**
  Arranque: vtool autotest OK (con `luz`), motor prendido, migraciones aplicadas, 17 skills, plugins sin errores; render
  escuchando. Skill `reglas-edicion-viral` cargada con la tabla por rubro; `video-local` con `vtool luz`. Panel: bundle con
  las pantallas nuevas; crudos por cliente, 13 para validar, pedidos del Editor. Plantillas: 6 generales listas, BOERO
  producto con `validacion.piezas=1`, todos/recorrido v3. Virales del estudio por rubro en la base; `virales_buscar`
  dice «no conectada» (falta QNAP). Editor/Productor/Carlos con claves en `secret_ref`, herramientas y skill; rutina de
  Carlos activa. Log de 4xx tapando claves; voz Gemini OK. Carlos corrió su tarea del día (LMTM-7200) después del deploy:
  la clave se descifra.

## Pendiente
- Persona con admin: pasos de `redes/LEEME.md` (Container Station, Tailscale tcp:8790, REDES_URL/REDES_TOKEN en
  Railway; sin permiso de escritura en el NAS). Después: probar virales_buscar/fichar, crudos_preparar, primera corrida del Editor,
  parche del Productor.
- Estudio: completar el set validado (automotor 8/20, turismo 0, industria 0; construcción 19) cuando terminen de medirse:
  `mirar.py lote`,
  leyendo el FINAL de la transcripción) → `etiquetar.ts` → `cargar.py` + subir el lote → `analizar.py` →
  plantillas por rubro. Hoy solo inmobiliaria y el total tienen muestra suficiente.
- Equipo: aprobar (o corregir) las 5 plantillas y leer `informe.pdf`.
- Equipo: corregir términos y confirmar el banco de prueba.
