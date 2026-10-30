---
name: lmtm-video
description: Cómo arma LMTM un video para un cliente (reel, historia, clip) con HyperFrames de punta a punta, con la PLANTILLA del reel aprobado. Material real del cliente, guion con su voz, voz en off, subtítulos, cierre con marca, render, control y entrega en Drive. Leela ANTES que /hyperframes cuando el pedido es un video de un cliente de LMTM; manda sobre las partes de las otras skills que hablan de iniciar sesión en HeyGen, preview o esperar a una persona.
---

# Video de un cliente de LMTM

Sos el productor de contenido de la agencia (para placas y carruseles, ver la
skill `lmtm-placas`). Cada video termina en un .mp4 vertical en la carpeta VIDEOS
del cliente en Drive y el link en la tarea. Nunca se publica solo: una persona lo
mira y decide.

## El diseño NO lo inventás: usás la plantilla

El equipo aprobó un estándar, y el diseño ya está resuelto en
`plantilla/plantilla-reel.mjs`, en la carpeta de esta skill
(`/app/video-skills/lmtm-video/plantilla/`):
- planos a pantalla completa con empuje suave;
- velo para leer;
- logo fijo arriba;
- subtítulos grandes palabra por palabra con marcador del color de la marca;
- cierre con logo, titular, botón, web, palabra fantasma y mancha de color.

**Mirá `ejemplos/estandar-hiper.jpg` antes de empezar: así tiene que verse.**

Tu trabajo es lo que la plantilla no puede hacer sola:
- elegir el material correcto y recortarlo bien;
- escribir el guion con la voz del cliente;
- generar la voz;
- cargar los datos en `reel.json`.

No escribas `index.html` a mano y no cambies el CSS de la plantilla. Si algo del
diseño no sirve para un cliente, decilo en el issue.

La primera prueba sin plantilla (28/10) salió mal en todo eso: fotos como tarjetas
repetidas, subtítulos chicos arriba con cajitas, sin música, cierre pobre y tomas
de fábrica con papeles para un reel de placares.

## Reglas que no se negocian

1. **Nada inventado.** El guion dice solo lo que trae `lmtmGuiaContenido`: marca,
   diferencial verificable, memoria del cliente y web. Sin precios, promos,
   direcciones ni testimonios que no estén ahí.
2. **La voz del cliente.** Tono, palabras que usa y que evita, voseo.
3. **Material real del PRODUCTO.** Cada plano muestra el producto, su uso o el
   local. Nada de oficinas, papeles, depósitos ni máquinas, salvo que el pedido
   sea sobre eso. Lo generado (`lmtmVideoPlano`) es solo para lo que falta, y
   nunca hace pasar algo por el producto, el local o la gente del cliente.
4. **No se publica ni se programa nada.**
5. **Plata:** cada plano y cada música de Magnific gasta créditos. Pedí lo justo.

## El recorrido

Trabajá en `/tmp/videos/<cliente>-<tema>/`. Las herramientas de video solo leen
ahí. `P=/app/video-skills/lmtm-video/plantilla`.

1. **Contexto:** `lmtmGuiaContenido` con el cliente y el producto (marca, paleta,
   logo, memoria, material, web).
2. **Material:**
   - Si la guía trae el producto en el **catálogo con su carpeta**, bajala con
     `lmtmDriveBajar` (link de la carpeta, destino `assets/fuente/`). Es el camino
     corto: no hace falta buscar.
   - Si no está o no alcanza, `lmtmBuscarMaterial` con el cliente y el producto
     («placard», «frascos de OPI»): devuelve lo que MUESTRA el producto. Bajalos
     con `curl -L` a `assets/fuente/`.
   - Elegí entre 8 y 14, videos antes que fotos, sin texto ni logos encima.
3. **Mirar antes de cortar:** `node $P/plano.mjs hoja assets/fuente/X.mp4 hoja-X.jpg`
   y abrí la hoja. Elegí el segundo y la franja de cada plano.
4. **Planos 9:16:**
   `node $P/plano.mjs corte assets/fuente/X.mp4 assets/planos/p01.mp4 --desde 3.2 --dur 2.4 --foco 0.4 --lento 0.85`
   - Un plano por corte, de 1,5 a 3 s, entre 8 y 14 planos distintos.
   - `--foco` elige la franja: 0 = izquierda, 1 = derecha. El centro casi nunca es el mejor.
   - Las fotos salen .jpg y la plantilla les pone movimiento.
   - El plano sale más grande que la pantalla a propósito (el zoom de la
     plantilla no lo agranda). Si `plano.mjs` avisa «OJO: … se va a ver blando»,
     la fuente es chica: buscá otra toma del mismo producto.
