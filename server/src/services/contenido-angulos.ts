// LMTM-OS: el ángulo de cada publicación real (pedido 7/10).
//
// Para comparar ángulos entre todas las cuentas hay que saber desde dónde se
// contó cada publicación. Lo decide un modelo de texto leyendo el copy, con la
// misma lista que usa el generador de ideas (angulos-creativos.ts) más las
// formas propias del orgánico. Queda en organic_posts.angulo: se clasifica una
// vez y no se vuelve a pagar.
//
// Es una etiqueta, no un número: si el modelo no contesta, la publicación queda
// sin clasificar (null) y se reintenta en la próxima vuelta. Nunca se adivina.

import type { Db } from "@paperclipai/db";
import { clients, competenciaPosts, organicPosts } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { ANGULOS, ANGULOS_ORGANICO } from "./angulos-creativos.js";
import { analizarTexto, MODELO_TEXTO, MODELO_TEXTO_RESPALDO } from "./nvidia-modelos.js";

/** El modelo general (nemotron-3-super): en los casos dudosos acertó más que el
 *  rápido (9 s por lote). Si muere, analizarTexto cae solo al de respaldo. */
const MODELO_CLASIFICAR = process.env.NVIDIA_MODEL_CLASIFICAR?.trim() || MODELO_TEXTO;

/**
 * Lo clasificado antes de esta hora usó el modelo rápido y una lista sin
 * "emocional": se vuelve a clasificar. Una sola vez — lo nuevo queda con
 * angulo_at posterior.
 * ponytail: corte fijo por fecha; si se vuelve a cambiar la lista, mover la fecha.
 */
const RECLASIFICAR_ANTES_DE = new Date("2026-10-07T19:40:00Z");
const pendiente = () => or(isNull(organicPosts.angulo), and(lt(organicPosts.anguloAt, RECLASIFICAR_ANTES_DE), ne(organicPosts.angulo, SIN_TEXTO)));

const TODOS = [...ANGULOS, ...ANGULOS_ORGANICO];
const IDS = new Set(TODOS.map((a) => a.id));
/** Sin copy no hay ángulo que leer; se marca para no reintentar. */
export const SIN_TEXTO = "sin-texto";
const VENTANA_DIAS = 180;
const POR_LOTE = 20;

const SISTEMA = [
  "Clasificás publicaciones de redes de pymes argentinas según su ÁNGULO: desde dónde se cuenta, no el tema.",
  "Ángulos posibles (id — nombre: cómo se reconoce):",
  ...TODOS.map((a) => `- ${a.id} — ${a.nombre}: ${a.como}`),
  "Elegí UNO por publicación: el más específico. Si muestra la propiedad o el producto con sus datos y nada más, es vitrina.",
  'Respondé SOLO con un array JSON, sin texto alrededor: [{"i":<número>,"angulo":"<id>"}]. Un elemento por publicación, con el mismo "i".',
].join("\n");

/** Puro: valida la respuesta del modelo contra los ids que se mandaron. */
export function leerClasificacion(texto: string, indices: number[]): Map<number, string> {
  const out = new Map<number, string>();
  const a = texto.indexOf("["), b = texto.lastIndexOf("]");
  if (a < 0 || b <= a) return out;
  let arr: unknown;
  try { arr = JSON.parse(texto.slice(a, b + 1)); } catch { return out; }
  if (!Array.isArray(arr)) return out;
  const validos = new Set(indices);
  for (const it of arr) {
    const o = it as { i?: unknown; angulo?: unknown };
    const i = Number(o?.i);
    const ang = String(o?.angulo ?? "").trim().toLowerCase();
    if (validos.has(i) && IDS.has(ang)) out.set(i, ang);
  }
  return out;
}

/** Clasifica textos en lotes: índice → ángulo. Lo que el modelo no contestó no está (se reintenta). */
async function clasificarTextos(items: Array<{ texto: string; tipo: string | null; red: string }>): Promise<{ angulos: Map<number, string>; fallas: number }> {
  const angulos = new Map<number, string>();
  let fallas = 0;
  for (let k = 0; k < items.length; k += POR_LOTE) {
    const lote = items.slice(k, k + POR_LOTE);
    // Por caracteres completos: un .slice puede partir un emoji en dos.
    const usuario = lote.map((p, i) => `[${i}] (${p.red}, ${p.tipo ?? "post"}) ${Array.from(p.texto.replace(/\s+/g, " ")).slice(0, 400).join("")}`).join("\n");
    // 12k: el modelo grande razona antes de contestar y con 4096 se quedaba
    // sin espacio (finish_reason=length). Si igual no contesta, el rápido.
    let r = await analizarTexto(SISTEMA, usuario, { maxTokens: 12_000, temperature: 0, modelo: MODELO_CLASIFICAR });
    if (!r.texto && MODELO_CLASIFICAR !== MODELO_TEXTO_RESPALDO) r = await analizarTexto(SISTEMA, usuario, { maxTokens: 4096, temperature: 0, modelo: MODELO_TEXTO_RESPALDO });
    const mapa = r.texto ? leerClasificacion(r.texto, lote.map((_, i) => i)) : new Map<number, string>();
    if (mapa.size === 0) {
      fallas += 1;
      console.warn(`[contenido-angulos] lote sin clasificar (${r.motivo ?? "respuesta ilegible"}${r.detalle ? `: ${r.detalle.slice(0, 120)}` : ""})`);
      if (fallas >= 3) break; // el modelo no está contestando: se reintenta en la próxima vuelta
      continue;
    }
    for (const [i, angulo] of mapa) angulos.set(k + i, angulo);
  }
  return { angulos, fallas };
}

