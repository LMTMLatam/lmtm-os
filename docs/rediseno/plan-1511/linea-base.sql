-- Línea de base del plan 15/11 (solo lectura). Correr con el rol lmtm_lectura o en transacción read only.

-- (aud2.sql)
select 'cols_clients', string_agg(column_name, ',') from information_schema.columns where table_name='clients';
select 'cols_brand', string_agg(column_name, ',') from information_schema.columns where table_name='client_brand';
select 'cols_memory', string_agg(column_name, ',') from information_schema.columns where table_name='client_memory';
select 'clientes', status, count(*) from clients group by 2;
select 'meta_keys', k, count(*) from clients, jsonb_object_keys(coalesce(metadata,'{}'::jsonb)) k where status='active' group by k order by 3 desc;
select 'memoria_por_tipo', kind, count(*), count(distinct client_id) from client_memory group by kind order by 3 desc;
select 'memoria_dist', percentile_cont(0.5) within group (order by n), max(n), min(n) from (select client_id, count(*) n from client_memory group by 1) t;
select 'activos_sin_memoria', count(*) from clients c where status='active' and not exists (select 1 from client_memory m where m.client_id=c.id);
select 'activos_sin_marca', count(*) from clients c where status='active' and not exists (select 1 from client_brand b where b.client_id=c.id);
select 'activos_sin_productos', count(*) from clients c where status='active' and not exists (select 1 from client_products p where p.client_id=c.id);
select 'activos_sin_competidores', count(*) from clients c where status='active' and not exists (select 1 from competitors p where p.client_id=c.id);
select 'entregables_tipo', kind, count(*) from agent_deliverables group by kind order by 3 desc limit 12;
select 'decisiones', estado, count(*) from decisiones group by 2;
select 'trabajos_30d', estado, count(*) from agente_trabajos where creado_en > now()-interval '30 days' group by 2;
select 'runs_7d', status, count(*) from heartbeat_runs where created_at > now()-interval '7 days' group by 2;

-- (aud3.sql)
select 'marca', count(*) total, count(nullif(tono,'')) tono, count(nullif(publico,'')) publico, count(nullif(diferencial,'')) diferencial, count(nullif(mensaje,'')) mensaje, count(logo_url) logo, count(*) filter (where jsonb_array_length(coalesce(colores,'[]'::jsonb))>0) colores, count(*) filter (where updated_by is not null and updated_by not ilike '%auto%' and updated_by not ilike '%sistema%') por_persona from client_brand b join clients c on c.id=b.client_id and c.status='active';
select 'marca_by', updated_by, count(*) from client_brand group by 2 order by 3 desc limit 6;
select 'cols_trab', string_agg(column_name, ',') from information_schema.columns where table_name='agente_trabajos';
select 'runs_7d', status, count(*) from heartbeat_runs where created_at > now()-interval '7 days' group by 2;
select 'runs_7d_agente', a.name, count(*), count(*) filter (where r.status='succeeded') ok from heartbeat_runs r join agents a on a.id=r.agent_id where r.created_at > now()-interval '7 days' group by 2 order by 3 desc;
select 'entregables_30d', kind, count(*) from agent_deliverables where created_at > now()-interval '30 days' group by 2 order by 3 desc;
select 'conector_uso_30d', a.name, count(*) from activity_log l join agents a on a.id::text=l.actor_id where l.created_at > now()-interval '30 days' and a.name ilike 'Claude%' group by 2;
select 'nas_ej', name, metadata->'nas' from clients where metadata ? 'nas' limit 3;
select 'products_carpetas', count(*), count(*) filter (where (to_jsonb(p)::text) ilike '%drive%') from client_products p;
select 'issues_abiertas', status, count(*) from issues group by 2 order by 3 desc;
select 'memoria_fuente', source, count(*) from client_memory group by 2 order by 3 desc limit 10;
select 'pub_dash', count(*) from public_dashboards;
select 'informes', estado, count(*) from informes_semanales group by 2;

-- (aud4.sql)
select 'cols', string_agg(column_name, ',') from information_schema.columns where table_name='agent_deliverables';
select 'cols_gastos', string_agg(column_name, ',') from information_schema.columns where table_name='contenido_gastos';
select 'piezas_30d', d.kind, count(*), count(*) filter (where d.metadata ? 'revision') con_revision, count(*) filter (where (d.metadata->'revision'->>'aprobado')='false' or (d.metadata->>'apto')='false') no_apta from agent_deliverables d where d.created_at > now()-interval '30 days' and d.kind in ('video','placa','descartado') group by 2;
select 'meta_keys', k, count(*) from agent_deliverables d, jsonb_object_keys(coalesce(d.metadata,'{}'::jsonb)) k where d.kind in ('video','placa','descartado') group by k order by 3 desc limit 25;
select 'ult', d.kind, left(d.title,60), d.created_at::date, left(d.metadata::text,300) from agent_deliverables d where d.kind in ('video','placa','descartado') order by d.created_at desc limit 8;
select 'productor_issues_30d', i.status, count(*) from issues i join agents a on a.id=i.assignee_agent_id where a.name='Productor de contenido' and i.created_at > now()-interval '30 days' group by 2;

-- (aud5.sql)

