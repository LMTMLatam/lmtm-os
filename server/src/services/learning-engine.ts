// LMTM-OS: cumulative learning engine (#4).
// Mines the content knowledge graph across clients/niches to extract reusable
// patterns ("in niche X, format Y outperforms"), plus per-niche ads benchmarks
// (average vs best-quartile CTR/CPL — the niche's achievable "ideal") and
// cross-niche experiments (a format winning elsewhere that this niche hasn't
// tried). Stored with confidence and evidence. Feeds reports, opportunities
// and agent context.

import type { Db } from "@paperclipai/db";
import { contentPerformance, clients, learnings, companies, adsInsights } from "@paperclipai/db";
import { and, eq, gte, isNotNull, notInArray, sql } from "drizzle-orm";
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

// Niches that aren't real client verticals — no benchmark/experiment value.
const NON_BENCHMARK_NICHES = ["agencia-marketing", "interno-test", "general"];

/**
 * Per-niche ads benchmarks: average and best-quartile CTR/CPL across the
 * niche's clients over the last 30 days. The best quartile is the "achievable
 * ideal" — a target proven by peers in the same vertical, not an invented
 * number. One learning row per niche (scope "niche_benchmark").
 */
export async function mineAdsBenchmarks(db: Db): Promise<{ benchmarks: number }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { benchmarks: 0 };
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Per-client 30d aggregates, joined to the client's niche.
  const rows = await db
    .select({
      industry: clients.industry,
      clientId: clients.id,
      spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0)`,
      impressions: sql<number>`coalesce(sum(${adsInsights.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${adsInsights.clicks}), 0)::int`,
      leads: sql<number>`coalesce(sum(${adsInsights.leads}), 0)::int`,
    })
    .from(adsInsights)
    .innerJoin(clients, eq(adsInsights.clientId, clients.id))
    .where(and(
      gte(adsInsights.date, since),
      eq(clients.status, "active"),
      isNotNull(clients.industry),
      notInArray(clients.industry, NON_BENCHMARK_NICHES),
    ))
    .groupBy(clients.industry, clients.id);

  const byNiche = new Map<string, Array<{ ctr: number; cpl: number | null; spend: number; leads: number }>>();
  for (const r of rows) {
    const imp = Number(r.impressions);
    if (imp < 500) continue; // too little signal to benchmark
    const spend = Number(r.spend);
    const leads = Number(r.leads);
    const arr = byNiche.get(r.industry!) ?? [];
    arr.push({ ctr: Number(r.clicks) / imp, cpl: leads > 0 ? spend / leads : null, spend, leads });
    byNiche.set(r.industry!, arr);
  }

  // Benchmarks are a live snapshot, not history — and the pattern text embeds
  // the current numbers, so the (scope, scopeKey, pattern) upsert would never
  // match yesterday's row. Replace the scope wholesale each pass.
  await db.delete(learnings).where(eq(learnings.scope, "niche_benchmark"));

  let count = 0;
  for (const [niche, entries] of byNiche) {
    if (entries.length < 2) continue; // a benchmark of one client is just that client
    const ctrs = entries.map((e) => e.ctr).sort((a, b) => b - a);
    const cpls = entries.filter((e) => e.cpl != null).map((e) => e.cpl!).sort((a, b) => a - b);
    const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    const topQ = <T,>(xs: T[]) => xs.slice(0, Math.max(1, Math.ceil(xs.length / 4)));
    const avgCtr = avg(ctrs);
    const idealCtr = avg(topQ(ctrs));
    const avgCpl = cpls.length ? avg(cpls) : null;
    const idealCpl = cpls.length ? avg(topQ(cpls)) : null;
    const pattern = `Benchmark de "${niche}" (30d, ${entries.length} clientes): CTR prom. ${(avgCtr * 100).toFixed(2)}% / ideal (mejor cuartil) ${(idealCtr * 100).toFixed(2)}%${avgCpl != null ? `; CPL prom. $${Math.round(avgCpl)} / ideal $${Math.round(idealCpl!)}` : ""}.`;
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche_benchmark", scopeKey: niche, pattern,
      evidence: { avgCtr, idealCtr, avgCpl, idealCpl, clients: entries.length, windowDays: 30 },
      metricImpact: "ads_benchmark", confidence: String(Math.min(0.9, 0.5 + entries.length * 0.05)),
      occurrences: entries.length, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [learnings.scope, learnings.scopeKey, learnings.pattern],
      set: { evidence: { avgCtr, idealCtr, avgCpl, idealCpl, clients: entries.length, windowDays: 30 }, occurrences: entries.length, lastSeenAt: new Date() },
    });
    count += 1;
  }
  return { benchmarks: count };
}

/**
 * Cross-niche experiments: a format that clearly wins in some OTHER niche but
 * has little/no data in this one is worth a deliberate test. One suggestion
 * per niche (scope "niche_experiment") — opportunities/roundtable pick it up.
 */
export async function mineExperiments(db: Db): Promise<{ experiments: number }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { experiments: 0 };
  const all = await db.select().from(learnings).where(eq(learnings.scope, "niche"));
  type Ev = { topFormat?: string; topAvg?: number; samples?: number; ranked?: Array<{ format: string; avg: number; n: number }> };

  // Formats each niche has real data for (from the ranked evidence).
  const testedByNiche = new Map<string, Set<string>>();
  const winners: Array<{ niche: string; format: string; avg: number }> = [];
  for (const l of all) {
    const key = l.scopeKey ?? "general";
    if (NON_BENCHMARK_NICHES.includes(key)) continue;
    const ev = (l.evidence ?? {}) as Ev;
    const tested = testedByNiche.get(key) ?? new Set<string>();
    for (const r of ev.ranked ?? []) tested.add(r.format);
    if (ev.topFormat) tested.add(ev.topFormat);
    testedByNiche.set(key, tested);
    // A "winner" needs real signal: enough samples AND a positive score. A top
    // format with score 0 just means nothing measured — not worth exporting.
    if (ev.topFormat && (ev.samples ?? 0) >= 5 && (ev.topAvg ?? 0) > 0) winners.push({ niche: key, format: ev.topFormat, avg: ev.topAvg ?? 0 });
  }

  // Same live-snapshot semantics as benchmarks: the suggestion embeds scores,
  // so replace the whole scope instead of accumulating stale suggestions.
  await db.delete(learnings).where(eq(learnings.scope, "niche_experiment"));

  let count = 0;
  for (const [niche, tested] of testedByNiche) {
    // Best foreign winner this niche hasn't tried (generic formats only travel well).
    const candidate = winners
      .filter((w) => w.niche !== niche && !tested.has(w.format) && w.format !== "otro")
      .sort((a, b) => b.avg - a.avg)[0];
    if (!candidate) continue;
    const pattern = `Experimento sugerido para "${niche}": probar el formato "${candidate.format}" — en "${candidate.niche}" es el de mejor desempeño (score prom. ${candidate.avg.toFixed(1)}) y en este rubro no hay datos todavía.`;
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche_experiment", scopeKey: niche, pattern,
      evidence: { format: candidate.format, sourceNiche: candidate.niche, sourceAvg: candidate.avg },
      metricImpact: "content_score", confidence: "0.4", occurrences: 1, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [learnings.scope, learnings.scopeKey, learnings.pattern],
      set: { evidence: { format: candidate.format, sourceNiche: candidate.niche, sourceAvg: candidate.avg }, lastSeenAt: new Date() },
    });
    count += 1;
  }
  return { experiments: count };
}

/** Learnings relevant to a niche (for opportunities / reports). */
export async function learningsForNiche(db: Db, niche: string | null) {
  const rows = await db.select().from(learnings).limit(200);
  const n = (niche ?? "general").toLowerCase();
  return rows.filter((l) => l.scope === "global" || (l.scopeKey ?? "") === n).slice(0, 10);
}

/** Full mining pass: formats → benchmarks → experiments (experiments read the
 *  freshly-mined format learnings, so order matters). */
export async function runLearningPass(db: Db): Promise<{ learnings: number; benchmarks: number; experiments: number }> {
  const l = await mineLearnings(db).catch((e) => { console.warn("[learning] formats failed:", e); return { learnings: 0 }; });
  const b = await mineAdsBenchmarks(db).catch((e) => { console.warn("[learning] benchmarks failed:", e); return { benchmarks: 0 }; });
  const x = await mineExperiments(db).catch((e) => { console.warn("[learning] experiments failed:", e); return { experiments: 0 }; });
  return { ...l, ...b, ...x };
}

let learnTimer: ReturnType<typeof setInterval> | null = null;
export function initLearningEngine(db: Db): void {
  if (learnTimer) return;
  setTimeout(() => { void runLearningPass(db); }, 20 * 60 * 1000);
  learnTimer = setInterval(() => { void runLearningPass(db); }, 24 * 3600 * 1000);
  console.log("[learning-engine] scheduled learning mining (formats+benchmarks+experiments) every 24h");
}
