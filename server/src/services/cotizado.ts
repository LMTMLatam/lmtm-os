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

import type { Db } from "@paperclipai/db";
import { adsInsights, clients } from "@paperclipai/db";
import { eq, gte, sql } from "drizzle-orm";
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
  };
  realizado: {
    posteosMes: number;
    videosMes: number;
    storiesMes: number;
    spendMeta: number;
    spendGoogle: number;
  };
  /** El cliente no tiene lista Redes de ClickUp mapeada → no se puede medir. */
  sinListaClickup: boolean;
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

export async function cotizadoVsRealizado(db: Db, opts: { months?: number } = {}): Promise<{ month: string; rows: CotizadoRow[]; sinMatch: string[]; prorrateoPct: number }> {
  const months = Math.min(Math.max(opts.months ?? 1, 1), 6);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const monthLabel = from.toISOString().slice(0, 7);
  // Fracción del período ya transcurrida (el período termina a fin del mes actual).
  const finPeriodo = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const prorrateo = Math.min(1, (now.getTime() - from.getTime()) / (finPeriodo - from.getTime()));

  const values = await readSheet();
  const activos = await db.select({ id: clients.id, name: clients.name, slug: clients.slug }).from(clients).where(eq(clients.status, "active"));

  // Hecho = calendario Redes de ClickUp con tag "mandado a make" en el período,
  // clasificado por formato ("Tipo de Contenido" o tag reel/story/etc.).
  const postsByClient = await contarHechoClickUp(db, activos.map((c) => c.id), from.getTime(), now.getTime());
  const fromDay = from.toISOString().slice(0, 10);
  const spend = await db.select({
    clientId: adsInsights.clientId,
    platform: adsInsights.platform,
    spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)`,
  }).from(adsInsights)
    .where(gte(adsInsights.date, fromDay))
    .groupBy(adsInsights.clientId, adsInsights.platform);
  const spendByClient = new Map<string, { meta: number; google: number }>();
  for (const s of spend) {
    if (!s.clientId) continue;
    const cur = spendByClient.get(s.clientId) ?? { meta: 0, google: 0 };
    if (s.platform === "google") cur.google += Number(s.spend); else cur.meta += Number(s.spend);
    spendByClient.set(s.clientId, cur);
  }

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
    };
    const hecho = match ? postsByClient.get(match.id) ?? null : null;
    const sinListaClickup = !!match && hecho === null;
    const real = {
      posteosMes: hecho?.posteos ?? 0,
      videosMes: hecho?.videos ?? 0,
      storiesMes: hecho?.stories ?? 0,
      spendMeta: match ? Math.round(spendByClient.get(match.id)?.meta ?? 0) : 0,
      spendGoogle: match ? Math.round(spendByClient.get(match.id)?.google ?? 0) : 0,
    };

    // Esperado del período: semanal ×4.33×meses, mensual ×meses — prorrateado
    // a los días transcurridos (a mitad de mes no se exige el mes entero).
    const esperadoPosteos = Math.round(((cot.igPosteosSemana ?? 0) * 4.33 + (cot.linkedinPosteosSemana ?? 0) * 4.33) * months * prorrateo);
    const esperadoVideos = Math.round(((cot.igReelesMes ?? 0) + (cot.igVideosMes ?? 0) + (cot.tiktokVideosMes ?? 0)) * months * prorrateo);
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
      esperadoMes: { posteos: esperadoPosteos, videos: esperadoVideos, stories: esperadoStories },
      cumplimientoPct: esperadoTotal > 0 && match && !sinListaClickup ? Math.round((realizadoTotal / esperadoTotal) * 100) : null,
    });
  }
  rows.sort((a, b) => (a.cumplimientoPct ?? 999) - (b.cumplimientoPct ?? 999));
  return { month: monthLabel, rows, sinMatch, prorrateoPct: Math.round(prorrateo * 100) };
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

/** Resuelve el responsable humano de una tarea de cliente según la planilla
 *  del equipo. El área se infiere del texto: diseño vs copy/programación. */
export async function resolverResponsable(clienteName: string, texto: string): Promise<{ nombre: string; area: string } | null> {
  try {
    if (!respCache || Date.now() - respCache.at > 10 * 60_000) {
      respCache = { at: Date.now(), rows: await leerResponsables() };
    }
  } catch { return null; }
  const fila = respCache.rows.find((r) => {
    const a = norm(r.cliente), b = norm(clienteName);
    return a === b || a.includes(b) || b.includes(a);
  });
  if (!fila) return null;
  const esDiseno = /dise[ñn]|placa|banner|imagen|logo|pieza|gr[aá]fic|flyer|portada|editable|pixel[ae]|resoluci[oó]n/i.test(texto);
  if (esDiseno && fila.diseno) return { nombre: fila.diseno, area: "diseño" };
  if (fila.copyProgramacion) return { nombre: fila.copyProgramacion, area: "copy y programación" };
  return fila.diseno ? { nombre: fila.diseno, area: "diseño" } : null;
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

export interface CargaPersona {
  nombre: string;
  cuentas: number;
  porRol: Record<string, number>;
  clientes: string[];
}

export async function cargaEquipo(): Promise<{ personas: CargaPersona[] }> {
  const values = await readSheet();
  const byPersona = new Map<string, { roles: Map<string, number>; clientes: Set<string> }>();
  for (const row of values.slice(4)) {
    const cliente = String(row[0] ?? "").trim();
    if (!cliente) continue;
    for (const { col, rol } of ROLES) {
      const nombre = String(row[col] ?? "").trim();
      if (!nombre) continue;
      const cur = byPersona.get(nombre) ?? { roles: new Map(), clientes: new Set() };
      cur.roles.set(rol, (cur.roles.get(rol) ?? 0) + 1);
      cur.clientes.add(cliente);
      byPersona.set(nombre, cur);
    }
  }
  const personas = [...byPersona.entries()].map(([nombre, v]) => ({
    nombre,
    cuentas: v.clientes.size,
    porRol: Object.fromEntries(v.roles),
    clientes: [...v.clientes].sort(),
  }));
  personas.sort((a, b) => b.cuentas - a.cuentas);
  return { personas };
}
