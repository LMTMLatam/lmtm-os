-- Inventario de la flota, 14 días: qué corre, cuánto y qué deja. Solo lectura.
with r as (
  select agent_id, count(*) corridas,
         count(*) filter (where status = 'succeeded') ok,
         count(*) filter (where status in ('failed','timed_out')) mal,
         round(avg(extract(epoch from (finished_at - started_at)) / 60) filter (where finished_at is not null), 1) min_prom,
         round(sum(coalesce((usage_json->>'rawInputTokens')::numeric, 0)) / 1e6, 1) mtok_in,
         round(sum(coalesce((usage_json->>'costUsd')::numeric, 0))) usd_nominal,
         count(*) filter (where invocation_source = 'timer') por_reloj
  from heartbeat_runs where started_at > now() - interval '14 days' group by agent_id
), d as (
  select agent_id, count(*) entregables from agent_deliverables where created_at > now() - interval '14 days' group by agent_id
), c as (
  select author_agent_id agent_id, count(*) comentarios from issue_comments where created_at > now() - interval '14 days' group by 1
), i as (
  select assignee_agent_id agent_id, count(*) filter (where status = 'done') cerrados, count(*) filter (where status = 'blocked') bloqueados
  from issues where updated_at > now() - interval '14 days' group by 1
), x as (
  select agent_id, count(*) acciones from agent_actions where created_at > now() - interval '14 days' group by 1
)
select a.name, coalesce(r.corridas,0) corridas, r.ok, r.mal, r.min_prom, r.por_reloj, r.mtok_in, r.usd_nominal,
       coalesce(d.entregables,0) entregables, coalesce(c.comentarios,0) coment, coalesce(i.cerrados,0) cerrados,
       coalesce(i.bloqueados,0) bloq, coalesce(x.acciones,0) acciones
from agents a
left join r on r.agent_id = a.id left join d on d.agent_id = a.id left join c on c.agent_id = a.id
left join i on i.agent_id = a.id left join x on x.agent_id = a.id
order by r.usd_nominal desc nulls last;
