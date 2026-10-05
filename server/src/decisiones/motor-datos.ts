// LMTM-OS: las consultas que alimentan las reglas de pauta.
//
// Separado de las reglas para que las reglas sean puras y se puedan probar sin
// base. Todas las ventanas terminan AYER: el día de hoy está a medio
// sincronizar y contarlo ya rompió dos cálculos (CONTEXTO, incidente 9).

import type { Db } from "@paperclipai/db";
import { adsAdsets, adsCampaigns, adsCreatives, adsInsights, agentActions } from "@paperclipai/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { deMenor } from "../services/ads-budget.js";
import { esTerminoDeMarca } from "../services/ads-keywords.js";
import { metricasCliente } from "../metricas/index.js";
import { esActiva, metricasCampanas, type MetricasCampana } from "../metricas/campanas.js";
import { evaluarPropuesta, type ContextoEval } from "../metricas/eval-propuestas.js";
import type { AnuncioVentana, ConjuntoEscalable, UnidadPauta } from "./reglas/pauta.js";

const ZONA = "America/Argentina/Buenos_Aires";

/** YYYY-MM-DD de un instante, en la hora de Buenos Aires. */
export function fechaLocal(d: Date): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Resta días a una fecha YYYY-MM-DD sin pasar por husos horarios. */
export function restarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) - dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface Ventanas {
  hasta: string;
  desde14: string;
  desde7: string;
  desde3: string;
  /** Las dos semanas completas para la regla de costo por calificado. */
  semana1: { desde: string; hasta: string };
  semana2: { desde: string; hasta: string };
}

export function ventanas(ahora = new Date()): Ventanas {
  const hasta = restarDias(fechaLocal(ahora), 1);
  return {
    hasta,
    desde14: restarDias(hasta, 13),
    desde7: restarDias(hasta, 6),
    desde3: restarDias(hasta, 2),
    semana1: { desde: restarDias(hasta, 13), hasta: restarDias(hasta, 7) },
    semana2: { desde: restarDias(hasta, 6), hasta },
  };
}

/** Anuncios con gasto en los últimos 14 días, por cliente. */
export async function anunciosPorCliente(db: Db, clientIds: string[], v: Ventanas): Promise<Map<string, AnuncioVentana[]>> {
  const out = new Map<string, AnuncioVentana[]>();
  if (clientIds.length === 0) return out;
  const filas = await db
    .select({
      clientId: adsInsights.clientId,
      adId: adsInsights.adId,
      campana: sql<string | null>`max(${adsInsights.campaignName})`,
      gasto14: sql<string>`coalesce(sum(${adsInsights.spend}), 0)`,
      leads14: sql<string>`coalesce(sum(${adsInsights.leads}), 0)`,
      gasto3: sql<string>`coalesce(sum(${adsInsights.spend}) filter (where ${adsInsights.date} >= ${v.desde3}), 0)`,
      impresiones7: sql<string>`coalesce(sum(${adsInsights.impressions}) filter (where ${adsInsights.date} >= ${v.desde7}), 0)`,
      alcance7: sql<string>`coalesce(sum(${adsInsights.reach}) filter (where ${adsInsights.date} >= ${v.desde7}), 0)`,
    })
    .from(adsInsights)
    .where(and(
      inArray(adsInsights.clientId, clientIds),
      gte(adsInsights.date, v.desde14),
      lte(adsInsights.date, v.hasta),
      sql`${adsInsights.adId} is not null`,
    ))
    .groupBy(adsInsights.clientId, adsInsights.adId);

  // Nombres de los anuncios: el titular manda menos que el nombre que le puso
  // el equipo, que es como lo buscan en el administrador.
  const ids = [...new Set(filas.map((f) => f.adId).filter((x): x is string => !!x))];
  const nombres = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const rows = await db.select({ id: adsCreatives.id, name: adsCreatives.name }).from(adsCreatives).where(inArray(adsCreatives.id, lote));
    for (const r of rows) nombres.set(r.id, r.name);
  }

  for (const f of filas) {
    if (!f.clientId || !f.adId) continue;
    const arr = out.get(f.clientId) ?? [];
    arr.push({
      adId: f.adId,
      nombre: nombres.get(f.adId) ?? null,
      campana: f.campana,
      gasto14: Number(f.gasto14),
      leads14: Number(f.leads14),
      gasto3: Number(f.gasto3),
      impresiones7: Number(f.impresiones7),
      alcance7: Number(f.alcance7),
    });
    out.set(f.clientId, arr);
  }
  return out;
}

/**
 * ¿La campaña sigue corriendo? Meta deja en ACTIVE las campañas que ya
 * pasaron su fecha de fin (lo encontró A en A4): proponer "+20%" en una que
 * terminó es un botón que no sirve para nada. Sin fecha de fin, sigue.
 */
