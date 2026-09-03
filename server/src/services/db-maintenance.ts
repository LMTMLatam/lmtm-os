// LMTM-OS: DB retention sweeper.
//
// agent_wakeup_requests is an operational queue: the heartbeat scheduler logs
// every wake decision, including ~15k/day of "skipped" no-ops. Nothing prunes
// it, so it became the single largest table (241k rows / 132MB, 26% of the DB,
// 2026-07-11 review). Dedup lookups only ever read live statuses
// (queued/claimed/deferred_issue_execution — see heartbeat.ts), so terminal
// rows are pure telemetry with a short useful life.
import type { Db } from "@paperclipai/db";
import { agentWakeupRequests, heartbeatRuns } from "@paperclipai/db";
import { and, inArray, lt, notExists, sql } from "drizzle-orm";

const DAY = 86_400_000;
// Scheduler no-ops: nothing ever reads them back; keep a week for debugging.
const NOISE_STATUSES = ["skipped", "coalesced"];
const NOISE_RETENTION_MS = 7 * DAY;
// Real executions that ended: keep a month for postmortems.
const TERMINAL_STATUSES = ["completed", "failed", "timed_out", "cancelled"];
const TERMINAL_RETENTION_MS = 30 * DAY;

export async function runWakeupRetention(db: Db): Promise<{ noise: number; terminal: number }> {
  const sweep = async (statuses: string[], cutoff: Date): Promise<number> => {
    const where = and(
      inArray(agentWakeupRequests.status, statuses),
      lt(agentWakeupRequests.createdAt, cutoff),
      // heartbeat_runs.wakeup_request_id references this table without
      // ON DELETE — rows that became a run must outlive the run history.
      notExists(
        db.select({ one: sql`1` }).from(heartbeatRuns)
          .where(sql`${heartbeatRuns.wakeupRequestId} = ${agentWakeupRequests.id}`),
      ),
    );
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(agentWakeupRequests).where(where);
    if (c?.n) await db.delete(agentWakeupRequests).where(where);
    return c?.n ?? 0;
  };
  const noise = await sweep(NOISE_STATUSES, new Date(Date.now() - NOISE_RETENTION_MS));
  const terminal = await sweep(TERMINAL_STATUSES, new Date(Date.now() - TERMINAL_RETENTION_MS));
  return { noise, terminal };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function initDbMaintenance(db: Db): void {
  if (timer) return;
  const tick = async () => {
    await runWakeupRetention(db)
      .then((r) => {
        if (r.noise || r.terminal) console.log(`[db-maintenance] wakeups purgados: ${r.noise} noise (>7d), ${r.terminal} terminal (>30d)`);
      })
      .catch((e) => console.warn("[db-maintenance] wakeup retention failed:", e));
    // Lo bloqueado tampoco se acumula sin fecha: lo que espera a una persona
    // sube a la cola humana, lo que nadie tocó en 21 días se cierra.
    await import("./cola-humana.js")
      .then(({ barrerColaHumana }) => barrerColaHumana(db))
      .then((r) => {
        if (r.escalados || r.vencidos) {
          console.log(`[db-maintenance] bloqueados: ${r.escalados} escalados a la cola humana, ${r.vencidos} vencidos`);
        }
      })
      .catch((e) => console.warn("[db-maintenance] barrido de bloqueados failed:", e));
    // Publicaciones que salieron dos veces en la misma red. Las corridas de
    // Make figuran en verde igual, así que si no se mira acá se entera el
    // cliente antes que nosotros (MAERS, 26/8/26).
    await import("./publicaciones-duplicadas.js")
      .then(({ avisarDuplicados }) => avisarDuplicados(db))
      .then((r) => {
        if (r.encontrados) console.log(`[db-maintenance] publicaciones duplicadas: ${r.encontrados} detectadas, ${r.avisados} avisadas`);
      })
      .catch((e) => console.warn("[db-maintenance] detector de duplicados failed:", e));
    // El detector de arriba compara posts sincronizados de Meta, y 34 de los 59
    // clientes activos no tienen la página mapeada: para ellos es ciego. Las
    // corridas de Make están para todos, así que este segundo detector es el
    // que cubre la cartera entera (Ikigai, 30/8/26).
    await import("./make-disparos.js")
      .then(({ avisarDisparosRepetidos }) => avisarDisparosRepetidos(db))
      .then((r) => {
        if (r.rafagas || r.solapes) {
          console.log(`[db-maintenance] disparos de Make: ${r.rafagas} ráfagas, ${r.solapes} solapes${r.avisado ? " (avisado)" : ""}`);
        }
      })
      .catch((e) => console.warn("[db-maintenance] detector de disparos de Make failed:", e));
  };
  setTimeout(() => { void tick(); }, 25 * 60 * 1000); // 25 min after boot (off-peak vs other init ticks)
  timer = setInterval(() => { void tick(); }, 24 * 3600 * 1000); // daily
  console.log("[db-maintenance] scheduled daily wakeup retention");
}
