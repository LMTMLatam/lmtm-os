// LMTM-OS: las métricas de un cliente campaña por campaña.
//
// Los agentes tenían con qué pausar y mover presupuesto (pause_ad_entity,
// set_budget, shift_budget) pero ninguna herramienta les mostraba las campañas:
// solo el total del cliente. Sin el id ni el número de cada campaña no hay
// propuesta posible, y en producción había CERO propuestas de pauta desde que
// existe el mecanismo. Esto es lo que les faltaba ver.
//
// Mismas reglas que index.ts: null = no se puede medir. Sin cuenta conectada la
// respuesta entera es null; una campaña activa que no gastó es un 0 real (y es
// justamente lo que hay que mirar: está prendida y no entrega).

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { saludFuentes } from "../ingest/salud.js";
import { conversionesDudosas, hayPautaConectada, razon, type VentanaMetricas } from "./index.js";

type Plataforma = "meta" | "google";

export interface NumerosPauta {
  inversion: number;
  impresiones: number;
  clics: number;
  leads: number;
  /** null con 0 leads: no hay costo por lead que medir, mirá inversion. */
  cpl: number | null;
}

export interface MetricasConjunto extends NumerosPauta {
  adsetId: string;
  nombre: string | null;
  estado: string | null;
  /** En la moneda de la cuenta. null = el presupuesto no vive acá (campaña con CBO) o no lo traemos. */
  presupuestoDiario: number | null;
}

export interface MetricasCampana extends NumerosPauta {
  plataforma: Plataforma;
  campaignId: string;
  nombre: string | null;
  estado: string | null;
  objetivoCampana: string | null;
  /** En la moneda de la cuenta. Google: siempre null (vive en un campaign_budget aparte). */
  presupuestoDiario: number | null;
  /** Fecha de fin programada (YYYY-MM-DD), null si no tiene. */
  fin: string | null;
  diasConGasto: number;
  ultimoDiaConGasto: string | null;
  /** Google contando como lead acciones que no lo son: el CPL de esta campaña no sirve para decidir. */
  leadsDudosos: boolean;
  conjuntos: MetricasConjunto[];
}

export interface FilaInsight {
  plataforma: Plataforma;
  campaignId: string;
  campaignName: string | null;
  adsetId: string | null;
  inversion: number;
  impresiones: number;
  clics: number;
  leads: number;
  dias: string[];
}

export interface FilaEntidad {
  id: string;
  plataforma: Plataforma;
  nombre: string | null;
  estado: string | null;
  presupuestoMenor: number | null;
  objetivo?: string | null;
  campaignId?: string | null;
  /** YYYY-MM-DD. Meta sigue diciendo ACTIVE después de la fecha de fin. */
  fin?: string | null;
}

/** Google pone 2037-12-30 como fecha de fin de las campañas que no tienen. */
const SIN_FIN_GOOGLE = "2037-12";

const ACTIVO = new Set(["active", "enabled"]);
export const esActiva = (estado: string | null | undefined) => ACTIVO.has((estado ?? "").toLowerCase());

/** Meta guarda el presupuesto en la unidad menor (centavos); Google no lo guarda en la campaña. */
export function presupuestoEnMoneda(plataforma: Plataforma, menor: number | null): number | null {
  if (plataforma !== "meta" || menor == null || !(menor > 0)) return null;
  return menor / 100;
}

const numeros = (filas: FilaInsight[]): NumerosPauta => {
  const t = filas.reduce(
    (a, f) => ({ inversion: a.inversion + f.inversion, impresiones: a.impresiones + f.impresiones, clics: a.clics + f.clics, leads: a.leads + f.leads }),
    { inversion: 0, impresiones: 0, clics: 0, leads: 0 },
  );
  return { ...t, inversion: Math.round(t.inversion * 100) / 100, cpl: razon(t.inversion, t.leads) };
};

/**
 * Arma las campañas a partir de las filas de insights y de las entidades. Pura.
 * Entra toda campaña que gastó en la ventana y toda campaña activa (aunque no
 * haya gastado: prendida sin entregar es un hallazgo, no un hueco), salvo las
 * que ya terminaron antes de `hasta`: Meta las sigue marcando ACTIVE.
 */
