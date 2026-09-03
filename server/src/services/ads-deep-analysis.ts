// LMTM-OS: análisis profundo de pauta (pedido 23/7, inspirado en la IA de
// Meta): benchmark vs el rubro, cuello de botella de formatos creativos y
// eficiencia por edad — determinista, con números reales, en lenguaje que se
// puede reenviar al cliente. Lo consumen el endpoint /analisis-estrategico
// (card del dashboard) y el tool get_client_ads_performance (agentes).

import type { Db } from "@paperclipai/db";
import { adsAdsets, adsCreatives, adsInsights, audienceDemographics, learnings } from "@paperclipai/db";
import { and, eq, gte, isNotNull, sql as dsql } from "drizzle-orm";

export interface ConjuntoAnalisis {
  id: string;
  nombre: string;
  spend: number;
  leads: number;
  cpl: number | null;
  ctrPct: number | null;
  /** % vs CPL promedio del rubro (negativo = mejor que el promedio). */
  deltaVsRubroPct: number | null;
  creativosActivos: number;
  formatos: string[];
  /** Depende de un solo creativo activo — riesgo de fatiga/estancamiento. */
  monoCreativo: boolean;
  creativoUnico: string | null;
}

export interface AnalisisProfundo {
  benchmark: { cpl: number | null; ctrPct: number | null; rubroCplProm: number; rubroCplIdeal: number; deltaPct: number | null } | null;
  formatos: { mix: Record<string, number>; dominante: string | null; dominantePct: number } | null;
  porEdad: Array<{ rango: string; spend: number; leads: number; cpl: number | null }>;
  porConjunto: ConjuntoAnalisis[];
  resumen: string[];
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

function clasificarFormato(raw: unknown): string {
  const creative = (raw as { creative?: Record<string, unknown> } | null)?.creative ?? {};
  const spec = (creative.object_story_spec ?? {}) as Record<string, unknown>;
  if (spec.video_data) return "video";
  const link = spec.link_data as Record<string, unknown> | undefined;
  if (link?.child_attachments) return "carrusel";
  if (link) return "imagen";
  if (spec.photo_data) return "imagen";
  return "otro";
}

export async function analisisProfundo(db: Db, client: { id: string; industry: string | null }): Promise<AnalisisProfundo> {
  const resumen: string[] = [];
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  // ── 1. Benchmark vs rubro (learnings minados a diario) ────────────────────
  const [tot] = await db.select({
    spend: dsql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)`,
    leads: dsql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
    impressions: dsql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
    clicks: dsql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
  }).from(adsInsights).where(and(eq(adsInsights.clientId, client.id), gte(adsInsights.date, d30)));
  const spend = Number(tot?.spend ?? 0);
  const cpl = Number(tot?.leads ?? 0) > 0 ? spend / Number(tot.leads) : null;
  const ctrPct = Number(tot?.impressions ?? 0) > 0 ? (Number(tot.clicks) / Number(tot.impressions)) * 100 : null;

  let benchmark: AnalisisProfundo["benchmark"] = null;
  if (client.industry) {
    const [b] = await db.select({ evidence: learnings.evidence })
      .from(learnings)
      .where(and(eq(learnings.scope, "niche_benchmark"), eq(learnings.scopeKey, client.industry)));
    const ev = (b?.evidence ?? null) as { avgCpl?: number; idealCpl?: number } | null;
    if (ev?.avgCpl && cpl != null) {
      const deltaPct = Math.round(((cpl - ev.avgCpl) / ev.avgCpl) * 100);
      benchmark = { cpl, ctrPct, rubroCplProm: ev.avgCpl, rubroCplIdeal: ev.idealCpl ?? ev.avgCpl, deltaPct };
      if (deltaPct <= -15) {
        resumen.push(`Eficiencia vs el rubro: tu costo por consulta (${fmtMoney(cpl)}) está ${Math.abs(deltaPct)}% POR DEBAJO del promedio del rubro (${fmtMoney(ev.avgCpl)}) — la oferta funciona; es momento de escalar presupuesto.`);
      } else if (deltaPct >= 15) {
        resumen.push(`Eficiencia vs el rubro: tu costo por consulta (${fmtMoney(cpl)}) está ${deltaPct}% POR ARRIBA del promedio del rubro (${fmtMoney(ev.avgCpl)}); los mejores lo consiguen a ${fmtMoney(ev.idealCpl ?? ev.avgCpl)}. Hay que revisar creatividad y segmentación.`);
      }
    }
  }

  // ── 2. Cuello de botella de formatos (avisos activos) ─────────────────────
  const crs = await db.select({ status: adsCreatives.status, raw: adsCreatives.raw })
    .from(adsCreatives).where(eq(adsCreatives.clientId, client.id));
  const activos = crs.filter((c) => /active/i.test(String(c.status ?? "")));
  const base = activos.length >= 3 ? activos : crs;
  let formatos: AnalisisProfundo["formatos"] = null;
  if (base.length >= 3) {
    const mix: Record<string, number> = {};
    for (const c of base) mix[clasificarFormato(c.raw)] = (mix[clasificarFormato(c.raw)] ?? 0) + 1;
    const [domFmt, domN] = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
    const domPct = Math.round((domN / base.length) * 100);
    formatos = { mix, dominante: domFmt, dominantePct: domPct };
    if (domPct >= 70 && domFmt !== "otro") {
      const sugerencia = domFmt === "video" ? "imágenes estáticas o carruseles con oferta directa" : domFmt === "imagen" ? "videos cortos (reels) y carruseles" : "videos cortos e imágenes estáticas";
      resumen.push(`Cuello de botella creativo: el ${domPct}% de los avisos son ${domFmt}. Sumar ${sugerencia} le da a la plataforma más ubicaciones donde subastar y suele bajar el costo por resultado.`);
    }
  }

  // ── 2b. Por conjunto de anuncios (el nivel donde decide Meta): CPL propio,
  // delta vs rubro, y dependencia de un solo creativo ────────────────────────
  const adsetAgg = await db.select({
    adsetId: adsInsights.adsetId,
    spend: dsql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)`,
    leads: dsql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
    impressions: dsql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
    clicks: dsql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
  }).from(adsInsights)
    .where(and(eq(adsInsights.clientId, client.id), gte(adsInsights.date, d30), isNotNull(adsInsights.adsetId)))
    .groupBy(adsInsights.adsetId);
  const adsetNames = new Map(
    (await db.select({ id: adsAdsets.id, name: adsAdsets.name }).from(adsAdsets).where(eq(adsAdsets.clientId, client.id))).map((a) => [a.id, a.name]),
  );
  const creativosPorAdset = new Map<string, Array<{ name: string; formato: string }>>();
  for (const c of crs) {
    if (!/active/i.test(String(c.status ?? ""))) continue;
    const adsetId = ((c.raw as { adset_id?: string } | null)?.adset_id) ?? null;
    if (!adsetId) continue;
    const arr = creativosPorAdset.get(adsetId) ?? [];
    arr.push({ name: String((c.raw as { name?: string } | null)?.name ?? ""), formato: clasificarFormato(c.raw) });
    creativosPorAdset.set(adsetId, arr);
  }
  const rubroCpl = benchmark?.rubroCplProm ?? null;
  const porConjunto: ConjuntoAnalisis[] = adsetAgg
    .map((a) => {
      const sp = Number(a.spend);
      const cplA = Number(a.leads) > 0 ? sp / Number(a.leads) : null;
      const creativos = creativosPorAdset.get(a.adsetId ?? "") ?? [];
      return {
        id: a.adsetId ?? "",
        nombre: adsetNames.get(a.adsetId ?? "") ?? (a.adsetId ?? "?"),
        spend: sp,
        leads: Number(a.leads),
        cpl: cplA,
        ctrPct: Number(a.impressions) > 0 ? (Number(a.clicks) / Number(a.impressions)) * 100 : null,
        deltaVsRubroPct: cplA != null && rubroCpl ? Math.round(((cplA - rubroCpl) / rubroCpl) * 100) : null,
        creativosActivos: creativos.length,
        formatos: [...new Set(creativos.map((c) => c.formato))],
        monoCreativo: creativos.length === 1,
        creativoUnico: creativos.length === 1 ? creativos[0].name : null,
      };
    })
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);
  const monos = porConjunto.filter((a) => a.monoCreativo && a.spend > spend * 0.1);
  if (monos.length) {
    resumen.push(`Dependencia de un solo creativo: ${monos.map((m) => `"${m.nombre.slice(0, 35)}" (todo cuelga de "${(m.creativoUnico ?? "").slice(0, 35)}")`).join("; ")}. Si ese anuncio se fatiga, el conjunto se cae — sumar variantes ya.`);
  }

  // ── 3. Eficiencia por edad (último snapshot de demographics) ──────────────
  const ages = await db.select({
    rango: audienceDemographics.dimKey,
    spend: dsql<string>`coalesce(sum(${audienceDemographics.spend})::numeric,0)`,
    leads: dsql<number>`coalesce(sum(${audienceDemographics.leads}),0)::int`,
  }).from(audienceDemographics)
    .where(and(
      eq(audienceDemographics.clientId, client.id),
      eq(audienceDemographics.dimension, "age"),
      dsql`${audienceDemographics.periodUntil} = (select max(period_until) from ${audienceDemographics} ad2 where ad2.client_id = ${client.id} and ad2.dimension = 'age')`,
    ))
    .groupBy(audienceDemographics.dimKey);
  const porEdad = ages
    .map((a) => ({ rango: a.rango, spend: Number(a.spend), leads: Number(a.leads), cpl: Number(a.leads) > 0 ? Number(a.spend) / Number(a.leads) : null }))
    .filter((a) => a.spend > 0)
    .sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity));
  const conCpl = porEdad.filter((a) => a.cpl != null);
  if (conCpl.length >= 2) {
    const mejor = conCpl[0];
    const peor = conCpl[conCpl.length - 1];
    if ((peor.cpl ?? 0) >= (mejor.cpl ?? 1) * 1.8) {
      resumen.push(`Segmentación por edad: el rango ${mejor.rango} es el más eficiente (consulta a ${fmtMoney(mejor.cpl!)}), mientras que ${peor.rango} paga ${fmtMoney(peor.cpl!)} — ${(peor.cpl! / mejor.cpl!).toFixed(1)}× más caro. Reasignar presupuesto hacia ${mejor.rango} (o excluir ${peor.rango}) baja el costo total.`);
    }
  }
  const sinLeads = porEdad.filter((a) => a.cpl == null && a.spend > spend * 0.08);
  for (const s of sinLeads.slice(0, 1)) {
    resumen.push(`El rango ${s.rango} gastó ${fmtMoney(s.spend)} sin generar consultas — candidato a exclusión.`);
  }

  return { benchmark, formatos, porEdad, porConjunto, resumen };
}

