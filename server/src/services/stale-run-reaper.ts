// LMTM-OS: stale heartbeat-run reaper (anti-saturation safety net).
//
// Symptom this fixes: agent runs occasionally stay in status='running' long
// after their process is gone (container restart from a deploy, a hung claude
// subprocess, or a race that started more than the timeout reaped). Those zombie
// "running" rows count against the global concurrency cap, so the whole queue
// freezes ("muy trabado"). The boot reaper only runs at startup; this periodic
// reaper marks any run still 'running' past a hard max age (well beyond the
// per-run timeout) as timed_out and frees the slot, so the backlog keeps moving.

import type { Db } from "@paperclipai/db";
import { heartbeatRuns, agents } from "@paperclipai/db";
import { and, eq, lt, sql } from "drizzle-orm";

// Agent runs use timeoutSec ~600 (10 min). Anything past 15 min is stuck/orphaned.
const MAX_RUN_MINUTES = Math.max(12, Number(process.env.LMTM_MAX_RUN_MINUTES ?? 15));

export async function reapStaleRuns(db: Db): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - MAX_RUN_MINUTES * 60_000);
  const reaped = await db
    .update(heartbeatRuns)
    .set({
      status: "timed_out",
      finishedAt: new Date(),
      updatedAt: new Date(),
      error: sql`COALESCE(${heartbeatRuns.error}, 'reaped: run exceeded max age, orphaned/hung')`,
    })
    .where(and(eq(heartbeatRuns.status, "running"), lt(heartbeatRuns.startedAt, cutoff)))
    .returning({ id: heartbeatRuns.id });

  // Agents left 'running' with no live run → back to idle so they can be re-dispatched.
  await db
    .update(agents)
    .set({ status: "idle", updatedAt: new Date() })
    .where(
      and(
        eq(agents.status, "running"),
        sql`not exists (select 1 from ${heartbeatRuns} hr where hr.agent_id = ${agents.id} and hr.status = 'running')`,
      ),
    );

  if (reaped.length > 0) console.log(`[stale-run-reaper] reaped ${reaped.length} stale running run(s)`);
  return { reaped: reaped.length };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function initStaleRunReaper(db: Db): void {
  if (timer) return;
  setTimeout(() => { void reapStaleRuns(db).catch((e) => console.warn("[stale-run-reaper] failed:", e)); }, 60_000);
  timer = setInterval(() => { void reapStaleRuns(db).catch((e) => console.warn("[stale-run-reaper] failed:", e)); }, 5 * 60_000);
  console.log(`[stale-run-reaper] scheduled (every 5min, max run age ${MAX_RUN_MINUTES}min)`);
}
