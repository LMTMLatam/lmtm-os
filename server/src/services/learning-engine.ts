// LMTM-OS: cumulative learning engine (#4).
// Mines the content knowledge graph across clients/niches to extract reusable
// patterns ("in niche X, format Y outperforms"), plus per-niche ads benchmarks
// (average vs best-quartile CTR/CPL — the niche's achievable "ideal") and
// cross-niche experiments (a format winning elsewhere that this niche hasn't
// tried). Stored with confidence and evidence. Feeds reports, opportunities
// and agent context.

import type { Db } from "@paperclipai/db";
import { adsCreatives, clients, learnings, companies, adsInsights } from "@paperclipai/db";
import { and, eq, gte, isNotNull, notInArray, sql } from "drizzle-orm";
import { conversionesDudosas } from "../metricas/index.js";

export async function mineLearnings(db: Db): Promise<{ learnings: number }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { learnings: 0 };

  // ORGANIC only (los anuncios tienen su propio minero, mineAdsWinningFormats).
  //
  // 7/10: antes se promediaba la interacción CRUDA por formato y rubro. Eso
  // premia a la cuenta con más seguidores, no al formato; y además el score
  // orgánico estaba en 0 para todas las publicaciones (nombres de métricas mal
  // leídos), así que el "formato ganador" no salía de ningún dato. Ahora sale
  // de contenido-analisis.ts: cada publicación contra lo normal de su cuenta.
  const { analisisContenido } = await import("./contenido-analisis.js");
  const a = await analisisContenido(db, 180);
  const fmt = (x: number) => x.toFixed(2).replace(".", ",");

  // Live snapshot: se reemplaza el scope entero para que no queden ganadores viejos.
  await db.delete(learnings).where(eq(learnings.scope, "niche"));

  let count = 0;
  for (const n of a.nichos) {
    const ranked = n.formatos; // ya ordenados por índice, solo los que tienen muestra suficiente
    const top = ranked[0];
    if (!top || top.indice <= 1) continue; // nada rinde por encima de lo normal: no hay ganador
    const peor = ranked.length > 1 ? ranked[ranked.length - 1] : null;
    const pattern = `En orgánico de "${n.nicho}", ${top.clave} rinde ${fmt(top.indice)} veces lo normal de cada cuenta (${top.publicaciones} publicaciones de ${top.cuentas} cuentas)` +
      (peor ? `; ${peor.clave} rinde ${fmt(peor.indice)} veces.` : ".");
    const evidence = {
      topFormat: top.clave, topAvg: top.indice, samples: top.publicaciones, cuentas: top.cuentas, medida: "indice-vs-cuenta",
      ranked: ranked.slice(0, 6).map((f) => ({ format: f.clave, avg: f.indice, n: f.publicaciones })),
    };
    const confidence = Math.min(0.95, 0.4 + top.cuentas * 0.1);
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche", scopeKey: n.nicho, pattern, evidence,
      metricImpact: "content_score", confidence: String(confidence), occurrences: top.publicaciones, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [learnings.scope, learnings.scopeKey, learnings.pattern],
      set: { evidence, confidence: String(confidence), occurrences: top.publicaciones, lastSeenAt: new Date() },
    });
    count += 1;
  }
  return { learnings: count };
}

// Niches that aren't real client verticals — no benchmark/experiment value.
const NON_BENCHMARK_NICHES = ["agencia-marketing", "interno-test", "general"];

/**
 * Winning AD format per niche (video vs imagen), by CTR over the last 30 days.
 * Complements the organic winning format ("Formato ganador tenemos que hacerlo
 * en orgánico y ads"). Scope "niche_ads_format", replaced wholesale each pass
 * (live snapshot, same semantics as benchmarks).
 */
