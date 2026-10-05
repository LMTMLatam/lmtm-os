// LMTM-OS: las consultas que alimentan las reglas de pauta.
//
// Separado de las reglas para que las reglas sean puras y se puedan probar sin
// base. Todas las ventanas terminan AYER: el día de hoy está a medio
// sincronizar y contarlo ya rompió dos cálculos (CONTEXTO, incidente 9).

import type { Db } from "@paperclipai/db";
import { adsAdsets, adsCampaigns, adsCreatives, adsInsights, agentActions } from "@paperclipai/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { deMenor } from "../services/ads-budget.js";
import type { AnuncioVentana, ConjuntoEscalable } from "./reglas/pauta.js";

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

/**
 * Conjuntos y campañas de Meta con presupuesto diario propio, activos, con su
 * rendimiento de 14 días y el último cambio de presupuesto que hizo el sistema.
 *
 * Solo Meta: el sync de Google no trae presupuestos, y sin el actual no hay
 * cómo proponer "+20%".
 */
export async function conjuntosEscalables(db: Db, clientIds: string[], v: Ventanas): Promise<Map<string, ConjuntoEscalable[]>> {
  const out = new Map<string, ConjuntoEscalable[]>();
  if (clientIds.length === 0) return out;

  const adsets = await db
    .select({ id: adsAdsets.id, clientId: adsAdsets.clientId, name: adsAdsets.name, dailyBudget: adsAdsets.dailyBudget, status: adsAdsets.status, campaignId: adsAdsets.campaignId })
    .from(adsAdsets)
    .where(and(inArray(adsAdsets.clientId, clientIds), eq(adsAdsets.platform, "meta"), sql`coalesce(${adsAdsets.dailyBudget}, 0) > 0`));
  const campanas = await db
    .select({ id: adsCampaigns.id, clientId: adsCampaigns.clientId, name: adsCampaigns.name, dailyBudget: adsCampaigns.dailyBudget, status: adsCampaigns.status })
    .from(adsCampaigns)
    .where(and(inArray(adsCampaigns.clientId, clientIds), eq(adsCampaigns.platform, "meta"), sql`coalesce(${adsCampaigns.dailyBudget}, 0) > 0`));
  // Fecha de fin de TODAS las campañas de Meta del cliente (también las que
  // reparten el presupuesto en sus conjuntos), en día de Buenos Aires.
  const fines = new Map(
    (
      await db
        .select({ id: adsCampaigns.id, fin: sql<string | null>`to_char(${adsCampaigns.stopTime} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')` })
        .from(adsCampaigns)
        .where(and(inArray(adsCampaigns.clientId, clientIds), eq(adsCampaigns.platform, "meta"), sql`${adsCampaigns.stopTime} is not null`))
    ).map((c) => [c.id, c.fin]),
  );

  const activo = (s: string | null) => /^active$/i.test(s ?? "");
  const entidades = [
    ...adsets
      .filter((a) => activo(a.status) && vigente(a.campaignId ? fines.get(a.campaignId) : null, v.hasta))
      .map(({ campaignId: _c, ...a }) => ({ ...a, entityType: "adset" as const })),
    ...campanas.filter((c) => activo(c.status) && vigente(fines.get(c.id), v.hasta)).map((c) => ({ ...c, entityType: "campaign" as const })),
  ];
  if (entidades.length === 0) return out;

  const rend = async (col: typeof adsInsights.adsetId | typeof adsInsights.campaignId, ids: string[]) => {
    if (ids.length === 0) return new Map<string, { gasto14: number; leads14: number; impresiones7: number; alcance7: number }>();
    const filas = await db
      .select({
        id: col,
        gasto14: sql<string>`coalesce(sum(${adsInsights.spend}), 0)`,
        leads14: sql<string>`coalesce(sum(${adsInsights.leads}), 0)`,
        impresiones7: sql<string>`coalesce(sum(${adsInsights.impressions}) filter (where ${adsInsights.date} >= ${v.desde7}), 0)`,
        alcance7: sql<string>`coalesce(sum(${adsInsights.reach}) filter (where ${adsInsights.date} >= ${v.desde7}), 0)`,
      })
      .from(adsInsights)
      .where(and(inArray(col, ids), gte(adsInsights.date, v.desde14), lte(adsInsights.date, v.hasta)))
      .groupBy(col);
    return new Map(filas.map((f) => [String(f.id), {
      gasto14: Number(f.gasto14), leads14: Number(f.leads14), impresiones7: Number(f.impresiones7), alcance7: Number(f.alcance7),
    }]));
  };
  const porAdset = await rend(adsInsights.adsetId, entidades.filter((e) => e.entityType === "adset").map((e) => e.id));
  const porCampana = await rend(adsInsights.campaignId, entidades.filter((e) => e.entityType === "campaign").map((e) => e.id));

  const cambios = await db
    .select({ entityId: agentActions.entityId, ultimo: sql<string>`max(${agentActions.createdAt})` })
    .from(agentActions)
    .where(and(eq(agentActions.kind, "set_budget"), inArray(agentActions.entityId, entidades.map((e) => e.id))))
    .groupBy(agentActions.entityId);
  const ultimoCambio = new Map(cambios.map((c) => [c.entityId, c.ultimo ? new Date(c.ultimo) : null]));

  for (const e of entidades) {
    if (!e.clientId) continue;
    const r = (e.entityType === "adset" ? porAdset : porCampana).get(e.id);
    if (!r) continue;
    const arr = out.get(e.clientId) ?? [];
    arr.push({
      entityType: e.entityType,
      entityId: e.id,
      nombre: e.name,
      // Meta guarda el presupuesto en centavos (ver ads-budget.ts).
      presupuestoDiario: deMenor(Number(e.dailyBudget ?? 0)),
      ...r,
      ultimoCambio: ultimoCambio.get(e.id) ?? null,
    });
    out.set(e.clientId, arr);
  }
  return out;
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
