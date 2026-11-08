# Referencias de motion (de afuera)

Videos terminados de la colección pública `yihui-dev/awesome-claude-motion-videos` (134 piezas de X, revisada el
08/11/2026). Se toma la **técnica**, nunca el material: los videos, la música y las marcas son de sus autores.

Leela solo si el pedido pide «algo distinto», un explicativo o un dato animado. El diseño sigue siendo la plantilla:
estas referencias sirven para elegir el inserto y ordenar el guion, no para dibujar a mano.

## Lo que se traduce con lo que ya tenemos

| Referencia | Qué hace bien | Con qué lo hacemos | Rubro |
|---|---|---|---|
| Receta de Negroni (ror_fly, 30 s) | Un paso por escena: tarjeta «PASO 2 DE 6», medida grande, y abajo una barra de pasos que se van tildando. El vaso se llena paso a paso. | `pasos` (2 a 4 pasos, con `nota` para la medida). La barra tildada ya la tiene `lista`. | Gastronomía, instalación, cómo se pide |
| Números de la semana de un taller (atsurokishii, 30 s) | Cada escena es UN número con su título-conclusión («Solo el miércoles faltó»), el dato fuera de lo normal en otro color y al final una lista de qué hacer. | `numero` con `texto` como conclusión, y `lista` para cerrar. | Informes, resultados |
| Ventas del mes contra el objetivo (gmotenbinai, 10 s) | Las barras entran una por una y la última termina en un número grande. | `numero` con `barras` (los valores reales, en orden). | Resultados con datos reales |
| Financiación de facturas (pablomanjarress, 15 s) | Tarjetas que se ordenan, un clic, y el total se actualiza en grande. Fondo oscuro, un solo color de acento. | `pantalla` (clic sobre la web real) y después `numero`. | Servicios, financieras |
| Inspección de techo (everestchris6, 29 s) | Abre con un detalle real en primer plano y una palabra gigante («SMALL DETAILS»). Las opciones aparecen en 3 tarjetas («Mantener / Reparar / Reemplazar»). Cierra con «Te contactamos» y una confirmación. | Gancho por palabra + `lista` de 3 opciones + `chat` para el pedido. | Oficios, construcción, servicios a domicilio |
| Una forma, doce estados (twoclipping, 14 s) | Una sola pieza de interfaz que cambia sin cortes: un botón, después un reproductor, después un gráfico. | `pantalla` con un único `foco` claro. | Apps, tiendas online |

## Lo que hoy NO se puede (no lo prometas)

- **Despiece por capas** (el techo que se abre en tejas, membrana y vigas): necesita un modelo 3D o capas dibujadas.
- **De la maqueta al render** (una casa que pasa de líneas a terminada, de día a noche; techartist_, 19 s): necesita
  3D o renders reales del proyecto. Con renders REALES del cliente, en orden, se puede pedir como fotos del filmado.
- **Manual paso a paso en 3D** (la huerta elevada; skylartkitchen, 41 s), showreels tipográficos (pankajkumar_dev,
  m1n9_k7), dibujos animados y escenas de three.js: otra plantilla.

Si el pedido necesita una de estas, decilo en el issue en lugar de improvisar el diseño.

## Reglas al usarlas

- Nada inventado: cada número, paso y precio sale de la guía o del pedido, como en cualquier inserto.
- No copies textos, marcas ni la paleta de la referencia. La paleta y la tipografía son las del cliente.
- Un explicativo largo (más de 60 s) no es un reel: pedí el formato en el issue.