// ── Narrativa estilo "IA de Meta" (pedido 23/7): un estratega LLM escribe el
// análisis hilado sobre los datos duros, nombrando conjuntos y anuncios
// REALES. Cache 12h en memoria (MiniMax por consulta cuesta; el dato de fondo
// cambia a diario). ────────────────────────────────────────────────────────
const narrativaCache = new Map<string, { at: number; texto: string }>();

export async function narrativaPauta(
  db: Db,
  client: { id: string; name: string; industry: string | null },
): Promise<{ texto: string | null; cached: boolean }> {
  const hit = narrativaCache.get(client.id);
  if (hit && Date.now() - hit.at < 12 * 3_600_000) return { texto: hit.texto, cached: true };

  const datos = await analisisProfundo(db, client);
  if (!datos.porConjunto.length && !datos.porEdad.length) return { texto: null, cached: false };

  const { aiNarrative } = await import("./agency-ops.js");
  const system = [
    "Sos el estratega senior de pauta de LMTM (agencia de marketing). Escribís el análisis de la cuenta de UN cliente para que el equipo se lo reenvíe tal cual.",
    "Estilo: como el asistente de IA de Meta Ads — diagnóstico con números exactos y recomendaciones accionables. Español rioplatense profesional, sin jerga técnica innecesaria.",
    "Estructura EXACTA (markdown):",
    "**Diagnóstico** — 2-3 párrafos cortos: eficiencia vs el rubro, qué conjunto trabaja mejor y cuál peor (POR NOMBRE, con su costo por consulta), cuellos de botella de creativos (si un conjunto depende de un solo anuncio, nombralo), y qué pasa por edad.",
    "**Recomendaciones** — 3 a 5, numeradas, cada una anclada a un dato del JSON (nada que sirva para cualquier cliente).",
    "PROHIBIDO: inventar números o nombres que no estén en el JSON; consejos genéricos; más de 300 palabras.",
  ].join("\n");
  const datosJson = JSON.stringify({
    cliente: client.name,
    rubro: client.industry,
    benchmarkRubro: datos.benchmark,
    porConjunto: datos.porConjunto,
    porEdad: datos.porEdad,
    mixFormatos: datos.formatos,
    hallazgos: datos.resumen,
  });
  let texto = await aiNarrative(system, datosJson).catch(() => null);
  // Gate de fundamentación (curso reliable-agents 26/7): el análisis se
  // reenvía al cliente tal cual, así que ninguna cifra/nombre inventado puede
  // pasar. Juez binario contra el JSON; 1 reintento con el motivo; si vuelve a
  // fallar, mejor sin narrativa (el panel tiene botón Reintentar) que con una
  // alucinada.
  if (texto) {
    try {
      const { gateBinario } = await import("./entrega-checks.js");
      let v = await gateBinario({
        criterio: "¿TODAS las cifras y TODOS los nombres de conjuntos/anuncios que menciona el texto existen en los datos fuente? Un solo número o nombre que no esté en el JSON = false.",
        contenido: texto,
        contexto: datosJson,
      });
      if (!v.ok) {
        const retry = await aiNarrative(system + `\nOJO: tu intento anterior falló la verificación por esto: "${v.motivo}". Usá SOLO datos del JSON.`, datosJson).catch(() => null);
        if (retry) {
          v = await gateBinario({
            criterio: "¿TODAS las cifras y TODOS los nombres de conjuntos/anuncios que menciona el texto existen en los datos fuente? Un solo número o nombre que no esté en el JSON = false.",
            contenido: retry,
            contexto: datosJson,
          });
          texto = v.ok ? retry : null;
        } else {
          texto = null;
        }
        if (!texto) console.warn(`[narrativa-pauta] gate de fundamentación descartó la narrativa de ${client.name}: ${v.motivo}`);
      }
    } catch { /* gate best-effort: no romper el panel */ }
  }
  if (texto) {
    // MiniMax filtra tokens CJK mid-frase ("Si se quiere测试…") — mismo saneo
    // que en el resto de los entregables.
    const { NON_LATIN_RE } = await import("./entrega-checks.js");
    texto = texto.replace(new RegExp(NON_LATIN_RE.source, "g"), "");
    narrativaCache.set(client.id, { at: Date.now(), texto });
  }
  return { texto, cached: false };
}