export function armarCampanas(insights: FilaInsight[], campanas: FilaEntidad[], conjuntos: FilaEntidad[], hasta: string): MetricasCampana[] {
  const vigente = (c: FilaEntidad) => esActiva(c.estado) && !(c.fin && c.fin < hasta);
  const clave = (p: string, id: string) => `${p}:${id}`;
  const camp = new Map(campanas.map((c) => [clave(c.plataforma, c.id), c]));
  const porCampana = new Map<string, FilaInsight[]>();
  // Meta deja filas en cero para campañas ya terminadas: no son actividad.
  for (const f of insights.filter((f) => f.inversion > 0 || f.impresiones > 0 || f.leads > 0)) {
    const k = clave(f.plataforma, f.campaignId);
    porCampana.set(k, [...(porCampana.get(k) ?? []), f]);
  }
  for (const c of campanas) {
    if (vigente(c) && !porCampana.has(clave(c.plataforma, c.id))) porCampana.set(clave(c.plataforma, c.id), []);
  }

  // Las conversiones mal configuradas son de la CUENTA: si el total de la
  // plataforma es dudoso, lo es cada campaña, aunque alguna quede bajo el umbral.
  const totalPlat = (p: Plataforma) => numeros(insights.filter((f) => f.plataforma === p));
  const cuentaDudosa = { meta: false, google: conversionesDudosas("google", totalPlat("google").leads, totalPlat("google").clics) };

  const salida: MetricasCampana[] = [];
  for (const [k, filas] of porCampana) {
    const [plataforma, campaignId] = [k.slice(0, k.indexOf(":")) as Plataforma, k.slice(k.indexOf(":") + 1)];
    const c = camp.get(k);
    const dias = [...new Set(filas.filter((f) => f.inversion > 0).flatMap((f) => f.dias))].sort();

    const porConjunto = new Map<string, FilaInsight[]>();
    for (const f of filas) if (f.adsetId) porConjunto.set(f.adsetId, [...(porConjunto.get(f.adsetId) ?? []), f]);
    for (const a of conjuntos) {
      if (a.plataforma === plataforma && a.campaignId === campaignId && esActiva(a.estado) && !porConjunto.has(a.id)) porConjunto.set(a.id, []);
    }
    const sets = new Map(conjuntos.filter((a) => a.plataforma === plataforma).map((a) => [a.id, a]));
    const conjuntosCamp: MetricasConjunto[] = [...porConjunto].map(([adsetId, fs]) => {
      const a = sets.get(adsetId);
      return {
        adsetId, nombre: a?.nombre ?? null, estado: a?.estado ?? null,
        presupuestoDiario: presupuestoEnMoneda(plataforma, a?.presupuestoMenor ?? null),
        ...numeros(fs),
      };
    }).sort((x, y) => y.inversion - x.inversion);

    const totales = numeros(filas);
    salida.push({
      plataforma, campaignId,
      nombre: c?.nombre ?? filas.find((f) => f.campaignName)?.campaignName ?? null,
      estado: c?.estado ?? null,
      objetivoCampana: c?.objetivo ?? null,
      presupuestoDiario: presupuestoEnMoneda(plataforma, c?.presupuestoMenor ?? null),
      fin: c?.fin && c.fin < SIN_FIN_GOOGLE ? c.fin : null,
      ...totales,
      diasConGasto: dias.length,
      ultimoDiaConGasto: dias.at(-1) ?? null,
      leadsDudosos: cuentaDudosa[plataforma] || conversionesDudosas(plataforma, totales.leads, totales.clics),
      conjuntos: conjuntosCamp,
    });
  }
  return salida.sort((x, y) => y.inversion - x.inversion);
}

type Fila = Record<string, unknown>;
const filas = (r: unknown): Fila[] => (Array.isArray(r) ? r : ((r as { rows?: Fila[] })?.rows ?? [])) as Fila[];
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Campañas de UN cliente en una ventana. null = no hay cuenta de pauta conectada
 * para lo pedido (no "no tiene campañas": no sabemos).
 */
export async function metricasCampanas(db: Db, clientId: string, v: VentanaMetricas): Promise<MetricasCampana[] | null> {
  if (!clientId) throw new Error("metricasCampanas: falta clientId");
  const salud = await saludFuentes(db, { clientId });
  const plataformas = (["meta", "google"] as const).filter(
    (p) => (!v.plataforma || v.plataforma === p) && hayPautaConectada(salud, p),
  );
  if (plataformas.length === 0) return null;
  const enPlat = sql.join(plataformas.map((p) => sql`${p}`), sql`, `);

  const [ins, camp, sets] = await Promise.all([
    db.execute(sql`
      select platform, campaign_id, max(campaign_name) as campaign_name, adset_id,
             coalesce(sum(spend), 0) as inversion, coalesce(sum(impressions), 0) as impresiones,
             coalesce(sum(clicks), 0) as clics, coalesce(sum(leads), 0) as leads,
             coalesce(array_agg(distinct date::text) filter (where spend > 0), '{}') as dias
      from ads_insights
      where client_id = ${clientId} and date between ${v.desde} and ${v.hasta}
        and platform in (${enPlat}) and campaign_id is not null
      group by platform, campaign_id, adset_id`),
    db.execute(sql`
      select id, platform, name, status, objective, daily_budget, to_char(stop_time at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') as fin
      from ads_campaigns
      where client_id = ${clientId} and platform in (${enPlat})
        and (lower(status) in ('active', 'enabled') or id in (
          select distinct campaign_id from ads_insights
          where client_id = ${clientId} and date between ${v.desde} and ${v.hasta}))`),
    db.execute(sql`
      select id, platform, campaign_id, name, status, daily_budget
      from ads_adsets
      where client_id = ${clientId} and platform in (${enPlat})
        and (lower(status) in ('active', 'enabled') or id in (
          select distinct adset_id from ads_insights
          where client_id = ${clientId} and date between ${v.desde} and ${v.hasta}))`),
  ]);

  return armarCampanas(
    filas(ins).map((f) => ({
      plataforma: f.platform as Plataforma, campaignId: String(f.campaign_id),
      campaignName: (f.campaign_name as string) ?? null, adsetId: (f.adset_id as string) ?? null,
      inversion: Number(f.inversion), impresiones: Number(f.impresiones), clics: Number(f.clics), leads: Number(f.leads),
      dias: (f.dias as string[]) ?? [],
    })),
    filas(camp).map((c) => ({
      id: String(c.id), plataforma: c.platform as Plataforma, nombre: (c.name as string) ?? null,
      estado: (c.status as string) ?? null, objetivo: (c.objective as string) ?? null, presupuestoMenor: numOrNull(c.daily_budget),
      fin: (c.fin as string) ?? null,
    })),
    filas(sets).map((a) => ({
      id: String(a.id), plataforma: a.platform as Plataforma, campaignId: (a.campaign_id as string) ?? null,
      nombre: (a.name as string) ?? null, estado: (a.status as string) ?? null, presupuestoMenor: numOrNull(a.daily_budget),
    })),
    v.hasta,
  );
}
