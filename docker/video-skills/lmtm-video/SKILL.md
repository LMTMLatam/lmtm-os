---
name: lmtm-video
description: Cómo arma LMTM un video para un cliente (reel, historia, clip) con HyperFrames de punta a punta, con la PLANTILLA del reel aprobado. Material real del cliente, guion con su voz, voz en off, subtítulos, cierre con marca, render, control y entrega en Drive. Leela ANTES que /hyperframes cuando el pedido es un video de un cliente de LMTM; manda sobre las partes de las otras skills que hablan de iniciar sesión en HeyGen, preview o esperar a una persona.
---

# Video de un cliente de LMTM

Sos el productor de contenido de la agencia (para placas y carruseles, ver la
skill `lmtm-placas`). Cada video termina en un .mp4 vertical en la carpeta VIDEOS
del cliente en Drive y el link en la tarea. Nunca se publica solo: una persona lo
mira y decide.

## Qué camino según el material

| Material | Camino |
|---|---|
| Filmado con la voz del cliente: alguien habla a cámara, recorrida, testimonio, entrevista | skill `video-local`: `vtool tomas` y `vtool reel` (un crudo) o `vtool jornada` (varios crudos + guion). Elige las tomas buenas y descarta las de rodaje sola. |
| Voz en off generada + planos del material (fotos y videos sin nadie hablando) | la plantilla de esta skill (lo que sigue) |

Mirá el material antes de elegir: si el audio del video es alguien hablando del producto, ese es el guion; no le
pongas una voz en off encima.

**Siempre, sea cual sea el camino:** antes de `lmtmVideoEntregar`, `vtool revisar <final.mp4>` (además de
`lmtmVideoRevisar`). Si da el volumen fuera de -16 a -12 LUFS, `vtool normalizar <final.mp4>` y entregá el
`__audio.mp4` que sale.

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

Tu trabajo es decidir; lo mecánico lo hace `armar.mjs`:
- elegir el material correcto (leyendo `lmtmVideoDescribir`, no mirando hojas);
- escribir el guion con la voz del cliente, frase por frase, con lo que se VE en cada una;
- cargar todo eso en `guion.json`.

`armar.mjs` corta los planos, pide las voces, saca los tiempos de cada palabra,
arma los subtítulos y `reel.json`, chequea, renderiza y revisa. No escribas
`reel.json` ni `index.html` a mano y no cambies el CSS de la plantilla. Si algo
del diseño no sirve para un cliente, decilo en el issue.

La primera prueba sin plantilla (28/10) salió mal en todo eso: fotos como tarjetas
repetidas, subtítulos chicos arriba con cajitas, sin música, cierre pobre y tomas
de fábrica con papeles para un reel de placares. La v3 de RENO (30/10) repitió 4
videos en 8 cortes y mostraba otra cosa que lo que decía: `armar.mjs` ya no deja
repetir fuentes y la revisión mira frase por frase.

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

## El recorrido (pocos turnos: cada turno reenvía todo el contexto)

Trabajá en `/tmp/videos/<cliente>-<tema>/`. Las herramientas de video solo leen
ahí. `P=/app/video-skills/lmtm-video/plantilla`.

1. **Contexto:** `lmtmGuiaContenido` con el cliente y el producto (marca, paleta,
   logo, memoria, material, web).
2. **Material, en UNA llamada:** si la guía trae el producto en el catálogo con su
   carpeta, `lmtmDriveBajar` con ese link y `carpeta` = `assets/fuente/` del
   proyecto (deja el índice con el id de Drive de cada archivo: sirve para los
   cambios). Si no alcanza, `lmtmBuscarMaterial` y bajá lo elegido con
   `lmtmDriveBajar` (link o id). El logo, a `assets/marca/`.
3. **Qué hay en el material:** `lmtmVideoDescribir` con `carpeta` = `assets/fuente/`
   y `para` = de qué es el video. Devuelve TEXTO: los momentos de cada video con su
   segundo, el foco y si sirve, y una línea por foto. No armes hojas de contacto
   ni las mires: cada imagen se reenvía en todos los turnos que siguen.
   Si dice «ALGUIEN HABLA A CÁMARA», es material filmado con voz: camino vtool.
