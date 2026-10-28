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
