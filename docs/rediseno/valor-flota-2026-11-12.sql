-- Revisión 12/11, C2 (N4: «se mide por el valor que aportan las cosas»).
-- Vista que el control diario (lmtm-control-flota) y cualquier chat leen con
-- lmtmSql. Valor = lo que cambió algo para un cliente o para el equipo:
--   acciones ejecutadas que mejoraron (agent_actions.outcome.verdict = improved),
--   propuestas que una persona aprobó, entregables cuya tarea se cerró.
-- Costo = tokens; «sin efecto» = tokens de corridas que fallaron o vencieron
-- (desde el 12/11 un tope de turnos con trabajo hecho cuenta como bien).
-- Idempotente. Se corre como admin.

create or replace view valor_flota as
with a as (select id, name from agents where adapter_type = 'claude_local'),
v as (select * from (values (7), (30)) t(dias)),
tok as (
  select r.agent_id, v.dias,
         sum(coalesce((r.usage_json->>'inputTokens')::numeric, 0) + coalesce((r.usage_json->>'cachedInputTokens')::numeric, 0)
             + coalesce((r.usage_json->>'outputTokens')::numeric, 0)) as tokens,
         sum(case when r.status in ('failed', 'timed_out')
                  then coalesce((r.usage_json->>'inputTokens')::numeric, 0) + coalesce((r.usage_json->>'cachedInputTokens')::numeric, 0)
                       + coalesce((r.usage_json->>'outputTokens')::numeric, 0) else 0 end) as tokens_sin_efecto,
         count(*) as corridas
    from heartbeat_runs r join v on r.created_at > now() - make_interval(days => v.dias)
   group by 1, 2),
acc as (
  select x.agent_id, v.dias,
         count(*) as acciones,
         count(*) filter (where x.outcome->>'verdict' = 'improved') as mejoraron,
         count(*) filter (where x.outcome->>'verdict' = 'worse') as empeoraron,
         count(*) filter (where x.outcome is null) as sin_medir
    from agent_actions x join v on x.created_at > now() - make_interval(days => v.dias)
   group by 1, 2),
prop as (
  select p.requested_by_agent_id as agent_id, v.dias,
         count(*) as propuestas,
         count(*) filter (where p.status = 'approved') as aprobadas,
         count(*) filter (where p.status in ('rejected', 'cancelled')) as rechazadas_o_vencidas
    from approvals p join v on p.created_at > now() - make_interval(days => v.dias)
   where p.requested_by_agent_id is not null
   group by 1, 2),
ent as (
  select d.agent_id, v.dias,
         count(*) as entregables,
         -- Usado: su tarea se cerró, o es una pieza terminada con link (videos y
         -- placas del Productor no van atados a una tarea).
         count(*) filter (where i.status = 'done'
                             or (d.kind in ('video', 'placa', 'carrusel', 'imagen', 'reel') and d.url is not null)) as entregables_usados
    from agent_deliverables d join v on d.created_at > now() - make_interval(days => v.dias)
    left join issues i on i.id = d.issue_id
   group by 1, 2)
select a.name as agente, v.dias,
       coalesce(tok.corridas, 0) as corridas,
       round(coalesce(tok.tokens, 0) / 1e6, 1) as tokens_m,
       round(coalesce(tok.tokens_sin_efecto, 0) / 1e6, 1) as tokens_sin_efecto_m,
       coalesce(acc.acciones, 0) as acciones, coalesce(acc.mejoraron, 0) as acciones_mejoraron,
       coalesce(acc.empeoraron, 0) as acciones_empeoraron, coalesce(acc.sin_medir, 0) as acciones_sin_medir,
       coalesce(prop.propuestas, 0) as propuestas, coalesce(prop.aprobadas, 0) as propuestas_aprobadas,
       coalesce(prop.rechazadas_o_vencidas, 0) as propuestas_rechazadas_o_vencidas,
       coalesce(ent.entregables, 0) as entregables, coalesce(ent.entregables_usados, 0) as entregables_usados,
       coalesce(acc.mejoraron, 0) + coalesce(prop.aprobadas, 0) + coalesce(ent.entregables_usados, 0) as valor,
       case when coalesce(acc.mejoraron, 0) + coalesce(prop.aprobadas, 0) + coalesce(ent.entregables_usados, 0) > 0
            then round(coalesce(tok.tokens, 0) / 1e6 / (coalesce(acc.mejoraron, 0) + coalesce(prop.aprobadas, 0) + coalesce(ent.entregables_usados, 0)), 1)
       end as tokens_m_por_valor
  from a cross join v
  left join tok on tok.agent_id = a.id and tok.dias = v.dias
  left join acc on acc.agent_id = a.id and acc.dias = v.dias
  left join prop on prop.agent_id = a.id and prop.dias = v.dias
  left join ent on ent.agent_id = a.id and ent.dias = v.dias;

grant select on valor_flota to lmtm_lectura;