export function vigente(fin: string | null | undefined, hasta: string): boolean {
  return !fin || fin >= hasta;
}

type TcplFuente = "cliente" | "historial" | null;

/**
 * Lo que las reglas de pauta necesitan de un cliente, todo de `metricas` (A2):
 * el objetivo POR PLATAFORMA (Google no se mide con el de Meta) y las campañas
 * de los últimos 14 y 3 días. El objetivo del rubro no entra: es un promedio
 * ajeno, y decidir con él sería afirmar algo del cliente con datos de otros.
 */
export interface ContextoPauta {
  ctx: ContextoEval;
  fuente: { meta: TcplFuente; google: TcplFuente };
  campanas14: MetricasCampana[];
  campanas3: MetricasCampana[];
}

export async function contextoPauta(db: Db, cliente: { id: string; nombre: string }, v: Ventanas): Promise<ContextoPauta> {
  const v14 = { desde: v.desde14, hasta: v.hasta };
  const [meta, google, campanas14, campanas3] = await Promise.all([
    metricasCliente(db, cliente.id, { ...v14, plataforma: "meta" }),
    metricasCliente(db, cliente.id, { ...v14, plataforma: "google" }),
    metricasCampanas(db, cliente.id, v14),
    metricasCampanas(db, cliente.id, { desde: v.desde3, hasta: v.hasta }),
  ]);
  const propio = (o: { tcpl: number | null; tcplFuente: string | null }) =>
    o.tcpl != null && (o.tcplFuente === "cliente" || o.tcplFuente === "historial")
      ? { tcpl: o.tcpl, fuente: o.tcplFuente as TcplFuente }
      : { tcpl: null, fuente: null };
  const m = propio(meta.objetivo);
  const g = propio(google.objetivo);
  return {
    // La misma vara que el evaluador del piloto (eval-propuestas-cli de A).
    ctx: { tcpl: { meta: m.tcpl, google: g.tcpl }, esMarca: (n) => /\b(brand|marca)\b/i.test(n) || esTerminoDeMarca(cliente.nombre, n) },
    fuente: { meta: m.fuente, google: g.fuente },
    campanas14: campanas14 ?? [],
    campanas3: campanas3 ?? [],
  };
}

/**
 * Campañas y conjuntos de una plataforma que la regla de "sin leads" puede
 * juzgar: los que el evaluador de A dejaría pausar (objetivo de leads, no la
 * de marca, sin leads dudosos, gasto de 3×TCPL y CPL alto o sin leads). Un
 * conjunto se juzga solo; la campaña, cuando no trae conjuntos.
 */
export function unidadesSinLeads(cp: ContextoPauta, plataforma: "meta" | "google"): UnidadPauta[] {
  const gasto3 = new Map<string, number>();
  for (const c of cp.campanas3) {
    gasto3.set(`campana:${c.campaignId}`, c.inversion);
    for (const a of c.conjuntos) gasto3.set(`conjunto:${a.adsetId}`, a.inversion);
  }
  const out: UnidadPauta[] = [];
  for (const c of cp.campanas14.filter((x) => x.plataforma === plataforma)) {
    const unidades: UnidadPauta[] = c.conjuntos.length
      ? c.conjuntos.map((a) => ({ id: a.adsetId, nivel: "conjunto", plataforma, nombre: a.nombre, campana: c.nombre, gasto14: a.inversion, leads14: a.leads, gasto3: gasto3.get(`conjunto:${a.adsetId}`) ?? 0 }))
      : [{ id: c.campaignId, nivel: "campana", plataforma, nombre: c.nombre, campana: c.nombre, gasto14: c.inversion, leads14: c.leads, gasto3: gasto3.get(`campana:${c.campaignId}`) ?? 0 }];
    for (const u of unidades) {
      const v = evaluarPropuesta({ accion: "pause", entityType: u.nivel === "campana" ? "campaign" : "adset", entityId: u.id }, cp.campanas14, cp.ctx);
      if (v.ok) out.push(u);
    }
  }
  return out;
}

/**
 * Candidatos a escalar de un cliente: campañas y conjuntos de Meta vigentes,
 * con presupuesto diario propio, que el evaluador de A dejaría subir 20%
 * (objetivo de leads, CPL debajo del objetivo, sin leads dudosos). La
 * frecuencia se lee por anuncio de `ads_insights` (metricas no trae alcance) y
 * el último cambio, de lo que movió el sistema.
 *
 * Solo Meta: el sync de Google no trae presupuestos, y sin el actual no hay
 * cómo proponer "+20%".
 */
