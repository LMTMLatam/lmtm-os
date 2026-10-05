# Buzón entre el chat A y el chat B

Los dos chats del rediseño se hablan por esta rama: `rediseno/buzon`.

- **`A.md`** lo escribe solo el chat A (Datos y agentes; corre en la máquina de
  Nazareno y es el **integrador**: el único que puede mergear a `main`, aplicar
  migraciones y deployar).
- **`B.md`** lo escribe solo el chat B (Decisiones y tablero; corre en la nube).
- Nadie edita el archivo del otro. Por eso no hay conflictos aunque los dos
  pusheen a la misma rama.

## Cómo se usa

En cada vuelta de trabajo:

1. `git fetch origin rediseno/buzon` y leer el archivo del otro:
   `git show origin/rediseno/buzon:docs/rediseno/buzon/B.md` (o `A.md`).
2. Atender los mensajes nuevos (los que están arriba del último que ya
   respondiste).
3. Escribir los tuyos ARRIBA de todo en tu archivo y pushear:
   ```
   git checkout rediseno/buzon && git pull --rebase origin rediseno/buzon
   # editar SOLO tu archivo
   git commit -am "buzon A: <resumen>" && git push origin rediseno/buzon
   ```
   Si el push rebota, `git pull --rebase` y otra vez (son archivos distintos, el
   rebase no choca). Volvé a tu rama de trabajo después.

## Formato de cada mensaje

```
### 2026-10-05 16:40 · LISTO-PARA-INTEGRAR · PR #3
Fase B1, motor de decisiones. Migración 0150 (tabla decisiones, aditiva).
Verificado: ... Queda: ...
```

Tipos:

| Tipo | Quién | Para qué |
|---|---|---|
| `LISTO-PARA-INTEGRAR` | B (o A para lo suyo) | PR listo: tests verdes, verificado. Decir si trae migraciones |
| `INTEGRADO` | A | Mergeado, deployado y verificado en producción. Con la evidencia |
| `FALLO-INTEGRACION` | A | No pasó revisión, tests o verificación en prod. Con el detalle exacto |
| `PEDIDO` | cualquiera | Algo que necesitás del otro (un cambio en su carpeta, un dato, una firma) |
| `RESPUESTA` | cualquiera | Contesta un PEDIDO; citar la fecha del pedido |
| `AVISO` | cualquiera | Algo que el otro tiene que saber (cambio de contrato, hallazgo) |
| `BLOQUEADO` | cualquiera | Solo una persona lo destraba; Nazareno lo lee acá |

## Integración (la hace A)

Para cada `LISTO-PARA-INTEGRAR`: revisar el diff, correr los tests propios y el
typecheck, resguardar las tablas que toque una migración, mergear, deployar,
confirmar la hora del boot, verificar el efecto en producción (consultas con el
rol de solo lectura, GETs, capturas) y contestar `INTEGRADO` o
`FALLO-INTEGRACION`. Si el arreglo es chico y obvio, A lo hace y lo dice; si no,
lo devuelve a B con el detalle.
