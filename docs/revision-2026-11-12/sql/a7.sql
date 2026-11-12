\echo == COLUMNAS learnings
select string_agg(column_name, ' ') from information_schema.columns where table_name='learnings';
\echo == MEMORIAS QUE ENSENAN A SALTAR EL CERCO (clave y recorte)
select c.name, m.key, m.created_at::date, left(regexp_replace(m.content, E'[\\n\\r]+', ' ', 'g'), 260) from client_memory m left join clients c on c.id=m.client_id
 where m.content ~* 'psql|DATABASE_URL|/proc/|access_token|ads_connections|ssh |crm_claude|printenv|claude-mcp\.json|token de la fila' limit 6;
\echo == LECCIONES DE EQUIPO CON LO MISMO
select count(*) from learnings l where to_jsonb(l)::text ~* 'psql|DATABASE_URL|/proc/|ads_connections|crm_claude|printenv|claude-mcp\.json|token de la fila';
\echo == WA OUTBOX
select estado, count(*), min(created_at)::date, max(created_at)::date from wa_outbox group by 1 order by 2 desc;
\echo == BLOQUEADAS VIEJAS (regla: vencen a 21 dias)
select count(*) n, count(*) filter (where title like '[HUMANO]%') humano, min(updated_at)::date mas_vieja from issues where status='blocked' and updated_at < now()-interval '21 days';
\echo == LUNA: entregables por dia y por cliente (7d)
select d.created_at::date dia, count(*) n, count(distinct d.client_id) clientes, count(*) filter (where d.issue_id is null) sin_tarea from agent_deliverables d join agents a on a.id=d.agent_id where a.name like 'Luna%' and d.created_at > now()-interval '7 days' group by 1 order by 1;
\echo == DERIVACIONES / INTERVENCIONES ABIERTAS
select vigilante, count(*) n, min(created_at)::date mas_vieja, count(*) filter (where created_at < now()-interval '21 days') mas_21d from interventions where resolved_at is null group by 1 order by 2 desc limit 12;
