// LMTM-OS: auditoría de keywords de Google Ads (pedido 18/8).
//
// QUÉ HACE
// Lee el informe de términos de búsqueda —lo que la gente REALMENTE escribió en
// Google antes de que se le mostrara el anuncio— y lo cruza con las keywords
// activas. De ahí salen cuatro cosas concretas:
//
//   1. Negativas: términos que gastaron plata y no trajeron una sola conversión.
//   2. Keywords nuevas: búsquedas que SÍ convirtieron y todavía no son keyword.
//   3. Keywords a pausar: keywords que gastan sin convertir.
//   4. Concordancia: keywords en amplia que se comen el presupuesto.
//
// NO TOCA LA CUENTA. Devuelve una lista de pasos para que el equipo la aplique.
// Es la misma regla que el resto del sistema: nada se ejecuta sin que una
// persona lo apruebe. Además, agregar una negativa mal puesta apaga tráfico
// bueno y eso no se recupera.
//
// El texto que se le entrega al equipo es un PASO A PASO, no una tabla de datos
// (pedido explícito del usuario 18/8: "que deriven cosas al equipo, específicas
// y derechas, no con datos, con guías paso a paso").

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, clients } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { searchStream } from "./ads/providers/google.js";
import { withFreshAccessToken } from "./ads/token-refresh.js";
import { issueService } from "./issues.js";
import { resolveCompanyId } from "./intel-common.js";

/** Google devuelve la plata en micros: 1.000.000 micros = 1 unidad de moneda. */
const MICROS = 1_000_000;

/** Gasto mínimo para proponer una negativa. Debajo de esto el término no llegó
 *  a costar nada y bloquearlo es ruido — o peor, apaga una búsqueda que recién
 *  empieza a aprender. */
const GASTO_MIN_NEGATIVA = 3000;

/** Clics mínimos para afirmar que un término "no convierte". Con 2 clics no se
 *  sabe nada; es la diferencia entre una decisión y una corazonada. */
const CLICS_MIN = 8;

export interface TerminoBusqueda {
  termino: string;
  keyword: string | null;
  campana: string;
  clics: number;
  impresiones: number;
  costo: number;
  conversiones: number;
}

export interface KeywordActiva {
  texto: string;
  concordancia: string;
  campana: string;
  clics: number;
  costo: number;
  conversiones: number;
  qualityScore: number | null;
}

export interface AuditoriaKeywords {
  cliente: string;
  cuenta: string;
  desde: string;
  terminos: number;
  gastoTotal: number;
  conversionesTotal: number;
  negativas: TerminoBusqueda[];
  nuevas: TerminoBusqueda[];
  pausar: KeywordActiva[];
  ampliaCara: KeywordActiva[];
  /** Plata que se libera si se aplican las negativas propuestas. */
  ahorroMensual: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

function anidado(row: Record<string, unknown>, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), row);
}

/**
 * Conexión + customer id de Google del cliente, o null si no está mapeado.
 * Se refresca el access token antes de usarlo: la auditoría corre a demanda y
 * el token guardado suele estar vencido.
 */
async function conexionGoogle(db: Db, clientId: string) {
  const [m] = await db.select()
    .from(adsAccountMappings)
    .where(and(eq(adsAccountMappings.clientId, clientId), eq(adsAccountMappings.platform, "google")))
    .limit(1);
  if (!m?.connectionId) return null;
  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, m.connectionId));
  if (!conn) return null;
  // Se reusa el helper del aggregator en vez de refrescar a mano: además de
  // pedir el token nuevo, lo PERSISTE en la conexión. Refrescando por afuera se
  // obtenía un 401 (18/8) porque el objeto quedaba con el access token viejo.
  const fresca = await withFreshAccessToken(db, conn);
  // Si el refresh dejó la conexión marcada en error, no tiene sentido pegarle a
  // la API: devuelve un 401 que parece un problema de la cuenta y no lo es.
  const [estado] = await db.select({ status: adsConnections.status, lastError: adsConnections.lastError })
    .from(adsConnections).where(eq(adsConnections.id, conn.id));
  if (estado?.status === "error" && /refresh token ya no sirve/i.test(estado.lastError ?? "")) {
    throw new Error("La conexión de Google Ads está caída: hay que volver a autorizarla desde Integraciones. Hasta entonces no se puede auditar ninguna cuenta.");
  }
  return { conn: fresca, customerId: m.adAccountId.replace(/^act_/, "").replace(/-/g, "") };
}

/**
 * Corre la auditoría de una cuenta.
 *
 * `dias` mira hacia atrás: 30 es el default porque menos que eso no junta
 * conversiones suficientes para decidir, y más arrastra campañas ya cambiadas.
 */