export async function conjuntosEscalables(db: Db, cp: ContextoPauta, v: Ventanas): Promise<ConjuntoEscalable[]> {
  const unidades: Array<{ entityType: "campaign" | "adset"; id: string; nombre: string; presupuesto: number; gasto14: number; leads14: number }> = [];
  for (const c of cp.campanas14) {
    if (c.plataforma !== "meta" || !esActiva(c.estado) || !vigente(c.fin, v.hasta)) continue;
    if (c.presupuestoDiario != null && c.presupuestoDiario > 0) {
      unidades.push({ entityType: "campaign", id: c.campaignId, nombre: c.nombre ?? c.campaignId, presupuesto: c.presupuestoDiario, gasto14: c.inversion, leads14: c.leads });
    }
    for (const a of c.conjuntos) {
      if (!esActiva(a.estado) || a.presupuestoDiario == null || !(a.presupuestoDiario > 0)) continue;
      unidades.push({ entityType: "adset", id: a.adsetId, nombre: a.nombre ?? a.adsetId, presupuesto: a.presupuestoDiario, gasto14: a.inversion, leads14: a.leads });
    }
  }
  const defendibles = unidades.filter(
    (u) => evaluarPropuesta({ accion: "set_budget", entityType: u.entityType, entityId: u.id, nuevoDiario: Math.round(u.presupuesto * 1.2) }, cp.campanas14, cp.ctx).ok,
  );
  if (defendibles.length === 0) return [];

  // Frecuencia de 7 días por conjunto o campaña (cota inferior: suma de alcances diarios).
  const frec = async (col: typeof adsInsights.adsetId | typeof adsInsights.campaignId, ids: string[]) => {
    if (ids.length === 0) return new Map<string, { impresiones7: number; alcance7: number }>();
    const filas = await db
      .select({
        id: col,
        impresiones7: sql<string>`coalesce(sum(${adsInsights.impressions}), 0)`,
        alcance7: sql<string>`coalesce(sum(${adsInsights.reach}), 0)`,
      })
      .from(adsInsights)
      .where(and(inArray(col, ids), gte(adsInsights.date, v.desde7), lte(adsInsights.date, v.hasta)))
      .groupBy(col);
    return new Map(filas.map((f) => [String(f.id), { impresiones7: Number(f.impresiones7), alcance7: Number(f.alcance7) }]));
  };
  const porAdset = await frec(adsInsights.adsetId, defendibles.filter((u) => u.entityType === "adset").map((u) => u.id));
  const porCampana = await frec(adsInsights.campaignId, defendibles.filter((u) => u.entityType === "campaign").map((u) => u.id));

  const cambios = await db
    .select({ entityId: agentActions.entityId, ultimo: sql<string>`max(${agentActions.createdAt})` })
    .from(agentActions)
    .where(and(eq(agentActions.kind, "set_budget"), inArray(agentActions.entityId, defendibles.map((u) => u.id))))
    .groupBy(agentActions.entityId);
  const ultimoCambio = new Map(cambios.map((c) => [c.entityId, c.ultimo ? new Date(c.ultimo) : null]));

  return defendibles.map((u) => ({
    entityType: u.entityType,
    entityId: u.id,
    nombre: u.nombre,
    presupuestoDiario: u.presupuesto,
    gasto14: u.gasto14,
    leads14: u.leads14,
    ...((u.entityType === "adset" ? porAdset : porCampana).get(u.id) ?? { impresiones7: 0, alcance7: 0 }),
    ultimoCambio: ultimoCambio.get(u.id) ?? null,
  }));
}

/**
 * Presupuesto diario en pesos según la base, que es lo mismo que mira
 * ads-budget para Meta (`ads_adsets.daily_budget` en centavos). null = no hay
 * fila o es Google, que no trae presupuestos en el sync.
 */
export async function presupuestoEnBase(db: Db, entityType: "campaign" | "adset", entityId: string): Promise<number | null> {
  const t = entityType === "campaign" ? adsCampaigns : adsAdsets;
  const [f] = await db.select({ platform: t.platform, dailyBudget: t.dailyBudget }).from(t).where(eq(t.id, entityId)).limit(1);
  if (!f || f.platform !== "meta" || f.dailyBudget == null) return null;
  const pesos = deMenor(Number(f.dailyBudget));
  return pesos > 0 ? pesos : null;
}

/** Última vez que el sistema movió el presupuesto de una entidad. */
export async function ultimoCambioPresupuesto(db: Db, entityId: string): Promise<Date | null> {
  const [r] = await db
    .select({ ultimo: sql<string | null>`max(${agentActions.createdAt})` })
    .from(agentActions)
    .where(and(eq(agentActions.kind, "set_budget"), eq(agentActions.entityId, entityId)));
  return r?.ultimo ? new Date(r.ultimo) : null;
}