4. **guion.json** (copiá `$P/guion.ejemplo.json`):
   - De 20 a 35 s: gancho en los primeros 2 s, 3 o 4 frases cortas con el
     diferencial, y el cierre (lo que dice la voz + titular + llamado: web o
     WhatsApp de la marca).
   - Cada frase con sus planos, en orden, elegidos de lo que describió el paso 3
     para que MUESTREN lo que dice («los fabricamos» → la fábrica; «los instalamos»
     → casas; «placares y vestidores» → placares y vestidores). `fuente` = la ruta,
     `desde` = el segundo del momento, `foco` = el que dio, `muestra` = qué se ve.
     8 a 14 planos de fuentes distintas; entra un plano por cada ~1,2 s de frase.
     `realce: true` en tomas lavadas (fábrica en día nublado).
   - `*palabra*` resalta: 2 o 3 por frase, las que importan.
   - `estilo` de la voz adaptado al cliente (el mismo para todo el reel). La voz es
     SIEMPRE Gemini (Sulafat); no pases `proveedor: openai`.
   - `marca`: los colores salen SOLO de la paleta de la guía (leé sus notas: «NO
     usar rojo» en RENO). Marca oscura (negro): `color` y `oscuro` en ese negro,
     `claro` en el claro de la paleta. Logo oscuro de una tinta sobre tomas oscuras:
     `logoBlanco: true`.
   - `musica`: `{ "prompt": … }` para generarla (cálida, sin voces) o
     `{ "archivo": … }` si el cliente tiene una cama instrumental.
5. **Armar:** `node $P/armar.mjs guion.json`. Frena con lo que no cumple (fuentes
   repetidas, frase con más planos de los que entran, toma que no alcanza, logo
   que falta): corregí `guion.json` y volvé a correrlo. Lo que no cambió no se
   rehace, así que repetir es barato. Si dice que no hay cupo de voz, frená:
   contalo en el issue («sin cupo de voz, se retoma mañana») y cerrá la corrida.
6. **Render y control:** `node $P/armar.mjs guion.json --render`. Renderiza, pasa
   `vtool revisar` (y `normalizar` si hace falta), arma `hoja-sincro.jpg` (una foto
   por frase) y pide la revisión frase por frase. Mirá `hoja-sincro.jpg` UNA vez.
   Si la revisión dice que una frase no muestra lo que dice, cambiá ESE plano en
   `guion.json` y repetí el paso; dos vueltas como mucho.
7. **Entrega:** `lmtmVideoEntregar` con el `FINAL` que imprimió el paso 6. Si el
   issue trae una tarea de ClickUp, pasá su `clickupTaskId`. En el issue dejá el
   link, las líneas de SINCRONÍA que imprimió `armar.mjs` (qué se dice → qué se ve)
   y lo que no se pudo verificar. Después cerralo.

## Cambios a un video ya entregado (pedidos desde el panel)

No lo rehagas: `lmtmVideoRetomar` con el `deliverableId` del pedido restaura el
proyecto y te da su `guion.json`. Cambiá SOLO lo pedido, corré
`node $P/armar.mjs <proyecto>/guion.json --render` (las voces y planos que no
cambiaron no se rehacen) y entregá con `lmtmVideoEntregar` y `reemplaza` = ese id.
Si necesitás otra toma, `lmtmVideoDescribir` sobre `assets/fuente/` del proyecto
tiene las descripciones guardadas, y las fuentes que no están se bajan solas.

## Cuando algo falla

- Sin material del producto: decilo en la tarea y proponé qué filmar o pedir.
- Una herramienta falla dos veces igual: contalo en la tarea y seguí o cerrá.
- `ejemplos/hiper-build.mjs` y `ejemplos/ferrol-build.mjs` son los scripts
  originales de los reels aprobados. Sirven de referencia; la plantilla los
  reemplaza.
