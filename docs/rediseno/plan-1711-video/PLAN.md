# LMTM-OS — plan de producción y edición de video con agentes (17/11/2026)

Objetivo: que se le pueda decir a un agente **«En el cliente X, carpeta X, tenés todos los crudos grabados hoy:
dejalos editados y listos para subir a redes»** y que vuelvan piezas que el equipo valida y se publican por la
cadena de siempre.

El agente tiene que saber recortar tomas y silencios, hacer zooms, animar con motion graphics y, sobre todo,
**editar como edita lo que se viraliza**. Para eso, primero un **estudio de los videos virales de Latinoamérica en
TikTok e Instagram** (no solo de la competencia de nuestros clientes), hecho con una herramienta que después usan los
agentes para repetirlo solos.

Estado: **decisiones del 17/11 tomadas (abajo). Nada aplicado todavía.** Bitácora viva: `estado.md`.

---

## 0. Decisiones (17/11)

| # | Decisión | Quién |
|---|---|---|
| D1 | **Dos agentes** en la misma flota: el **Productor** (el de hoy) y un **Editor** nuevo, solo para crudos | Equipo |
| D2 | Las piezas terminadas quedan **en Drive y en el NAS** → **18/11: solo en Drive** (el NAS sigue de solo lectura para los agentes) | Equipo |
| D3 | El estudio base es sobre **virales en general de Latinoamérica, en TikTok e Instagram**, por rubro y por tipo de video. Se hace primero con Claude en una PC de la oficina y **con la misma herramienta que después usan los agentes** | Equipo |
| D4 | **Valida el equipo** (a pedido): las piezas y también el estudio | Equipo |
| D5 | El Editor **no sale del equipo de agentes**: necesita la marca, la memoria, los tipos de video, la guía, el panel, ClickUp y la delegación. Lo pesado (bajar, transcribir, renderizar) ya corre aparte, en `lmtm-render`. Un worker en la oficina, **solo si la medición de la fase 0 lo pide** | Claude |
| D6 | **API propia de redes, gratis («nuestro ScrapeCreators»)**: mismos tipos de endpoints, corriendo en el NAS de la oficina (IP residencial), consumida por el servidor y los agentes por Tailscale. Ver §3 fase 1.0. ScrapeCreators y Apify, descartados por pagos | Equipo + Claude |

---

## 1. Punto de partida (medido el 17/11)

| Qué | Dato |
|---|---|
| Plantillas de edición | **0.** Las 45 combinaciones rubro × tipo están «sin plantilla». `video_virales` 0 filas |
| Virales que ve hoy el sistema | Solo los de la **competencia de los clientes**, solo Instagram: ~4.300 videos de ~180 cuentas; virales ≥3× en inmobiliaria ~75, en los demás rubros de 1 a 4. Sin TikTok. **No sirve como estudio de mercado:** queda para plantillas por cliente |
| Vistas | El sistema no tiene: el lector propio de Instagram no las trae y a la IP de Railway Instagram le da 429 |
| Cómo se sabe el tipo de video | Lo pone un modelo **leyendo el copy**. Nadie miró los videos |
| Veredictos «¿Sirve?» | **0 en toda la historia.** 16 tareas del Productor en revisión esperando |
| Productor | De los últimos 25 entregables, 4 son videos; el resto, placas y carruseles. 9 tareas bloqueadas (fotos reales, persona) |
| vtool del contenedor | Tomas, rodaje, muletillas, silencios, subtítulos palabra por palabra, voz limpia, música, jornada. **Sin zoom y sin efectos de sonido** (el kit de las PC sí los tiene desde la 1.4) |
| Motion | HyperFrames: títulos, tarjetas, insertos, 5 estilos, guardián de variedad. Insertos casi sin uso real |
| NAS | Listar, buscar (índice nocturno), bajar y link firmado con Range. Usuario `Agentes_IA` **solo lectura**. Crudos en `/LMTM/Clientes/<C>/VIDEO/PROYECTOS/<proyecto>/RECURSOS/CRUDOS` |
| Disco | Volumen de lmtm-os: 5 GB, 68 % usado. **Una jornada de crudos 4K no entra.** `/tmp` se borra en cada deploy |
| Esquema del estudio | **Ya existe y está vacío:** `video_virales` (forma, respuestas sí/no, gancho, notas), `video_plantillas` (estructura, ganchos, edición, noHacer, reglas, perfil de vtool, evidencia), aprobación por persona en Producción → Tipos de video |
Pruebas de hoy desde esta PC (conexión de la oficina, **todo gratis y sin iniciar sesión**):

