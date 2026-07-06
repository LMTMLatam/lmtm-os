// TEMP — run the agent-efficiency SQL raw to surface the real PG error. Delete after use.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await sql`
    select coalesce(a.name, 'sistema') as agent,
           case when i.origin_kind in ('stranded_issue_recovery','issue_productivity_review','stale_active_run_evaluation','harness_liveness_escalation') then 'maintenance' else 'real' end as bucket,
           count(*)::int as runs,
           count(*) filter (where r.status = 'failed')::int as failed
    from heartbeat_runs r
    left join issues i on i.id::text = r.context_snapshot->>'issueId'
    left join agents a on a.id = r.agent_id
    where r.started_at > ${since}
    group by 1, 2`;
  console.log("OK rows:", rows.length, JSON.stringify(rows.slice(0, 3)));
} catch (e) {
  console.log("PG ERROR:", e.message);
} finally { await sql.end(); }
