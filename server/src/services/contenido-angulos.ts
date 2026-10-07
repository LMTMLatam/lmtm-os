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
import { clients, organicPosts } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { ANGULOS, ANGULOS_ORGANICO } from "./angulos-creativos.js";
import { analizarTexto } from "./nvidia-modelos.js";

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

let corriendo = false;

/** Clasifica hasta `max` publicaciones pendientes (las más nuevas primero). */
export async function clasificarPendientes(db: Db, max = 200): Promise<{ clasificadas: number; sinTexto: number; fallas: number }> {
  if (corriendo) return { clasificadas: 0, sinTexto: 0, fallas: 0 };
  corriendo = true;
  try {
    const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
    const pendientes = await db
      .select({ id: organicPosts.id, texto: organicPosts.message, tipo: organicPosts.postType, permalink: organicPosts.permalinkUrl })
      .from(organicPosts)
      .innerJoin(clients, eq(clients.id, organicPosts.clientId))
      .where(and(isNull(organicPosts.angulo), gte(organicPosts.createdTime, desde), eq(clients.status, "active")))
      .orderBy(desc(organicPosts.createdTime))
      .limit(max);

    const vacias = pendientes.filter((p) => (p.texto ?? "").trim().length < 15);
    if (vacias.length) {
      await db.update(organicPosts).set({ angulo: SIN_TEXTO, anguloAt: new Date() }).where(inArray(organicPosts.id, vacias.map((v) => v.id)));
    }
    const conTexto = pendientes.filter((p) => (p.texto ?? "").trim().length >= 15);

    let clasificadas = 0, fallas = 0;
    for (let k = 0; k < conTexto.length; k += POR_LOTE) {
      const lote = conTexto.slice(k, k + POR_LOTE);
      const usuario = lote.map((p, i) => {
        const red = /instagram\.com/.test(p.permalink ?? "") ? "instagram" : "facebook";
        return `[${i}] (${red}, ${p.tipo ?? "post"}) ${(p.texto ?? "").replace(/\s+/g, " ").slice(0, 400)}`;
      }).join("\n");
      const r = await analizarTexto(SISTEMA, usuario, { maxTokens: 4096, temperature: 0 });
      const mapa = r.texto ? leerClasificacion(r.texto, lote.map((_, i) => i)) : new Map<number, string>();
      if (mapa.size === 0) {
        fallas += 1;
        console.warn(`[contenido-angulos] lote sin clasificar (${r.motivo ?? "respuesta ilegible"})`);
        if (fallas >= 3) break; // el modelo no está contestando: se reintenta en la próxima vuelta
        continue;
      }
      for (const [i, angulo] of mapa) {
        await db.update(organicPosts).set({ angulo, anguloAt: new Date() }).where(eq(organicPosts.id, lote[i].id));
        clasificadas += 1;
      }
    }
    return { clasificadas, sinTexto: vacias.length, fallas };
  } finally {
    corriendo = false;
  }
}

/** Cuántas quedan sin clasificar (para el panel). */
export async function pendientesDeClasificar(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(organicPosts)
    .where(and(isNull(organicPosts.angulo), gte(organicPosts.createdTime, new Date(Date.now() - VENTANA_DIAS * 86_400_000))));
  return Number(r?.n ?? 0);
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada hora clasifica lo nuevo. Las publicaciones entran por el sync de Meta. */
export function initContenidoAngulos(db: Db): void {
  if (timer) return;
  const vuelta = () => {
    void clasificarPendientes(db)
      .then((r) => { if (r.clasificadas || r.sinTexto || r.fallas) console.log(`[contenido-angulos] ${r.clasificadas} clasificadas, ${r.sinTexto} sin texto, ${r.fallas} lotes fallidos`); })
      .catch((e) => console.warn("[contenido-angulos] falló:", e instanceof Error ? e.message : e));
  };
  setTimeout(vuelta, 8 * 60_000);
  timer = setInterval(vuelta, 60 * 60_000);
}