| Qué | Cómo | Resultado |
|---|---|---|
| Buscar en TikTok por palabra | Navegador automático (Playwright) en la búsqueda de TikTok, leyendo las respuestas de la página | **Anda con el navegador visible**: «inmobiliaria argentina» → 12 videos con vistas, me gusta, compartidos, guardados, duración y autor. **Oculto (headless) TikTok lo detecta** y no devuelve videos |
| Lo normal de un autor de TikTok | `yt-dlp --impersonate chrome` sobre el perfil | **Anda**: últimos videos con vistas, me gusta y duración |
| Lo normal de una cuenta de Instagram | Navegador en `instagram.com/<cuenta>/reels/` | **Anda**: reproducciones de los últimos 12 reels (probado con un creador mexicano: de 0,8 a 20 millones) |
| Buscar en Instagram por palabra o hashtag | — | **No se puede sin login.** Se resuelve por cuentas (ver fase 1.2) |
| Tendencias por país | TikTok Creative Center, pedido de la propia página con el país cambiado | **Anda para AR, MX y CO**, pero sin login da solo 3 hashtags por país: sirve de semilla, no de muestra |
| Bajar el video | `yt-dlp` | **Anda** en Instagram (720p) y en TikTok |
| El lector de perfiles del servidor (`web_profile_info`) | Pedido directo | Desde esta PC devuelve la página de login (404): ya no sirve |
| Buscar sin navegador | Buscador web (DuckDuckGo HTML, `site:tiktok.com …` / `site:instagram.com/reel …`) → links | **Anda**: 6 TikTok y 10 reels por consulta. Bing: 0 |
| Datos de un video de TikTok sin navegador | `yt-dlp --impersonate chrome -j <link>` | **Anda**: vistas (717.700), me gusta, compartidos, comentarios, duración, fecha, autor |
| Navegador oculto (headless) | Chromium completo, sin marca de automatización | **Instagram anda** (12 reels con reproducciones). **TikTok no** («Hubo un problema»): su búsqueda solo con navegador visible |
| Desde el servidor (Railway) | `lmtmRedesPublicas` | Instagram **429**: Railway está bloqueado. Tiene que salir por la oficina |
| Repos evaluados | `yt-dlp` (se usa), TikTok-Api de davidteather (usa el mismo truco del navegador: no suma), instaloader (hashtags piden login), ScrapeCreators y Apify (pagos) | Se arma una API propia chica sobre `yt-dlp` + buscador web + Playwright |

- El kit de video de esta PC **se cae al transcribir**: segfault de `ctranslate2` 4.9.0 al cargar Whisper (CPU y
  GPU; Python 3.14). Bloquea `vtool referencia` y `vtool reel` acá. Hay que mirar si las PC del equipo con el kit
  1.5 tienen lo mismo.

---

## 2. Arquitectura

```
 NAS (oficina) ──Tailscale/WebDAV──► lmtm-os ─────────────► lmtm-render (Railway, aparte)
   crudos (lectura)                   motor de agentes:        preparar_carpeta: baja de a un archivo,
                                      Productor · Editor       endereza, copia 720p, transcribe, tomas,
                                      herramientas · cerebro   hojas, describe → inventario.json
        ▲                                   │                  render final: lee SOLO los tramos elegidos
        │                                   ▼                  del NAS por Range
        └──────── pieza final ◄──── entregar: Drive + ClickUp «Enlace de publicación» → Make

 TikTok + Instagram (LatAm) ◄── «lmtm-redes» (API propia, contenedor en el NAS, IP de la oficina)
                                      ▲ Tailscale (token, puerto propio)
 agentes ── lmtmBuscarVirales / virales_* ── lmtm-os ──┘ → video_virales → plantillas (las aprueba el equipo)
```

