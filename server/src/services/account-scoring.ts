// LMTM-OS: account scores — operational + health (#6).
//
// Health = ad performance signal (CTR level, CPL trend, activity, active
// alerts). Ops = operational compliance (social posting vs plan in ClickUp).
// Mostly deterministic; stored daily with history in account_scores.

import type { Db } from "@paperclipai/db";
import { accountScores, adsAlerts } from "@paperclipai/db";
import { and, eq, inArray, desc } from "drizzle-orm";
import { aggInsights, dayStr } from "./agency-ops.js";
import { getRedesPostStats } from "./clickup-sync.js";
import { resolveCompanyId, activeClients, clamp } from "./intel-common.js";

export interface ScoreResult {
  healthScore: number;
  opsScore: number;
  components: Record<string, unknown>;
}

export async function computeClientScore(db: Db, clientId: string): Promise<ScoreResult> {
  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));
  const w7 = await aggInsights(db, clientId, d(7), d(0));
  const wPrev = await aggInsights(db, clientId, d(14), d(8));
  const w2 = await aggInsights(db, clientId, d(2), d(0));

  const components: Record<string, unknown> = {};

  // ── Health (ads) ──
  let health = 50;
  if (w7.impressions > 0 || w7.spend > 0) {
    const ctr = w7.impressions > 0 ? (w7.clicks / w7.impressions) * 100 : 0;
    components.ctr = Number(ctr.toFixed(2));
    health += ctr >= 2 ? 25 : ctr >= 1 ? 10 : -15;

    const cpl7 = w7.leads > 0 ? w7.spend / w7.leads : null;
    const cplPrev = wPrev.leads > 0 ? wPrev.spend / wPrev.leads : null;
    if (cpl7 != null && cplPrev != null && cplPrev > 0) {
      const change = cpl7 / cplPrev - 1;
      components.cplTrendPct = Math.round(change * 100);
      health += change <= -0.1 ? 15 : change <= 0.1 ? 5 : change <= 0.5 ? -5 : -15;
    }
    health += w2.spend > 0 ? 10 : -10; // currently active?
    if (w7.leads > 0) health += 10;
  } else {
    components.noAds = true;
    health = 0;
  }
  const activeAlerts = await db.select({ id: adsAlerts.id }).from(adsAlerts)
    .where(and(eq(adsAlerts.clientId, clientId), inArray(adsAlerts.status, ["pending", "acknowledged"])));
  components.activeAlerts = activeAlerts.length;
  health -= activeAlerts.length * 5;
  const healthScore = clamp(Math.round(health));

  // ── Ops (posting compliance) ──
  let ops = 70;
  const weekAgoMs = today.getTime() - 7 * 86400000;
  const redes = await getRedesPostStats(db, clientId, weekAgoMs, today.getTime() + 86400000).catch(() => null);
  if (redes) {
    components.posts = redes.total;
    components.publishedThisWeek = redes.publishedThisWeek;
    if (redes.hasDates && redes.plannedThisWeek > 0) {
      const rate = (redes.plannedThisWeek - redes.missed) / redes.plannedThisWeek;
      ops = Math.round(rate * 100);
      components.compliance = Number(rate.toFixed(2));
    } else {
      ops = redes.publishedThisWeek > 0 ? 75 : 55;
      components.opsNote = "cargar fechas + estado Publicado en ClickUp para medir cumplimiento";
    }
  } else {
    components.noClickup = true;
    ops = 50;
  }
  const opsScore = clamp(Math.round(ops));

  return { healthScore, opsScore, components };
}

export async function runClientScores(db: Db): Promise<{ scored: number }> {
  const rows = await activeClients(db);
  const date = dayStr(new Date());
  let scored = 0;
  for (const client of rows) {
    const companyId = await resolveCompanyId(db, client.id);
    if (!companyId) continue;
    const s = await computeClientScore(db, client.id);
    await db.insert(accountScores).values({
      companyId, clientId: client.id, date,
      healthScore: s.healthScore, opsScore: s.opsScore, components: s.components,
    }).onConflictDoUpdate({
      target: [accountScores.clientId, accountScores.date],
      set: { healthScore: s.healthScore, opsScore: s.opsScore, components: s.components },
    });
    scored += 1;
  }
  return { scored };
}

export async function getLatestScore(db: Db, clientId: string) {
  const [row] = await db.select().from(accountScores).where(eq(accountScores.clientId, clientId))
    .orderBy(desc(accountScores.date)).limit(1);
  return row ?? null;
}

export async function getScoreHistory(db: Db, clientId: string, limit = 30) {
  return db.select().from(accountScores).where(eq(accountScores.clientId, clientId))
    .orderBy(desc(accountScores.date)).limit(limit);
}

let scoreTimer: ReturnType<typeof setInterval> | null = null;

export function initAccountScoring(db: Db): void {
  if (scoreTimer) return;
  setTimeout(() => { runClientScores(db).catch((e) => console.warn("[scoring] run failed:", e)); }, 7 * 60 * 1000);
  scoreTimer = setInterval(() => { runClientScores(db).catch((e) => console.warn("[scoring] run failed:", e)); }, 12 * 3600 * 1000);
  console.log("[account-scoring] scheduled scoring every 12h");
}
