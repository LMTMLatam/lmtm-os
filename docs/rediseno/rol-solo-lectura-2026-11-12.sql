-- Fase A1 de la revisión del 12/11 (docs/revision-2026-11-12): lo que lmtm_lectura
-- todavía leía con claves adentro. Se corre como admin, una vez. Idempotente.
--
--  - agents.adapter_config / runtime_config: la clave de MiniMax de los 15 agentes.
--  - agent_config_revisions: copias viejas de esa misma configuración.
--  - google_web_conexiones.refresh_token: el refresh token de Google de la agencia.
--  - heartbeat_runs.stdout_excerpt / stderr_excerpt: 38 corridas con credenciales.
-- En su lugar quedan dos vistas sin secretos: agentes_config y corridas_salida.
-- Las tablas de respaldo (respaldo_*, *_backup_*) dejan de ser legibles.

begin;

-- 1) Tablas con columnas sensibles: se revoca la tabla y se dan las columnas sanas.
do $$
declare
  t record; cols text;
begin
  for t in select * from (values
    ('agents', array['adapter_config','runtime_config']),
    ('heartbeat_runs', array['stdout_excerpt','stderr_excerpt']),
    ('google_web_conexiones', array['refresh_token']),
    ('agent_config_revisions', array['after_config','before_config'])
  ) v(tabla, fuera) loop
    execute format('revoke select on %I from lmtm_lectura', t.tabla);
    select string_agg(quote_ident(column_name), ', ') into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t.tabla and column_name <> all (t.fuera);
    execute format('grant select (%s) on %I to lmtm_lectura', cols, t.tabla);
  end loop;
end $$;

-- 2) Vista de la configuración útil de los agentes, sin claves.
create or replace view agentes_config as
select a.id, a.name, a.adapter_type, a.status,
       a.adapter_config->>'model'           as model,
       a.adapter_config->>'maxTurnsPerRun'  as max_turns_per_run,
       a.adapter_config->>'timeoutSec'      as timeout_sec,
       a.adapter_config->'env'->>'PAPERCLIP_MCP_TOOLS'   as herramientas,
       a.adapter_config->'env'->>'LMTM_AGENTE_SIN_ROOT'  as sin_root
  from agents a;
grant select on agentes_config to lmtm_lectura;

-- 3) Salida de las corridas con los secretos enmascarados.
create or replace function enmascarar_secretos(t text) returns text
language sql immutable as $f$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(t, ''),
    'postgres(ql)?://[^:@/ ]+:[^@ ]+@', 'postgres://<CRED>@', 'gi'),
    'EAA[A-Za-z0-9]{20,}', 'EAA<TOKEN>', 'g'),
    'ya29\.[A-Za-z0-9_-]{20,}', 'ya29.<TOKEN>', 'g'),
    '1//[0-9A-Za-z_-]{30,}', '1//<TOKEN>', 'g'),
    'pk_[0-9]{4,}_[A-Z0-9]{16,}', 'pk_<TOKEN>', 'g'),
    'Bearer [A-Za-z0-9._~+/=-]{20,}', 'Bearer <TOKEN>', 'g'),
    '\m(sk-|tskey-)[A-Za-z0-9_-]{16,}', '\1<TOKEN>', 'g'),
    '([A-Z][A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|APIKEY)[A-Z0-9_]*)(["'']?\s*[:=]\s*["'']?)[^\s"'',]{6,}', '\1\3<SECRETO>', 'g')
$f$;

create or replace view corridas_salida as
select r.id, r.agent_id, r.status, r.error_code, r.created_at,
       enmascarar_secretos(r.stdout_excerpt) as stdout_excerpt,
       enmascarar_secretos(r.stderr_excerpt) as stderr_excerpt
  from heartbeat_runs r;
grant select on corridas_salida to lmtm_lectura;

-- 4) Las tablas de respaldo no se leen desde afuera.
do $$
declare t record;
begin
  for t in select table_name from information_schema.tables
            where table_schema = 'public' and (table_name like 'respaldo\_%' or table_name like '%\_backup\_%') loop
    execute format('revoke select on %I from lmtm_lectura', t.table_name);
  end loop;
end $$;

commit;
