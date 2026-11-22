// LMTM-OS: cotizado vs realizado (pedido 18/7, decisión: leer SIEMPRE de la
// planilla de Google del equipo — pestaña "PLANILLA GENERAL").
//
// Cotizado = lo VENDIDO al cliente (posteos/semana, reels y videos/mes,
// stories/semana, pauta sí/no, por plataforma). Hecho = lo que el EQUIPO
// registra en el calendario Redes de ClickUp con el tag "mandado a make"
// (decisión 20/7: la fuente es ClickUp, no la API de Meta — y así las stories
// también cuentan). La pauta realizada sigue saliendo de ads_insights. La
// inversión COTIZADA en $ no vive en esta planilla (pendiente: planilla de
// facturación del usuario).
//
// 7/10: la etiqueta de ClickUp ya nos mintió dos veces (daba por publicado lo
// que no salía, y lo que no se etiquetaba contaba cero). Si leemos la cuenta de
// Instagram del cliente, el "hecho" sale de ahí: publicaciones reales, contra
// lo cotizado PARA INSTAGRAM. ClickUp queda solo para quien no tiene la cuenta
// leída, y la fila lo dice (fuente "clickup").

import type { Db } from "@paperclipai/db";
import { adsInsights, clients, organicPostInsights, organicPosts, organicStories } from "@paperclipai/db";
import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { LECTURA_CONFIABLE_MS } from "./auditor.js";
import { googleTools } from "./agent-mcp-tools.js";
import { getRedesCalendar } from "./clickup-sync.js";

const SHEET_ID = process.env.LMTM_COTIZADO_SHEET_ID || "1TXeJyM0aPHgxlqK06azdntLrjS97iZ6qG8XOTLvkSoY";

export interface CotizadoRow {
  clienteSheet: string;
  clientId: string | null;
  clientName: string | null;
  slug: string | null;
  cotizado: {
    igPosteosSemana: number | null;
    igReelesMes: number | null;
    igVideosMes: number | null;
    igStoriesSemana: number | null;
    pautaIg: boolean;
    pautaLinkedin: boolean;
    pautaMeta: boolean;
    pautaGoogle: boolean;
    linkedinPosteosSemana: number | null;
    tiktokVideosMes: number | null;
    /** Plata y avisos vendidos por mes (21/11): no están en la planilla, se
     *  cargan en la ficha del cliente (clients.metadata.cotizado). */
    inversionMetaMes: number | null;
    inversionGoogleMes: number | null;
    avisosMes: number | null;
  };
  realizado: {
    posteosMes: number;
    videosMes: number;
    storiesMes: number;
    spendMeta: number;
    spendGoogle: number;
    /** Anuncios distintos que gastaron en el período (Meta + Google). */
    avisos: number;
  };
  /** El cliente no tiene lista Redes de ClickUp mapeada → no se puede medir. */
  sinListaClickup: boolean;
  /** De dónde sale el "hecho": publicaciones leídas de Instagram, o la
   *  etiqueta "mandado a make" de ClickUp (sin verificar en la red). */
  fuente: "instagram" | "clickup" | null;
  esperadoMes: { posteos: number; videos: number; stories: number };
  cumplimientoPct: number | null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const num = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};
const boolCell = (v: unknown) => String(v ?? "").trim().toUpperCase() === "TRUE";

// Cache stale-while-revalidate: la planilla cambia poco y la API de Sheets
// tiene cuota — si hay valor viejo se sirve YA y se refresca atrás (fluidez
// del panel, 23/7). Solo el primer hit tras un boot espera la llamada real.
let cache: { at: number; values: string[][] } | null = null;
let sheetInflight: Promise<string[][]> | null = null;
function fetchSheet(): Promise<string[][]> {
  if (!sheetInflight) {
    sheetInflight = (async () => {
      const res = (await googleTools.sheetsRead({ spreadsheetId: SHEET_ID, range: "PLANILLA GENERAL!A1:AI200" })) as { values?: string[][] };
      cache = { at: Date.now(), values: res.values ?? [] };
      return cache.values;
    })().finally(() => { sheetInflight = null; });
  }
  return sheetInflight;
}
async function readSheet(): Promise<string[][]> {
  if (cache) {
    if (Date.now() - cache.at > 10 * 60_000) void fetchSheet().catch(() => {});
    return cache.values;
  }
  return fetchSheet();
}

