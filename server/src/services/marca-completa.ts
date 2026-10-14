// LMTM-OS: la marca de cada cliente se completa sola (pedido 13/10).
//
// "Buscá la web de todos los clientes y cargala en Marca; tomá los colores
// principales de cada marca; y del Enfoque Técnico sacá todos los datos que no
// sean avatar ni logo y cargalos en Marca. Después que lo hagan automático."
//
// De dónde sale cada cosa, en orden de confianza:
//   · web:      un link del Enfoque Técnico, o el campo "sitio web" de su página
//               de Facebook. Solo se guarda si responde.
//   · colores:  la paleta del Enfoque Técnico (los hex que escribió el equipo);
//               si no hay, los colores principales de la web.
//   · el resto (tipografías, tono, palabras, mensaje, público, diferencial): el
//               Enfoque Técnico, leído por el modelo con la regla de no inventar.
//
// Quién gana: lo que cargó una PERSONA > el Enfoque Técnico > lo aprendido de
// los posteos (marca-aprendida.ts). Una persona nunca es pisada; el Enfoque
// Técnico es un documento del equipo y le gana a una inferencia.

import { createHash } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, clientBrand, clientContextCache, clients } from "@paperclipai/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { AUTOR_APRENDIZAJE } from "./marca-aprendida.js";

/** Quién escribió la fila cuando sale del Enfoque Técnico. */
export const AUTOR_ENFOQUE = "enfoque-tecnico";
/** Autores automáticos: lo demás es una persona (o un agente a propósito) y no se pisa. */
export const esAutomatico = (autor: string | null | undefined) => !autor || autor === AUTOR_APRENDIZAJE || autor === AUTOR_ENFOQUE;

export interface MarcaDelEnfoque {
  colores: string[];
  tipografias: string[];
  tono: string | null;
  palabrasSi: string[];
  palabrasNo: string[];
  mensaje: string | null;
  publico: string | null;
  diferencial: string | null;
}
type Campo = keyof MarcaDelEnfoque;
const CAMPOS: Campo[] = ["colores", "tipografias", "tono", "palabrasSi", "palabrasNo", "mensaje", "publico", "diferencial"];

const cargado = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "");

/**
 * Qué escribir. Pura. Fila de una persona: solo los huecos. Fila automática (o
 * sin fila): lo que diga el documento pisa lo inferido, y lo que el documento no
 * dice se deja como estaba.
 */
export function fusionarEnfoque(actual: Partial<MarcaDelEnfoque> | null, nueva: MarcaDelEnfoque, filaDePersona: boolean): Partial<MarcaDelEnfoque> {
  const out: Partial<MarcaDelEnfoque> = {};
  for (const c of CAMPOS) {
    if (!cargado(nueva[c])) continue;
    if (filaDePersona && cargado(actual?.[c])) continue;
    (out as Record<string, unknown>)[c] = nueva[c];
  }
  return out;
}

// ── colores ──────────────────────────────────────────────────────────────────

