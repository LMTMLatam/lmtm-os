\echo == RUNS POR ISSUE (7d, top)
select coalesce(i.identifier,'-') idf, a.name, count(*) n, count(*) filter (where r.status='succeeded') ok, left(i.title,70) t, i.status
from heartbeat_runs r join agents a on a.id=r.agent_id left join issues i on i.id::text = r.context_snapshot->>'issueId'
where r.created_at > now()-interval '7 days' group by 1,2,5,6 having count(*)>=4 order by 3 desc limit 15;
\echo == TOKENS 7D POR AGENTE (M)
select a.name, round(sum(coalesce((r.usage_json->>'inputTokens')::numeric,0)+coalesce((r.usage_json->>'outputTokens')::numeric,0)+coalesce((r.usage_json->>'cachedInputTokens')::numeric,0))/1e6,1) m,
 round(sum(case when r.status<>'succeeded' then coalesce((r.usage_json->>'inputTokens')::numeric,0)+coalesce((r.usage_json->>'cachedInputTokens')::numeric,0)+coalesce((r.usage_json->>'outputTokens')::numeric,0) else 0 end)/1e6,1) m_fallidas
from heartbeat_runs r join agents a on a.id=r.agent_id where r.created_at > now()-interval '7 days' group by 1 order by 2 desc;
\echo == RUTINAS
select left(r.title,50), a.name, r.status, t.cron_expression, t.enabled, t.next_run_at::date nx, t.last_fired_at::date lf
from routines r left join agents a on a.id=r.assignee_agent_id left join routine_triggers t on t.routine_id=r.id order by t.next_run_at nulls first limit 60;