// Conteo del "hecho" desde ClickUp, cacheado 10 min: son ~40 llamadas a la API
// (una por lista de cliente) y esto se consulta en cada carga de Growth.
type HechoCounts = { posteos: number; videos: number; stories: number } | null; // null = sin lista mapeada
let hechoCache: { at: number; key: string; map: Map<string, HechoCounts> } | null = null;
let hechoInflight: Promise<Map<string, HechoCounts>> | null = null;

// Stale-while-revalidate (23/7): son ~40 llamadas a ClickUp (~15s) — si hay
// cache del mismo período se sirve YA aunque esté vencido y se refresca atrás.
async function contarHechoClickUp(db: Db, clientIds: string[], sinceMs: number, untilMs: number): Promise<Map<string, HechoCounts>> {
  const key = `${sinceMs}`;
  if (hechoCache && hechoCache.key === key) {
    if (Date.now() - hechoCache.at > 10 * 60_000) void contarHechoFresh(db, clientIds, sinceMs, untilMs, key).catch(() => {});
    return hechoCache.map;
  }
  return contarHechoFresh(db, clientIds, sinceMs, untilMs, key);
}

function contarHechoFresh(db: Db, clientIds: string[], sinceMs: number, untilMs: number, key: string): Promise<Map<string, HechoCounts>> {
  if (hechoInflight) return hechoInflight;
  hechoInflight = contarHechoReal(db, clientIds, sinceMs, untilMs, key).finally(() => { hechoInflight = null; });
  return hechoInflight;
}

async function contarHechoReal(db: Db, clientIds: string[], sinceMs: number, untilMs: number, key: string): Promise<Map<string, HechoCounts>> {
  const map = new Map<string, HechoCounts>();
  // Tandas de 5 para no clavar la API de ClickUp ni tardar 15s secuencial.
  for (let i = 0; i < clientIds.length; i += 5) {
    await Promise.all(clientIds.slice(i, i + 5).map(async (id) => {
      const items = await getRedesCalendar(db, id, sinceMs, untilMs).catch(() => null);
      if (!items) { map.set(id, null); return; }
      const c = { posteos: 0, videos: 0, stories: 0 };
      for (const it of items) {
        if (!it.published) continue; // solo lo que realmente se disparó a Make
        // "Tipo de Contenido" del calendario (Reel/Clip corto/Video Largo/
        // Story/Carrusel/…); si falta, caer al nombre de la tarea.
        const f = `${it.format ?? ""} ${it.name}`;
        if (/story|historia/i.test(f)) c.stories += 1;
        else if (/reel|video|clip/i.test(f)) c.videos += 1;
        else c.posteos += 1;
      }
      map.set(id, c);
    }));
  }
  hechoCache = { at: Date.now(), key, map };
  return map;
}

/** Clasifica un tipo de publicación de Instagram como posteo o video. */
export function formatoInstagram(tipo: string | null): "videos" | "posteos" {
  return /reel|video|clip/i.test(tipo ?? "") ? "videos" : "posteos";
}

const ES_INSTAGRAM = sql`${organicPosts.permalinkUrl} like '%instagram.com%'`;

/** Publicaciones reales de Instagram en el período, solo de clientes cuya
 *  cuenta leímos hace poco (sin lectura, un cero no es un hecho). */
async function contarPublicadoInstagram(db: Db, clientIds: string[], desde: Date, hasta: Date): Promise<Map<string, { posteos: number; videos: number }>> {
  const out = new Map<string, { posteos: number; videos: number }>();
  if (!clientIds.length) return out;
  const lecturas = await db.select({ clientId: organicPosts.clientId, ultima: sql<string | null>`max(${organicPostInsights.syncedAt})` })
    .from(organicPosts)
    .innerJoin(organicPostInsights, eq(organicPostInsights.postId, organicPosts.id))
    .where(and(inArray(organicPosts.clientId, clientIds), ES_INSTAGRAM))
    .groupBy(organicPosts.clientId);
  const ahora = Date.now();
  for (const l of lecturas) {
    if (l.clientId && l.ultima && ahora - new Date(l.ultima).getTime() <= LECTURA_CONFIABLE_MS) out.set(l.clientId, { posteos: 0, videos: 0 });
  }
  if (!out.size) return out;
  const posts = await db.select({ clientId: organicPosts.clientId, tipo: organicPosts.postType })
    .from(organicPosts)
    .where(and(inArray(organicPosts.clientId, [...out.keys()]), gte(organicPosts.createdTime, desde), lt(organicPosts.createdTime, hasta), ES_INSTAGRAM));
  for (const p of posts) {
    const c = p.clientId ? out.get(p.clientId) : undefined;
    if (c) c[formatoInstagram(p.tipo)] += 1;
  }
  return out;
}