/** "#abc" → "#aabbcc", en minúscula. null si no es un hex. */
export function normalizarHex(h: string): string | null {
  const m = h.trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const x = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${x}`;
}

/** Saturación y luz (0-1) para descartar blancos, negros y grises, que no son "la marca". */
function hsl(hex: string): { s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
export const esColorDeMarca = (hex: string) => {
  const { s, l } = hsl(hex);
  return s >= 0.18 && l >= 0.08 && l <= 0.94;
};

/** Colores por defecto de frameworks y plantillas: aparecen en mil webs y no son la marca de nadie. */
const DE_PLANTILLA = new Set([
  "#007bff", "#0d6efd", "#6c757d", "#28a745", "#198754", "#dc3545", "#ffc107", "#17a2b8", "#0dcaf0", "#6610f2", "#6f42c1", "#e83e8c", "#d63384", "#fd7e14", "#20c997",
  "#0073aa", "#21759b", "#00a0d2", "#2271b1", "#135e96", "#72aee6", "#d63638", "#00a32a", "#dba617",
  "#6ec1e4", "#61ce70", "#4054b2", "#23a455", "#cf2e2e", "#ff6900", "#fcb900", "#7bdcb5", "#00d084", "#8ed1fc", "#0693e3", "#abb8c3", "#eb144c", "#f78da7", "#9b51e0",
  "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff",
  // Bootstrap 3, WordPress (barra y avisos), Divi, BeTheme y el editor de bloques:
  // salían como "colores de marca" en el ensayo del 13/10.
  "#337ab7", "#a94442", "#3c763d", "#8a6d3b", "#31708f", "#5cb85c", "#5bc0de", "#f0ad4e", "#d9534f",
  "#003388", "#003399", "#dc3232", "#46b450", "#ffb900", "#2ea3f2", "#2db742", "#0095eb", "#0089f7", "#161922", "#81d742",
  "#007cba", "#7a00df", "#00a8ff", "#ffdddd", "#1e73be", "#1e293b",
  "#fcf8e3", "#f2dede", "#dff0d8", "#d9edf7", "#006ba1", "#005a87", "#34e2e4", "#f56e28", "#94a3b8", "#64748b", "#cbd5e0", "#dd4b39",
  // Botones de redes y de WhatsApp de los plugins.
  "#25d366", "#22d366", "#4dc247", "#128c7e", "#075e54", "#3b5998", "#1877f2", "#4267b2", "#1b95e0", "#1da1f2", "#e1306c", "#c13584", "#0077b5", "#bd081c",
]);

/**
 * Los colores principales de una web. Pura sobre el HTML y el CSS ya bajados.
 * Primero lo declarado como de marca (theme-color, variables --primary/--brand/
 * --accent), después por frecuencia. Sin blancos, negros, grises ni colores de
 * plantilla.
 */
export function coloresDeLaWeb(html: string, css: string): string[] {
  const puntos = new Map<string, number>();
  const sumar = (raw: string, p: number) => {
    const h = normalizarHex(raw);
    if (!h || DE_PLANTILLA.has(h) || !esColorDeMarca(h)) return;
    puntos.set(h, (puntos.get(h) ?? 0) + p);
  };
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{3,6})["']/i)
    ?? html.match(/<meta[^>]+content=["'](#[0-9a-f]{3,6})["'][^>]+name=["']theme-color["']/i);
  if (theme) sumar(theme[1], 50);
  const todo = `${html}\n${css}`;
  for (const m of todo.matchAll(/--[\w-]*(?:primary|primario|brand|marca|accent|acento|secondary|secundario|main)[\w-]*\s*:\s*(#[0-9a-f]{3,6})\b/gi)) sumar(m[1], 20);
  for (const m of todo.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) sumar(m[0], 1);
  return [...puntos.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 4);
}

async function bajar(url: string, max = 600_000): Promise<string> {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LMTM-OS marca)" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.text()).slice(0, max);
}

/** Baja la home y hasta 3 hojas de estilo, y devuelve sus colores principales. */
export async function coloresDeSitio(url: string): Promise<string[]> {
  const html = await bajar(url);
  const hojas = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1])
    .filter((h) => !/fonts\.googleapis|bootstrap|font-?awesome|jquery|cdnjs|elementor\/assets\/lib/i.test(h))
    .slice(0, 3);
  const css: string[] = [];
  for (const h of hojas) {
    try { css.push(await bajar(new URL(h, url).toString(), 400_000)); } catch { /* una hoja que no baja no frena */ }
  }
  return coloresDeLaWeb(html, css.join("\n"));
}

// ── web ──────────────────────────────────────────────────────────────────────

const NO_ES_WEB_PROPIA = /(instagram|facebook|fb\.me|linkedin|tiktok|youtube|youtu\.be|twitter|x\.com|wa\.me|whatsapp|clickup|google\.|goo\.gl|drive\.|docs\.|linktr\.ee|canva|figma|mercadolibre|bit\.ly|calendly|notion|dropbox|wetransfer|zonaprop|argenprop|tokko|maps\.app)/i;

/** Las URLs de un texto que pueden ser la web propia del cliente. Pura. */
export function websCandidatas(texto: string): string[] {
  const out = new Set<string>();
  for (const m of texto.matchAll(/\bhttps?:\/\/[^\s)\]>"'|,]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s)\]>"'|,]*/gi)) {
    let u = m[0].replace(/[.;:]+$/, "");
    if (!/^https?:/i.test(u)) u = `https://${u}`;
    try {
      const url = new URL(u);
      if (NO_ES_WEB_PROPIA.test(url.hostname)) continue;
      out.add(`${url.protocol}//${url.hostname}/`);
    } catch { /* no es URL */ }
  }
  return [...out];
}