**Regla de diseño:** el agente decide sobre cosas livianas (transcripción con tiempos, hoja de contacto, copia de
720p, inventario) y el worker ejecuta en calidad completa. El agente nunca mueve material 4K y **nunca se guarda
la jornada entera**: se procesa archivo por archivo y el render final trae del NAS solo los tramos que usa.

### Reparto entre los dos agentes

| | Productor (hoy) | Editor (nuevo) |
|---|---|---|
| Recibe | Pedido, idea, etiqueta «generar contenido» | Una carpeta de crudos (NAS o Drive) |
| Hace | Placas, carruseles, reels con voz en off sobre material, **guion de grabación** (qué filmar según el tipo de video) | Crudos → N piezas, cada una con su tipo y su plantilla |
| Skills | `lmtm-placas`, `lmtm-video` (plantilla de voz) | `video-local`, `lmtm-video` (filmado y motion), `reglas-edicion-viral` |
| Entrega | En revisión | En revisión |
| Se hablan | Deja el guion de grabación; cuando aparecen los crudos, se lo pasa al Editor | — |

Dos agentes en vez de uno: cada uno carga menos skills (cada byte de un SKILL.md se paga en todos los turnos),
tienen colas separadas (los carruseles no frenan los videos) y se miden por separado.

---

## 3. Fases

### Fase 0 — Preparar y medir (1 día)

1. **Kit de esta PC:** arreglar el segfault de Whisper (probar otra versión de `ctranslate2`, o transcribir con el
   whisper.cpp de HyperFrames). Revisar las PC del equipo con el kit 1.5. Sumar `curl_cffi` a `yt-dlp` y probar
   la bajada de un TikTok suelto.
2. **Lugar para la API de redes en la oficina:** TikTok e Instagram frenan a la IP de Railway. Una persona con admin del
   QNAP instala **Container Station** (gratis, de QNAP). Yo dejo el contenedor `lmtm-redes` listo para bajar de GHCR, la
   regla de Tailscale (`tag:agentes` → NAS, puerto de la API) y el token en Railway (lo carga la persona, como
   `NAS_PASSWORD`). Si el QNAP no puede, va en una PC de la oficina siempre prendida, con el mismo código.
3. **Velocidad NAS → Railway:** bajar 1 GB con `lmtmNasBajar` y cronometrar. Pesar 3 jornadas reales. Con esto se
   decide si hace falta la fase 5.
4. ~~**Escritura en el NAS** (D2)~~ — descartado el 18/11: las piezas van solo a Drive.
   - Una persona con admin del QNAP le da a `Agentes_IA` escritura **solo** en las carpetas
     `VIDEO/TERMINADOS/NO_SUBIDO` (permisos avanzados de carpeta). Ese permiso es el cerco real: los agentes corren
     con Bash y el entorno del servidor.
   - Del lado del servidor, `nas_subir` (WebDAV PUT): solo acepta `/LMTM/Clientes/<C>/VIDEO/TERMINADOS/NO_SUBIDO/…`,
     nunca sobrescribe y frena las rutas con «..».
5. **Banco de prueba:** elegir 3 jornadas reales de clientes y tipos distintos. Se usan en todas las fases para
   comparar antes y después.
6. **Términos de búsqueda por rubro:** propongo 20–30 palabras clave y hashtags en español por rubro, con variantes
   de cada país (Argentina, México, Colombia, Chile, Perú, Uruguay), y el equipo los corrige.

### Fase 1 — Estudio de virales de Latinoamérica (5–6 días; Claude en la PC, con el equipo)

