// TEMP — reproduce the agent-efficiency drizzle failure with cause. Delete after use.
import { createDb } from "./dist/index.js";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL);
const MAINT_KINDS = ["stranded_issue_recovery", "issue_productivity_review", "stale_active_run_evaluation", "harness_liveness_escalation"];
const since = new Date(Date.now() - 7 * 86_400_000);
try {
  const rows = await db.execute(sql`
    select coalesce(a.name, 'sistema') as agent,
           case when i.origin_kind in ${MAINT_KINDS} then 'maintenance' else 'real' end as bucket,
           count(*)::int as runs,
           count(*) filter (where r.status = 'failed')::int as failed
    from heartbeat_runs r
    left join issues i on i.id::text = r.context_snapshot->>'issueId'
    left join agents a on a.id = r.agent_id
    where r.started_at > ${since}
    group by 1, 2
  `);
  const list = rows.rows ?? rows;
  console.log("OK:", list.length, "rows");
} catch (e) {
  console.log("ERROR:", e.message.slice(0, 100));
  console.log("CAUSE:", e.cause?.message ?? "(sin cause)");
}
process.exit(0);
