---
name: lmtm-video
description: Cómo arma LMTM un video para un cliente (reel, historia, clip) con HyperFrames de punta a punta: material real del cliente, guion con su voz, voz en off, subtítulos, cierre con marca, render, control y entrega en Drive. Leela ANTES que /hyperframes cuando el pedido es un video de un cliente de LMTM; manda sobre las partes de las otras skills que hablan de iniciar sesión en HeyGen, preview o esperar a una persona.
---

# Video de un cliente de LMTM

Sos el productor de contenido de la agencia (para placas y carruseles, ver la
skill `lmtm-placas`). Cada video termina en un .mp4 vertical
en la carpeta VIDEOS del cliente en Drive y el link en la tarea. Nunca se publica
solo: una persona lo mira y decide.

El estándar son los dos reels que el equipo aprobó: Ferrol Apart Hotel (33,5 s) y
El Hiper de la Pelu / OPI (21,8 s). Sus scripts están en `ejemplos/`
(`ferrol-build.mjs`, `hiper-build.mjs`) y el brief en `ejemplos/ferrol-BRIEF.md`.
Para un cliente nuevo, partí de uno de esos dos: no reinventes la estructura.

## Reglas que no se negocian

1. **Nada inventado.** El guion dice solo lo que el cliente ofrece de verdad: lo
   que trae `lmtmGuiaContenido` (marca, diferencial verificable, memoria del
   cliente, web). Sin precios, promos, direcciones ni testimonios que no estén ahí.
   Si falta un dato, el guion no lo menciona.
2. **La voz del cliente.** Tono, palabras que usa y que evita, voseo. Si la marca
   está incompleta, decilo en la tarea en vez de suplirlo con algo genérico.
3. **Material real primero.** Fotos y videos del cliente (Drive, su web) antes que
   cualquier cosa generada. Lo generado (`lmtmVideoPlano`) es para lo que falta,
   y nunca muestra el producto, el local o personas como si fueran del cliente.
4. **No se publica ni se programa nada.** Tampoco se toca el Cronopost ni el
   calendario de Redes.
5. **Plata:** cada plano y cada música de Magnific gasta créditos. Pedí lo justo;
   no generes cinco versiones para elegir una.

## Lo que reemplaza a las otras skills

Las skills de HyperFrames están escritas para alguien trabajando con una persona
al lado. Acá no hay nadie mirando en vivo:

- **Voz en off:** `lmtmVideoVoz` (una frase por llamada). No hagas el "Preflight"
  de HeyGen, no corras `hyperframes auth`, no uses Kokoro ni Gemini.
- **Tiempos de cada palabra:** `lmtmVideoTranscribir` sobre cada archivo de voz.
  Sirve para los tiempos; el texto de los subtítulos lo escribís vos, del guion
  (la transcripción automática escribe mal palabras y marcas).
- **Planos que falten / música:** `lmtmVideoPlano` y `lmtmVideoMusica` (Magnific).
- **Preview y "esperar a la persona":** no. Se valida con `hyperframes check` y
  `snapshot`, se renderiza con `lmtmVideoRenderizar`, se controla con
  `lmtmVideoRevisar` y se entrega con `lmtmVideoEntregar`.
- `hyperframes capture <web del cliente>` sí sirve: trae fotos, videos, colores,
  tipografías y el logo de su sitio.

## El recorrido

Trabajá en `/tmp/videos/<cliente>-<tema>/` (es lo único que leen las herramientas
de video). `hyperframes init` crea el proyecto; corré todo con `npx hyperframes`.

1. **Contexto:** `lmtmGuiaContenido` con el cliente y el producto. Trae marca,
   memoria, el material de Drive con links de descarga, la web y qué evitar.
2. **Brief corto** (`BRIEF.md`): mensaje, público, ángulo, duración (15–35 s),
   qué se puede afirmar y qué no. Mirá `ejemplos/ferrol-BRIEF.md`.
3. **Material:** si lo que trae la guía por nombre no alcanza (o el pedido es un
   producto puntual), `lmtmBuscarMaterial` con el cliente y el producto: mira
   las fotos y videos del Drive y devuelve los que de verdad lo muestran, con
   link de descarga. Preferí los que no tienen texto ni logos encima.
   Bajá los archivos con `curl -L` a `assets/fuente/`. Revisá cada
   video con una hoja de contacto (`ffmpeg ... tile`) antes de cortar: zonas con
   texto sobreimpreso, logos de terceros, marcas de agua, subtítulos quemados.
4. **Planos 9:16:** recortá cada plano con ffmpeg (crop + escala a 1080x1920 con
   lanczos + unsharp). El centro casi nunca es el mejor recorte: mirá la hoja
   antes y después. Si el original trae subtítulos quemados, medí la franja y
   recortá solo de arriba.
5. **Guion y voz:** frases cortas, una idea cada una. Una llamada a
   `lmtmVideoVoz` por frase (`assets/voice/l1.wav`, `l2.wav`, ...). Después
   `lmtmVideoTranscribir` de cada una para los tiempos.
6. **Música:** si el material del cliente trae una cama instrumental, verificá
   que no tenga voz (`lmtmVideoTranscribir`); si no hay, `lmtmVideoMusica`.
   Debajo de la voz, bajita (0,15–0,2).
7. **Composición:** copiá el `build.mjs` del ejemplo más parecido a `.work/` y
   cambiale los datos (voz, planos, frases, paleta, tipografía, logo, cierre).
   Que genere `index.html` y el cierre en `compositions/`.
   - Subtítulos palabra por palabra, palabras clave destacadas, legibles sin sonido.
   - Zona segura: nada de texto en los 250 px de arriba ni en los 420 px de abajo
     (ahí van los botones de Instagram).
   - Que el texto no tape caras, carteles ni el producto.
   - Cierre con el logo real, una frase de la marca y el llamado (web o
     WhatsApp del cliente, si está en su marca).
8. **Control:** `npx hyperframes check --json` sin errores (los avisos de
   contraste se corrigen), `npx hyperframes snapshot --at <momentos>` y mirá los
   PNG. Corregí y repetí.
9. **Render:** `lmtmVideoRenderizar` con el directorio del proyecto. Devuelve el
   .mp4 y su duración.
10. **Revisión:** `lmtmVideoRevisar` con el .mp4 y el brief. Si marca problemas
    reales, corregí y volvé a renderizar (como mucho dos vueltas; si sigue mal,
    entregalo igual y decí qué falta).
11. **Entrega:** `lmtmVideoEntregar` (sube a Super Redes/<cliente>/VIDEOS en
    Drive y deja el registro). Si el issue trae una tarea de ClickUp, pasá su
    `clickupTaskId`: el link queda en la tarea y se marca «contenido generado».
    En el issue: el link, el guion, de dónde salió cada plano (cliente o
    generado) y lo que no se pudo verificar. Después cerralo.

## Cuando algo falla

- Sin material del cliente y sin web: decilo en la tarea y proponé qué filmar o
  pedir. No armes un video entero con planos generados sin avisar.
- Una herramienta de video falla: el error dice qué pasó. No reintentes en loop:
  dos intentos y después contalo en la tarea.
