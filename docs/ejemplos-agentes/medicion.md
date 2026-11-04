# Medición de variedad

Compara lo que entregan los agentes antes y después del 04/11/2026, cuando se cargaron las skills de ejemplo y se sacaron los formatos obligatorios.

## Punto de partida (30 días hasta el 04/11)

| Sector | Medida | Antes |
|---|---|---|
| Estrategia | Planes con las secciones Radiografía, Ideas creativas y Fallos | 220 de 229 |
| Estrategia | Planes que citan el mismo promedio de la agencia (3,4x) | 21 de 229 |
| SEO | Notas sobre «agencia agéntica» desde julio | 19 de 31 |
| Contenido | Guiones que arrancan con «HOOK (0-3 s)» | 39 de 41 |
| Pauta | Propuestas pendientes, sumando todos los clientes | 21 |
| Flota | Corridas exitosas del 28/10 al 04/11 | 88 de 239 |

## Cómo medir después

Reemplazar `:desde` por la fecha del deploy. Con menos de 10 planes o 5 guiones, decir que la muestra no alcanza.

```sql
-- Planes: forma y largo
select count(*) planes,
  count(*) filter (where content ilike '%## Radiografía%' and content ilike '%## Ideas creativas%' and content ilike '%## Fallos%') mismo_esqueleto,
  count(*) filter (where content ilike '%3,4x%' or content ilike '%3.4x%') promedio_agencia,
  count(*) filter (where client_id is null) sin_cliente,
  percentile_cont(0.5) within group (order by length(content)) largo_mediano,
  min(length(content)) largo_min, max(length(content)) largo_max
from agent_deliverables where title like 'Plan de acción%' and created_at >= :desde and length(content) > 100;

-- Primeras palabras repetidas entre planes
select left(regexp_replace(content, '\s+', ' ', 'g'), 40) apertura, count(*)
from agent_deliverables where title like 'Plan de acción%' and created_at >= :desde
group by 1 having count(*) > 1 order by 2 desc limit 10;

-- Blog
select created_at::date, title from agent_deliverables
where title like 'Nota blog:%' and created_at >= :desde order by 1;

-- Guiones: forma
select count(*) guiones,
  count(*) filter (where content ~* 'HOOK \(0.{1,3}3') hook_0_3,
  count(distinct client_id) clientes
from agent_deliverables where title like 'Guion:%' and created_at >= :desde;

-- Pauta: propuestas
select status, count(*) from approvals
where type = 'accion_pauta' and created_at >= :desde group by 1;

-- Salud de las corridas
select count(*) corridas, count(*) filter (where status = 'succeeded') exitosas,
  count(*) filter (where error_code = 'max_turns_exhausted') tope_turnos,
  count(*) filter (where status = 'timed_out') timeout
from heartbeat_runs where created_at >= :desde;
```

Además de contar, leer tres entregas de cada sector: que tengan otra forma no alcanza si no sirven para decidir.