La pieza central. Se hace a mano y con criterio, porque va a ser la vara para todo lo que venga después.

**1.0 Primero, la API de redes: «nuestro ScrapeCreators» (2–3 días). Propia y gratis.** Se arma **antes** del
estudio, y el estudio base ya corre por ella. Así los agentes después usan exactamente lo mismo; lo único que cambia
es quién juzga.

- **Qué es:** `lmtm-redes`, un servicio HTTP chico (Python: `yt-dlp` con `curl_cffi`, Playwright con Chromium, y un
  buscador web). Vive en `lmtm-os/redes/` y se publica como imagen en GHCR, como el resto.
- **Dónde corre:** un contenedor en el NAS (Container Station). Sale a internet con la IP de la oficina, que TikTok e
  Instagram no frenan. lmtm-os lo llama por Tailscale con un token, por el mismo proxy que ya usa para el NAS
  (`nas.ts`). Mientras se arma el estudio, corre en esta PC con el mismo código.
- **Los agentes no salen por la oficina:** solo llaman a la API. El ritmo y los topes los pone el servicio, fuera de su
  alcance.
- **Endpoints** (mismos nombres que ScrapeCreators, para poder cambiar a la versión paga solo con otra URL y clave):

  | Endpoint | Cómo lo resuelve | Devuelve | Probado 17/11 |
  |---|---|---|---|
  | `GET /v1/tiktok/search/keyword?query=` | Buscador web `site:tiktok.com` → links → `yt-dlp` por video. Si hay pantalla, suma la búsqueda de TikTok con navegador visible | Videos con vistas, me gusta, compartidos, comentarios, duración, autor, fecha, texto | ✔ |
  | `GET /v3/tiktok/profile/videos?handle=` | `yt-dlp --impersonate` sobre el perfil | Últimos 30 videos con vistas → mediana del autor | ✔ |
  | `GET /v2/tiktok/video?url=` | `yt-dlp -j` | Datos de un video | ✔ |
  | `GET /v2/instagram/reels/search?query=` | Buscador web `site:instagram.com/reel` → links → datos de cada reel | Reels con autor, me gusta, comentarios y, si está entre sus últimos 12, reproducciones | ✔ (links) |
  | `GET /v1/instagram/user/reels?handle=` | Chromium oculto en `/<usuario>/reels/` | Últimos 12 reels con reproducciones → mediana | ✔ |
  | `GET /v1/instagram/post?url=` | `yt-dlp -j` + los reels del autor | Me gusta, comentarios, medidas, reproducciones | ✔ (sin reproducciones: salen de los reels del autor) |
  | `GET /v1/tiktok/trends?pais=` | Creative Center, pedido de la página con el país | Hashtags en tendencia (semillas) | ✔ (3 por país; necesita pantalla) |
  | `GET /descargar?url=` | `yt-dlp` | El archivo del video, para medirlo en lmtm-os y borrarlo | ✔ |

- **Lo que copia de un ScrapeCreators:**
  - caché por link (no se pide dos veces lo mismo en 24 h);
  - ritmo de persona por sitio (pausas al azar, de a un pedido por vez);
  - tope diario por red;
  - respuesta `bloqueado` con «reintentar a las…» cuando aparece un captcha, la pantalla de login o un 429. No
    reintenta en círculo.
  - Sin login, sin rotar IP y sin resolver captchas.
- **Lo que no copia:** la red de IPs residenciales paga (usamos una sola, la de la oficina: alcanza para el volumen de
  la agencia) ni las cuentas logueadas.
- **Si TikTok cambia y la búsqueda deja de andar,** el buscador web sigue dando links. Si se rompe todo, se apunta la
  misma integración a ScrapeCreators (rama `competencia-scrapecreators`) cambiando URL y clave.
- **Datos que se guardan:** cada viral va a `video_virales` con plataforma, país, vistas, me gusta, comentarios,
  compartidos, guardados, mediana del autor y cuántas veces la supera. Hacen falta columnas nuevas: una migración
  chica.
