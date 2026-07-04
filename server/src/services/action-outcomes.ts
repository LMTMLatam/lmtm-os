// LMTM-OS: outcome scorer for executed agent actions (closes the
// propose→act→MEASURE loop). For every pause recorded in agent_actions, once
// 7 full days have passed it compares the client's blended performance in the
// 7 days before vs after the pause, records the verdict on the ledger row,
// and writes the result into the client's brain — so future decisions are
// informed by what actually happened, not by whether the idea sounded good.

import type { Db } from "@paperclipai/db";
import { agentActions, adsInsights } from "@paperclipai/db";
import { and, eq, gte, isNull, lte, lt, sql } from "drizzle-orm";
import { aggInsights, dayStr } from "./agency-ops.js";
import { upsertMemory } from "./customer-brain.js";
import { resolveCompanyId } from "./intel-common.js";

const DAY = 86_400_000;

interface PauseOutcome {
  entitySpend7dBefore: number;
  entityLeads7dBefore: number;
  clientCplBefore: number | null;
  clientCplAfter: number | null;
  clientCtrBefore: number;
  clientCtrAfter: number;
  verdict: "improved" | "neutral" | "worse" | "insufficient_data";
  evaluatedAt: string;
}

/** Evaluate every pause that is ≥7 days old and not yet scored. */
export async function evaluatePauseOutcomes(db: Db): Promise<{ evaluated: number }> {
  const cutoff = new Date(Date.now() - 7 * DAY);
  const pending = await db.select().from(agentActions).where(and(
    eq(agentActions.kind, "pause_ad_entity"),
    isNull(agentActions.outcome),
    lt(agentActions.createdAt, cutoff),
  )).limit(50);

  let evaluated = 0;
  for (const action of pending) {
    if (!action.clientId || !action.entityId) continue;
    try {
      const pausedAt = new Date(action.createdAt);
      const dBefore = dayStr(new Date(pausedAt.getTime() - 7 * DAY));
      const dPause = dayStr(pausedAt);
      const dAfter = dayStr(new Date(pausedAt.getTime() + 7 * DAY));

      // What the paused entity was burning in its final week.
      const entityCol = action.entityType === "adset" ? adsInsights.adsetId : adsInsights.campaignId;
      const [ent] = await db.select({
        spend: sql<string>`coalesce(sum(${adsInsights.spend}),0)`,
        leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
      }).from(adsInsights).where(and(
        eq(adsInsights.clientId, action.clientId),
        eq(entityCol, action.entityId),
        gte(adsInsights.date, dBefore),
        lte(adsInsights.date, dPause),
      ));

      // Client blended performance, week before vs week after.
      const before = await aggInsights(db, action.clientId, dBefore, dPause);
      const after = await aggInsights(db, action.clientId, dPause, dAfter);

      const cpl = (a: { spend: number; leads: number }) => (a.leads > 0 ? a.spend / a.leads : null);
      const ctr = (a: { clicks: number; impressions: number }) => (a.impressions > 0 ? a.clicks / a.impressions : 0);
      const cplBefore = cpl(before);
      const cplAfter = cpl(after);
      const ctrBefore = ctr(before);
      const ctrAfter = ctr(after);

      let verdict: PauseOutcome["verdict"];
      if (after.impressions < 500 || before.impressions < 500) verdict = "insufficient_data";
      else if (cplBefore != null && cplAfter != null) {
        verdict = cplAfter < cplBefore * 0.9 ? "improved" : cplAfter > cplBefore * 1.1 ? "worse" : "neutral";
      } else {
        verdict = ctrAfter > ctrBefore * 1.1 ? "improved" : ctrAfter < ctrBefore * 0.9 ? "worse" : "neutral";
      }

      const outcome: PauseOutcome = {
        entitySpend7dBefore: Math.round(Number(ent?.spend ?? 0)),
        entityLeads7dBefore: Number(ent?.leads ?? 0),
        clientCplBefore: cplBefore != null ? Math.round(cplBefore) : null,
        clientCplAfter: cplAfter != null ? Math.round(cplAfter) : null,
        clientCtrBefore: Number((ctrBefore * 100).toFixed(2)),
        clientCtrAfter: Number((ctrAfter * 100).toFixed(2)),
        verdict,
        evaluatedAt: new Date().toISOString(),
      };
      await db.update(agentActions).set({ outcome: outcome as never }).where(eq(agentActions.id, action.id));

      // Feed the result back into the client's brain so agents see it.
      const name = (action.detail as { name?: string } | null)?.name ?? action.entityId;
      const verdictTxt = { improved: "MEJORÓ", neutral: "quedó igual", worse: "EMPEORÓ", insufficient_data: "sin datos suficientes para evaluar" }[verdict];
      const companyId = await resolveCompanyId(db, action.clientId);
      if (companyId) {
        await upsertMemory(db, {
          companyId, clientId: action.clientId, kind: "performance",
          key: `pausa-${action.entityId}`,
          content: `Resultado de la pausa de ${action.entityType} "${name}" (${dPause}): la entidad venía gastando $${outcome.entitySpend7dBefore} con ${outcome.entityLeads7dBefore} leads en su última semana. CPL del cliente: $${outcome.clientCplBefore ?? "?"} antes → $${outcome.clientCplAfter ?? "?"} después (${verdictTxt}). CTR: ${outcome.clientCtrBefore}% → ${outcome.clientCtrAfter}%.`,
          source: "action-outcomes",
        }).catch(() => {});
      }
      evaluated += 1;
    } catch (e) {
      console.warn(`[action-outcomes] evaluate ${action.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { evaluated };
}

let outcomeTimer: ReturnType<typeof setInterval> | null = null;
export function initActionOutcomes(db: Db): void {
  if (outcomeTimer) return;
  const tick = () => evaluatePauseOutcomes(db)
    .then((r) => { if (r.evaluated > 0) console.log(`[action-outcomes] evaluated ${r.evaluated} pause(s)`); })
    .catch((e) => console.warn("[action-outcomes] run failed:", e));
  setTimeout(tick, 30 * 60 * 1000); // 30 min after boot
  outcomeTimer = setInterval(tick, 24 * 3600 * 1000); // then daily
  console.log("[action-outcomes] scheduled daily pause-outcome evaluation");
}