/** Lo cotizado en plata y avisos, que se carga en la ficha (metadata.cotizado). Pura. */
export function cotizadoDeFicha(metadata: unknown): { inversionMetaMes: number | null; inversionGoogleMes: number | null; avisosMes: number | null } {
  const c = ((metadata as Record<string, unknown> | null)?.cotizado ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return { inversionMetaMes: n(c.metaMes), inversionGoogleMes: n(c.googleMes), avisosMes: n(c.avisosMes) };
}

/** Ventana de un mes calendario «YYYY-MM» (UTC, como el resto del archivo). Pura. */
export function ventanaDeMes(mes: string, ahora: Date): { from: Date; fin: Date; hasta: Date; prorrateo: number; cerrado: boolean } {
  const [a, m] = mes.split("-").map(Number);
  const from = new Date(Date.UTC(a, m - 1, 1));
  const fin = new Date(Date.UTC(a, m, 1));
  const hasta = ahora < fin ? ahora : fin;
  const prorrateo = Math.min(1, Math.max(0, (hasta.getTime() - from.getTime()) / (fin.getTime() - from.getTime())));
  return { from, fin, hasta, prorrateo, cerrado: ahora >= fin };
}

export type CotizadoResultado = { month: string; rows: CotizadoRow[]; sinMatch: string[]; prorrateoPct: number };
// Un mes cerrado no cambia: se guarda 6 h (la cuenta del trimestre pide 3 de una).
const mesesCerrados = new Map<string, { at: number; valor: CotizadoResultado }>();
/** Al cambiar lo vendido de un cliente en la ficha, lo guardado de los meses cerrados ya no vale. */
export const olvidarMesesCerrados = () => mesesCerrados.clear();

/**
 * `months` = los últimos N meses juntos, hasta hoy (la vista de siempre).
 * `mes` = un solo mes calendario; si ya cerró se mide SOLO contra Instagram: la
 * etiqueta de ClickUp no es confiable y pedir 3 meses de 41 listas no entra en
 * un pedido.
 */
export async function cotizadoVsRealizado(db: Db, opts: { months?: number; mes?: string } = {}): Promise<CotizadoResultado> {
  const now = new Date();
  const unMes = opts.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(opts.mes) ? ventanaDeMes(opts.mes, now) : null;
  if (unMes?.cerrado) {
    const g = mesesCerrados.get(opts.mes!);
    if (g && Date.now() - g.at < 6 * 3600_000) return g.valor;
  }
  const months = unMes ? 1 : Math.min(Math.max(opts.months ?? 1, 1), 6);
  const from = unMes?.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const hasta = unMes?.hasta ?? now;
  const monthLabel = from.toISOString().slice(0, 7);
  // Fracción del período ya transcurrida (el período termina a fin del mes actual).
  const finPeriodo = unMes?.fin.getTime() ?? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const prorrateo = unMes?.prorrateo ?? Math.min(1, (now.getTime() - from.getTime()) / (finPeriodo - from.getTime()));

  const values = await readSheet();
  const activos = await db.select({ id: clients.id, name: clients.name, slug: clients.slug, metadata: clients.metadata }).from(clients).where(eq(clients.status, "active"));
  const ids = activos.map((c) => c.id);

  // Hecho = calendario Redes de ClickUp con tag "mandado a make" en el período,
  // clasificado por formato ("Tipo de Contenido" o tag reel/story/etc.).
  const postsByClient = unMes?.cerrado ? new Map<string, HechoCounts>() : await contarHechoClickUp(db, ids, from.getTime(), hasta.getTime());
  const instagram = await contarPublicadoInstagram(db, ids, from, hasta);
  const fromDay = from.toISOString().slice(0, 10);
  const finDay = new Date(finPeriodo).toISOString().slice(0, 10);
  const spend = await db.select({
    clientId: adsInsights.clientId,
    platform: adsInsights.platform,
    spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)`,
    // Avisos realizados = anuncios distintos que gastaron (las filas sin ad_id no cuentan).
    avisos: sql<number>`count(distinct case when ${adsInsights.spend} > 0 then ${adsInsights.adId} end)::int`,
  }).from(adsInsights)
    .where(and(gte(adsInsights.date, fromDay), lt(adsInsights.date, finDay)))
    .groupBy(adsInsights.clientId, adsInsights.platform);
  const spendByClient = new Map<string, { meta: number; google: number; avisos: number }>();
  for (const s of spend) {
    if (!s.clientId) continue;
    const cur = spendByClient.get(s.clientId) ?? { meta: 0, google: 0, avisos: 0 };
    if (s.platform === "google") cur.google += Number(s.spend); else cur.meta += Number(s.spend);
    cur.avisos += Number(s.avisos) || 0;
    spendByClient.set(s.clientId, cur);
  }
  // Historias capturadas de la cuenta cada 6 h (desde el 15/10): el equipo no las carga en ClickUp.
  const capturadas = new Map<string, number>();
  const historias = await db.select({ clientId: organicStories.clientId, n: sql<number>`count(*)::int` }).from(organicStories)
    .where(and(isNotNull(organicStories.clientId), gte(organicStories.publicadaAt, from), lt(organicStories.publicadaAt, hasta)))
    .groupBy(organicStories.clientId);
  for (const s of historias) if (s.clientId) capturadas.set(s.clientId, s.n);

  const rows: CotizadoRow[] = [];
  const sinMatch: string[] = [];
  // Filas de datos: desde la 5 (0-indexed 4) — las primeras 4 son headers.
  for (const row of values.slice(4)) {
    const nombre = String(row[0] ?? "").trim();
    if (!nombre) continue;
    const match = activos.find((c) => {
      const a = norm(c.name), b = norm(nombre);
      return a === b || a.includes(b) || b.includes(a);
    }) ?? null;
    if (!match) sinMatch.push(nombre);

    const cot = {
      igPosteosSemana: num(row[2]),
      igReelesMes: num(row[3]),
      igVideosMes: num(row[4]),
      igStoriesSemana: num(row[5]),
      pautaIg: boolCell(row[6]),
      linkedinPosteosSemana: num(row[9]),
      pautaLinkedin: boolCell(row[10]),
      tiktokVideosMes: num(row[12]),
      pautaMeta: boolCell(row[22]),
      pautaGoogle: boolCell(row[23]),
      ...cotizadoDeFicha(match?.metadata),
    };
    const ig = match ? instagram.get(match.id) ?? null : null;
    const hecho = match ? postsByClient.get(match.id) ?? null : null;
    const fuente: CotizadoRow["fuente"] = ig ? "instagram" : match && hecho ? "clickup" : null;
    const sinListaClickup = !!match && !ig && hecho === null;
    const real = {
      posteosMes: ig?.posteos ?? hecho?.posteos ?? 0,
      videosMes: ig?.videos ?? hecho?.videos ?? 0,
      // Las stories no se leen de la red (la API solo da las de 24 h).
      storiesMes: Math.max(hecho?.stories ?? 0, match ? capturadas.get(match.id) ?? 0 : 0),
      spendMeta: match ? Math.round(spendByClient.get(match.id)?.meta ?? 0) : 0,
      spendGoogle: match ? Math.round(spendByClient.get(match.id)?.google ?? 0) : 0,
      avisos: match ? spendByClient.get(match.id)?.avisos ?? 0 : 0,
    };

    // Esperado del período: semanal ×4.33×meses, mensual ×meses — prorrateado
    // a los días transcurridos (a mitad de mes no se exige el mes entero).
    // Con fuente Instagram se compara solo contra lo cotizado para Instagram:
    // LinkedIn y TikTok no se leen, y sumarlos daría un incumplimiento falso.
    const soloIg = fuente === "instagram";
    const esperadoPosteos = Math.round(((cot.igPosteosSemana ?? 0) * 4.33 + (soloIg ? 0 : (cot.linkedinPosteosSemana ?? 0) * 4.33)) * months * prorrateo);
    const esperadoVideos = Math.round(((cot.igReelesMes ?? 0) + (cot.igVideosMes ?? 0) + (soloIg ? 0 : (cot.tiktokVideosMes ?? 0))) * months * prorrateo);
    const esperadoStories = Math.round((cot.igStoriesSemana ?? 0) * 4.33 * months * prorrateo);
    // Stories fuera del %: el equipo aún no las registra como tareas en el
    // calendario (0 en los 41 clientes) — mostrarlas sí, castigar no.
    const esperadoTotal = esperadoPosteos + esperadoVideos;
    const realizadoTotal = real.posteosMes + real.videosMes;
    rows.push({
      clienteSheet: nombre,
      clientId: match?.id ?? null,
      clientName: match?.name ?? null,
      slug: match?.slug ?? null,
      cotizado: cot,
      realizado: real,
      sinListaClickup,
      fuente,
      esperadoMes: { posteos: esperadoPosteos, videos: esperadoVideos, stories: esperadoStories },
      cumplimientoPct: esperadoTotal > 0 && match && fuente ? Math.round((realizadoTotal / esperadoTotal) * 100) : null,
    });
  }
  rows.sort((a, b) => (a.cumplimientoPct ?? 999) - (b.cumplimientoPct ?? 999));
  const valor = { month: monthLabel, rows, sinMatch, prorrateoPct: Math.round(prorrateo * 100) };
  if (unMes?.cerrado) mesesCerrados.set(opts.mes!, { at: Date.now(), valor });
  return valor;
}

/** Responsables por cliente (pestaña RESPONSABLES) — para derivar tareas. */
export async function leerResponsables(): Promise<Array<{ cliente: string; diseno: string | null; copyProgramacion: string | null; linkedin: string | null; tiktok: string | null }>> {
  const res = (await googleTools.sheetsRead({ spreadsheetId: SHEET_ID, range: "RESPONSABLES!A1:J100" })) as { values?: string[][] };
  const out: Array<{ cliente: string; diseno: string | null; copyProgramacion: string | null; linkedin: string | null; tiktok: string | null }> = [];
  for (const row of (res.values ?? []).slice(3)) {
    const cliente = String(row[0] ?? "").trim();
    if (!cliente) continue;
    const cell = (i: number) => (String(row[i] ?? "").trim() || null);
    out.push({ cliente, diseno: cell(1), copyProgramacion: cell(2), linkedin: cell(3), tiktok: cell(5) });
  }
  return out;
}

// ── Derivación de tareas al responsable humano (pestaña RESPONSABLES) ──────
let respCache: { at: number; rows: Awaited<ReturnType<typeof leerResponsables>> } | null = null;

export type AreaTarea = "diseño" | "pauta" | "cuenta" | "copy";

/**
 * De qué se trata una tarea, por su texto. Pura.
 *
 * Antes solo se distinguía diseño de "el resto", y el resto iba a copy y
 * programación: al 10/11, 332 derivaciones a Caro incluían recargar saldo,
 * el BM de Meta y las conversiones de Google. La pauta y la relación con el
 * cliente tienen responsable propio en PLANILLA GENERAL.
 */
export function areaDeTarea(texto: string): AreaTarea {
  if (/dise[ñn]|placa|banner|imagen|logo|pieza|gr[aá]fic|flyer|portada|editable|pixel[ae]|resoluci[oó]n/i.test(texto)) return "diseño";
  if (/\bpauta|campa[ñn]a|anuncio|presupuesto|spend ?cap|saldo|recarg|meta ads|google ads|conversi[oó]n|conversiones|\bcpl\b|\bbm\b|business manager|p[ií]xel|lead ads|act_\d/i.test(texto)) return "pauta";
  if (/churn|contactar|llamar|check-?in|reuni[oó]n|whatsapp proactivo|avisarle al cliente|pedir(le)? a/i.test(texto)) return "cuenta";
  return "copy";
}

/** Pauta y gestión de cuenta por cliente (PLANILLA GENERAL, columnas AF y AH). */
async function responsablesGenerales(): Promise<Array<{ cliente: string; cuenta: string | null; pauta: string | null }>> {
  const values = await readSheet();
  const cell = (row: string[], i: number) => String(row[i] ?? "").trim() || null;
  return values.slice(4).map((row) => ({ cliente: String(row[0] ?? "").trim(), cuenta: cell(row, 31), pauta: cell(row, 33) })).filter((r) => r.cliente);
}

/**
 * Elige a la persona según el área de la tarea. Si el área no tiene a nadie
 * cargado, cae como antes: copy y programación, y si no, diseño. Pura.
 */
export function elegirResponsable(
  area: AreaTarea,
  r: { diseno: string | null; copyProgramacion: string | null; pauta?: string | null; cuenta?: string | null },
): { nombre: string; area: string } | null {
  if (area === "diseño" && r.diseno) return { nombre: r.diseno, area: "diseño" };
  if (area === "pauta" && r.pauta) return { nombre: r.pauta, area: "pauta" };
  if (area === "cuenta" && r.cuenta) return { nombre: r.cuenta, area: "gestión de cuenta" };
  if (r.copyProgramacion) return { nombre: r.copyProgramacion, area: "copy y programación" };
  return r.diseno ? { nombre: r.diseno, area: "diseño" } : null;
}

const mismoCliente = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
};

/** Resuelve el responsable humano de una tarea de cliente según la planilla del equipo. */
export async function resolverResponsable(clienteName: string, texto: string): Promise<{ nombre: string; area: string } | null> {
  try {
    if (!respCache || Date.now() - respCache.at > 10 * 60_000) {
      respCache = { at: Date.now(), rows: await leerResponsables() };
    }
  } catch { return null; }
  const fila = respCache.rows.find((r) => mismoCliente(r.cliente, clienteName));
  if (!fila) return null;
  const area = areaDeTarea(texto);
  // La planilla general solo hace falta para pauta y cuenta; si no se puede
  // leer, se deriva como antes en vez de no derivar.
  const general = area === "pauta" || area === "cuenta"
    ? await responsablesGenerales().then((rs) => rs.find((r) => mismoCliente(r.cliente, clienteName)) ?? null).catch(() => null)
    : null;
  return elegirResponsable(area, { ...fila, pauta: general?.pauta ?? null, cuenta: general?.cuenta ?? null });
}

// ── Carga del equipo (pedido 18/7: "ver si algún recurso está con muchas
// cuentas") — columnas "Responsable de atención" de PLANILLA GENERAL. ────────
const ROLES: Array<{ col: number; rol: string }> = [
  { col: 26, rol: "Diseño" },
  { col: 27, rol: "Diseño" },
  { col: 28, rol: "Filmaker" },
  { col: 29, rol: "Edición" },
  { col: 30, rol: "Copy" },
  { col: 31, rol: "Gestión de cuenta" },
  { col: 32, rol: "Posteos" },
  { col: 33, rol: "Pauta" },
];

/**
 * Piezas por mes que le tocan a un rol en una cuenta, según lo vendido (21/11: la
 * cantidad de cuentas no decía la carga; 10 cuentas de 2 posteos no son 10 de 20).
 * Filmaker y edición cargan los videos; diseño, copy y posteos, todo lo que se
 * publica. Gestión y pauta no se miden en piezas. Pura.
 */
export function piezasDelRol(rol: string, row: unknown[]): number {
  const posteos = ((num(row[2]) ?? 0) + (num(row[9]) ?? 0)) * 4.33;
  const videos = (num(row[3]) ?? 0) + (num(row[4]) ?? 0) + (num(row[12]) ?? 0);
  if (rol === "Filmaker" || rol === "Edición") return videos;
  if (rol === "Diseño" || rol === "Copy" || rol === "Posteos") return posteos + videos;
  return 0;
}

export interface CargaPersona {
  nombre: string;
  cuentas: number;
  /** Piezas por mes que le tocan, sumando sus roles en cada cuenta. */
  piezasMes: number;
  porRol: Record<string, number>;
  clientes: string[];
}

export async function cargaEquipo(): Promise<{ personas: CargaPersona[] }> {
  const values = await readSheet();
  const byPersona = new Map<string, { roles: Map<string, number>; clientes: Set<string>; piezas: number }>();
  for (const row of values.slice(4)) {
    const cliente = String(row[0] ?? "").trim();
    if (!cliente) continue;
    for (const { col, rol } of ROLES) {
      const nombre = String(row[col] ?? "").trim();
      if (!nombre) continue;
      const cur = byPersona.get(nombre) ?? { roles: new Map(), clientes: new Set(), piezas: 0 };
      cur.roles.set(rol, (cur.roles.get(rol) ?? 0) + 1);
      cur.piezas += piezasDelRol(rol, row);
      cur.clientes.add(cliente);
      byPersona.set(nombre, cur);
    }
  }
  const personas = [...byPersona.entries()].map(([nombre, v]) => ({
    nombre,
    cuentas: v.clientes.size,
    piezasMes: Math.round(v.piezas),
    porRol: Object.fromEntries(v.roles),
    clientes: [...v.clientes].sort(),
  }));
  personas.sort((a, b) => b.cuentas - a.cuentas);
  return { personas };
}
