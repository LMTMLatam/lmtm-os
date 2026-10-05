-- Rol de solo lectura para los chats de la nube (fase 0 del rediseño).
-- Lo corre Nazareno, una vez, contra la DB de producción. Reemplazar
-- <PASSWORD> por una clave nueva y larga; NO commitearla.
--
-- La URL resultante va como DATABASE_URL_RO en la configuración del entorno
-- de la nube (host y puerto: los del TCP proxy de lmtm-postgres):
--   postgresql://lmtm_lectura:<PASSWORD>@<host-del-proxy>:<puerto>/postgres

create role lmtm_lectura login password '<PASSWORD>';
grant connect on database postgres to lmtm_lectura;
grant usage on schema public, drizzle to lmtm_lectura;
grant select on all tables in schema public, drizzle to lmtm_lectura;
alter default privileges in schema public grant select on tables to lmtm_lectura;

-- Lo que NO puede leer: tablas con tokens, sesiones o secretos en texto.
-- (ads_connections guarda los tokens de Meta y Google; wa_session_state, la
-- sesión del WhatsApp propio; account/session, las de los usuarios del panel.)
revoke select on
  account, session, verification,
  company_secrets, company_secret_versions, company_secret_provider_configs,
  company_secret_bindings, secret_access_events,
  wa_session_state, agent_api_keys, board_api_keys, cli_auth_challenges,
  invites, join_requests, client_dashboard_links, meta_token_rotation_log
from lmtm_lectura;

-- ads_connections: se ve la conexión (plataforma, estado, cuentas), no el token.
revoke select on ads_connections from lmtm_lectura;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'ads_connections'
    and column_name not in ('client_secret', 'access_token', 'developer_token', 'refresh_token');
  execute format('grant select (%s) on ads_connections to lmtm_lectura', cols);
end $$;

-- Que una consulta pesada desde la nube no frene producción.
alter role lmtm_lectura set statement_timeout = '60s';
alter role lmtm_lectura set default_transaction_read_only = on;

-- Para revocarlo:
--   drop owned by lmtm_lectura; drop role lmtm_lectura;
