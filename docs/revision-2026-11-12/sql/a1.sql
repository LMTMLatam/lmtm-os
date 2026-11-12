\echo == AGENTES
select a.name, a.status, a.adapter_type ad, adapter_config->>'model' model, adapter_config->>'maxTurnsPerRun' turns, adapter_config->>'timeoutSec' tmo,
 (adapter_config->'env'->>'PAPERCLIP_MCP_TOOLS') is null sin_lista,
 coalesce(array_length(string_to_array(adapter_config->'env'->>'PAPERCLIP_MCP_TOOLS',','),1),0) n_tools,
 a.last_heartbeat_at::date ult
from agents a order by a.adapter_type, a.name;
\echo == CORRIDAS 7D POR AGENTE
select a.name, count(*) n, count(*) filter (where r.status='succeeded') ok, count(*) filter (where r.status='failed') fail,
 count(*) filter (where r.status='timed_out') tmo, count(*) filter (where r.error_code ilike '%max_turns%' or r.error ilike '%max turns%') turnos
from heartbeat_runs r join agents a on a.id=r.agent_id where r.created_at > now()-interval '7 days' group by 1 order by 2 desc;
\echo == ERRORES 7D
select coalesce(error_code,'(null)') code, status, count(*) from heartbeat_runs where created_at > now()-interval '7 days' and status<>'succeeded' group by 1,2 order by 3 desc limit 15;