let corriendo = false;

/** Clasifica hasta `max` publicaciones pendientes (las más nuevas primero). */
export async function clasificarPendientes(db: Db, max = 500): Promise<{ clasificadas: number; sinTexto: number; fallas: number }> {
  if (corriendo) return { clasificadas: 0, sinTexto: 0, fallas: 0 };
  corriendo = true;
  try {
    const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
    const pendientes = await db
      .select({ id: organicPosts.id, texto: organicPosts.message, tipo: organicPosts.postType, permalink: organicPosts.permalinkUrl })
      .from(organicPosts)
      .innerJoin(clients, eq(clients.id, organicPosts.clientId))
      .where(and(pendiente(), gte(organicPosts.createdTime, desde), eq(clients.status, "active")))
      .orderBy(desc(organicPosts.createdTime))
      .limit(max);

    const vacias = pendientes.filter((p) => (p.texto ?? "").trim().length < 15);
    if (vacias.length) {
      await db.update(organicPosts).set({ angulo: SIN_TEXTO, anguloAt: new Date() }).where(inArray(organicPosts.id, vacias.map((v) => v.id)));
    }
    const conTexto = pendientes.filter((p) => (p.texto ?? "").trim().length >= 15);

    const { angulos, fallas } = await clasificarTextos(conTexto.map((p) => ({
      texto: p.texto ?? "", tipo: p.tipo, red: /instagram\.com/.test(p.permalink ?? "") ? "instagram" : "facebook",
    })));
    for (const [i, angulo] of angulos) {
      await db.update(organicPosts).set({ angulo, anguloAt: new Date() }).where(eq(organicPosts.id, conTexto[i].id));
    }
    return { clasificadas: angulos.size, sinTexto: vacias.length, fallas };
  } finally {
    corriendo = false;
  }
}

/** Lo mismo para las publicaciones de la competencia (competencia-ig.ts). */
export async function clasificarCompetencia(db: Db, max = 300): Promise<{ clasificadas: number; sinTexto: number; fallas: number }> {
  if (corriendo) return { clasificadas: 0, sinTexto: 0, fallas: 0 };
  corriendo = true;
  try {
    const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
    const pendientes = await db
      .select({ id: competenciaPosts.id, texto: competenciaPosts.texto, tipo: competenciaPosts.formato })
      .from(competenciaPosts)
      .where(and(isNull(competenciaPosts.angulo), gte(competenciaPosts.publicadoAt, desde)))
      .orderBy(desc(competenciaPosts.publicadoAt))
      .limit(max);
    const vacias = pendientes.filter((p) => (p.texto ?? "").trim().length < 15);
    if (vacias.length) {
      await db.update(competenciaPosts).set({ angulo: SIN_TEXTO, anguloAt: new Date() }).where(inArray(competenciaPosts.id, vacias.map((v) => v.id)));
    }
    const conTexto = pendientes.filter((p) => (p.texto ?? "").trim().length >= 15);
    const { angulos, fallas } = await clasificarTextos(conTexto.map((p) => ({ texto: p.texto ?? "", tipo: p.tipo, red: "instagram" })));
    for (const [i, angulo] of angulos) {
      await db.update(competenciaPosts).set({ angulo, anguloAt: new Date() }).where(eq(competenciaPosts.id, conTexto[i].id));
    }
    return { clasificadas: angulos.size, sinTexto: vacias.length, fallas };
  } finally {
    corriendo = false;
  }
}

/** Cuántas quedan sin clasificar (para el panel). */
export async function pendientesDeClasificar(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(organicPosts)
    .where(and(pendiente(), gte(organicPosts.createdTime, new Date(Date.now() - VENTANA_DIAS * 86_400_000))));
  return Number(r?.n ?? 0);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada hora clasifica lo nuevo. Las publicaciones entran por el sync de Meta. */
export function initContenidoAngulos(db: Db): void {
  if (timer) return;
  const vuelta = () => {
    void (async () => {
      const r = await clasificarPendientes(db);
      if (r.clasificadas || r.sinTexto || r.fallas) console.log(`[contenido-angulos] ${r.clasificadas} clasificadas, ${r.sinTexto} sin texto, ${r.fallas} lotes fallidos`);
      const c = await clasificarCompetencia(db);
      if (c.clasificadas || c.sinTexto || c.fallas) console.log(`[contenido-angulos] competencia: ${c.clasificadas} clasificadas, ${c.sinTexto} sin texto, ${c.fallas} lotes fallidos`);
    })().catch((e) => console.warn("[contenido-angulos] falló:", e instanceof Error ? e.message : e));
  };
  setTimeout(vuelta, 8 * 60_000);
  timer = setInterval(vuelta, 60 * 60_000);
}
