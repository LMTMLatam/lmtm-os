# Tokens de LMTM: valores y contrastes medidos

Medidos con `contrast()` del validador de la skill `dataviz`
(`scripts/validate_palette.js`). Objetivo: 4,5:1 para texto normal, 3:1 para
texto grande y marcas.

## Claro

| Token | Hex | sobre superficie `#ffffff` | sobre papel `#f6f5f1` |
|---|---|---|---|
| tinta | `#161922` | 17,55 | 16,09 |
| tinta-2 | `#4a4e5a` | 8,31 | 7,61 |
| tinta-3 | `#666a77` | 5,39 | 4,94 |
| marca | `#3545d6` | 7,06 | 6,47 |
| critico (texto) | `#d03b3b` | 4,80 | 4,40 → solo en ≥ 14 px seminegrita o con ícono |
| bien (texto) | `#0b7a0b` | 5,52 | 5,06 |
| atencion (texto) | `#8a5a00` | 5,93 | 5,43 |

`tinta-3` empezó en `#6f7380` y daba 4,34 sobre papel: se oscureció a
`#666a77` para pasar 4,5.

## Oscuro

| Token | Hex | sobre superficie `#191b22` | sobre papel `#101116` |
|---|---|---|---|
| tinta | `#f4f3ef` | 15,49 | 16,98 |
| tinta-2 | `#bfc2cc` | 9,67 | 10,60 |
| tinta-3 | `#9a9daa` | 6,37 | 6,98 |
| marca | `#8f98ff` | 6,64 | 7,28 |
| critico (texto) | `#ef6b6b` | 5,72 | 6,27 |
| bien (texto) | `#3cc23c` | 7,35 | 8,06 |
| atencion (texto) | `#fab219` | 9,37 | 10,28 |

## Estado (fijos, de la paleta de dataviz)

| Rol | Hex | Uso |
|---|---|---|
| bien | `#0ca30c` | marca de "al día" |
| atencion | `#fab219` | marca de "atrasada" (bajo 3:1 en claro: siempre con ícono y palabra) |
| serio | `#ec835a` | reservado |
| critico | `#d03b3b` | regla de incidente, marca de "fallando" |
| neutro | `#c9c6bd` / `#4a4d57` | "sin pauta corriendo" (no es un problema) |
| neutro-2 | `#dcd8ce` / `#30333c` | "sin conectar" (un paso más oscuro que la línea, para que el tramo se vea sobre el papel) |

Los colores de estado son para marcas (regla, punto, tramo de barra, ícono). El
texto que los acompaña va en `tinta` o `tinta-2`; si una palabra de estado
tiene que ir en color, usa el "texto" de la tabla de arriba.