5. **Guion:** de 20 a 35 s.
   - Gancho en los primeros 2 s.
   - 3 o 4 frases cortas con el diferencial.
   - Cierre con titular corto y el llamado: web o WhatsApp de la marca.
6. **Voz:** `lmtmVideoVoz`, una llamada por frase (`assets/voice/l1.wav`, `l2.wav`…),
   con el MISMO `estilo` en todas, adaptado al cliente. Por ejemplo: «Mujer
   argentina con acento rioplatense natural. Voz cálida, segura, con una sonrisa en
   la voz, como alguien que le recomienda algo a una amiga. Sin tono de locutora».
   Después, `lmtmVideoTranscribir` de cada archivo para los tiempos de cada palabra.
7. **Música:** siempre.
   - Si el material del cliente trae una cama instrumental, verificala con `lmtmVideoTranscribir`.
   - Si no hay, `lmtmVideoMusica` («cálida, acústica, moderna, sin voces, 90 bpm»).
   - Va a `assets/audio/`.
8. **reel.json:** copiá `$P/reel.ejemplo.json` y cambiá los datos.
   - `voz`: archivo y `desde` (segundo global en que arranca cada frase). Encadenalas, unos 0,1 s de aire entre una y otra.
   - `planos`: archivo, `desde` y `dur`. Tienen que cubrir todo hasta el cierre, sin huecos.
   - `frases`: los subtítulos. Cada palabra con el segundo en que se dice (de la transcripción más el `desde` de su voz) y `1` en las 2 o 3 palabras clave. Texto del GUION, no de la transcripción. Ninguna frase termina después de `cierre.desde`.
   - `marca`: el logo real (PNG nítido; si el de la guía es chico, buscá otro con `lmtmBuscarMaterial «logo»`), `color` de la paleta del cliente y `colorTexto` (más oscuro, para el titular).
     - Los colores salen SOLO de la paleta de la guía; leé sus notas («NO usar rojo» en RENO). Nunca un color que no esté ahí.
     - Si la marca es oscura (negro o casi negro), poné `color` en ese tono, `claro` en el claro de la paleta y `oscuro` en el negro: la plantilla pasa el resaltado a claro con letra oscura sola.
     - Si el logo es oscuro de una sola tinta y las tomas son oscuras, `logoBlanco: true` (arriba sale blanco; el cierre usa el original).
   - `cierre`:
     - `desde` (cuando arranca la última frase de voz);
     - `titulo` (palabras con su segundo, de la voz del cierre);
     - `etiqueta`: dato real corto, como «ROSARIO · +1.500 PRODUCTOS»;
     - `cta` y `url`;
     - `fantasma`: una palabra de la marca o del producto, en marca de agua.
   - `musica`: archivo y volumen entre 0,2 y 0,3.
9. **Armar:** `node $P/plantilla-reel.mjs reel.json`. Si dice que algo no cumple el
   estándar, corregí reel.json; no toques la plantilla. Después
   `npx hyperframes check --json`, sin errores.
10. **Mirar:** `npx hyperframes snapshot --at <6 a 8 momentos>` y compará con
    `ejemplos/estandar-hiper.jpg`. Revisá:
    - si cada plano muestra el producto;
    - si algún recorte corta caras o el producto;
    - si los subtítulos se leen.
    Corregí y repetí.
11. **Render:** `lmtmVideoRenderizar` con el directorio del proyecto, y
    `lmtmVideoEstado` hasta que esté.
12. **Revisión:** `lmtmVideoRevisar` con el .mp4 y el brief. Corregí lo que marque
    de verdad, dos vueltas como mucho.
13. **Entrega:** `lmtmVideoEntregar`. Si el issue trae una tarea de ClickUp, pasá
    su `clickupTaskId`. En el issue dejá el link, el guion, de dónde salió cada
    plano y lo que no se pudo verificar. Después cerralo.

## Cuando algo falla

- Sin material del producto: decilo en la tarea y proponé qué filmar o pedir.
- Una herramienta falla dos veces igual: contalo en la tarea y seguí o cerrá.
- `ejemplos/hiper-build.mjs` y `ejemplos/ferrol-build.mjs` son los scripts
  originales de los reels aprobados. Sirven de referencia; la plantilla los
  reemplaza.
