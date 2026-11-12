\echo == FUGAS EN CORRIDAS (7d): patrones en stdout_excerpt
select p.pat, count(*) corridas, count(distinct r.agent_id) agentes, max(r.created_at)::timestamp(0) ultima,
 string_agg(distinct split_part(a.name,' ',1), ',') quienes
from (values ('/proc/[0-9a-z]+/environ'),('printenv|\menv\M \|'),('psql |DATABASE_URL|postgres://'),('claude-mcp\.json'),('/app/server|/app/\.paperclip|/app/\.ssh'),
 ('graph\.facebook\.com'),('googleads\.googleapis'),('82\.29\.56\.162|ssh '),('api\.clickup\.com'),('hook\.[a-z0-9]+\.make\.com|make\.com/api'),
 ('EAA[A-Za-z0-9]{20,}'),('pk_[0-9]+_[A-Z0-9]{20,}'),('sk-[A-Za-z0-9_-]{20,}'),('ya29\.[A-Za-z0-9_-]{20,}'),('tskey-'),('Permission denied|EACCES'),('nmap|nc -z|/dev/tcp/')) p(pat)
join heartbeat_runs r on r.created_at > now()-interval '7 days' and r.stdout_excerpt ~* p.pat
join agents a on a.id=r.agent_id group by 1 order by 2 desc;
\echo == MEMORIA DE CLIENTE
select count(*) total, count(*) filter (where client_id is null) sin_cliente,
 count(*) filter (where content ~ '[Ѐ-ӿ　-ヿ一-鿿가-힯]') otro_alfabeto,
 count(*) filter (where created_at > now()-interval '7 days') nuevas_7d from client_memory;
\echo == MEMORIA QUE NOMBRA A OTRO CLIENTE (posible contaminacion)
select c.name dueno, c2.name nombrado, count(*) n from client_memory m join clients c on c.id=m.client_id
 join clients c2 on c2.id<>m.client_id and length(trim(c2.name))>=6 and c2.status='active' and m.content ilike '%'||trim(c2.name)||'%'
 where c.name not ilike '%'||trim(c2.name)||'%' and trim(c2.name) not ilike '%'||c.name||'%' and c.name not in ('LMTM','Agencia LMTM','LMTM Latam')
 group by 1,2 order by 3 desc limit 20;
\echo == ENTREGABLES 14D
select a.name, count(*) n, count(*) filter (where d.client_id is null) sin_cliente, count(*) filter (where d.issue_id is null) sin_tarea,
 count(*) filter (where d.content ~ '[Ѐ-ӿ　-ヿ一-鿿가-힯]') otro_alfabeto
from agent_deliverables d left join agents a on a.id=d.agent_id where d.created_at > now()-interval '14 days' group by 1 order by 2 desc;
\echo == ENTREGABLE CON CLIENTE X QUE EN EL TITULO NOMBRA A Y
select c.name dueno, c2.name en_titulo, count(*) n, max(d.created_at)::date ult from agent_deliverables d join clients c on c.id=d.client_id
 join clients c2 on c2.id<>d.client_id and length(trim(c2.name))>=6 and d.title ilike '%'||trim(c2.name)||'%'
 where d.created_at > now()-interval '30 days' and c.name not ilike '%'||trim(c2.name)||'%' and trim(c2.name) not ilike '%'||c.name||'%'
 group by 1,2 order by 3 desc limit 15;
\echo == TAREA CON CLIENTE X QUE EN EL TITULO NOMBRA A Y (abiertas)
select c.name dueno, c2.name en_titulo, count(*) n from issues i join clients c on c.id=i.client_id
 join clients c2 on c2.id<>i.client_id and length(trim(c2.name))>=6 and i.title ilike '%'||trim(c2.name)||'%'
 where i.status not in ('done','cancelled') and c.name not ilike '%'||trim(c2.name)||'%' and trim(c2.name) not ilike '%'||c.name||'%'
 group by 1,2 order by 3 desc limit 15;
\echo == TAREAS ABIERTAS SIN CLIENTE POR ORIGEN
select origin_kind, count(*) n, count(*) filter (where client_id is null) sin_cliente from issues where status not in ('done','cancelled') group by 1 order by 2 desc;