export async function auditarKeywords(db: Db, clientId: string, dias = 30): Promise<AuditoriaKeywords | null> {
  const [cliente] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId));
  const ctx = await conexionGoogle(db, clientId);
  if (!cliente || !ctx) return null;
  const { conn, customerId } = ctx;

  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  const hasta = new Date().toISOString().slice(0, 10);
  const rango = `segments.date BETWEEN '${desde}' AND '${hasta}'`;

  // searchStream ya resuelve developer-token, login-customer-id y el refresh
  // ante un 401 a mitad de job — no hay que repetir nada de eso acá.
  const filasTerminos = await searchStream(conn, customerId, `
    SELECT search_term_view.search_term, segments.keyword.info.text, campaign.name,
           metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
    FROM search_term_view
    WHERE ${rango} AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 500`);

  const filasKeywords = await searchStream(conn, customerId, `
    SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           ad_group_criterion.quality_info.quality_score, campaign.name,
           metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM keyword_view
    WHERE ${rango} AND ad_group_criterion.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 300`);

  const terminos: TerminoBusqueda[] = filasTerminos.map((r) => ({
    termino: texto(anidado(r, "search_term_view.search_term")),
    keyword: texto(anidado(r, "segments.keyword.info.text")) || null,
    campana: texto(anidado(r, "campaign.name")),
    clics: num(anidado(r, "metrics.clicks")),
    impresiones: num(anidado(r, "metrics.impressions")),
    costo: num(anidado(r, "metrics.cost_micros")) / MICROS,
    conversiones: num(anidado(r, "metrics.conversions")),
  })).filter((t) => t.termino);

  const keywords: KeywordActiva[] = filasKeywords.map((r) => ({
    texto: texto(anidado(r, "ad_group_criterion.keyword.text")),
    concordancia: texto(anidado(r, "ad_group_criterion.keyword.match_type")),
    campana: texto(anidado(r, "campaign.name")),
    clics: num(anidado(r, "metrics.clicks")),
    costo: num(anidado(r, "metrics.cost_micros")) / MICROS,
    conversiones: num(anidado(r, "metrics.conversions")),
    qualityScore: anidado(r, "ad_group_criterion.quality_info.quality_score") != null
      ? num(anidado(r, "ad_group_criterion.quality_info.quality_score")) : null,
  })).filter((k) => k.texto);

  const gastoTotal = terminos.reduce((a, t) => a + t.costo, 0);
  const conversionesTotal = terminos.reduce((a, t) => a + t.conversiones, 0);
  const yaSonKeyword = new Set(keywords.map((k) => k.texto.toLowerCase().trim()));

  // 1. Negativas: gastó, tuvo clics suficientes para juzgarlo, y cero conversiones.
  const negativas = terminos
    .filter((t) => t.conversiones === 0 && t.costo >= GASTO_MIN_NEGATIVA && t.clics >= CLICS_MIN)
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 15);

  // 2. Keywords nuevas: convirtió y todavía no está como keyword propia. Es la
  //    plata más barata de la cuenta — ya sabés que ese término trae clientes.
  const nuevas = terminos
    .filter((t) => t.conversiones >= 1 && !yaSonKeyword.has(t.termino.toLowerCase().trim()))
    .sort((a, b) => b.conversiones - a.conversiones)
    .slice(0, 12);

  // 3. Keywords que gastan sin convertir.
  const pausar = keywords
    .filter((k) => k.conversiones === 0 && k.costo >= GASTO_MIN_NEGATIVA && k.clics >= CLICS_MIN)
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 10);

  // 4. Concordancia amplia cara: la amplia trae volumen pero también basura.
  //    Si además no convierte, conviene bajarla a frase o exacta.
  const ampliaCara = keywords
    .filter((k) => /BROAD/i.test(k.concordancia) && k.costo >= GASTO_MIN_NEGATIVA * 2 && k.conversiones < 1)
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 8);

  return {
    cliente: cliente.name,
    cuenta: customerId,
    desde,
    terminos: terminos.length,
    gastoTotal: Math.round(gastoTotal),
    conversionesTotal: Math.round(conversionesTotal * 10) / 10,
    negativas, nuevas, pausar, ampliaCara,
    ahorroMensual: Math.round(negativas.reduce((a, t) => a + t.costo, 0)),
  };
}

const plata = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/**
 * La auditoría convertida en instrucciones que alguien pueda ejecutar sin
 * saber nada del contexto.
 *
 * A propósito NO es una tabla de métricas: el equipo no necesita saber que un
 * término tuvo 412 impresiones, necesita saber qué escribir y dónde. Los números
 * aparecen solo cuando justifican la decisión.
 */