- **Herramientas que no cambian de nombre**, porque la skill `estilos-por-nicho` del kit ya las usa: se amplían
  `lmtmBuscarVirales` (`fuente: "latam"`, `plataforma`, `rubro`) y `lmtmGuardarViral`.
- **Tests con respuestas grabadas** de TikTok, Instagram y Creative Center: si cambian el formato, devuelve «sin datos»
  y no inventa.

**1.1 Rubros.** Prioridad por clientes: inmobiliaria (12 clientes), turismo-hotelería (6),
construcción-materiales (5), industria B2B (5), automotor-autopartes (5). Más un **general**: los formatos que se
viralizan en cualquier rubro. Los demás rubros heredan el general hasta tener datos propios.

**1.2 Universo: Latinoamérica, TikTok e Instagram.**
- **TikTok:** búsqueda por los términos de la fase 0 por rubro y por las semillas del Creative Center, últimos 90
  días.
- **Instagram:** como sin login no se puede buscar por palabra, se va por cuentas, en este orden:
  1. el mismo autor de los virales de TikTok, si tiene Instagram: en LatAm la mayoría publica en las dos redes;
  2. las ~180 cuentas de competencia que ya se miden;
  3. referentes por rubro que propongo yo y corrige el equipo.

  De cada cuenta se leen sus reels con reproducciones y quedan los que superan 3× su mediana.
- **Filtros:**
  - videos en español, de autores de Latinoamérica (idioma, bio, ubicación y país que figure);
  - 90 segundos o menos;
  - se descartan copias, re-subidas y cuentas de recortes.
- **No importa si es competencia o no:** marcas, profesionales y creadores del rubro. Lo que se busca es cómo edita
  lo que funciona.

**1.3 Qué es viral (con vistas, no solo con me gusta).**
- **Contra el propio autor:** vistas ≥ 3× la mediana de sus últimos videos. Controla el tamaño de la cuenta: un
  creador grande no gana por ser grande.
- **Piso por rubro:** el cuarto superior de vistas de las búsquedas de ese rubro. Un rubro B2B no se mide con la vara
  del entretenimiento.
- **Grupo de control:** por cada viral, 1 o 2 videos normales del mismo autor. Así se ve qué cambia en la edición
  cuando el video funciona.
- En Instagram se cruzan las reproducciones con me gusta + comentarios.

**1.4 Muestra.**
- Por rubro prioritario: **≥ 60 virales y ≥ 60 de control**, mitad TikTok y mitad Instagram, de al menos 4 países.
- General: ≥ 100 virales.
- Total: **unos 800 videos.** Se bajan en la PC con `yt-dlp`, de a uno cada 5–10 s, y se borran después de medirlos.

**1.5 Ficha de cada video.**
- *Datos de la red:* plataforma, país, vistas, compartidos, guardados, comentarios, duración, audio original o en
  tendencia.
- *Medido sin IA* (`vtool referencia`, ya existe): cantidad de cortes, plano medio, primer corte, palabras por
  segundo, volumen, brillo, saturación. Va a `video_virales.forma`.
- *Mirado* (hoja de los primeros 3 s a 4 cuadros por segundo + hoja general + transcripción), con **preguntas sí/no
  fijas** que van a `video_virales.respuestas`:
  - **Gancho (0–2 s):** cara en el primer cuadro · texto en pantalla antes de 1 s · pregunta · número o dato ·
    contraste o antes/después · promesa · arranca en medio de la acción · producto o lugar en el primer segundo ·
    movimiento o zoom antes de 1 s.
  - **Edición:** subtítulos palabra por palabra · palabra resaltada · zoom en palabra clave · b-roll sobre la voz ·
    motion (tarjetas, números, flechas) · transiciones · efectos de sonido · música de tendencia · voz en off o a
    cámara · celular o cámara.
  - **Contenido:** persona real del negocio · precio · humor · enseña algo · muestra el resultado · llamado a la
    acción explícito · final que engancha con el principio · marca visible en 0–3 s.
  - Más el tipo de video (de los 10) y el gancho literal.