export async function mineAdsWinningFormats(db: Db): Promise<{ formats: number }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { formats: 0 };
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Creative id → format. The media shape lives inside `raw` (Meta payload):
  // video_id → video; image_url/picture/thumbnail → imagen (same extraction
  // the /creatives endpoint uses).
  const creatives = await db.select({
    id: adsCreatives.id, clientId: adsCreatives.clientId, raw: adsCreatives.raw,
  }).from(adsCreatives);
  if (creatives.length === 0) return { formats: 0 };
  const clientRows = await db.select({ id: clients.id, industry: clients.industry, status: clients.status }).from(clients);
  const nicheOf = new Map(clientRows.filter((c) => c.status === "active" && c.industry && !NON_BENCHMARK_NICHES.includes(c.industry)).map((c) => [c.id, c.industry!]));

  const metrics = await db.select({
    adId: adsInsights.adId,
    impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
    clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
  }).from(adsInsights)
    .where(and(gte(adsInsights.date, since), isNotNull(adsInsights.adId)))
    .groupBy(adsInsights.adId);
  const byAd = new Map(metrics.map((m) => [m.adId!, m]));

  // Aggregate impressions/clicks by (niche, format).
  const agg = new Map<string, { niche: string; format: string; imp: number; clk: number; n: number }>();
  for (const cr of creatives) {
    const niche = cr.clientId ? nicheOf.get(cr.clientId) : null;
    if (!niche) continue;
    const m = byAd.get(cr.id);
    if (!m || m.impressions < 500) continue; // too little signal per creative
    const raw = (cr.raw ?? {}) as Record<string, unknown>;
    const creative = (raw.creative ?? {}) as Record<string, unknown>;
    // The reliable signal is object_story_spec: video ads carry video_data,
    // image ads link_data/photo_data. thumbnail_url exists for BOTH (video ads
    // have thumbnails too), so it can't discriminate.
    const spec = (creative.object_story_spec ?? {}) as Record<string, unknown>;
    const hasVideo = Boolean(spec.video_data ?? creative.video_id ?? raw.video_id);
    const hasImage = Boolean(spec.link_data ?? spec.photo_data ?? creative.image_url ?? raw.image_url ?? raw.picture);
    const format = hasVideo ? "video" : hasImage ? "imagen" : "otro";
    const key = `${niche}|${format}`;
    const e = agg.get(key) ?? { niche, format, imp: 0, clk: 0, n: 0 };
    e.imp += m.impressions; e.clk += m.clicks; e.n += 1;
    agg.set(key, e);
  }
  const byNiche = new Map<string, Array<{ format: string; ctr: number; n: number; imp: number }>>();
  for (const e of agg.values()) {
    const arr = byNiche.get(e.niche) ?? [];
    arr.push({ format: e.format, ctr: e.imp > 0 ? e.clk / e.imp : 0, n: e.n, imp: e.imp });
    byNiche.set(e.niche, arr);
  }

  await db.delete(learnings).where(eq(learnings.scope, "niche_ads_format"));
  let count = 0;
  for (const [niche, formats] of byNiche) {
    const ranked = formats.filter((f) => f.n >= 3).sort((a, b) => b.ctr - a.ctr);
    if (ranked.length < 2) continue; // needs a real comparison, not a single format
    const top = ranked[0];
    const rest = ranked.slice(1);
    const restCtr = rest.reduce((a, f) => a + f.ctr, 0) / rest.length;
    const pattern = `En ads de "${niche}" (30d), el formato "${top.format}" rinde mejor: CTR ${(top.ctr * 100).toFixed(2)}% vs ${(restCtr * 100).toFixed(2)}% del resto (${top.n} anuncios). Qué hacer: priorizar "${top.format}" en las próximas creatividades del rubro.`;
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche_ads_format", scopeKey: niche, pattern,
      evidence: { ranked: ranked.slice(0, 4), windowDays: 30 },
      metricImpact: "ads_ctr", confidence: String(Math.min(0.9, 0.4 + top.n * 0.05)),
      occurrences: top.n, lastSeenAt: new Date(),
    });
    count += 1;
  }
  return { formats: count };
}

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
  const hoy = new Date().toISOString().slice(0, 10);

  // Por cliente y plataforma, 30 días completos (hoy está a medio sincronizar).
  const rows = await db
    .select({
      industry: clients.industry,
      clientId: clients.id,
      platform: adsInsights.platform,
      spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0)`,
      impressions: sql<number>`coalesce(sum(${adsInsights.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${adsInsights.clicks}), 0)::int`,
      leads: sql<number>`coalesce(sum(${adsInsights.leads}), 0)::int`,
    })
    .from(adsInsights)
    .innerJoin(clients, eq(adsInsights.clientId, clients.id))
    .where(and(
      gte(adsInsights.date, since),
      sql`${adsInsights.date} < ${hoy}`,
      eq(clients.status, "active"),
      isNotNull(clients.industry),
      notInArray(clients.industry, NON_BENCHMARK_NICHES),
    ))
    .groupBy(clients.industry, clients.id, adsInsights.platform);

  const byNiche = new Map<string, Array<{ ctr: number | null; cpl: number | null }>>();
  for (const r of desglosarPorCliente(rows)) {
    const arr = byNiche.get(r.industry) ?? [];
    arr.push({ ctr: r.ctrMeta, cpl: r.cpl });
    byNiche.set(r.industry, arr);
  }

  // Benchmarks are a live snapshot, not history — and the pattern text embeds
  // the current numbers, so the (scope, scopeKey, pattern) upsert would never
  // match yesterday's row. Replace the scope wholesale each pass.
  await db.delete(learnings).where(eq(learnings.scope, "niche_benchmark"));

  let count = 0;
  for (const [niche, entries] of byNiche) {
    const ctrs = entries.filter((e) => e.ctr != null).map((e) => e.ctr!).sort((a, b) => b - a);
    const cpls = entries.filter((e) => e.cpl != null).map((e) => e.cpl!).sort((a, b) => a - b);
    // Un benchmark de un solo cliente es ese cliente.
    if (ctrs.length < 2 && cpls.length < 2) continue;
    const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    const topQ = <T,>(xs: T[]) => xs.slice(0, Math.max(1, Math.ceil(xs.length / 4)));
    const avgCtr = ctrs.length >= 2 ? avg(ctrs) : null;
    const idealCtr = ctrs.length >= 2 ? avg(topQ(ctrs)) : null;
    const avgCpl = cpls.length >= 2 ? avg(cpls) : null;
    const idealCpl = cpls.length >= 2 ? avg(topQ(cpls)) : null;
    // Two layers: the numbers, then a plain-language read + what to do with it
    // (pedido del usuario: "que me dé un detalle para alguien no experto").
    const partes: string[] = [];
    if (avgCtr != null) partes.push(`CTR de Meta prom. ${(avgCtr * 100).toFixed(2)}% / ideal (mejor cuartil) ${(idealCtr! * 100).toFixed(2)}% (${ctrs.length} clientes)`);
    if (avgCpl != null) partes.push(`costo por resultado prom. $${Math.round(avgCpl)} / ideal $${Math.round(idealCpl!)} (${cpls.length} clientes)`);
    const criollo: string[] = [];
    if (avgCtr != null) criollo.push(`de cada 1.000 personas que ven un anuncio de este rubro en Meta, ~${Math.round(avgCtr * 1000)} hacen clic (los mejores logran ~${Math.round(idealCtr! * 1000)})`);
    if (avgCpl != null) criollo.push(`cada consulta cuesta ~$${Math.round(avgCpl)} (los mejores la consiguen a ~$${Math.round(idealCpl!)})`);
    const pattern = `Benchmark de "${niche}" (30d): ${partes.join("; ")}. En criollo: ${criollo.join(", y ")}. ` +
      `Qué hacer: cliente por debajo del promedio → cambiar creatividad/segmentación ya; entre promedio e ideal → copiar el formato ganador del rubro; en el ideal → escalar presupuesto.`;
    const evidence = { avgCtr, idealCtr, avgCpl, idealCpl, clients: Math.max(ctrs.length, cpls.length), clientesCtr: ctrs.length, clientesCpl: cpls.length, ctrDe: "meta", windowDays: 30 };
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche_benchmark", scopeKey: niche, pattern, evidence,
      metricImpact: "ads_benchmark", confidence: String(Math.min(0.9, 0.5 + entries.length * 0.05)),
      occurrences: entries.length, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [learnings.scope, learnings.scopeKey, learnings.pattern],
      set: { evidence, occurrences: entries.length, lastSeenAt: new Date() },
    });
    count += 1;
  }
  return { benchmarks: count };
}

/**
 * Puro: de filas (cliente × plataforma) a lo comparable por cliente.
 *
 * - CTR solo de Meta: el de Google búsqueda (10-20%) no se compara con el de
 *   Meta (1-3%), y mezclados el "ideal" de automotor daba 21,77%.
 * - Costo por resultado sin las cuentas de Google que cuentan como conversión
 *   cualquier cosa (conversionesDudosas): con ellas el ideal de inmobiliaria
 *   daba $263, por las 19.103 "conversiones" de MA PROPIEDADES en 30 días.
 *   Se descartan inversión y resultados de esa plataforma para el CPL.
 */
export function desglosarPorCliente(rows: Array<{ industry: string | null; clientId: string; platform: string; spend: string | number; impressions: number; clicks: number; leads: number }>): Array<{
  industry: string; clientId: string; ctrMeta: number | null; cpl: number | null; leadsDudosos: boolean;
}> {
  const porCliente = new Map<string, { industry: string; metaImp: number; metaClicks: number; spend: number; leads: number; dudosos: boolean }>();
  for (const r of rows) {
    if (!r.industry) continue;
    const c = porCliente.get(r.clientId) ?? { industry: r.industry, metaImp: 0, metaClicks: 0, spend: 0, leads: 0, dudosos: false };
    const clicks = Number(r.clicks), leads = Number(r.leads), spend = Number(r.spend);
    if (r.platform === "meta") { c.metaImp += Number(r.impressions); c.metaClicks += clicks; }
    if (conversionesDudosas(r.platform, leads, clicks)) c.dudosos = true;
    else { c.spend += spend; c.leads += leads; }
    porCliente.set(r.clientId, c);
  }
  return [...porCliente.entries()].map(([clientId, c]) => ({
    industry: c.industry,
    clientId,
    ctrMeta: c.metaImp >= 500 ? c.metaClicks / c.metaImp : null, // con menos, no hay señal
    cpl: c.leads > 0 ? c.spend / c.leads : null,
    leadsDudosos: c.dudosos,
  }));
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
    // topAvg es el índice contra lo normal de cada cuenta (1 = lo normal): un
    // ganador tiene que rendir por encima de eso. Comparable entre rubros.
    if (ev.topFormat && (ev.samples ?? 0) >= 5 && (ev.topAvg ?? 0) > 1) winners.push({ niche: key, format: ev.topFormat, avg: ev.topAvg ?? 0 });
  }

  // Same live-snapshot semantics as benchmarks: the suggestion embeds scores,
  // so replace the whole scope instead of accumulating stale suggestions.
  await db.delete(learnings).where(eq(learnings.scope, "niche_experiment"));

  let count = 0;
  for (const [niche, tested] of testedByNiche) {
    // Best foreign winners this niche hasn't tried (generic formats only travel
    // well). Up to TWO per niche — one experiment per rubro was too poor a
    // proposal stream for the panel (pedido del equipo 2026-07-17).
    const candidates = winners
      .filter((w) => w.niche !== niche && !tested.has(w.format) && w.format !== "otro")
      .sort((a, b) => b.avg - a.avg);
    const picks: typeof candidates = [];
    for (const c of candidates) {
      if (picks.length >= 2) break;
      if (!picks.some((p) => p.format === c.format)) picks.push(c);
    }
    for (const candidate of picks) {
      const pattern = `Experimento sugerido para "${niche}": probar ${candidate.format} — en "${candidate.niche}" rinde ${candidate.avg.toFixed(2).replace(".", ",")} veces lo normal de cada cuenta y en este rubro no hay datos suficientes todavía.`;
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
  }
  return { experiments: count };
}

/**
 * Plan de acción por nicho (scope "niche_actions"): cruza el benchmark recién
 * minado con los números de CADA cliente y las mejores campañas reales, y baja
 * acciones concretas — subir CTR / bajar CPL replicando lo que ya funciona,
 * escalar a los que rinden arriba de la meta, activar pauta en los que no
 * tienen — más 2 ideas creativas de IA sobre esos mismos datos. Es lo que el
 * panel /niches muestra como "Acciones a tomar" y los agentes leen como plan.
 */
export type NicheAction = { priority: 1 | 2 | 3; action: string; clientSlug?: string | null; kind: "accion" | "idea" };

export async function mineNicheActions(db: Db): Promise<{ actions: number }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { actions: 0 };
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Every active client with a niche (with or without pauta), plus 30d numbers.
  const clientRows = await db
    .select({ id: clients.id, slug: clients.slug, name: clients.name, industry: clients.industry })
    .from(clients)
    .where(and(eq(clients.status, "active"), isNotNull(clients.industry), notInArray(clients.industry, NON_BENCHMARK_NICHES)));
  // Por cliente y plataforma: el CTR se compara solo en Meta y el CPL sin las
  // conversiones dudosas de Google (desglosarPorCliente), igual que el benchmark.
  const insightRows = await db
    .select({
      clientId: adsInsights.clientId,
      platform: adsInsights.platform,
      spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0)`,
      impressions: sql<number>`coalesce(sum(${adsInsights.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${adsInsights.clicks}), 0)::int`,
      leads: sql<number>`coalesce(sum(${adsInsights.leads}), 0)::int`,
    })
    .from(adsInsights)
    .where(and(gte(adsInsights.date, since), sql`${adsInsights.date} < ${new Date().toISOString().slice(0, 10)}`))
    .groupBy(adsInsights.clientId, adsInsights.platform);
  const campaignRows = await db
    .select({
      industry: clients.industry,
      clientName: clients.name,
      campaignName: adsInsights.campaignName,
      impressions: sql<number>`coalesce(sum(${adsInsights.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${adsInsights.clicks}), 0)::int`,
    })
    .from(adsInsights)
    .innerJoin(clients, eq(adsInsights.clientId, clients.id))
    // Solo Meta: una campaña de búsqueda de Google siempre "gana" por CTR.
    .where(and(gte(adsInsights.date, since), eq(adsInsights.platform, "meta"), eq(clients.status, "active"), isNotNull(clients.industry), isNotNull(adsInsights.campaignName)))
    .groupBy(clients.industry, clients.name, adsInsights.campaignName)
    .having(sql`sum(${adsInsights.impressions}) >= 500`);

  // Fresh learnings from this same pass (order in runLearningPass matters).
  const mined = await db.select().from(learnings).where(notInArray(learnings.scope, ["global"]));
  const evOf = (scope: string, niche: string) =>
    (mined.find((l) => l.scope === scope && l.scopeKey === niche)?.evidence ?? null) as Record<string, unknown> | null;

  const industriaDe = new Map(clientRows.map((c) => [c.id, c.industry]));
  const perClient = new Map(desglosarPorCliente(insightRows
    .filter((r) => r.clientId && industriaDe.has(r.clientId))
    .map((r) => ({ ...r, clientId: r.clientId as string, industry: industriaDe.get(r.clientId as string) ?? null }))).map((d) => [d.clientId, d]));
  const impresiones = new Map<string, number>();
  for (const r of insightRows) if (r.clientId) impresiones.set(r.clientId, (impresiones.get(r.clientId) ?? 0) + Number(r.impressions));
  const byNiche = new Map<string, typeof clientRows>();
  for (const c of clientRows) {
    const arr = byNiche.get(c.industry!) ?? [];
    arr.push(c);
    byNiche.set(c.industry!, arr);
  }

  await db.delete(learnings).where(eq(learnings.scope, "niche_actions"));

  let count = 0;
  for (const [niche, members] of byNiche) {
    const bench = evOf("niche_benchmark", niche) as { avgCtr?: number; idealCtr?: number; avgCpl?: number; idealCpl?: number } | null;
    if (!bench || (bench.idealCtr == null && bench.idealCpl == null)) continue; // sin benchmark no hay meta contra la cual accionar
    const fmtAds = (evOf("niche_ads_format", niche) as { ranked?: Array<{ format: string; ctr: number }> } | null)?.ranked?.[0] ?? null;
    const topCampaign = campaignRows
      .filter((c) => c.industry === niche && Number(c.impressions) > 0)
      .map((c) => ({ name: c.campaignName!, clientName: c.clientName, ctr: Number(c.clicks) / Number(c.impressions) }))
      .sort((a, b) => b.ctr - a.ctr)[0] ?? null;

    const actions: NicheAction[] = [];
    const sinPauta: string[] = [];
    for (const m of members) {
      const d = perClient.get(m.id);
      if ((impresiones.get(m.id) ?? 0) < 500) { sinPauta.push(m.name); continue; }
      const ctr = d?.ctrMeta ?? null;
      const cpl = d?.cpl ?? null;
      if (d?.leadsDudosos) {
        actions.push({
          priority: 1,
          action: `Corregir las conversiones de Google de ${m.name}: cuenta como conversión más de un tercio de los clics, así que no son leads. Revisar qué acciones están como "principales" en Google Ads; hasta entonces su costo por resultado de Google no se usa.`,
          clientSlug: m.slug, kind: "accion",
        });
      }
      const replicar = [
        fmtAds ? `pasar la pauta a formato "${fmtAds.format}" (CTR ${(fmtAds.ctr * 100).toFixed(2)}% en el nicho)` : "",
        topCampaign && topCampaign.clientName !== m.name ? `replicar la estructura de "${topCampaign.name}" (${topCampaign.clientName}, CTR ${(topCampaign.ctr * 100).toFixed(2)}%)` : "",
      ].filter(Boolean).join(" y ");
      if (ctr != null && bench.idealCtr != null && ctr < bench.idealCtr * 0.9) {
        actions.push({
          priority: bench.avgCtr != null && ctr < bench.avgCtr ? 1 : 2,
          action: `Subir el CTR en Meta de ${m.name}: ${(ctr * 100).toFixed(2)}% hoy vs meta ${(bench.idealCtr * 100).toFixed(2)}%${replicar ? ` — ${replicar}` : ""}.`,
          clientSlug: m.slug, kind: "accion",
        });
      } else if (cpl != null && bench.idealCpl != null && cpl > bench.idealCpl * 1.2) {
        actions.push({
          priority: bench.avgCpl != null && cpl > bench.avgCpl ? 1 : 2,
          action: `Bajar el CPL de ${m.name}: $${Math.round(cpl)} hoy vs meta $${Math.round(bench.idealCpl)} — revisar segmentación y oferta; sus pares del nicho lo consiguen.`,
          clientSlug: m.slug, kind: "accion",
        });
      } else if (ctr != null || cpl != null) {
        actions.push({
          priority: 2,
          action: `Escalar presupuesto de ${m.name}: ya rinde en la meta del nicho (${[ctr != null ? `CTR en Meta ${(ctr * 100).toFixed(2)}%` : "", cpl != null ? `CPL ${Math.round(cpl)}` : ""].filter(Boolean).join(", ")}) — subir inversión gradual manteniendo la creatividad.`,
          clientSlug: m.slug, kind: "accion",
        });
      }
    }
    if (sinPauta.length > 0) {
      actions.push({
        priority: 3,
        action: `Activar pauta en ${sinPauta.slice(0, 4).join(", ")}${sinPauta.length > 4 ? ` (+${sinPauta.length - 4})` : ""}: el nicho tiene meta clara (${[bench.idealCtr != null ? `CTR en Meta ${(bench.idealCtr * 100).toFixed(2)}%` : "", bench.idealCpl != null ? `CPL ${Math.round(bench.idealCpl)}` : ""].filter(Boolean).join(", ")}) — proponer plan de medios.`,
        kind: "accion",
      });
    }

    // 2 ideas creativas de IA sobre los mismos datos (best-effort — si el
    // modelo no está, el plan determinístico queda igual de útil).
    try {
      const { aiNarrative } = await import("./agency-ops.js");
      const raw = await aiNarrative(
        [
          "Sos estratega creativo de LMTM (agencia de marketing latam). Con los datos reales del rubro, proponé exactamente 2 ideas creativas ACCIONABLES para mejorar resultados de los clientes del rubro (ángulos de campaña, ofertas, formatos, hooks).",
          "Cada idea en UNA línea concreta y ejecutable, español rioplatense, sin relleno ni genéricos. Respondé SOLO un array JSON de 2 strings.",
        ].join("\n"),
        [
          `Rubro: ${niche} (${members.length} clientes).`,
          `Benchmark 30d: ${[bench.idealCtr != null ? `CTR en Meta prom ${((bench.avgCtr ?? 0) * 100).toFixed(2)}% / meta ${(bench.idealCtr * 100).toFixed(2)}%` : "", bench.idealCpl != null ? `CPL meta ${Math.round(bench.idealCpl)}` : ""].filter(Boolean).join("; ")}.`,
          fmtAds ? `Formato que gana en ads: ${fmtAds.format} (CTR ${(fmtAds.ctr * 100).toFixed(2)}%).` : "",
          topCampaign ? `Mejor campaña real: "${topCampaign.name}" de ${topCampaign.clientName} (CTR ${(topCampaign.ctr * 100).toFixed(2)}%).` : "",
        ].filter(Boolean).join("\n"),
      );
      const s = raw?.indexOf("[") ?? -1, e = raw?.lastIndexOf("]") ?? -1;
      if (raw && s !== -1 && e > s) {
        const parsed = JSON.parse(raw.slice(s, e + 1)) as unknown[];
        for (const idea of parsed.slice(0, 2)) {
          if (typeof idea === "string" && idea.trim().length > 15) actions.push({ priority: 3, action: idea.trim(), kind: "idea" });
        }
      }
    } catch { /* ideas de IA son opcionales */ }

    if (actions.length === 0) continue;
    actions.sort((a, b) => a.priority - b.priority);
    const urgent = actions.filter((a) => a.priority === 1).length;
    const pattern = `Plan de acción de "${niche}" (30d): ${actions.length} acciones${urgent ? `, ${urgent} urgente${urgent === 1 ? "" : "s"}` : ""}.`;
    await db.insert(learnings).values({
      companyId: company.id, scope: "niche_actions", scopeKey: niche, pattern,
      evidence: { actions: actions.slice(0, 8), windowDays: 30 },
      metricImpact: "ads_benchmark", confidence: "0.7", occurrences: actions.length, lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: [learnings.scope, learnings.scopeKey, learnings.pattern],
      set: { evidence: { actions: actions.slice(0, 8), windowDays: 30 }, occurrences: actions.length, lastSeenAt: new Date() },
    });
    count += 1;
  }
  return { actions: count };
}

