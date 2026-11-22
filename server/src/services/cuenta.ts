// LMTM-OS: la cuenta del cliente (plan 21/11, doc de Marcos «RESUMEN DE TABLEROS»).
//
// Marcos necesita saber si a un cliente hay que cobrarle más, y por mes no se ve:
// «hay meses que sí se hace algo y otros no». Acá se arma, por cliente, el mes en
// curso y los 3 meses cerrados anteriores con cada renglón «cotizado vs realizado»
// (posteos, videos, historias, avisos, inversión de Meta y de Google), la señal de
// cobro mirando el trimestre, la salud en una vista y el informe trimestral.
//
// Todo sale de datos que ya están: cotizado.ts (planilla + ficha contra Instagram y
// la pauta), account_scores, decisiones, opportunities y metricas/. Nada inventado:
// lo que no se pudo medir va en null y la pantalla lo dice.

import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { accountScores, clients, decisiones, financeEntries, opportunities } from "@paperclipai/db";
import { cotizadoVsRealizado, type CotizadoRow } from "./cotizado.js";
import { metricasCliente } from "../metricas/index.js";
import { OPORTUNIDAD_CERRADA } from "./semaforo-pauta.js";

export const SENAL = {
  /** Realizado ≥ 120 % de lo cotizado: se le está dando más de lo que paga. */
  sobre: 120,
  /** Realizado ≤ 70 %: se le está dando menos de lo vendido. */
  sub: 70,
  /** En cuántos de los 3 meses cerrados tiene que pasar. */
  mesesMinimos: 2,
};

export type Senal = "sobre-servicio" | "sub-servicio" | "en-linea" | "sin-datos";

/** La señal del trimestre a partir del cumplimiento de los meses CERRADOS. Pura. */
export function senalDeCobro(pcts: Array<number | null>): Senal {
  const medidos = pcts.filter((p): p is number => p != null);
  if (medidos.length < SENAL.mesesMinimos) return "sin-datos";
  if (medidos.filter((p) => p >= SENAL.sobre).length >= SENAL.mesesMinimos) return "sobre-servicio";
  if (medidos.filter((p) => p <= SENAL.sub).length >= SENAL.mesesMinimos) return "sub-servicio";
  return "en-linea";
}