- En la PC se arman 4 videos por imagen, para gastar menos.

**1.6 Análisis.**
- Por pregunta: qué tanto más aparece en los virales que en los de control, en general y por rubro, tipo, **red**
  (TikTok contra Instagram) y país. Se queda solo lo que tiene muestra (n ≥ 20) y una diferencia clara: ≥ 1,5× es
  regla; ≤ 0,67× es «no hacer».
- Por medida: mediana y rango de virales contra control (duración, plano medio, primer corte, ritmo de la voz).
- Por tipo: estructura típica por tramos (0–3 s, 3–10 s, …), fórmulas de gancho con ejemplo, duración por red.

**1.7 Entregables.**
1. **Informe** general y por rubro, con números y links de ejemplo: `docs/estudio-video/` y un PDF para el equipo.
2. **Virales cargados** en `video_virales` (con forma, respuestas, gancho y notas): se ven en Producción →
   Tipos de video y en `lmtmBuscarVirales`.
3. **Plantillas en borrador** (`video_plantillas`): las 10 generales y las de los rubros prioritarios con datos.
   Cada una con objetivo, duración por red, estructura, ganchos, edición, «no hacer», perfil de vtool y evidencia
   (ids).
4. **Skill `reglas-edicion-viral`:** corta (< 2 KB), lo que Productor y Editor leen siempre. El detalle va en la
   plantilla de cada tipo, que se carga solo cuando hace falta.
5. **Set validado** de unos 100 videos con sus respuestas: el examen con el que después se mide a los agentes
   (fase 6).
6. **La herramienta funcionando** para los agentes (1.0).

**1.8 Validación del equipo.** Revisan las plantillas en el panel y aprueban o corrigen. Las reglas que carga una
persona no las puede sacar un agente (ya funciona así).

**Uso de material ajeno:** los videos de terceros se bajan solo para medirlos y se borran después; quedan las
medidas, las hojas y el link. Nunca se reutilizan tomas, audio ni diseño: se toman técnicas, no looks.

**La competencia de cada cliente** se sigue midiendo como hoy (Instagram, cada 3 h) y sirve para las plantillas de
ese cliente, no para el estudio general.

### Fase 2 — Herramientas de edición (3 días; en paralelo con la fase 1)

1. **vtool del contenedor:**
   - Zoom en la palabra clave con entrada suave, y efectos de sonido. Se pasan del kit de las PC, con el arreglo de
     SAR ya resuelto ahí.
   - Reencuadre 16:9 → 9:16 siguiendo la cara (OpenCV ya está).
   - Corrección básica de exposición y blanco.
   - El perfil de vtool de cada plantilla (`perfil`) maneja pausa, zoom, efectos y volumen.
2. **`preparar_carpeta`** (en lmtm-render, sin agente): de una carpeta del NAS sale un `inventario.json`. Baja de a un
   archivo y lo borra al terminar; por archivo deja duración, rotación, si hay voz, transcripción, tomas, hoja de
   contacto, descripción, **tipo de toma** (habla a cámara / recorrido / testimonio / b-roll / producto) y copia de
   720p. Caché por huella: correrlo dos veces no repite nada.
3. **Plan de piezas sugerido:** agrupa las tomas por tipo y tema, y propone N piezas candidatas con su plantilla.
4. **Render final por tramos:** lee del NAS solo los segundos elegidos (Range), en calidad original.
5. **Pruebas:** el autotest de vtool con zoom y efectos en 2 clips (como el kit), y `preparar_carpeta` contra las 3
   jornadas del banco.

### Fase 3 — Agente Editor (2 días)

1. **Alta en la flota (motor):** modelo como el del Productor (OpenAI vía LiteLLM). Los reintentos no bajan a otro
   modelo (`modelProfiles.cheap.enabled=false`). Carpeta `/tmp/videos`, solo a pedido, con tope de turnos.
