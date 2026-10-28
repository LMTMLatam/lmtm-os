---
name: lmtm-ahorro-tokens
description: Cómo trabajar gastando pocos tokens. Lo caro no es lo que escribís sino lo que queda en el contexto, porque se vuelve a leer en CADA turno hasta que termina la corrida. Reglas para pedir datos chicos, cortar temprano y no repetir. Aplica siempre.
---

# Gastar pocos tokens

Una corrida típica lee entre 1 y 2 millones de tokens, casi todo contexto que se
relee turno a turno. Cada cosa que entra (un resultado de herramienta, un archivo,
una página) se paga de nuevo en todos los turnos que siguen. La cuota del modelo
es semanal y la comparte toda la flota: cuando se acaba, se frenan todos.

## Pedí datos chicos

- **SQL (`lmtmSql`):** columnas puntuales, `LIMIT` siempre (20 alcanza casi
  siempre), y agregá en la consulta (`count`, `sum`, `group by`) en vez de traer
  filas para contarlas vos. Nunca `select *`.
- **Bash:** cortá la salida (`| head -40`, `| tail -20`, `grep`, `jq '.campo'`,
  `wc -l`). Un log entero o un JSON crudo puede costar decenas de miles de tokens.
- **Archivos:** buscá primero (`grep -n`) y leé solo el tramo (`Read` con
  `offset`/`limit`). No leas un archivo entero para encontrar una línea.
- **Web:** pedí el dato concreto; no traigas páginas enteras para hojearlas.
- **Herramientas de LMTM:** preferí la que trae todo junto (`lmtmGuiaContenido`,
  `lmtmPortfolioSnapshot`, `lmtmGetClientBrain`) a diez llamadas chicas.

## No repitas

- Lo que ya está en el contexto no se vuelve a pedir: anotá el id o el número
  la primera vez y usalo.
- Si una herramienta falló dos veces igual, no la reintentes en loop: contalo en
  el issue y seguí con otra cosa o terminá.
- Las llamadas que no dependen entre sí, juntas en un mismo turno.

## Cortá temprano

- Si el despertar no tiene nada nuevo (issue sin cambios, nada asignado),
  terminá en uno o dos turnos.
- Plan de tres líneas como mucho y a trabajar. No explores "por las dudas".
- Cuando la tarea está hecha, cerrá: no sigas puliendo.
- No uses `Task` (subagentes) salvo que el trabajo sea grande y paralelo de
  verdad: cada subagente arranca su propio contexto desde cero.

## Escribí poco donde se relee

- Comentarios en issues: cortos, con el dato que decide y el link. No pegues
  tablas o volcados enteros: los vuelve a leer cada agente que abre el issue.
- Skills: leé solo la que necesitás y solo la sección que aplica.
- Ver también la skill `caveman` (modo escueto para el trabajo interno).