export function auditoriaAPasos(a: AuditoriaKeywords): { titulo: string; cuerpo: string } {
  const p: string[] = [];

  p.push(`Auditoría de keywords de **${a.cliente}** — últimos ${a.desde.slice(5)} a hoy.`);
  p.push(`Se revisaron ${a.terminos} términos de búsqueda por ${plata(a.gastoTotal)} de inversión y ${a.conversionesTotal} conversiones.`);
  p.push("");

  if (a.negativas.length) {
    p.push(`### 1. Sumar ${a.negativas.length} palabras clave negativas — libera ${plata(a.ahorroMensual)}/mes`);
    p.push("Estas búsquedas gastaron plata y no trajeron una sola conversión. En Google Ads: **Campañas → Palabras clave → Palabras clave negativas → +**, y agregar cada una en *concordancia de frase*:");
    p.push("");
    for (const t of a.negativas) p.push(`- \`${t.termino}\` — ${plata(t.costo)} en ${t.clics} clics, 0 conversiones (campaña ${t.campana})`);
    p.push("");
    p.push("Antes de agregarlas, leerlas una por una: si alguna describe algo que el cliente sí vende, NO agregarla — el término puede estar mal servido, no ser malo.");
    p.push("");
  }

  if (a.nuevas.length) {
    p.push(`### 2. Sumar ${a.nuevas.length} keywords que ya están convirtiendo`);
    p.push("La gente buscó esto, convirtió, y todavía no lo tenemos como keyword propia — o sea que estamos pagando por ellas al precio de la concordancia amplia en vez del suyo. Agregarlas en **concordancia de frase** al grupo de anuncios que mejor les calce:");
    p.push("");
    for (const t of a.nuevas) p.push(`- \`${t.termino}\` — ${t.conversiones} conversión(es) por ${plata(t.costo)} (campaña ${t.campana})`);
    p.push("");
  }

  if (a.pausar.length) {
    p.push(`### 3. Pausar ${a.pausar.length} keywords que solo gastan`);
    p.push("Tienen clics suficientes para juzgarlas y ninguna conversión. Pausar (no borrar: el historial sirve):");
    p.push("");
    for (const k of a.pausar) {
      const qs = k.qualityScore != null ? `, calidad ${k.qualityScore}/10` : "";
      p.push(`- \`${k.texto}\` [${k.concordancia}] — ${plata(k.costo)} en ${k.clics} clics${qs} (campaña ${k.campana})`);
    }
    p.push("");
  }

  if (a.ampliaCara.length) {
    p.push(`### 4. Bajar ${a.ampliaCara.length} keywords de amplia a frase`);
    p.push("Están en concordancia amplia, se llevan una parte grande del presupuesto y no convierten. La amplia trae volumen pero también búsquedas que no tienen nada que ver:");
    p.push("");
    for (const k of a.ampliaCara) p.push(`- \`${k.texto}\` — ${plata(k.costo)} sin conversiones (campaña ${k.campana})`);
    p.push("");
  }

  if (!a.negativas.length && !a.nuevas.length && !a.pausar.length && !a.ampliaCara.length) {
    p.push("**Sin acciones para esta cuenta.** No hay términos que gasten sin convertir por encima del piso, ni búsquedas convertidoras sin keyword. La cuenta está limpia en este período.");
  }

  return {
    titulo: `[${a.cliente}] Optimización de keywords Google Ads — ${a.negativas.length + a.nuevas.length + a.pausar.length + a.ampliaCara.length} acciones`,
    cuerpo: p.join("\n"),
  };
}

/**
 * Corre la auditoría y deja la guía como tarea del equipo.
 *
 * Va como tarea INTERNA (status todo), no como propuesta al cliente: al cliente
 * no le sirve una lista de negativas, es trabajo de la agencia. Esa distinción
 * es la que faltaba — el panel del cliente venía juntando cosas que en realidad
 * eran del equipo.
 */
export async function auditarYDerivar(
  db: Db,
  clientId: string,
  dias = 30,
): Promise<{ ok: boolean; acciones: number; issueId?: string; motivo?: string }> {
  const a = await auditarKeywords(db, clientId, dias);
  if (!a) return { ok: false, acciones: 0, motivo: "el cliente no tiene Google Ads mapeado" };
  const acciones = a.negativas.length + a.nuevas.length + a.pausar.length + a.ampliaCara.length;
  if (acciones === 0) return { ok: true, acciones: 0, motivo: "la cuenta está limpia en este período" };

  const { titulo, cuerpo } = auditoriaAPasos(a);
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { ok: false, acciones, motivo: "no se pudo resolver la empresa" };

  const creado = await issueService(db).create(companyId, {
    title: titulo,
    description: cuerpo,
    status: "todo" as never,
    priority: (a.ahorroMensual > 50_000 ? "high" : "medium") as never,
    clientId,
    originKind: "agent_detected",
    createdByAgentId: null,
  } as never);
  return { ok: true, acciones, issueId: String((creado as Record<string, unknown>).id ?? "") };
}