2. **Flujo fijo** (objetivo: ≤ 60 turnos por jornada):
   1. `lmtmGuiaContenido` del cliente + `lmtmPlantillaVideo` del tipo.
   2. `preparar_carpeta` → inventario.
   3. **Plan de piezas** como comentario en la tarea: por pieza, tipo, red de destino, tomas, 5 ganchos puntuados y
      duración.
   4. Por pieza: vtool con el perfil del tipo → motion (`filmado.mjs`) → render en lmtm-render.
   5. Revisión: `vtool revisar` + `video_revisar` («¿lo que se dice se ve?») + las reglas de la plantilla.
   6. Entrega: Drive + entregable con tipo y versión de la plantilla → en revisión.
3. **Frenos:** si no hay material para una pieza, no la inventa y lo dice. Precios y promos, solo de la guía. Nada de
   terceros en el gancho. Variedad por cliente (`video_variedad`).
4. **Cómo se le pide:**
   - Producción → «Pedile al Editor»: cliente + carpeta, con buscador del NAS.
   - ~~Etiqueta de ClickUp.~~ Descartado el 18/11 (usuario): al Editor se le pide desde el panel de LMTM.
   - Delegación del Productor.
   - **«Crudos nuevos»:** el índice nocturno del NAS detecta carpetas nuevas de crudos y las muestra con un botón
     «Editar». No arranca solo, para controlar el gasto.
5. **Productor:** se le saca `video-local` y gana «guion de grabación» (lista de tomas por tipo, sacada de la
   plantilla), que deja en la tarea.

### Fase 4 — Validación y salida (2 días)

1. **Bandeja «Validar»** en Producción: el video, «Sirve / No sirve», el motivo en botones (gancho, ritmo, toma,
   subtítulo, marca, dato) y texto libre. «Pedir cambios» vuelve al Editor con el motivo (ya existe para el
   Productor).
2. **Si sirve:** Drive + «Enlace de publicación» en ClickUp → la cadena de publicación de siempre.
3. **Los motivos enseñan:** van como `pieza-veredicto` (la guía los trae siempre) y se cuentan por plantilla, para
   ver qué regla falla más.
4. **Medición** a 24 h y 7 días (`pieza_metricas`, ya existe): rendimiento contra la mediana de la cuenta del
   cliente. A los 30 días se contrasta con las plantillas.
5. **Aviso diario** al equipo: «hay X piezas para validar», en Hoy.

### Fase 5 — Worker en la oficina (solo si la fase 0 lo pide)

Si la subida de la oficina no da para una jornada en un tiempo razonable: `preparar_carpeta` corre en una PC de la
oficina o en el QNAP (Container Station). Se conecta **hacia afuera** con lmtm-os, sin abrir puertos, lee el NAS por
la red local y sube solo las copias de 720p, el inventario y los videos finales.

### Fase 6 — El estudio lo hacen los agentes (después de la validación de la fase 1)

1. **Cómo llegan los agentes:** por herramientas de lmtm-os que llaman a la API `lmtm-redes` del NAS (fase 1.0).
   - `virales_buscar` (rubro, red, términos);
   - `virales_autor` (mediana de una cuenta);
   - `virales_bajar` (video a `/tmp/videos`);
   - más `lmtmBuscarVirales` y `lmtmGuardarViral`, ampliadas.

   No necesitan salir a internet por la oficina ni ver el token.
2. **Rutina semanal** (el agente que ya mide la competencia), con la herramienta de la fase 1.0:
   1. buscar virales nuevos de LatAm por rubro en TikTok e Instagram;
   2. medirlos contra su autor;
   3. bajarlos con `virales_bajar`;
   4. ficha: `vtool referencia` en el contenedor + preguntas sí/no con el modelo de visión;
   5. nueva versión de la plantilla en borrador → la aprueba el equipo.
3. **Examen antes de soltarlo:** el agente analiza 50 videos del set validado y tiene que coincidir **≥ 85 %** con las
   respuestas. Si no, no carga plantillas.