/** «YYYY-MM» del mes en curso y los n anteriores, del más nuevo al más viejo. Pura. */
export function ultimosMeses(ahora: Date, n: number): string[] {
  return Array.from({ length: n + 1 }, (_, i) => new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
}

export interface Renglon { cotizado: number | null; realizado: number }
export interface MesCuenta {
  mes: string;
  cerrado: boolean;
  /** De dónde sale lo realizado de contenido; null = no se pudo medir ese mes. */
  fuente: CotizadoRow["fuente"];
  posteos: Renglon;
  videos: Renglon;
  historias: Renglon;
  avisos: Renglon;
  inversionMeta: Renglon;
  inversionGoogle: Renglon;
  cumplimientoPct: number | null;
  /** false = el mes es anterior a la captura de historias (arrancó el 15/10/2026): un 0 ahí no es un hecho. */
  historiasMedidas: boolean;
  /** Videos según el tracker del equipo de video (Excel del mes en Drive); null = el cliente no está en ese tracker. */
  videosTracker: { encargados: number; entregados: number } | null;
}
export interface CuentaCliente { clientId: string; slug: string; name: string; meses: MesCuenta[]; senal: Senal }

/** Primer mes con historias capturadas (stories.ts corre desde el 15/10/2026). */
export const HISTORIAS_DESDE = "2026-10";

/** Un renglón de la planilla + ficha → el mes de la cuenta. Pura. */
export function mesDeFila(r: CotizadoRow, mes: string, cerrado: boolean, prorrateoPct: number): MesCuenta {
  // Lo cotizado en plata y avisos es mensual: a mitad de mes se compara contra la parte que ya pasó.
  const parte = (v: number | null) => (v == null ? null : Math.round(v * (prorrateoPct / 100)));
  return {
    mes,
    cerrado,
    fuente: r.fuente,
    posteos: { cotizado: r.esperadoMes.posteos, realizado: r.realizado.posteosMes },
    videos: { cotizado: r.esperadoMes.videos, realizado: r.realizado.videosMes },
    historias: { cotizado: r.esperadoMes.stories, realizado: r.realizado.storiesMes },
    avisos: { cotizado: parte(r.cotizado.avisosMes), realizado: r.realizado.avisos },
    inversionMeta: { cotizado: parte(r.cotizado.inversionMetaMes), realizado: r.realizado.spendMeta },
    inversionGoogle: { cotizado: parte(r.cotizado.inversionGoogleMes), realizado: r.realizado.spendGoogle },
    cumplimientoPct: r.cumplimientoPct,
    historiasMedidas: mes >= HISTORIAS_DESDE,
    videosTracker: null,
  };
}

/** La cuenta de toda la cartera: mes en curso + 3 cerrados, con la señal del trimestre. */
export async function cuentaCartera(db: Db, ahora = new Date()): Promise<{ meses: string[]; clientes: CuentaCliente[] }> {
  const meses = ultimosMeses(ahora, 3);
  const porCliente = new Map<string, CuentaCliente>();
  // De a uno: el mes en curso llama a ClickUp y los cerrados quedan guardados 6 h.
  for (const [i, mes] of meses.entries()) {
    const { rows, prorrateoPct } = await cotizadoVsRealizado(db, { mes });
    for (const r of rows) {
      if (!r.clientId || !r.slug || !r.clientName) continue;
      const c = porCliente.get(r.clientId) ?? { clientId: r.clientId, slug: r.slug, name: r.clientName, meses: [], senal: "sin-datos" as Senal };
      if (!c.meses.some((m) => m.mes === mes)) c.meses.push(mesDeFila(r, mes, i > 0, prorrateoPct));
      porCliente.set(r.clientId, c);
    }
  }
  const clientes = [...porCliente.values()];
  // El tracker de video del equipo, al lado de lo medido. Si Drive falla, la cuenta sale igual sin esa fila.
  try {
    const { videosDelTracker } = await import("./tracker-video.js");
    const { porMes } = await videosDelTracker(db, meses);
    for (const c of clientes) for (const m of c.meses) m.videosTracker = porMes.get(m.mes)?.get(c.clientId) ?? null;
  } catch (e) {
    console.warn("[cuenta] sin tracker de video:", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  for (const c of clientes) c.senal = senalDeCobro(c.meses.filter((m) => m.cerrado).map((m) => m.cumplimientoPct));
  const orden: Record<Senal, number> = { "sobre-servicio": 0, "sub-servicio": 1, "en-linea": 2, "sin-datos": 3 };
  clientes.sort((a, b) => orden[a.senal] - orden[b.senal] || a.name.localeCompare(b.name));
  return { meses, clientes };
}

export interface SaludCuenta {
  /** Índice /100 que estampa el vigilante a diario. */
  indice: number | null;
  razones: string[];
  leads: { ultimos30: number | null; previos30: number | null; dudosos: boolean };
  /** Calidad de la pauta /100 (account_scores); null = sin pauta corriendo. */
  calidadPauta: number | null;
  /** Seguidores por red, último dato de cada mes (lo estampa la captura de historias). */
  seguidores: Record<string, Array<{ mes: string; n: number }>>;
  /** Decisiones ejecutadas en 30 días: lo que los agentes y el equipo mejoraron. */
  mejoras30: number;
  oportunidades: number;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Seguidores guardados en la ficha → series ordenadas. Pura. */
export function seriesDeSeguidores(metadata: unknown): SaludCuenta["seguidores"] {
  const s = ((metadata as Record<string, unknown> | null)?.seguidores ?? {}) as Record<string, unknown>;
  const out: SaludCuenta["seguidores"] = {};
  for (const [red, porMes] of Object.entries(s)) {
    if (!porMes || typeof porMes !== "object") continue;
    const serie = Object.entries(porMes as Record<string, unknown>)
      .filter(([mes, n]) => /^\d{4}-\d{2}$/.test(mes) && typeof n === "number")
      .map(([mes, n]) => ({ mes, n: n as number }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    if (serie.length) out[red] = serie;
  }
  return out;
}

/** La salud de la cuenta en una vista: lo que pide el doc de Marcos, todo junto. */
export async function saludCuenta(db: Db, clientId: string, ahora = new Date()): Promise<SaludCuenta> {
  const hace = (n: number) => new Date(ahora.getTime() - n * 86_400_000);
  const [[c], ahora30, antes30, [score], [mej], [opp]] = await Promise.all([
    db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1),
    metricasCliente(db, clientId, { desde: dia(hace(30)), hasta: dia(hace(1)) }),
    metricasCliente(db, clientId, { desde: dia(hace(60)), hasta: dia(hace(31)) }),
    db.select({ health: accountScores.healthScore, components: accountScores.components }).from(accountScores)
      .where(eq(accountScores.clientId, clientId)).orderBy(desc(accountScores.date)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(decisiones)
      .where(and(eq(decisiones.clientId, clientId), inArray(decisiones.estado, ["ejecutada", "verificada"]), gte(decisiones.ejecutadaAt, hace(30)))),
    db.select({ n: sql<number>`count(*)::int` }).from(opportunities)
      .where(and(eq(opportunities.clientId, clientId), notInArray(opportunities.status, [...OPORTUNIDAD_CERRADA]), gte(opportunities.createdAt, hace(21)))),
  ]);
  const meta = (c?.metadata ?? {}) as Record<string, unknown>;
  const salud = (meta.salud ?? null) as { score?: number; razones?: string[] } | null;
  const sinPauta = (score?.components as { noAds?: boolean } | null)?.noAds === true;
  return {
    indice: typeof salud?.score === "number" ? salud.score : null,
    razones: Array.isArray(salud?.razones) ? salud!.razones!.slice(0, 5) : [],
    leads: { ultimos30: ahora30.leads, previos30: antes30.leads, dudosos: ahora30.leadsDudosos.length > 0 },
    calidadPauta: !score || sinPauta || score.health == null ? null : Math.round(Number(score.health)),
    seguidores: seriesDeSeguidores(meta),
    mejoras30: mej?.n ?? 0,
    oportunidades: opp?.n ?? 0,
  };
}

/** Cuánto pesa un gasto de Finanzas en un mes «YYYY-MM»: el fijo mensual entero, el anual en doceavos, el suelto solo en su mes. Pura. */
export function gastoDelMes(e: { amountCents: number; recurrence: string; occurredAt: Date }, mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  const desde = Date.UTC(a, m - 1, 1);
  const fin = Date.UTC(a, m, 1);
  const t = e.occurredAt.getTime();
  if (e.recurrence === "monthly") return t < fin ? e.amountCents / 100 : 0;
  if (e.recurrence === "yearly") return t < fin ? e.amountCents / 1200 : 0;
  return t >= desde && t < fin ? e.amountCents / 100 : 0;
}

export type Margen =
  | { mes: string; abono: number; directos: number; imputado: number; participacionPct: number; margen: number; otrasMonedas: number }
  | { motivo: string };

/**
 * Margen estimado: abono − gastos cargados a ese cliente − su parte de los gastos
 * generales, repartidos según las piezas vendidas (quien compró más trabajo carga
 * más gasto). Es una estimación y la pantalla lo dice. Pura.
 */
export function margenEstimado(x: { mes: string; abono: number; directos: number; generales: number; piezas: number; piezasTotal: number; otrasMonedas: number }): Margen {
  if (x.abono <= 0) return { motivo: "Falta cargar el abono del cliente." };
  if (x.directos + x.generales <= 0) return { motivo: "No hay gastos cargados en Finanzas para ese mes: sin gastos no hay margen que calcular." };
  const parte = x.piezasTotal > 0 ? x.piezas / x.piezasTotal : 0;
  const imputado = Math.round(x.generales * parte);
  return { mes: x.mes, abono: x.abono, directos: Math.round(x.directos), imputado, participacionPct: Math.round(parte * 1000) / 10, margen: Math.round(x.abono - x.directos - imputado), otrasMonedas: x.otrasMonedas };
}

/** El margen del último mes cerrado. Los gastos salen de Finanzas (en la moneda del cliente; los de otra moneda se cuentan aparte, no se convierten). */
async function margenDe(db: Db, clientId: string, abono: number, moneda: string, cartera: { meses: string[]; clientes: CuentaCliente[] }): Promise<Margen> {
  const mes = cartera.meses[1];
  if (abono <= 0) return { motivo: "Falta cargar el abono del cliente." };
  const gastos = await db.select({ clientId: financeEntries.clientId, amountCents: financeEntries.amountCents, recurrence: financeEntries.recurrence, occurredAt: financeEntries.occurredAt, currency: financeEntries.currency })
    .from(financeEntries).where(eq(financeEntries.type, "expense"));
  let directos = 0, generales = 0, otrasMonedas = 0;
  for (const g of gastos) {
    const monto = gastoDelMes(g, mes);
    if (!monto) continue;
    if (g.currency !== moneda) { otrasMonedas += 1; continue; }
    if (g.clientId === clientId) directos += monto;
    else if (!g.clientId) generales += monto;
  }
  const piezasDe = (c: CuentaCliente) => { const m = c.meses.find((x) => x.mes === mes); return m ? (m.posteos.cotizado ?? 0) + (m.videos.cotizado ?? 0) : 0; };
  const piezasTotal = cartera.clientes.reduce((s, c) => s + piezasDe(c), 0);
  const propio = cartera.clientes.find((c) => c.clientId === clientId);
  return margenEstimado({ mes, abono, directos, generales, piezas: propio ? piezasDe(propio) : 0, piezasTotal, otrasMonedas });
}

export async function cuentaDeCliente(db: Db, clientId: string, ahora = new Date()) {
  const [cartera, salud, [c]] = await Promise.all([
    cuentaCartera(db, ahora),
    saludCuenta(db, clientId, ahora),
    db.select({ name: clients.name, slug: clients.slug, metadata: clients.metadata, abono: clients.monthlyRetainerCents, moneda: clients.currency })
      .from(clients).where(eq(clients.id, clientId)).limit(1),
  ]);
  const { meses, clientes } = cartera;
  const cotizado = ((c?.metadata as Record<string, unknown> | null)?.cotizado ?? {}) as Record<string, unknown>;
  const abonoMes = c?.abono != null ? Number(c.abono) / 100 : null;
  return {
    meses,
    // Si el cliente no está en la planilla del equipo no hay cotizado de contenido: la pantalla lo dice.
    cuenta: clientes.find((x) => x.clientId === clientId) ?? null,
    salud,
    cotizado: { metaMes: cotizado.metaMes ?? null, googleMes: cotizado.googleMes ?? null, avisosMes: cotizado.avisosMes ?? null },
    abonoMes,
    margen: await margenDe(db, clientId, abonoMes ?? 0, c?.moneda ?? "ARS", cartera) as Margen | null,
    aprobacionPorLink: (c?.metadata as Record<string, unknown> | null)?.aprobacionPorLink === true,
    moneda: c?.moneda ?? "ARS",
    nombre: c?.name ?? "",
  };
}

const NOMBRE_SENAL: Record<Senal, string> = {
  "sobre-servicio": "Se le entregó más de lo vendido: revisar el precio",
  "sub-servicio": "Se le entregó menos de lo vendido: riesgo de reclamo o de baja",
  "en-linea": "Lo entregado está en línea con lo vendido",
  "sin-datos": "No hay meses medidos suficientes para decir",
};

const fila = (nombre: string, r: Renglon, plata = false, sinMedir = false) => {
  const f = (n: number) => (plata ? `$${n.toLocaleString("es-AR")}` : String(n));
  return `| ${nombre} | ${r.cotizado == null ? "sin cargar" : f(r.cotizado)} | ${sinMedir ? "sin medir" : f(r.realizado)} |`;
};

/** El informe trimestral, en texto: solo números del sistema. Pura. */
export function textoInformeTrimestral(d: Awaited<ReturnType<typeof cuentaDeCliente>>): string {
  const cerrados = (d.cuenta?.meses ?? []).filter((m) => m.cerrado).sort((a, b) => a.mes.localeCompare(b.mes));
  const l: string[] = [`# Informe trimestral — ${d.nombre}`, ""];
  if (!cerrados.length) return [...l, "El cliente no está en la planilla de lo vendido (PLANILLA GENERAL): no hay contra qué comparar."].join("\n");
  l.push(`Período: ${cerrados[0].mes} a ${cerrados[cerrados.length - 1].mes}.`, "", `**${NOMBRE_SENAL[d.cuenta!.senal]}.**`, "");
  for (const m of cerrados) {
    l.push(`## ${m.mes}`, "", "| | Cotizado | Realizado |", "|---|---|---|");
    // Sin fuente no hay conteo de contenido: un 0 se leería como «no publicó nada».
    l.push(fila("Posteos", m.posteos, false, !m.fuente), fila("Videos y reels", m.videos, false, !m.fuente), fila("Historias", m.historias, false, !m.historiasMedidas), fila("Avisos", m.avisos));
    if (m.videosTracker) l.push(`| Videos (tracker del equipo) | ${m.videosTracker.encargados} | ${m.videosTracker.entregados} |`);
    l.push(fila("Inversión Meta", m.inversionMeta, true), fila("Inversión Google", m.inversionGoogle, true), "");
    l.push(m.cumplimientoPct == null ? "Contenido: sin medir (no se lee la cuenta de Instagram de este cliente)." : `Cumplimiento de contenido: ${m.cumplimientoPct} %.`, "");
  }
  const s = d.salud;
  l.push("## Salud de la cuenta", "");
  l.push(`- Índice de salud: ${s.indice ?? "sin dato"}${s.indice != null ? " / 100" : ""}`);
  l.push(`- Consultas de pauta, últimos 30 días: ${s.leads.ultimos30 ?? "sin pauta"} (30 anteriores: ${s.leads.previos30 ?? "sin pauta"})${s.leads.dudosos ? " — las de Google no son confiables" : ""}`);
  l.push(`- Calidad de la pauta: ${s.calidadPauta == null ? "sin pauta corriendo" : `${s.calidadPauta} / 100`}`);
  for (const [red, serie] of Object.entries(s.seguidores)) {
    const u = serie[serie.length - 1];
    const p = serie.length > 1 ? serie[0] : null;
    l.push(`- Seguidores en ${red}: ${u.n.toLocaleString("es-AR")}${p ? ` (${u.n - p.n >= 0 ? "+" : ""}${(u.n - p.n).toLocaleString("es-AR")} desde ${p.mes})` : ""}`);
  }
  l.push(`- Mejoras ejecutadas en 30 días: ${s.mejoras30}`, `- Oportunidades abiertas: ${s.oportunidades}`);
  if (d.abonoMes) l.push("", `Abono mensual cargado: $${d.abonoMes.toLocaleString("es-AR")} ${d.moneda}.`);
  return l.join("\n");
}