select 'AGENTES', a.name, a.status, a.adapter_type, coalesce(a.adapter_config->>'model', a.adapter_config->'env'->'ANTHROPIC_MODEL'->>'value'), jsonb_array_length(coalesce(a.adapter_config->'env'->'PAPERCLIP_MCP_TOOLS'->'value','[]'::jsonb)) from agents a order by 2;
select 'RUTINAS', r.title, r.status, a.name, (select max(rr.created_at)::date from routine_runs rr where rr.routine_id=r.id) ult, (select count(*) from routine_runs rr where rr.routine_id=r.id and rr.created_at>now()-interval '14 days') n14 from routines r left join agents a on a.id=r.assignee_agent_id order by 3,2;
select 'SYNC_7d', kind, status, count(*) from sync_logs where created_at>now()-interval '7 days' group by 2,3 order by 2,3;
select 'WA_OUT_14d', estado, count(*) from wa_outbox where created_at>now()-interval '14 days' group by 2;
select 'WA_GRUPOS', count(*), count(*) filter (where activo) from wa_group_config;
select 'WA_MSG_7d', count(*) from wa_group_messages where created_at>now()-interval '7 days';
select 'KEYS_BOARD', count(*), count(*) filter (where revoked_at is null) vivas, count(*) filter (where revoked_at is null and last_used_at>now()-interval '30 days') usadas30 from board_api_keys;
select 'KEYS_AGENT', count(*), count(*) filter (where revoked_at is null) from agent_api_keys;
select 'USERS', count(*) from "user";
select 'COSTO_30d', provider, model, count(*), sum(input_tokens)/1e6 mi, sum(output_tokens)/1e6 mo, sum(cost_cents)/100.0 usd from cost_events where occurred_at>now()-interval '30 days' group by 2,3 order by 5 desc nulls last limit 12;
select 'GASTO_CONT_30d', herramienta, count(*), sum(creditos), sum(usd) from contenido_gastos where created_at>now()-interval '30 days' group by 2;
select 'OPORT', status, count(*) from opportunities group by 2 order by 3 desc;
select 'IDEAS', status, count(*) from content_ideas group by 2 order by 3 desc;
select 'TRENDS_30d', count(*) filter (where created_at>now()-interval '30 days'), count(*) from trends;
select 'ALERTS', status, count(*) from ads_alerts group by 2;
select 'ADS_MAP', platform, count(*), count(distinct client_id) from ads_account_mappings group by 2;
select 'WEB_PROP', count(*), count(distinct client_id) from web_propiedades;
select 'PUBDASH', count(*), count(*) filter (where revoked_at is null) from public_dashboards;
select 'LICIT', estado, count(*) from licitaciones group by 2;
select 'APPROV', status, type, count(*) from approvals group by 2,3 order by 4 desc limit 10;
select 'DBSIZE', pg_size_pretty(pg_database_size(current_database()));
select 'TOPSIZE', relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 8;

-- (aud6.sql)

select 'cols_wa', string_agg(column_name, ',') from information_schema.columns where table_name='wa_outbox';
select 'cols_sync', string_agg(column_name, ',') from information_schema.columns where table_name='sync_logs';
select 'WA_ERR', left(coalesce(error,''),90), count(*), max(created_at)::date from wa_outbox where estado='error' and created_at>now()-interval '14 days' group by 2 order by 3 desc limit 6;
select 'WA_DIA', created_at::date, estado, count(*) from wa_outbox where created_at>now()-interval '6 days' group by 2,3 order by 2,3;
select 'AG_ERR', a.name, left(r.error,160), r.finished_at from agents a join lateral (select * from heartbeat_runs r where r.agent_id=a.id order by r.created_at desc limit 1) r on true where a.status='error';
select 'FALLAS_7d', a.name, left(coalesce(r.error_code, r.error,''),70), count(*) from heartbeat_runs r join agents a on a.id=r.agent_id where r.created_at>now()-interval '7 days' and r.status in ('failed','timed_out') group by 2,3 order by 4 desc limit 14;
select 'BLOQ', a.name, count(*), min(i.updated_at)::date from issues i left join agents a on a.id=i.assignee_agent_id where i.status='blocked' group by 2 order by 3 desc;
select 'HUMANO', count(*), min(created_at)::date from issues where status in ('todo','blocked','in_review') and title ilike '[HUMANO]%';
select 'SIN_META', count(*) from clients c where status='active' and not exists (select 1 from ads_account_mappings m where m.client_id=c.id);
select 'SALUD_CLI', metadata->'salud'->>'nivel', count(*) from clients where status='active' group by 2;
select 'DEC_ABIERTAS', split_part(regla,':',1), count(*), min(created_at)::date from decisiones where estado='abierta' group by 2 order by 3 desc;
select 'ORG_SYNC', count(distinct client_id) from organic_posts where posted_at>now()-interval '14 days';
select 'COMPET_POSTS_14d', count(*) from competencia_posts where created_at>now()-interval '14 days';
select 'HOOKS_30d', count(*) filter (where created_at>now()-interval '30 days'), count(*) from hooks;
select 'LEARN', scope, count(*) from learnings group by 2;
select 'SKILLS', count(*) from company_skills;

-- (aud7.sql)

select 'viejos_runs', count(*) filter (where created_at < now()-interval '60 days'), count(*) from heartbeat_runs;
select 'viejos_eventos', count(*) filter (where created_at < now()-interval '60 days'), count(*) from heartbeat_run_events;
select 'usuarios', email is not null, created_at::date from "user" order by 3;
select 'miembros', count(*) from company_memberships where status='active';