const compacto = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * La web del cliente según su Enfoque Técnico. Pura. Un link cuenta solo si
 * está en una línea que habla de la web (web, sitio, página, tienda) o si el
 * dominio se parece al nombre: el documento también cita links de referencia
 * (a MONDINO le salía cleanenergyministerial.org, 13/10). Los que se parecen al
 * nombre van primero.
 */
export function websDelEnfoque(md: string, nombre: string): string[] {
  const tokens = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const pareceDelCliente = (url: string) => {
    const host = compacto(new URL(url).hostname.replace(/^www\./, "").split(".")[0]);
    return tokens.some((t) => host.includes(t) || t.includes(host)) || (compacto(nombre).length >= 5 && host.includes(compacto(nombre)));
  };
  const porNombre: string[] = [];
  const porEtiqueta: string[] = [];
  for (const linea of md.split("\n")) {
    const etiquetada = /\b(web|sitio|p[aá]gina|landing|tienda|dominio|e-?commerce)\b/i.test(linea);
    for (const u of websCandidatas(linea)) {
      if (pareceDelCliente(u)) porNombre.push(u);
      else if (etiquetada) porEtiqueta.push(u);
    }
  }
  return [...new Set([...porNombre, ...porEtiqueta])];
}

/** ¿La web responde? Devuelve la URL final (después de redirecciones) o null. */
export async function webQueResponde(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LMTM-OS marca)" } });
    if (r.status >= 400 && r.status !== 403) return null;
    const final = new URL(r.url || url);
    // Un dominio vencido redirige a un estacionador o a un marketplace de dominios.
    if (/sedo|godaddy|dan\.com|parking|hugedomains|afternic/i.test(final.hostname)) return null;
    return `${final.protocol}//${final.hostname}/`;
  } catch {
    return null;
  }
}