/** Learnings relevant to a niche (for opportunities / reports). */
export async function learningsForNiche(db: Db, niche: string | null) {
  const rows = await db.select().from(learnings).limit(200);
  const n = (niche ?? "general").toLowerCase();
  return rows.filter((l) => l.scope === "global" || (l.scopeKey ?? "") === n).slice(0, 10);
}

/** Full mining pass: formats → benchmarks → experiments (experiments read the
 *  freshly-mined format learnings, so order matters). */
export async function runLearningPass(db: Db): Promise<{ learnings: number; benchmarks: number; experiments: number; adsFormats: number; actions: number }> {
  const l = await mineLearnings(db).catch((e) => { console.warn("[learning] formats failed:", e); return { learnings: 0 }; });
  const b = await mineAdsBenchmarks(db).catch((e) => { console.warn("[learning] benchmarks failed:", e); return { benchmarks: 0 }; });
  const f = await mineAdsWinningFormats(db).catch((e) => { console.warn("[learning] ads formats failed:", e); return { formats: 0 }; });
  const x = await mineExperiments(db).catch((e) => { console.warn("[learning] experiments failed:", e); return { experiments: 0 }; });
  // Actions read everything mined above — always last.
  const a = await mineNicheActions(db).catch((e) => { console.warn("[learning] actions failed:", e); return { actions: 0 }; });
  return { ...l, ...b, adsFormats: f.formats, ...x, ...a };
}

let learnTimer: ReturnType<typeof setInterval> | null = null;
export function initLearningEngine(db: Db): void {
  if (learnTimer) return;
  setTimeout(() => { void runLearningPass(db); }, 20 * 60 * 1000);
  learnTimer = setInterval(() => { void runLearningPass(db); }, 24 * 3600 * 1000);
  console.log("[learning-engine] scheduled learning mining (formats+benchmarks+experiments) every 24h");
}
