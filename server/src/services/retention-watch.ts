// LMTM-OS: retention watch — turn a falling account score into action.
//
// account-scoring computes a daily health score per client but nothing acted on
// it. This closes the loop: when a client's health drops sharply week-over-week
// or falls below a floor, file a churn-risk task (routed to the CRM/Conversion
// specialist via createClientTask's area routing). Retention beats acquisition,
// and the signal already exists — this just makes someone look before the client
// notices and leaves.

import type { Db } from "@paperclipai/db";
import { accountScores } from "@paperclipai/db";
import { and, desc, eq, lte } from "drizzle-orm";
import { activeClients } from "./intel-common.js";
import { dayStr } from "./agency-ops.js";
import { createClientTask } from "./client-tasks.js";

const DROP_THRESHOLD = 20; // health points lost vs ~1 week ago
const FLOOR = 35; // absolute low-health line (0-100)

export async function runRetentionWatch(db: Db): Promise<{ flagged: number }> {
  const clients = await activeClients(db);
  const weekAgo = dayStr(new Date(Date.now() - 7 * 86_400_000));
  let flagged = 0;

  for (const c of clients) {
    const [latest] = await db.select({ health: accountScores.healthScore })
      .from(accountScores).where(eq(accountScores.clientId, c.id))
      .orderBy(desc(accountScores.date)).limit(1);
    // health === 0 is the "no ads running" sentinel, not a churn signal — skip it
    // so clients who simply don't run paid ads aren't flagged every day.
    if (!latest || latest.health <= 0) continue;

    const [baseline] = await db.select({ health: accountScores.healthScore })
      .from(accountScores).where(and(eq(accountScores.clientId, c.id), lte(accountScores.date, weekAgo)))
      .orderBy(desc(accountScores.date)).limit(1);

    const dropped = baseline ? baseline.health - latest.health : 0;
    const belowFloor = latest.health < FLOOR;
    if (!belowFloor && dropped < DROP_THRESHOLD) continue;

    const reason = belowFloor
      ? `Score de salud en ${latest.health}/100 (bajo el piso de ${FLOOR}).`
      : `Score de salud cayó ${dropped} puntos (${baseline!.health}→${latest.health}) en ~1 semana.`;

    // createClientTask dedups against an open task with the same title, so a
    // client stays flagged once until someone resolves it (no daily spam).
    const res = await createClientTask(db, {
      clientId: c.id,
      title: `[RIESGO CHURN] ${c.name}`,
      description: `Señal temprana de riesgo de retención (leads/conversión). ${reason}\n\nRevisar: performance de leads y conversión de la cuenta, cumplimiento de posteo, y si conviene contactar al cliente antes de que se caiga. Auto-detectado por el watcher de retención sobre account_scores.`,
      taskType: "internal",
      priority: dropped >= 30 || latest.health < 20 ? "high" : "medium",
      source: "retention-watch",
    }).catch((e) => { console.warn(`[retention-watch] task failed for ${c.name}:`, e); return null; });

    if (res?.created) flagged += 1;
  }

  if (flagged > 0) console.log(`[retention-watch] flagged ${flagged} client(s) at churn risk`);
  return { flagged };
}