/** El campo "sitio web" de la página de Facebook del cliente. */
async function webDeFacebook(db: Db, clientId: string): Promise<string | null> {
  const [m] = await db.select({ pageId: adsAccountMappings.pageId, conn: adsAccountMappings.connectionId })
    .from(adsAccountMappings)
    .where(and(eq(adsAccountMappings.clientId, clientId), eq(adsAccountMappings.platform, "meta"), isNotNull(adsAccountMappings.pageId)))
    .limit(1);
  if (!m?.pageId || !m.conn) return null;
  const [c] = await db.select({ token: adsConnections.accessToken }).from(adsConnections).where(eq(adsConnections.id, m.conn));
  if (!c?.token) return null;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(m.pageId)}?fields=website&access_token=${encodeURIComponent(c.token)}`, { signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as { website?: string };
    return j.website ? (websCandidatas(j.website)[0] ?? null) : null;
  } catch {
    return null;
  }
}

// ── Enfoque Técnico ─────────────────────────────────────────────────────────

/** Los hex que escribió el equipo en la sección de paleta. Pura. */
export function paletaDelEnfoque(md: string): string[] {
  const seccion = md.match(/#{1,4}[^\n]*(?:paleta|colores)[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s|$)/i)?.[1] ?? "";
  const hex = [...seccion.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)].map((m) => normalizarHex(m[0])).filter((h): h is string => !!h);
  return [...new Set(hex)].slice(0, 6);
}

/** Las secciones que hablan de la marca (el documento entero no entra: la mediana son 15 mil caracteres). */
export function seccionesDeMarca(md: string, max = 9_000): string {
  const partes = md.split(/\n(?=#{1,4}\s)/);
  const utiles = partes.filter((p) => /^#{1,4}[^\n]*(marca|tono|tipograf|paleta|color|cliente ideal|quién|quienes|público|publico|diferencia|posicionamiento|propuesta|mensaje|comunica|objetivo|motivacion|objecion|problema|lineamientos|empresa|qué hace|que hace)/i.test(p));
  const texto = (utiles.length ? utiles.join("\n") : md).slice(0, max);
  return texto;
}

const PROMPT = [
  "Sos analista de marca de una agencia. Te paso partes del Enfoque Técnico de un cliente: un documento que escribió el equipo.",
  "Extraé SOLO lo que el documento dice. No inventes, no completes con suposiciones, no generalices.",
  "",
  "Respondé ÚNICAMENTE con JSON:",
  '{"tipografias":["nombres de fuentes que el documento menciona"],"tono":"cómo habla la marca, 1-2 frases",',
  '"palabrasSi":["palabras o expresiones que el documento dice que usa"],"palabrasNo":["palabras o registros que el documento dice que evita"],',
  '"mensaje":"la promesa central, 1 frase","publico":"a quién le habla, 1 frase","diferencial":"por qué lo eligen, 1 frase"}',
  "",
  "Si el documento no dice algo, poné null (o [] para las listas). Español rioplatense.",
].join("\n");

function leer(raw: string): Omit<MarcaDelEnfoque, "colores"> | null {
  const i = raw.indexOf("{"), f = raw.lastIndexOf("}");
  if (i === -1 || f <= i) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw.slice(i, f + 1)) as Record<string, unknown>; } catch { return null; }
  const texto = (v: unknown) => (typeof v === "string" && v.trim() && !/^(null|n\/a|no (se )?(especifica|menciona|dice))/i.test(v.trim()) ? v.trim().slice(0, 600) : null);
  const lista = (v: unknown, largo = 40) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, largo)).slice(0, 12) : []);
  return {
    tipografias: lista(o.tipografias, 60), tono: texto(o.tono),
    palabrasSi: lista(o.palabrasSi), palabrasNo: lista(o.palabrasNo),
    mensaje: texto(o.mensaje), publico: texto(o.publico), diferencial: texto(o.diferencial),
  };
}

export interface ResultadoMarca {
  cliente: string;
  web: { valor: string | null; fuente: "ya_estaba" | "enfoque" | "facebook" | null };
  colores: { valor: string[]; fuente: "enfoque" | "web" | "ya_estaba" | null };
  camposDelEnfoque: string[];
  respetados: string[];
  nota?: string;
}

/**
 * Completa la marca de UN cliente. Idempotente: el modelo solo se llama si el
 * Enfoque Técnico cambió desde la última vez (o si se fuerza).
 */
export async function completarMarca(db: Db, clientId: string, opts: { forzar?: boolean } = {}): Promise<ResultadoMarca> {
  const [cli] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!cli) throw new Error("cliente no encontrado");
  const meta = (cli.metadata ?? {}) as Record<string, unknown>;
  const [doc] = await db.select({ payload: clientContextCache.payload }).from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));
  const md = String((doc?.payload as { markdown?: string } | undefined)?.markdown ?? "").trim();
  const [fila] = await db.select().from(clientBrand).where(eq(clientBrand.clientId, clientId));
  const filaDePersona = Boolean(fila && !esAutomatico(fila.updatedBy));
  const res: ResultadoMarca = { cliente: cli.name.trim(), web: { valor: cli.websiteUrl ?? null, fuente: cli.websiteUrl ? "ya_estaba" : null }, colores: { valor: (fila?.colores as string[]) ?? [], fuente: (fila?.colores as string[] | undefined)?.length ? "ya_estaba" : null }, camposDelEnfoque: [], respetados: [] };

  // 1. La web: solo si no hay una (la que cargó una persona no se toca).
  let web = cli.websiteUrl?.trim() || null;
  if (!web) {
    for (const cand of md ? websDelEnfoque(md, cli.name) : []) {
      const ok = await webQueResponde(cand);
      if (ok) { web = ok; res.web = { valor: ok, fuente: "enfoque" }; break; }
    }
    if (!web) {
      const fb = await webDeFacebook(db, clientId);
      const ok = fb ? await webQueResponde(fb) : null;
      if (ok) { web = ok; res.web = { valor: ok, fuente: "facebook" }; }
    }
    if (web) await db.update(clients).set({ websiteUrl: web, updatedAt: new Date() }).where(eq(clients.id, clientId));
  }

  // 2. Lo del Enfoque Técnico (con el modelo solo si el documento cambió).
  const hash = md ? createHash("sha1").update(md).digest("hex").slice(0, 16) : null;
  let nueva: MarcaDelEnfoque = { colores: md ? paletaDelEnfoque(md) : [], tipografias: [], tono: null, palabrasSi: [], palabrasNo: [], mensaje: null, publico: null, diferencial: null };
  if (md && (opts.forzar || meta.marcaEnfoqueHash !== hash)) {
    const { analizarTexto } = await import("./nvidia-modelos.js");
    const r = await analizarTexto(PROMPT, `Cliente: ${cli.name.trim()}\n\n${seccionesDeMarca(md)}`, { maxTokens: 12_000, temperature: 0.2 });
    const l = r.texto ? leer(r.texto) : null;
    if (l) nueva = { ...nueva, ...l };
    else res.nota = `el modelo no devolvió una marca legible (${r.motivo ?? "sin texto"})`;
  }

  // 3. Colores: los del documento; si no hay, los de la web.
  if (nueva.colores.length > 0) res.colores = { valor: nueva.colores, fuente: "enfoque" };
  else if (web && !(fila?.colores as string[] | undefined)?.length) {
    const deWeb = await coloresDeSitio(web).catch(() => []);
    if (deWeb.length) { nueva = { ...nueva, colores: deWeb }; res.colores = { valor: deWeb, fuente: "web" }; }
  }

  const aEscribir = fusionarEnfoque(fila ?? null, nueva, filaDePersona);
  res.camposDelEnfoque = Object.keys(aEscribir);
  res.respetados = filaDePersona ? CAMPOS.filter((c) => cargado(nueva[c]) && cargado(fila?.[c])) : [];
  if (Object.keys(aEscribir).length > 0) {
    await db.insert(clientBrand).values({ clientId, ...aEscribir, updatedBy: filaDePersona ? fila!.updatedBy : AUTOR_ENFOQUE, updatedAt: new Date() } as never)
      .onConflictDoUpdate({ target: clientBrand.clientId, set: { ...aEscribir, ...(filaDePersona ? {} : { updatedBy: AUTOR_ENFOQUE }), updatedAt: new Date() } as never });
  }
  if (hash && hash !== meta.marcaEnfoqueHash && !res.nota) {
    await db.update(clients).set({ metadata: { ...meta, marcaEnfoqueHash: hash } }).where(eq(clients.id, clientId));
  }
  return res;
}

/** Todos los clientes activos. */
export async function completarTodas(db: Db): Promise<{ clientes: number; conWeb: number; webNueva: number; conColores: number; actualizados: number; fallados: number }> {
  const activos = await db.select({ id: clients.id }).from(clients).where(eq(clients.status, "active"));
  let conWeb = 0, webNueva = 0, conColores = 0, actualizados = 0, fallados = 0;
  for (const c of activos) {
    try {
      const r = await completarMarca(db, c.id);
      if (r.web.valor) conWeb += 1;
      if (r.web.fuente === "enfoque" || r.web.fuente === "facebook") webNueva += 1;
      if (r.colores.valor.length) conColores += 1;
      if (r.camposDelEnfoque.length) actualizados += 1;
    } catch (e) {
      fallados += 1;
      console.warn(`[marca-completa] ${c.id} falló:`, e instanceof Error ? e.message : e);
    }
  }
  return { clientes: activos.length, conWeb, webNueva, conColores, actualizados, fallados };
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Una vez por día: los clientes nuevos y los Enfoques Técnicos que cambiaron. */
export function initMarcaCompleta(db: Db): void {
  if (timer) return;
  const vuelta = async () => {
    const { tocaHoy } = await import("./una-vez-por-dia.js");
    if (!(await tocaHoy(db, "marca:completar"))) return;
    const r = await completarTodas(db);
    console.log(`[marca-completa] ${r.clientes} clientes: ${r.conWeb} con web (${r.webNueva} nuevas), ${r.conColores} con colores, ${r.actualizados} marcas actualizadas, ${r.fallados} fallados`);
  };
  setTimeout(() => { void vuelta().catch((e) => console.warn("[marca-completa] falló:", e instanceof Error ? e.message : e)); }, 15 * 60_000);
  timer = setInterval(() => { void vuelta().catch((e) => console.warn("[marca-completa] falló:", e instanceof Error ? e.message : e)); }, 6 * 3600_000);
}
