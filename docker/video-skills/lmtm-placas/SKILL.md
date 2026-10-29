---
name: lmtm-placas
description: Cómo arma LMTM una placa o un carrusel terminado para un cliente (post de feed o historia) con HyperFrames, con el texto, la tipografía, la paleta y el logo de la marca puestos, listo para publicar. Leela cuando el pedido es un post, una placa, un carrusel, tips, una guía o una historia estática.
---

# Placas y carruseles de un cliente de LMTM

La pieza sale TERMINADA: fondo, texto, marca y logo. El texto lo escribís en HTML,
nunca adentro de una imagen generada (los modelos escriben con faltas). Cada pedido
termina en PNG en la carpeta PLACAS del cliente en Drive y el link en la tarea.
Nunca se publica solo.

Valen las mismas reglas que en `lmtm-video`: nada inventado, la voz del cliente,
material real primero, no se publica ni se programa nada, y Magnific gasta créditos.

## Formatos

| Pieza | Tamaño | Notas |
|---|---|---|
| Post o placa de feed | 1080x1350 (4:5) | Lo que más ocupa en el feed. |
| Carrusel | 1080x1350, de 3 a 10 placas | Todas del mismo tamaño y estilo. |
| Historia | 1080x1920 (9:16) | Dejá libres los 250 px de arriba y los 340 de abajo. |

## Cómo se arma

1. **Contexto:** `lmtmGuiaContenido` con el cliente y el tema. Trae marca (paleta,
   tipografías, tono, logo), memoria, el material de Drive con links y la web.
   Si el producto está en el catálogo con su carpeta, bajá las fotos con
   `lmtmDriveBajar`; `lmtmBuscarMaterial` solo si no alcanza.
2. **Textos primero:** escribí el texto de cada placa antes de diseñar.
   - Portada: un gancho de 4 a 9 palabras que haga frenar el dedo.
   - Placas del medio: una idea por placa, 25 palabras como mucho.
   - Última: el llamado concreto (escribinos, reservá, mirá el link) con el dato
     de contacto que esté en la marca.
   - El copy del posteo va aparte, en la entrega.
3. **Imágenes:** fotos reales del cliente antes que nada. `lmtmBuscarMaterial`
   con el cliente y el producto encuentra las que lo muestran aunque el archivo
   se llame DJI_….jpg (preferí las que no tienen texto ni logos encima); también
   sirve `hyperframes capture` de su web. Si falta, `lmtmContenidoImagen` para un fondo o una ilustración
   sin texto. Nunca una imagen generada que parezca el producto o el local real.
4. **Proyecto:** `hyperframes init` en `/tmp/videos/<cliente>-<tema>/`. Una
   composición de `data-width="1080" data-height="1350"` (o 1920 para historia)
   con cada placa como un `.clip` de 1 s: la placa 1 en `data-start="0"`, la 2 en
   `1` y así. `data-duration` del root = cantidad de placas. Sin animación: es una
   foto fija de cada segundo.
5. **Diseño:**
   - Tipografía de la marca con `@font-face` a un archivo local. Si no hay, una de
     Google Fonts parecida, bajada al proyecto.
   - Texto de lectura de 44 px como mínimo y títulos de 80 px o más. Contraste
     alto: si va sobre foto, un degradado o una banda detrás del texto.
   - Márgenes de 80 px. Nada pegado al borde.
   - El logo real del cliente, chico y siempre en el mismo lugar (por ejemplo
     abajo a la derecha). Colores de la paleta, no inventados.
   - Mismo estilo en todas las placas del carrusel. La portada tiene que poder
     funcionar sola en el feed.
6. **Control:** `npx hyperframes check --json` sin errores (los avisos de
   contraste se corrigen). Después
   `npx hyperframes snapshot --at 0.5,1.5,2.5,...` (uno por placa) y mirá cada PNG
   de `.hyperframes/artifacts/snapshots/<id>/`.
7. **Exportar:** copiá esos PNG a `entrega/slide-01.png`, `slide-02.png`, ... en
   orden.
8. **Revisión:** `lmtmVideoRevisar` con `imagenes` (los PNG en orden) y el brief.
   Corregí lo que marque de verdad: como mucho dos vueltas.
9. **Entrega:** `lmtmContenidoEntregarImagenes` con los PNG en orden, el texto de
   cada placa y el copy sugerido en `textos`, y el `clickupTaskId` si el issue lo
   trae. En el issue dejá los links, los textos y de dónde salió cada imagen
   (cliente o generada). Después cerralo.

## Fotos del cliente con su logo (sin diseñar una placa)

Cuando piden «ponele el logo a estas fotos», la foto se queda como está: ni
recorte, ni texto, ni filtro. Solo el logo, igual en todas.

1. **Fotos:** si vienen por link de Drive, `lmtmDriveBajar` con el link y una
   carpeta de trabajo (`/tmp/videos/<cliente>-logo/fuente`). Si dice que no tiene
   acceso, contalo en el issue (hay que compartirla con grow@bylmtm.com) y frená.
2. **Logo:** el de `lmtmGuiaContenido` (PNG con transparencia). Elegí la versión
   que contraste con las fotos: la clara sobre fotos oscuras, la oscura sobre
   claras. Si solo hay uno sin transparencia, decilo en el issue: no lo recortes
   a mano.
3. **Ponerlo, todas igual:** esquina inferior derecha salvo que el pedido diga
   otra cosa, ancho del 18 % de la foto y margen del 4 % del lado más corto.
   ```bash
   mkdir -p entrega
   for f in fuente/*; do
     W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$f")
     H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$f")
     LW=$(( W * 18 / 100 )); M=$(( (W < H ? W : H) * 4 / 100 ))
     ffmpeg -v error -y -i "$f" -i logo.png \
       -filter_complex "[1:v]scale=${LW}:-1[l];[0:v][l]overlay=W-w-${M}:H-h-${M}" \
       -q:v 2 "entrega/$(basename "${f%.*}").jpg"
   done
   ```
   (Probado 29/10. `scale2ref` deforma el logo: no lo uses.) Si el logo cae sobre
   algo importante (una cara, el producto), pasalo a otra esquina en esa foto y
   anotalo.
4. **Mirar:** abrí 2 o 3 resultados. El logo tiene que leerse y no tapar nada.
   Si una foto sale de costado, venía rotada por el celular (EXIF): enderezala
   con `-vf transpose=1` (o `2`) antes de ponerle el logo.
5. **Entrega:** `lmtmContenidoEntregarImagenes` con los JPG (titulo «<Cliente>
   con logo») y dejá los links en el issue.
