// LMTM-OS: cumulative learning engine (#4).
// Mines the content knowledge graph across clients/niches to extract reusable
// patterns ("in niche X, format Y outperforms"), stored with confidence and
// evidence. Feeds reports, opportunities and agent context.

import type { Db } from "@paperclipai/db";
import { contentPerformance, clients, learnings, companies } from "@paperclipai/db";
import { num } from "./intel-common.js";

export async function mineLearnings(db: Db): Promise<{ learnings: number }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { learnings: 0 };

  const cps = await db.select({ clientId: contentPerformance.clientId, format: contentPerformance.format, score: contentPerformance.score }).from(contentPerformance).limit(5000);
  if (cps.length === 0) return { learnings: 0 };
  const clientRows = await db.select({ id: clients.id, industry: clients.industry }).from(clients);
  const industryOf = new Map(clientRows.map((c) => [c.id, (c.industry ?? "general").toLowerCase()]));

  // Aggregate avg score by (niche, format).
  const agg = new Map<string, { niche: string; format: string; sum: number; n: number }>();
  for (const cp of cps) {
    const niche = cp.clientId ? industryOf.get(cp.clientId) ?? "general" : "general";
    const format = (cp.format ?? "otro").toLowerCase();
    const key = `${niche}|${format}`;
    const e = agg.get(key) ?? { niche, format, sum: 0, n: 0 };
    e.sum += num(cp.score); e.n += 1;
    agg.set(key, e);
  }

  // Per niche, rank formats; emit a learning for the top format (min 3 samples).
  const byNiche = new Map<string, Array<{ format: string; avg: number; n: number }>>();
  for (const e of agg.values()) {
    const arr = byNiche.get(e.niche) ?? [];
    arr.push({ format: e.format, avg: e.n > 0 ? e.sum / e.n : 0, n: e.n });
    byNiche.set(e.niche, arr);
  }

  let count = 0;
  for (const [niche, formats] of byNiche) {
    const ranked = formats.filter((f) => f.n >= 3).sort((a, b) => b.avg - a.avg);
    if (ranked.length < 1) continue;
    const top = ranked[0];
    const rest = ranked.slice(1);
    const restAvg = rest.length ? rest.reduce((a, f) => a + f.avg, 0) / rest.length : null;
    const pattern = restAvg != null
      ? `En "${niche}", el formato "${top.format}" rinde mejor (score prom. ${top.avg.toFixed(0)} vs ${restAvg.toFixed(0)} del resto).`
      : `En "${niche}", el formato "${top.format}" es el de mejor desempeño (score prom. ${top.avg.toFixed(0)}).`;
    const confidence = Math.min(0.95, 0.4 + top.n * 0.05);
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche", scopeKey: niche, pattern,
      evidence: { topFormat: top.format, topAvg: Number(top.avg.toFixed(1)), samples: top.n, ranked: ranked.slice(0, 5) },
      metricImpact: "content_score", confidence: String(confidence), occurrences: top.n, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [learnings.scope, learnings.scopeKey, learnings.pattern],
      set: { evidence: { topFormat: top.format, topAvg: Number(top.avg.toFixed(1)), samples: top.n }, confidence: String(confidence), occurrences: top.n, lastSeenAt: new Date() },
    });
    count += 1;
  }
  return { learnings: count };
}

/** Learnings relevant to a niche (for opportunities / reports). */
export async function learningsForNiche(db: Db, niche: string | null) {
  const rows = await db.select().from(learnings).limit(200);
  const n = (niche ?? "general").toLowerCase();
  return rows.filter((l) => l.scope === "global" || (l.scopeKey ?? "") === n).slice(0, 10);
}

let learnTimer: ReturnType<typeof setInterval> | null = null;
export function initLearningEngine(db: Db): void {
  if (learnTimer) return;
  setTimeout(() => { mineLearnings(db).catch((e) => console.warn("[learning] mine failed:", e)); }, 20 * 60 * 1000);
  learnTimer = setInterval(() => { mineLearnings(db).catch((e) => console.warn("[learning] mine failed:", e)); }, 24 * 3600 * 1000);
  console.log("[learning-engine] scheduled learning mining every 24h");
}
