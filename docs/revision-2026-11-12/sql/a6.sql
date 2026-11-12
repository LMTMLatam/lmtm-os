\echo == TABLAS
select string_agg(table_name, ' ' order by table_name) from information_schema.tables where table_schema='public' and (table_name ~ 'lesson|learn|memory|decision|outbox|interven|skill|secret|insight|organic|script|respaldo|backup|bak');
\echo == MEMORIA/LECCIONES QUE ENSENAN A SALTAR EL CERCO
select 'client_memory' src, count(*) from client_memory where content ~* 'psql|DATABASE_URL|/proc/|access_token|ads_connections|ssh |crm_claude|printenv|claude-mcp\.json|token de la fila';
\echo == FRESCURA PAUTA (por plataforma)
select platform, max(date) ult_dia, count(distinct client_id) filter (where date >= current_date-3) clientes_3d, count(distinct client_id) filter (where date >= current_date-30) clientes_30d from ads_insights group by 1;
\echo == CLIENTES CON GASTO 30D Y SIN DATO HACE 3+ DIAS
select c.name, i.platform, max(i.date) ult, round(sum(i.spend) filter (where i.date>=current_date-30)) gasto30 from ads_insights i join clients c on c.id=i.client_id
 where i.date >= current_date-30 group by 1,2 having max(i.date) < current_date-3 and sum(i.spend) > 0 order by 4 desc limit 15;
\echo == APROBACIONES PENDIENTES
select type, count(*) n, min(created_at)::date mas_vieja, count(*) filter (where created_at < now()-interval '7 days') mas_7d from approvals where status='pending' group by 1 order by 2 desc;
\echo == TAREAS ABIERTAS POR ESTADO Y EDAD
select status, count(*) n, count(*) filter (where updated_at < now()-interval '14 days') sin_mov_14d, count(*) filter (where updated_at < now()-interval '21 days') sin_mov_21d from issues where status not in ('done','cancelled') group by 1 order by 2 desc;
\echo == RESPALDOS SUELTOS EN LA BASE
select table_name from information_schema.tables where table_schema='public' and table_name ~ '^respaldo|_bak|backup' order by 1;
