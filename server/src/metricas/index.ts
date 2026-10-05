// LMTM-OS: el único lugar donde se calculan las métricas de un cliente.
//
// Había dos escritores de leads con fórmulas distintas y cada pantalla sumaba
// por su cuenta. Desde acá: las pantallas y los agentes leen métricas, no
// tablas. Las fórmulas por fila (leads con alias por MÁXIMO, compras solo con
// alias de compra) ya están aplicadas al escribir ads_insights; este módulo
// agrega, divide y dice qué no se puede medir.
//
// Regla de la casa: lo que no se puede medir es null, nunca 0. Un cliente sin
// cuenta conectada no "gastó 0": no sabemos.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";
import { saludFuentes, type EstadoFuente, type Fuente } from "../ingest/salud.js";

export interface VentanaMetricas {
  /** YYYY-MM-DD inclusive */
  desde: string;
  /** YYYY-MM-DD inclusive */
  hasta: string;
  plataforma?: "meta" | "google";
}

export type FuenteObjetivo = "cliente" | "historial" | "rubro";

export interface MetricasCliente {
  /** null = no hay fuente de pauta conectada para lo pedido. 0 = conectada y sin gasto. */
  inversion: number | null;
  impresiones: number | null;
  clics: number | null;
  /** El alcance diario por anuncio no se puede sumar (la misma persona cuenta
   *  muchas veces). Hasta que la ingesta traiga el alcance del período, null. */
  alcance: number | null;
  frecuencia: number | null;
  leads: number | null;
  /** Viene del CRM; hoy no hay datos del CRM en esta base. */
  leadsCalificados: number | null;
  /** Compras de Meta, solo si el cliente tiene seguimiento de compras (alguna
   *  compra en 180 días). Las conversiones de Google NO cuentan: en varias
   *  cuentas son cualquier acción (MA PROPIEDADES: 197.557 a ARS 30). */
  ventas: number | null;
  cpl: number | null;
  costoPorCalificado: number | null;
  costoPorVenta: number | null;
  objetivo: {
    tcpl: number | null;
    /** De dónde sale: lo fijó una persona, se calculó del historial, o es el ideal del rubro. */
    tcplFuente: FuenteObjetivo | null;
    presupuestoMensual: number | null;
  };
  frescura: Array<{ fuente: Fuente; ultimoDato: string | null; estado: EstadoFuente }>;
}

/** El historial alcanza para proponer un objetivo con al menos esta cantidad de leads en 30 días. */
export const LEADS_MIN_HISTORIAL = 10;
/** Objetivo desde historial = CPL de 30 días × 0,8: una mejora del 20% sale solo
 *  de limpiar lo que no rinde (playbook de pauta, método 2). */
export const MEJORA_HISTORIAL = 0.8;

export function razon(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den <= 0) return null;
  return num / den;
}

/** Elige el objetivo de costo por lead, en orden de confianza. Pura. */
export function elegirObjetivo(input: {
  cplCliente: number | null;
  historial: { inversion: number; leads: number } | null;
  idealRubro: number | null;
}): { tcpl: number | null; tcplFuente: FuenteObjetivo | null } {
  if (input.cplCliente != null && input.cplCliente > 0) return { tcpl: input.cplCliente, tcplFuente: "cliente" };
  const h = input.historial;
  if (h && h.leads >= LEADS_MIN_HISTORIAL && h.inversion > 0) {
    return { tcpl: Math.round((h.inversion / h.leads) * MEJORA_HISTORIAL), tcplFuente: "historial" };
  }
  if (input.idealRubro != null && input.idealRubro > 0) return { tcpl: input.idealRubro, tcplFuente: "rubro" };
  return { tcpl: null, tcplFuente: null };
}

type Fila = Record<string, unknown>;
const filas = (r: unknown): Fila[] => (Array.isArray(r) ? r : ((r as { rows?: Fila[] })?.rows ?? [])) as Fila[];
const n = (v: unknown): number => Number(v ?? 0);
const posNum = (v: unknown): number | null => (Number(v) > 0 ? Number(v) : null);

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Métricas de UN cliente en una ventana. Exige clientId: no hay forma de
 * pedir métricas "de todos" por acá, así nada puede mezclar clientes.
 */
export async function metricasCliente(db: Db, clientId: string, v: VentanaMetricas): Promise<MetricasCliente> {
  if (!clientId) throw new Error("metricasCliente: falta clientId");
  const plat = v.plataforma ? sql`and platform = ${v.plataforma}` : sql``;
  const desdeHist = restarDias(v.hasta, 29);

  const [salud, agregado, seguimiento, historial, cliente] = await Promise.all([
    saludFuentes(db, { clientId }),
    db.execute(sql`
      select coalesce(sum(spend), 0) as inversion, coalesce(sum(impressions), 0) as impresiones,
             coalesce(sum(clicks), 0) as clics, coalesce(sum(leads), 0) as leads,
             coalesce(sum(conversions) filter (where platform = 'meta'), 0) as compras_meta
      from ads_insights
      where client_id = ${clientId} and date between ${v.desde} and ${v.hasta} ${plat}`),
    db.execute(sql`
      select exists(select 1 from ads_insights where client_id = ${clientId} and platform = 'meta'
                    and conversions > 0 and date > current_date - 180) as hay`),
    db.execute(sql`
      select coalesce(sum(spend), 0) as inversion, coalesce(sum(leads), 0) as leads
      from ads_insights
      where client_id = ${clientId} and date between ${desdeHist} and ${v.hasta} ${plat}`),
    db.execute(sql`
      select c.metadata, b.evidence as benchmark
      from clients c
      left join learnings b on b.scope = 'niche_benchmark' and b.scope_key = c.industry
      where c.id = ${clientId}
      limit 1`),
  ]);

  const frescura = salud.map((s) => ({ fuente: s.fuente, ultimoDato: s.ultimoDato, estado: s.estado }));
  const conectada = (f: Fuente) => salud.some((s) => s.fuente === f && s.estado !== "sin_conexion");
  const hayPauta = v.plataforma === "meta" ? conectada("meta_ads")
    : v.plataforma === "google" ? conectada("google_ads")
    : conectada("meta_ads") || conectada("google_ads");

  const a = filas(agregado)[0] ?? {};
  const inversion = hayPauta ? n(a.inversion) : null;
  const leads = hayPauta ? n(a.leads) : null;
  const conSeguimiento = filas(seguimiento)[0]?.hay === true;
  const ventas = hayPauta && v.plataforma !== "google" && conSeguimiento ? n(a.compras_meta) : null;

  const c = filas(cliente)[0] ?? {};
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const h = filas(historial)[0] ?? {};
  const objetivo = elegirObjetivo({
    cplCliente: posNum(meta.cplObjetivo),
    historial: hayPauta ? { inversion: n(h.inversion), leads: n(h.leads) } : null,
    idealRubro: posNum((c.benchmark as Record<string, unknown> | null)?.idealCpl),
  });

  return {
    inversion,
    impresiones: hayPauta ? n(a.impresiones) : null,
    clics: hayPauta ? n(a.clics) : null,
    alcance: null,
    frecuencia: null,
    leads,
    leadsCalificados: null,
    ventas,
    cpl: razon(inversion, leads),
    costoPorCalificado: null,
    costoPorVenta: razon(inversion, ventas),
    objetivo: { ...objetivo, presupuestoMensual: posNum(meta.presupuestoMensual) },
    frescura,
  };
}