4. **Tendencias de la semana** (audios, formatos, ganchos que suben) en la guía de contenido, con fecha: una tendencia
   de hace un mes ya no es tendencia.

---

## 4. Cómo se mide el éxito

| Medida | Meta |
|---|---|
| Piezas que «sirven» a la primera | ≥ 60 % a las 2 semanas, ≥ 75 % a las 6 |
| Minutos de persona por pieza (validar + corregir) | < 5 |
| Costo por pieza (tokens + créditos) | Medido desde la primera corrida, con tope |
| De la carpeta a las piezas | < 2 h por jornada |
| Rendimiento a 7 días | Las del Editor contra las hechas a mano, en la misma cuenta |
| Estudio | ≥ 800 videos fichados; reglas con n ≥ 20; el agente ≥ 85 % contra el set validado |

## 5. Orden

| Semana | Qué |
|---|---|
| 1 | Fase 0 (día 1) · Fase 1.0, la herramienta (días 2–3) · Fase 1 (días 3–7) · Fase 2 en paralelo (días 4–6) |
| 2 | Fases 3 y 4 · primera jornada real con validación del equipo · ajustes |
| 3 | Fase 6 · rubros que faltan · fase 5 si hace falta |

## 6. Lo que hace falta del equipo

1. **Sin gasto en herramientas:** todo el estudio corre gratis. Lo único que paga es el modelo que mira los videos
   cuando lo hagan los agentes (fase 6), con el tope que ya tiene.
2. Una persona con admin del QNAP (fase 0) para dos cosas: el permiso de escritura e instalar **Container Station**
   para `lmtm-redes`. Claude no escribe contraseñas.
3. Durante el estudio, **esta PC prendida en la oficina**: la API corre acá hasta que esté en el NAS (a veces se abre
   sola una ventana del navegador).
4. OK a los términos de búsqueda por rubro y país (fase 0) y a los referentes de Instagram (fase 1.2).
5. 3 carpetas de jornadas reales para el banco de prueba.
6. Validar el estudio (cierre de la fase 1) y unos 15 minutos por día de piezas desde la fase 3.

## 7. Riesgos

- **La herramienta lee las páginas públicas como un navegador**, no usa una API oficial. TikTok o Instagram pueden
  cambiar la página y romperla: los tests con respuestas grabadas lo detectan el mismo día. Sus términos de uso no
  permiten leer en forma automatizada: por eso solo datos públicos, a ritmo de persona y sin cuentas (no se arriesga
  ninguna cuenta de la agencia). Si algún día se rompe del todo, el reemplazo pago ya está evaluado: ScrapeCreators
  (rama `competencia-scrapecreators`) o Apify.
- **Pueden frenar a la IP de la oficina** si se abusa: tope diario y pausas. Un freno de TikTok o Instagram es
  temporal, pero afecta a quien navegue desde la oficina sin login (con login no).
- **Instagram sin búsqueda:** la muestra de Instagram sale de cuentas elegidas, no de toda la red. Se compensa con los
  autores cruzados desde TikTok.
- **La API en el NAS:** corre en un contenedor sin acceso a las carpetas del NAS (no le hacen falta). Solo escucha por
  Tailscale, con token, en un puerto que la regla de acceso abre únicamente para `tag:agentes`. Los agentes no salen
  por la oficina: piden a la API, y la API pone el ritmo.
- **Pantalla para la búsqueda de TikTok con navegador:** en el contenedor del NAS no hay pantalla. Va con una virtual
  (Xvfb), sin probar todavía. Si TikTok la detecta, queda el buscador web, que ya anda.
- **Tokens:** cada turno de más sube el costo. El flujo fijo y el inventario son para bajar turnos. Medir la primera
  jornada.
- **Deploys:** borran `/tmp`. Mirar corridas activas antes de desplegar.
- **Agentes con Bash:** la escritura en el NAS la limita el permiso del QNAP, no solo el chequeo del servidor.
- **Licencias:** HyperFrames, no Remotion (Remotion pide licencia comercial).
