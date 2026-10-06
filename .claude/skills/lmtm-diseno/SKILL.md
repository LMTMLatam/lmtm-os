---
name: lmtm-diseno
description: >
  Sistema de diseño propio de LMTM para las pantallas donde se DECIDE: Hoy,
  Cartera, Cliente y el informe para el cliente. Claro, aireado, legible en el
  celular, con la plata y el estado primero. Usar siempre que se cree o se
  toque una de esas pantallas o un componente que vaya en ellas (ui/src/lmtm/,
  ui/src/pages/Hoy.tsx, Cartera, Cliente, PublicDashboard). NO es para la
  pantalla de Operación ni para las de paperclip (agentes, issues, settings):
  ésas siguen con design-guide. Mismo stack (Tailwind 4 + shadcn + radix),
  otros tokens. Usar junto con dataviz para cualquier gráfico.
---

# LMTM: diseño para decidir

El dueño de la agencia dijo que el panel era "feo y complejo" y estuvo por
apagarlo. La guía de paperclip (`design-guide`) es un panel de control denso,
oscuro y para teclado, hecho para desarrolladores: está bien para Operación y
mal para alguien que abre el celular a las 9 de la mañana para ver qué hay que
hacer. Este sistema existe para esa persona.

## Las cinco reglas

1. **La plata primero.** Si una pantalla tiene un número de plata, es lo más
   grande y lo primero que se lee. Un solo número héroe por pantalla (≥ 44 px en
   el celular). En las listas, la plata va en una columna a la derecha, alineada,
   para leerla de arriba abajo sin leer el resto.
2. **El estado con ícono y palabra, nunca solo color.** Los cuatro colores de
   estado (bien, atención, serio, crítico) están reservados: no se usan para
   decorar ni para una serie de un gráfico. Siempre van con un ícono y una
   etiqueta ("Incidente", "Fallando", "Al día").
3. **Aire en vez de cajas.** Separar con espacio y líneas finas (1 px), no con
   tarjetas, bordes gruesos ni sombras. Una tarjeta se gana su borde solo si es
   un objeto que se mueve o se toca entero.
4. **Una acción principal por fila.** Cada decisión tiene UN botón que dice lo
   que hace ("Subir a $18.000", "Asignar al equipo", "Pedir la recarga"), y
   "Descartar" como secundario. Nada de tres botones iguales en cada fila.
5. **Castellano desde el lado de quien usa.** "Plata parada por día", no
   "ARS/día en juego". "La cuenta no nos da permiso", no "403 en el sync". Sin
   jerga del sistema (TCPL, sync, mapping, payload, estado `abierta`). Lo que no
   se pudo medir dice "sin dato", nunca 0.

## Tokens

Viven en `ui/src/index.css`, bajo `.lmtm`, y se usan con las clases de Tailwind
registradas en `@theme` (`bg-l-papel`, `text-l-tinta`, `border-l-linea`, …).
Detalle y contrastes medidos en `references/tokens.md`.

| Rol | Claro | Oscuro | Para qué |
|---|---|---|---|
| `papel` | `#f6f5f1` | `#101116` | fondo de página |
| `superficie` | `#ffffff` | `#191b22` | lo que flota (diálogos, menús) |
| `tinta` | `#161922` | `#f4f3ef` | texto principal y plata |
| `tinta-2` | `#4a4e5a` | `#bfc2cc` | texto secundario, el "por qué" |
| `tinta-3` | `#666a77` | `#9a9daa` | notas, "sin dato", fechas |
| `linea` | `#e7e5df` | `#2a2d36` | separadores de 1 px |
| `marca` | `#3545d6` | `#8f98ff` | links y acciones de texto (índigo LMTM) |
| `bien` / `atencion` / `serio` / `critico` | `#0ca30c` / `#fab219` / `#ec835a` / `#d03b3b` | iguales | estado, siempre con ícono y palabra |

- **El modo oscuro es elegido, no invertido**: cada token tiene su valor oscuro
  propio, medido contra el papel oscuro. Los cuatro de estado no cambian (son de
  la paleta validada de dataviz y pasan 3:1 en los dos fondos).
- **El claro es el de por defecto.** El oscuro se elige con el botón de la luna
  y se recuerda en el navegador (`lmtm.tema`). No sigue al tema de paperclip: son
  pantallas distintas con públicos distintos.

## Tipografía

Poppins (la de la marca, ya cargada en la app), en 400 / 500 / 600.

| Uso | Tamaño | Peso |
|---|---|---|
| Plata héroe | 52 px (44 en pantallas < 360 px) | 600, `letter-spacing: -0.03em`, cifras proporcionales |
| Título de pantalla | 15 px | 600 |
| Encabezado de franja | 13 px, mayúsculas, `tracking .08em` | 600 |
| Qué hacer (la línea principal) | 16–17 px, interlineado 1.4 | 500 (600 en incidentes) |
| Cliente | 12 px, mayúsculas, `tracking .06em` | 600 |
| Por qué | 14 px, interlineado 1.5 | 400, `tinta-2` |
| Plata en lista | 20 px | 600; la unidad ("por día") en 11 px `tinta-3` |

- Cifras **proporcionales** en números grandes sueltos; `tabular-nums` solo en
  columnas que se alinean (tablas de Cartera).
- Pesos argentinos con punto de miles: `$48.217`. Siempre se dice la unidad:
  "por día", "en 14 días".

## Espacio y toque

- Margen lateral 16 px en el celular; ancho de lectura máximo 680 px.
- Entre franjas, 36 px. Entre filas de una lista, 18 px arriba y abajo con una
  línea de 1 px.
- Todo lo que se toca mide **≥ 44 px** de alto. Los botones tienen 10 px de radio.

## Componentes (en `ui/src/lmtm/`)

- `LmtmPantalla`: el contenedor. Pone los tokens, el tema y el encabezado
  (marca · nombre de la pantalla · fecha · luna). Sin la barra lateral de
  paperclip.
- `Franja`: el encabezado de un bloque ("INCIDENTES 3"), con ícono si es de
  estado.
- `Plata`: un monto. `null` → "sin dato" en itálica `tinta-3`, nunca "$0".
- `PorQue`: la frase y hasta 3 números, cada uno como línea "etiqueta: valor".
- `AccionesDecision`: el botón principal y "Descartar" (con motivo
  obligatorio). Lo que toca la pauta se ensaya antes de confirmar.
- `FilaDecision`: número, cliente, qué hacer, por qué y la plata a la derecha;
  los botones abajo, a lo ancho.
- `BloqueIncidente`: regla izquierda crítica de 3 px, lavado crítico al 6 % que
  se desvanece, cliente, qué, por qué, plata y acción.
- `BarraCobertura` + `LeyendaCobertura`: barra apilada de 12 px con 2 px de
  separación entre tramos y la leyenda con ícono y palabra (regla de dataviz).

Detalle de cada uno en `references/componentes.md`.

## Gráficos

Siempre con la skill `dataviz`: un solo eje, nunca dos escalas; los colores de
estado no se usan como series; leyenda con ícono y palabra; cada gráfico tiene
su versión en tabla o los números a la vista.

## Cómo saber si quedó bien

- Abrilo a 390 px de ancho. ¿Se entiende qué hay que hacer sin scrollear de
  costado ni ampliar?
- Tapá los colores (escala de grises). ¿Se sigue entendiendo qué es un incidente?
- ¿Hay algún número sin unidad, o algún 0 que en realidad es "no sé"?
- ¿Aparece alguna palabra que el dueño no usaría?
- ¿Hay más de un botón lleno por fila?
