// LMTM-OS: «Tipos de video» (pedido 09/11).
//
// "El equipo de agentes tiene que buscar los virales por nicho y por tipo de
// video, y en producción de contenido tiene que haber una plantilla de cómo se
// edita cada tipo de video en cada nicho."
//
// Los virales NO se buscan con un agente navegando: ya se miden las cuentas de
// la competencia cada 3 horas (competencia-ig.ts). Un video es viral si su
// interacción es VIRAL_DESDE veces lo normal de SU cuenta. Instagram no da las
// vistas de cuentas ajenas, así que la vara es me gusta + comentarios×3, la
// misma que en el resto del sistema. El tipo de video lo pone un modelo de
// texto leyendo el copy, una sola vez por publicación.
//
// La plantilla (nicho + tipo) la propone un agente con esos virales y la
// aprueba una persona. Cada cambio es una versión nueva. Las reglas que carga
// una persona no las puede sacar un agente.
//
// Alcance (11/11, «que se puedan poner tipos de videos para clientes
// específicos, para nichos, para todo»): una plantilla y un tipo de video
// valen para todos ('todos'), para un rubro ('inmobiliaria') o para un cliente
// ('cliente:<slug>'). La clave va en video_plantillas.nicho y video_tipos.alcance.
// Al pedir la plantilla de un cliente se usa la más específica que exista
// (cliente → rubro → general) y las reglas de los tres niveles se suman.

import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import {
  clients, competenciaPosts, competitors, videoPlantillas, videoTipos, videoVirales,
  type ContenidoPlantilla, type FormaDeVideo, type PerfilVtool, type ReglaDeVideo,
} from "@paperclipai/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { MADURA_DIAS, usuarioDeCompetidor, usuarioDeInstagram } from "./competencia-ig.js";
import { mediana, MIN_NORMAL, MIN_POR_CUENTA } from "./contenido-analisis.js";
import { analizarTexto, MODELO_TEXTO, MODELO_TEXTO_RESPALDO } from "./nvidia-modelos.js";
import { existeEnInstagram } from "./redes-publicas.js";

/** Un video es viral si rinde esto contra lo normal de su cuenta. */
export const VIRAL_DESDE = 3;
/** Ventana de los virales. Lo normal de la cuenta se calcula con el doble, para tener base. */
export const VENTANA_DIAS = 90;
/** Para pasar de borrador a «lista para revisar». */
export const MIN_VIRALES = 5;
export const MIN_CUENTAS = 3;
/** Una plantilla aprobada hace más de esto se marca «vieja». */
export const VENCE_DIAS = 90;

export const OTRO = "otro";
const SIN_TEXTO = "sin-texto";
const FORMATOS_VIDEO = ["reel", "video"];

export type Viral = {
  id: string; url: string | null; cuenta: string; nicho: string; tipo: string; fecha: string;
  interaccion: number | null; normal: number | null; veces: number | null;
  texto: string; fuente: "sistema" | "equipo" | "agente";
  gancho?: string | null; forma?: FormaDeVideo | null; respuestas?: Record<string, boolean> | null; notas?: string | null;
};

export const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** "https://www.instagram.com/reel/ABC123/?x=1" → "ABC123". Sirve para emparejar un link con una publicación medida. */
export function codigoDeLink(url: string | null | undefined): string | null {
  return (url ?? "").match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ?? null;
}

type PostMedido = { id: string; usuario: string; formato: string | null; interaccion: number; fecha: Date; permalink: string | null; texto: string; tipo: string | null };

/**
 * Puro: cada video de la ventana contra lo normal de su cuenta. Lo normal sale
 * de TODAS las publicaciones de la cuenta (no solo videos) y hace falta un
 * mínimo de publicaciones: con 3 posts no hay "normal".
 */
export function medirVideos(posts: PostMedido[], ahora = new Date()): Array<PostMedido & { normal: number; veces: number }> {
  const porCuenta = new Map<string, PostMedido[]>();
  for (const p of posts) porCuenta.set(p.usuario, [...(porCuenta.get(p.usuario) ?? []), p]);
  const desde = ahora.getTime() - VENTANA_DIAS * 86_400_000;
  const out: Array<PostMedido & { normal: number; veces: number }> = [];
  for (const arr of porCuenta.values()) {
    if (arr.length < MIN_POR_CUENTA) continue;
    const normal = mediana(arr.map((p) => p.interaccion));
    if (normal < MIN_NORMAL) continue;
    for (const p of arr) {
      if (!FORMATOS_VIDEO.includes(p.formato ?? "") || p.fecha.getTime() < desde) continue;
      out.push({ ...p, normal, veces: Math.round((p.interaccion / normal) * 10) / 10 });
    }
  }
  return out;
}

/** El nicho de cada cuenta de la competencia: el del cliente que la tiene cargada (el más repetido). */
async function nichoPorCuenta(db: Db): Promise<Map<string, string>> {
  const filas = await db
    .select({ ig: competitors.igHandle, web: competitors.website, nicho: clients.industry })
    .from(competitors)
    .innerJoin(clients, eq(clients.id, competitors.clientId))
    .where(and(eq(clients.status, "active"), isNotNull(clients.industry)));
  const votos = new Map<string, Map<string, number>>();
  for (const f of filas) {
    const u = usuarioDeCompetidor(f);
    if (!u || !f.nicho) continue;
    const m = votos.get(u) ?? new Map<string, number>();
    m.set(norm(f.nicho), (m.get(norm(f.nicho)) ?? 0) + 1);
    votos.set(u, m);
  }
  return new Map([...votos].map(([u, m]) => [u, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
}

/** Todos los videos medidos de la ventana, con su nicho. Los cargados a mano suman su cuenta al nicho que dijeron. */
async function videosMedidos(db: Db): Promise<{ medidos: Array<PostMedido & { normal: number; veces: number; nicho: string | null }>; manuales: Array<typeof videoVirales.$inferSelect> }> {
  const ahora = Date.now();
  const posts = await db.select().from(competenciaPosts).where(and(
    gte(competenciaPosts.publicadoAt, new Date(ahora - VENTANA_DIAS * 2 * 86_400_000)),
    lte(competenciaPosts.publicadoAt, new Date(ahora - MADURA_DIAS * 86_400_000)),
    isNotNull(competenciaPosts.meGusta),
  ));
  const nichoDe = await nichoPorCuenta(db);
  const manuales = await db.select().from(videoVirales);
  for (const m of manuales) if (!nichoDe.has(m.cuenta)) nichoDe.set(m.cuenta, norm(m.nicho));
  const medidos = medirVideos(posts.map((p) => ({
    id: p.id, usuario: p.usuario, formato: p.formato, interaccion: (p.meGusta ?? 0) + (p.comentarios ?? 0) * 3,
    fecha: p.publicadoAt, permalink: p.permalink, texto: p.texto ?? "", tipo: p.tipoVideo,
  }))).map((p) => ({ ...p, nicho: nichoDe.get(p.usuario) ?? null }));
  return { medidos, manuales };
}

const aViral = (p: PostMedido & { normal: number; veces: number; nicho: string | null }, m?: typeof videoVirales.$inferSelect): Viral => ({
  id: p.id, url: p.permalink, cuenta: p.usuario, nicho: m ? norm(m.nicho) : (p.nicho ?? ""), tipo: m?.tipo ?? p.tipo ?? OTRO,
  fecha: p.fecha.toISOString().slice(0, 10), interaccion: p.interaccion, normal: p.normal, veces: p.veces,
  texto: p.texto.slice(0, 500), fuente: m ? (m.fuente === "agente" ? "agente" : "equipo") : "sistema",
  gancho: m?.gancho ?? null, forma: m?.forma ?? null, respuestas: m?.respuestas ?? null, notas: m?.notas ?? null,
});

/**
 * Los virales y los que no lo fueron de un nicho y tipo. Los cargados a mano
 * aparecen siempre; si su cuenta no se pudo medir van con veces = null
 * ("sin medir") y no cuentan como evidencia.
 */
export async function viralesDe(db: Db, f: { nicho?: string | null; tipo?: string | null; limite?: number }): Promise<{ virales: Viral[]; noVirales: Viral[] }> {
  const { medidos, manuales } = await videosMedidos(db);
  const nicho = norm(f.nicho), tipo = norm(f.tipo);
  const porPost = new Map(manuales.filter((m) => m.postId).map((m) => [m.postId!, m]));
  const todos: Viral[] = medidos.map((p) => aViral(p, porPost.get(p.id)));
  const medidosIds = new Set(medidos.map((p) => p.id));
  for (const m of manuales) {
    if (m.postId && medidosIds.has(m.postId)) continue;
    todos.push({
      id: m.id, url: m.url, cuenta: m.cuenta, nicho: norm(m.nicho), tipo: m.tipo, fecha: m.createdAt.toISOString().slice(0, 10),
      interaccion: null, normal: null, veces: null, texto: "", fuente: m.fuente === "agente" ? "agente" : "equipo",
      gancho: m.gancho, forma: m.forma, respuestas: m.respuestas, notas: m.notas,
    });
  }
  const filtrados = todos.filter((v) => (!nicho || v.nicho === nicho) && (!tipo || v.tipo === tipo));
  const limite = Math.min(Math.max(f.limite ?? 20, 1), 100);
  const virales = filtrados.filter((v) => v.veces == null || v.veces >= VIRAL_DESDE).sort((a, b) => (b.veces ?? 0) - (a.veces ?? 0)).slice(0, limite);
  // Los que NO rindieron, de las mismas cuentas: lo que la plantilla tiene que evitar.
  const cuentas = new Set(virales.map((v) => v.cuenta));
  const noVirales = filtrados.filter((v) => v.veces != null && v.veces <= 1 && cuentas.has(v.cuenta)).sort((a, b) => (a.veces ?? 0) - (b.veces ?? 0)).slice(0, 5);
  return { virales, noVirales };
}

/** Puro: cuánta evidencia medida hay. Los "sin medir" no cuentan. */
export function evidenciaDe(virales: Viral[]): { virales: number; cuentas: number; ids: string[] } {
  const medidos = virales.filter((v) => v.veces != null && v.veces >= VIRAL_DESDE);
  return { virales: medidos.length, cuentas: new Set(medidos.map((v) => v.cuenta)).size, ids: medidos.map((v) => v.id) };
}

// ── Alcance: general, rubro o cliente ─────────────────────────────────────────

export const TODOS = "todos";
export const PREFIJO_CLIENTE = "cliente:";

export type Alcance = {
  clave: string;
  nivel: "todos" | "nicho" | "cliente";
  /** El rubro: el del nivel nicho, o el del cliente. null en general. */
  nicho: string | null;
  cliente: { id: string; slug: string; nombre: string } | null;
  /** De lo más específico a lo general: dónde se busca la plantilla. */
  cadena: string[];
  nombre: string;
};

/** Puro: el nombre que se lee en el panel y en la guía. */
export function nombreAlcance(clave: string, cliente?: string | null): string {
  if (clave === TODOS) return "general";
  if (clave.startsWith(PREFIJO_CLIENTE)) return cliente ?? clave.slice(PREFIJO_CLIENTE.length);
  return clave;
}

/** Puro: la parte del nombre de archivo del perfil (sin «:», que Windows no acepta). */
export function baseArchivo(clave: string): string {
  if (clave === TODOS) return "general";
  return clave.startsWith(PREFIJO_CLIENTE) ? clave.slice(PREFIJO_CLIENTE.length) : clave;
}

/**
 * «todos»/«general» → general. «cliente:<slug>», o el nombre, slug o id de un
 * cliente activo → ese cliente. Cualquier otra cosa → un rubro.
 */
export async function alcanceDe(db: Db, x: string | null | undefined): Promise<Alcance> {
  const q = (x ?? "").trim().toLowerCase();
  if (!q || q === TODOS || q === "general") return { clave: TODOS, nivel: "todos", nicho: null, cliente: null, cadena: [TODOS], nombre: "general" };
  const conPrefijo = q.startsWith(PREFIJO_CLIENTE);
  const buscado = conPrefijo ? q.slice(PREFIJO_CLIENTE.length) : q;
  const [c] = await db.select({ id: clients.id, slug: clients.slug, name: clients.name, industry: clients.industry }).from(clients)
    .where(and(eq(clients.status, "active"), conPrefijo
      ? eq(clients.slug, buscado)
      : or(sql`lower(${clients.name}) = ${buscado}`, eq(clients.slug, buscado), ...(/^[0-9a-f-]{36}$/i.test(buscado) ? [eq(clients.id, buscado)] : [])))).limit(1);
  if (c?.slug) {
    const clave = `${PREFIJO_CLIENTE}${c.slug}`;
    const nicho = c.industry ? norm(c.industry) : null;
    return { clave, nivel: "cliente", nicho, cliente: { id: c.id, slug: c.slug, nombre: c.name }, cadena: [clave, ...(nicho ? [nicho] : []), TODOS], nombre: c.name };
  }
  if (conPrefijo) throw new Error(`No hay un cliente activo con el slug «${buscado}».`);
  return { clave: q, nivel: "nicho", nicho: q, cliente: null, cadena: [q, TODOS], nombre: q };
}

// ── Tipo de video de cada publicación ─────────────────────────────────────────

export async function tiposActivos(db: Db) {
  return db.select().from(videoTipos).where(eq(videoTipos.activo, true)).orderBy(asc(videoTipos.orden));
}

type FilaTipo = typeof videoTipos.$inferSelect;

/** Puro: los tipos que se ven en un alcance: los generales y los de su rubro o cliente. */
export function tiposPara<T extends Pick<FilaTipo, "alcance">>(tipos: T[], a: Pick<Alcance, "cadena">): T[] {
  return tipos.filter((t) => a.cadena.includes(t.alcance));
}

/** Puro: «Promo flash» → «promo-flash». */
export function slugDe(nombre: string): string {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Una persona suma un tipo de video para todos, para un rubro o para un cliente. */
export async function crearTipo(db: Db, p: { nombre: string; descripcion?: string; alcance: string; autor: string }): Promise<{ ok: true; slug: string } | { ok: false; mensaje: string }> {
  const nombre = p.nombre.trim().slice(0, 60);
  const slug = slugDe(nombre);
  if (!slug) return { ok: false, mensaje: "Falta el nombre del tipo de video." };
  if (slug === OTRO || slug === SIN_TEXTO) return { ok: false, mensaje: "Ese nombre está reservado." };
  const a = await alcanceDe(db, p.alcance);
  if (a.nivel === "nicho") {
    const nichos = new Set((await db.selectDistinct({ i: clients.industry }).from(clients).where(and(eq(clients.status, "active"), isNotNull(clients.industry)))).map((r) => norm(r.i)));
    if (!nichos.has(a.clave)) return { ok: false, mensaje: `Rubro desconocido: ${a.clave}.` };
  }
  const [ya] = await db.select({ slug: videoTipos.slug, activo: videoTipos.activo }).from(videoTipos).where(eq(videoTipos.slug, slug)).limit(1);
  if (ya?.activo) return { ok: false, mensaje: `Ya hay un tipo de video «${slug}».` };
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${videoTipos.orden}), 100)::int` }).from(videoTipos);
  const fila = { nombre, descripcion: (p.descripcion ?? "").trim().slice(0, 300), alcance: a.clave, creadoPor: p.autor.slice(0, 120), activo: true };
  if (ya) await db.update(videoTipos).set(fila).where(eq(videoTipos.slug, slug)); // estaba oculto: vuelve
  else await db.insert(videoTipos).values({ slug, orden: max + 10, ...fila });
  return { ok: true, slug };
}

/** Solo los que creó una persona: los de fábrica no se ocultan. */
export async function ocultarTipo(db: Db, slug: string): Promise<boolean> {
  const r = await db.update(videoTipos).set({ activo: false })
    .where(and(eq(videoTipos.slug, norm(slug)), isNotNull(videoTipos.creadoPor))).returning({ slug: videoTipos.slug });
  return r.length > 0;
}

/** Puro: valida la respuesta del modelo contra los tipos del catálogo. */
export function leerTipos(texto: string, indices: number[], slugs: Set<string>): Map<number, string> {
  const out = new Map<number, string>();
  const a = texto.indexOf("["), b = texto.lastIndexOf("]");
  if (a < 0 || b <= a) return out;
  let arr: unknown;
  try { arr = JSON.parse(texto.slice(a, b + 1)); } catch { return out; }
  if (!Array.isArray(arr)) return out;
  const validos = new Set(indices);
  for (const it of arr) {
    const o = it as { i?: unknown; tipo?: unknown };
    const i = Number(o?.i);
    const t = norm(String(o?.tipo ?? ""));
    if (validos.has(i) && (slugs.has(t) || t === OTRO)) out.set(i, t);
  }
  return out;
}

let clasificando = false;

/** Le pone el tipo a los videos de la competencia que no lo tienen (los más nuevos primero). */
export async function clasificarTiposDeVideo(db: Db, max = 200): Promise<{ clasificados: number; sinTexto: number; fallas: number }> {
  if (clasificando) return { clasificados: 0, sinTexto: 0, fallas: 0 };
  clasificando = true;
  try {
    // Los tipos de un cliente son suyos: no sirven para clasificar a la competencia.
    const tipos = (await tiposActivos(db)).filter((t) => !t.alcance.startsWith(PREFIJO_CLIENTE));
    const pendientes = await db
      .select({ id: competenciaPosts.id, texto: competenciaPosts.texto })
      .from(competenciaPosts)
      .where(and(isNull(competenciaPosts.tipoVideo), inArray(competenciaPosts.formato, FORMATOS_VIDEO), gte(competenciaPosts.publicadoAt, new Date(Date.now() - VENTANA_DIAS * 2 * 86_400_000))))
      .orderBy(desc(competenciaPosts.publicadoAt))
      .limit(max);
    const vacias = pendientes.filter((p) => (p.texto ?? "").trim().length < 15);
    if (vacias.length) await db.update(competenciaPosts).set({ tipoVideo: SIN_TEXTO, tipoVideoAt: new Date() }).where(inArray(competenciaPosts.id, vacias.map((v) => v.id)));
    const conTexto = pendientes.filter((p) => (p.texto ?? "").trim().length >= 15);
    const sistema = [
      "Clasificás videos de redes de pymes argentinas según su TIPO DE VIDEO: cómo está hecho, no el tema. Solo tenés el texto de la publicación.",
      "Tipos posibles (id: cómo se reconoce):",
      ...tipos.map((t) => `- ${t.slug}${t.alcance === TODOS ? "" : ` (solo rubro ${t.alcance})`}: ${t.descripcion}`),
      `- ${OTRO}: el texto no alcanza para saberlo, o no es ninguno de los anteriores. Ante la duda, ${OTRO}: no adivines.`,
      'Respondé SOLO con un array JSON, sin texto alrededor: [{"i":<número>,"tipo":"<id>"}]. Un elemento por video, con el mismo "i".',
    ].join("\n");
    const slugs = new Set(tipos.map((t) => t.slug));
    let clasificados = 0, fallas = 0;
    for (let k = 0; k < conTexto.length; k += 20) {
      const lote = conTexto.slice(k, k + 20);
      const usuario = lote.map((p, i) => `[${i}] ${Array.from((p.texto ?? "").replace(/\s+/g, " ")).slice(0, 400).join("")}`).join("\n");
      let r = await analizarTexto(sistema, usuario, { maxTokens: 12_000, temperature: 0, modelo: MODELO_TEXTO });
      if (!r.texto) r = await analizarTexto(sistema, usuario, { maxTokens: 4096, temperature: 0, modelo: MODELO_TEXTO_RESPALDO });
      const mapa = r.texto ? leerTipos(r.texto, lote.map((_, i) => i), slugs) : new Map<number, string>();
      if (mapa.size === 0) { fallas += 1; if (fallas >= 3) break; continue; }
      for (const [i, tipo] of mapa) {
        await db.update(competenciaPosts).set({ tipoVideo: tipo, tipoVideoAt: new Date() }).where(eq(competenciaPosts.id, lote[i].id));
        clasificados += 1;
      }
    }
    return { clasificados, sinTexto: vacias.length, fallas };
  } finally {
    clasificando = false;
  }
}

// ── Cargar un viral a mano ────────────────────────────────────────────────────

export async function guardarViral(db: Db, p: {
  url: string; cuenta?: string; nicho: string; tipo: string; fuente: "equipo" | "agente"; autor: string;
  gancho?: string; notas?: string; forma?: FormaDeVideo; respuestas?: Record<string, boolean>;
}): Promise<{ ok: true; id: string; medido: boolean; mensaje: string } | { ok: false; mensaje: string }> {
  const url = p.url.trim().split(/[?#]/)[0];
  if (!/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com)\//i.test(url)) return { ok: false, mensaje: "El link tiene que ser de Instagram, TikTok, YouTube o Facebook." };
  const tipos = new Set((await tiposActivos(db)).map((t) => t.slug));
  const tipo = norm(p.tipo);
  if (!tipos.has(tipo)) return { ok: false, mensaje: `Tipo de video desconocido. Opciones: ${[...tipos].join(", ")}.` };
  const nichos = new Set((await db.selectDistinct({ i: clients.industry }).from(clients).where(and(eq(clients.status, "active"), isNotNull(clients.industry)))).map((r) => norm(r.i)));
  const nicho = norm(p.nicho);
  if (!nichos.has(nicho)) return { ok: false, mensaje: `Nicho desconocido. Opciones: ${[...nichos].join(", ")}.` };

  // La cuenta se verifica antes de guardar: el 11/10 había 79 cuentas inventadas por agentes.
  const esInstagram = /instagram\.com/i.test(url);
  const cuenta = usuarioDeInstagram(p.cuenta) ?? (esInstagram ? null : norm(p.cuenta) || null);
  if (!cuenta) return { ok: false, mensaje: "Falta la cuenta que publicó el video (el usuario, sin @)." };
  let postId: string | null = null;
  if (esInstagram) {
    const existe = await existeEnInstagram(db, cuenta);
    if (existe === false) return { ok: false, mensaje: `Instagram no encuentra la cuenta de empresa @${cuenta}. Revisá el usuario; si es una cuenta personal no se puede medir y no se guarda.` };
    const codigo = codigoDeLink(url);
    if (codigo) {
      const [post] = await db.select({ id: competenciaPosts.id }).from(competenciaPosts)
        .where(and(eq(competenciaPosts.usuario, cuenta), sql`${competenciaPosts.permalink} LIKE ${`%/${codigo}%`}`)).limit(1);
      postId = post?.id ?? null;
    }
  }
  const [fila] = await db.insert(videoVirales).values({
    url, cuenta, nicho, tipo, fuente: p.fuente, autor: p.autor.slice(0, 120), postId,
    gancho: p.gancho?.slice(0, 400) ?? null, notas: p.notas?.slice(0, 1000) ?? null, forma: p.forma ?? null, respuestas: p.respuestas ?? null,
  }).onConflictDoUpdate({
    target: videoVirales.url,
    set: { nicho, tipo, ...(postId ? { postId } : {}), ...(p.gancho ? { gancho: p.gancho.slice(0, 400) } : {}), ...(p.notas ? { notas: p.notas.slice(0, 1000) } : {}), ...(p.forma ? { forma: p.forma } : {}), ...(p.respuestas ? { respuestas: p.respuestas } : {}) },
  }).returning({ id: videoVirales.id });
  if (postId) await db.update(competenciaPosts).set({ tipoVideo: tipo, tipoVideoAt: new Date() }).where(eq(competenciaPosts.id, postId));
  return {
    ok: true, id: fila.id, medido: !!postId,
    mensaje: postId
      ? "Guardado y enlazado con la publicación medida de esa cuenta."
      : "Guardado como «sin medir»: todavía no tenemos las publicaciones de esa cuenta para compararlo contra lo normal. No cuenta como evidencia hasta que se mida (cargala como competidor del cliente para que se lea sola).",
  };
}

// ── Plantillas ────────────────────────────────────────────────────────────────

const ESTILOS = new Set(["reel", "caja", "simple"]);
const num = (x: unknown, min: number, max: number): number | undefined => {
  const n = Number(x);
  return Number.isFinite(n) && x != null && x !== "" ? Math.min(max, Math.max(min, n)) : undefined;
};
const txt = (x: unknown, largo: number): string | undefined => (typeof x === "string" && x.trim() ? x.trim().slice(0, largo) : undefined);
const rango = (x: unknown): [number, number] | undefined => {
  if (!Array.isArray(x) || x.length !== 2) return undefined;
  const a = num(x[0], 3, 600), b = num(x[1], 3, 600);
  return a != null && b != null && a <= b ? [a, b] : undefined;
};

/** Puro: el perfil con el formato exacto de los perfiles del kit de video de las PC (vtool --perfil). */
export function limpiarPerfil(x: unknown, nicho: string, tipo: string, descripcion: string, duracion?: [number, number]): PerfilVtool {
  const r = ((x as { reel?: Record<string, unknown> } | null)?.reel ?? {}) as Record<string, unknown>;
  const estilo = txt(r.estilo, 20);
  const reel: PerfilVtool["reel"] = {};
  const pausa = num(r.pausa, 0.35, 2); if (pausa != null) reel.pausa = pausa; // menos de 0,35 s se ve como salto
  if (estilo && ESTILOS.has(estilo)) reel.estilo = estilo;
  const zoom = num(r.zoom, 0, 1.3); if (zoom != null) reel.zoom = zoom === 0 || zoom >= 1 ? zoom : 0;
  if (typeof r.sfx === "boolean") reel.sfx = r.sfx;
  const vm = num(r.vol_musica, -40, -6); if (vm != null) reel.vol_musica = vm;
  const vs = num(r.vol_sfx, -40, -6); if (vs != null) reel.vol_sfx = vs;
  const dur = rango((x as { duracion?: unknown } | null)?.duracion) ?? duracion;
  return { nombre: `${nicho}__${tipo}`, descripcion: descripcion.slice(0, 200), reel, ...(dur ? { duracion: dur } : {}) };
}

/** Puro: limpia lo que mandó un agente o el panel. Las reglas se resuelven aparte (mezclarReglas). */
export function limpiarContenido(x: unknown, nicho: string, tipo: string): ContenidoPlantilla {
  const c = (x ?? {}) as Record<string, unknown>;
  const e = (c.edicion ?? {}) as Record<string, unknown>;
  const duracion = rango(c.duracion);
  const objetivo = txt(c.objetivo, 400);
  const edicion = Object.fromEntries((["cortes", "subtitulos", "zoom", "sfx", "musica", "look", "planos"] as const)
    .map((k) => [k, txt(e[k], 400)]).filter(([, v]) => v)) as ContenidoPlantilla["edicion"];
  return {
    ...(objetivo ? { objetivo } : {}),
    ...(duracion ? { duracion } : {}),
    estructura: (Array.isArray(c.estructura) ? c.estructura : []).slice(0, 8).map((t) => {
      const o = t as Record<string, unknown>;
      return { tramo: txt(o.tramo, 60) ?? "", desde: num(o.desde, 0, 600) ?? 0, hasta: num(o.hasta, 0, 600) ?? 0, que: txt(o.que, 300) ?? "" };
    }).filter((t) => t.tramo && t.que),
    ganchos: (Array.isArray(c.ganchos) ? c.ganchos : []).slice(0, 8).map((g) => {
      const o = (typeof g === "string" ? { formula: g } : g) as Record<string, unknown>;
      return { formula: txt(o.formula, 300) ?? "", ...(txt(o.viral, 80) ? { viral: txt(o.viral, 80) } : {}) };
    }).filter((g) => g.formula),
    edicion,
    ...(txt(c.promptIa, 4000) ? { promptIa: txt(c.promptIa, 4000) } : {}),
    noHacer: (Array.isArray(c.noHacer) ? c.noHacer : []).map((s) => txt(s, 300)).filter((s): s is string => !!s).slice(0, 12),
    perfil: limpiarPerfil(c.perfil, nicho, tipo, objetivo ?? `${tipo} para ${nicho}`, duracion),
  };
}

/**
 * Puro: las reglas de la versión nueva. Lo que cargó una persona queda SIEMPRE
 * (un agente no la puede sacar ni cambiar); las del agente se reemplazan por
 * las que manda ahora.
 */
export function mezclarReglas(anteriores: ReglaDeVideo[] | undefined, delAgente: unknown): ReglaDeVideo[] {
  const dePersonas = (anteriores ?? []).filter((r) => r.origen === "persona");
  const nuevas: ReglaDeVideo[] = (Array.isArray(delAgente) ? delAgente : []).map((r) => {
    const o = (typeof r === "string" ? { texto: r } : r) as Record<string, unknown>;
    return { id: randomUUID(), texto: txt(o.texto, 400) ?? "", origen: "agente" as const, ...(txt(o.viral, 80) ? { viral: txt(o.viral, 80) } : {}) };
  }).filter((r) => r.texto && !dePersonas.some((p) => norm(p.texto) === norm(r.texto))).slice(0, 20);
  return [...dePersonas, ...nuevas];
}

/** Puro: la guía en Markdown, con las mismas secciones que las guías de los perfiles del kit. */
export function guiaDe(nicho: string, tipo: string, c: ContenidoPlantilla, virales: Viral[] = []): string {
  const l: string[] = [`# ${tipo} · ${nicho}`, ""];
  if (c.objetivo) l.push(c.objetivo, "");
  if (c.duracion) l.push(`**Duración:** ${c.duracion[0]} a ${c.duracion[1]} s.`, "");
  const reglas = c.reglas ?? [];
  if (reglas.length) l.push("## Reglas", ...reglas.map((r) => `- ${r.texto}${r.origen === "persona" ? " _(del equipo: no se negocia)_" : ""}${(r as ReglaConAlcance).desde ? ` _(${(r as ReglaConAlcance).desde})_` : ""}`), "");
  if (c.estructura?.length) l.push("## Estructura", ...c.estructura.map((t) => `- **${t.tramo}** (${t.desde}–${t.hasta} s): ${t.que}`), "");
  if (c.ganchos?.length) l.push("## Gancho", ...c.ganchos.map((g) => `- ${g.formula}`), "");
  const e = c.edicion ?? {};
  const filas = ([["Cortes", e.cortes], ["Subtítulos", e.subtitulos], ["Zoom", e.zoom], ["Efectos de sonido", e.sfx], ["Música", e.musica], ["Look", e.look], ["Planos obligatorios", e.planos]] as const).filter(([, v]) => v);
  if (filas.length) l.push("## Edición", ...filas.map(([k, v]) => `- **${k}:** ${v}`), "");
  if (c.promptIa) l.push("## Prompt de IA", "Estructura obligatoria: anclas → descripción exacta → SHOT con un solo protagonista → fondo, luz y cámara fijos → LOOK → RULES.", "", "```", c.promptIa, "```", "");
  if (c.noHacer?.length) l.push("## Qué NO hacer", ...c.noHacer.map((s) => `- ${s}`), "");
  const ej = virales.filter((v) => v.url).slice(0, 3);
  if (ej.length) l.push("## Ejemplos que rindieron", ...ej.map((v) => `- @${v.cuenta}${v.veces ? `, ${v.veces} veces lo normal de su cuenta` : ""}: ${v.url}`), "");
  return l.join("\n").trim() + "\n";
}

type FilaPlantilla = typeof videoPlantillas.$inferSelect;

/** Puro: la vigente es la última aprobada; si ninguna lo está, la última versión. */
export function vigenteDe(versiones: FilaPlantilla[]): FilaPlantilla | null {
  const orden = [...versiones].sort((a, b) => b.version - a.version);
  return orden.find((v) => v.estado === "aprobada") ?? orden[0] ?? null;
}

/** Puro: el estado que se muestra. Una aprobada hace más de VENCE_DIAS es "vieja": hay que revisarla. */
export function estadoVisible(p: FilaPlantilla | null, ahora = new Date()): "sin-plantilla" | "borrador" | "lista" | "aprobada" | "vieja" {
  if (!p) return "sin-plantilla";
  if (p.estado === "aprobada" && p.aprobadaAt && ahora.getTime() - p.aprobadaAt.getTime() > VENCE_DIAS * 86_400_000) return "vieja";
  return p.estado === "aprobada" || p.estado === "lista" ? p.estado : "borrador";
}

async function versionesDe(db: Db, clave: string, tipo: string): Promise<FilaPlantilla[]> {
  return db.select().from(videoPlantillas).where(and(eq(videoPlantillas.nicho, clave), eq(videoPlantillas.tipo, norm(tipo)))).orderBy(desc(videoPlantillas.version));
}

/** Puro: ¿la plantilla dice cómo editar, o solo trae reglas? */
export function tieneCuerpo(c: ContenidoPlantilla | null | undefined): boolean {
  if (!c) return false;
  return !!(c.objetivo || c.estructura?.length || c.ganchos?.length || Object.keys(c.edicion ?? {}).length || c.promptIa || c.noHacer?.length);
}

/** Una regla con el nivel del que viene, cuando se hereda. */
export type ReglaConAlcance = ReglaDeVideo & { alcance?: string; desde?: string };

/** Si `nicho` es el nombre o el slug de un cliente, devuelve su rubro. */
export async function resolverNicho(db: Db, nichoOCliente: string): Promise<string> {
  const a = await alcanceDe(db, nichoOCliente);
  return a.nivel === "cliente" ? (a.nicho ?? TODOS) : a.clave;
}

/**
 * Puro: con las versiones de cada nivel (de lo específico a lo general), la
 * plantilla que vale y todas las reglas sumadas. Las del nivel más específico
 * van primero; un texto repetido en un nivel más general no se repite.
 */
export function resolverCadena(niveles: Array<{ clave: string; nombre: string; versiones: FilaPlantilla[] }>) {
  const vigentes = niveles.map((n) => ({ ...n, vigente: vigenteDe(n.versiones) }));
  // Un nivel que solo tiene reglas (ej. el cliente sumó una) no tapa la plantilla de arriba: suma sus reglas.
  const efectiva = vigentes.find((n) => n.vigente && tieneCuerpo(n.vigente.contenido)) ?? vigentes.find((n) => n.vigente) ?? null;
  const vistas = new Set<string>();
  const reglas: ReglaConAlcance[] = [];
  for (const [i, n] of vigentes.entries()) {
    for (const r of n.vigente?.contenido.reglas ?? []) {
      if (vistas.has(norm(r.texto))) continue;
      vistas.add(norm(r.texto));
      reglas.push({ ...r, alcance: n.clave, ...(i > 0 ? { desde: n.nombre === "general" ? "general" : `de ${n.nombre}` } : {}) });
    }
  }
  return { propia: vigentes[0]?.vigente ?? null, efectiva, heredada: vigentes.slice(1).find((n) => n.vigente) ?? null, reglas };
}

export async function plantillaDe(db: Db, nichoOCliente: string, tipo: string) {
  const a = await alcanceDe(db, nichoOCliente);
  const t = norm(tipo);
  const filas = await db.select().from(videoPlantillas)
    .where(and(inArray(videoPlantillas.nicho, a.cadena), eq(videoPlantillas.tipo, t))).orderBy(desc(videoPlantillas.version));
  const niveles = a.cadena.map((clave) => ({ clave, nombre: clave === a.clave ? a.nombre : nombreAlcance(clave), versiones: filas.filter((f) => f.nicho === clave) }));
  const { propia, efectiva, heredada, reglas } = resolverCadena(niveles);
  const p = efectiva?.vigente ?? null;
  const { virales, noVirales } = await viralesDe(db, { nicho: a.nicho, tipo: t, limite: 30 });
  // El perfil se llama como lo pidieron (reno__promo aunque salga del rubro): es el que se guarda en la PC.
  const contenido: ContenidoPlantilla | null = p ? {
    ...p.contenido, reglas,
    ...(p.contenido.perfil ? { perfil: { ...p.contenido.perfil, nombre: `${baseArchivo(a.clave)}__${t}` } } : {}),
  } : null;
  return {
    alcance: a.clave, nivel: a.nivel, nombreAlcance: a.nombre, cadena: a.cadena,
    nicho: a.nicho ?? TODOS, cliente: a.cliente?.nombre ?? null, tipo: t,
    /** De qué nivel sale la plantilla que vale (null = no hay en ninguno). */
    desde: efectiva?.clave ?? null,
    estado: estadoVisible(p), version: p?.version ?? 0,
    contenido, evidencia: evidenciaDe(virales),
    autor: p?.autor ?? null, motivo: p?.motivo ?? null, aprobadaPor: p?.aprobadaPor ?? null, aprobadaAt: p?.aprobadaAt ?? null, actualizada: p?.createdAt ?? null,
    guia: contenido ? guiaDe(a.nombre, t, contenido, virales) : null,
    archivo: `${baseArchivo(a.clave)}__${t}`,
    virales, noVirales,
    /** La del nivel pedido, para editarla en el panel. */
    propia: propia ? {
      estado: estadoVisible(propia), version: propia.version, contenido: propia.contenido,
      autor: propia.autor, motivo: propia.motivo, aprobadaPor: propia.aprobadaPor, actualizada: propia.createdAt,
    } : null,
    /** La del nivel de arriba más cercano (rubro o general), de la que se parte. */
    heredada: heredada ? { alcance: heredada.clave, nombre: heredada.nombre, estado: estadoVisible(heredada.vigente), version: heredada.vigente!.version, contenido: heredada.vigente!.contenido } : null,
    reglasHeredadas: reglas.filter((r) => r.alcance !== a.clave),
    versiones: niveles[0].versiones.map((v) => ({ version: v.version, estado: v.estado, autor: v.autor, motivo: v.motivo, fecha: v.createdAt })),
  };
}

/**
 * Guarda una versión nueva en el alcance pedido (general, rubro o cliente). Un
 * agente siempre deja borrador (o «lista» si hay evidencia) y nunca pisa las
 * reglas de las personas. Una persona que edita una plantilla aprobada la deja
 * aprobada: es quien aprueba.
 */
export async function guardarPlantilla(db: Db, p: {
  /** El alcance: «todos», un rubro, «cliente:<slug>» o el nombre de un cliente. */
  nicho: string; tipo: string; contenido: unknown; autor: string; esPersona: boolean; motivo?: string;
  /** Solo personas: las reglas PROPIAS de este nivel tal como quedan (pueden editar y borrar cualquiera). */
  reglas?: ReglaDeVideo[];
}): Promise<{ ok: true; version: number; estado: string; evidencia: { virales: number; cuentas: number } } | { ok: false; mensaje: string }> {
  const a = await alcanceDe(db, p.nicho), tipo = norm(p.tipo);
  if (!tiposPara(await tiposActivos(db), a).some((t) => t.slug === tipo)) return { ok: false, mensaje: `Tipo de video desconocido para ${a.nombre}: ${tipo}.` };
  const versiones = await versionesDe(db, a.clave, tipo);
  const anterior = versiones[0] ?? null;
  const contenido = limpiarContenido(p.contenido, baseArchivo(a.clave), tipo);
  contenido.reglas = p.esPersona && p.reglas
    ? p.reglas.map((r) => ({ id: r.id || randomUUID(), texto: (r.texto ?? "").trim().slice(0, 400), origen: r.origen === "agente" ? "agente" as const : "persona" as const, ...(r.autor ? { autor: r.autor } : {}), ...(r.viral ? { viral: r.viral } : {}) })).filter((r) => r.texto)
    : mezclarReglas(anterior?.contenido.reglas, (p.contenido as { reglas?: unknown } | null)?.reglas);
  const evidencia = evidenciaDe((await viralesDe(db, { nicho: a.nicho, tipo, limite: 100 })).virales);
  const alcanza = evidencia.virales >= MIN_VIRALES && evidencia.cuentas >= MIN_CUENTAS;
  const vigente = vigenteDe(versiones);
  const sigueAprobada = p.esPersona && vigente?.estado === "aprobada";
  const estado = sigueAprobada ? "aprobada" : alcanza ? "lista" : "borrador";
  const version = (anterior?.version ?? 0) + 1;
  await db.insert(videoPlantillas).values({
    nicho: a.clave, tipo, version, estado, contenido, evidencia, autor: p.autor.slice(0, 120), motivo: p.motivo?.slice(0, 400) ?? null,
    ...(sigueAprobada ? { aprobadaPor: p.autor.slice(0, 120), aprobadaAt: new Date() } : {}),
  });
  return { ok: true, version, estado, evidencia };
}

/** Solo una persona. Aprueba la última versión del alcance pedido. */
export async function aprobarPlantilla(db: Db, nicho: string, tipo: string, quien: string): Promise<boolean> {
  const a = await alcanceDe(db, nicho);
  const [ultima] = await versionesDe(db, a.clave, tipo);
  if (!ultima) return false;
  await db.update(videoPlantillas).set({ estado: "aprobada", aprobadaPor: quien.slice(0, 120), aprobadaAt: new Date() }).where(eq(videoPlantillas.id, ultima.id));
  return true;
}

/**
 * La grilla alcance × tipo para el panel y para lmtmTiposDeVideo. Sin filtro:
 * general y los rubros (los clientes se piden de a uno, con `alcance`).
 */
export async function grilla(db: Db, soloAlcance?: string | null) {
  const tipos = await tiposActivos(db);
  const activos = await db.select({ slug: clients.slug, nombre: clients.name, nicho: clients.industry }).from(clients).where(eq(clients.status, "active"));
  const conteo = new Map<string, number>();
  for (const c of activos) if (c.nicho && norm(c.nicho) !== "interno-test") conteo.set(norm(c.nicho), (conteo.get(norm(c.nicho)) ?? 0) + 1);
  const nichos = [...conteo.entries()].map(([nicho, clientes]) => ({ nicho, clientes })).sort((a, b) => b.clientes - a.clientes);
  const clientes = activos.filter((c) => c.slug && norm(c.nicho) !== "interno-test")
    .map((c) => ({ clave: `${PREFIJO_CLIENTE}${c.slug}`, nombre: c.nombre, nicho: c.nicho ? norm(c.nicho) : null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const pedidos: Alcance[] = soloAlcance
    ? [await alcanceDe(db, soloAlcance)]
    : [{ clave: TODOS, nivel: "todos", nicho: null, cliente: null, cadena: [TODOS], nombre: "general" }, ...nichos.map((n): Alcance => ({ clave: n.nicho, nivel: "nicho", nicho: n.nicho, cliente: null, cadena: [n.nicho, TODOS], nombre: n.nicho }))];
  const plantillas = await db.select().from(videoPlantillas);
  const todos = await todosLosVirales(db);
  const celdas = pedidos.flatMap((a) => tiposPara(tipos, a).map((t) => {
    const deTipo = plantillas.filter((x) => x.tipo === t.slug);
    const { propia, efectiva } = resolverCadena(a.cadena.map((clave) => ({ clave, nombre: nombreAlcance(clave), versiones: deTipo.filter((x) => x.nicho === clave) })));
    const ev = evidenciaDe(todos.filter((v) => (!a.nicho || v.nicho === a.nicho) && v.tipo === t.slug));
    return {
      alcance: a.clave, nicho: a.clave, tipo: t.slug, estado: estadoVisible(propia), version: propia?.version ?? 0,
      /** Sin plantilla propia: la que se usa, heredada de arriba. */
      ...(!propia && efectiva ? { hereda: { desde: efectiva.clave, estado: estadoVisible(efectiva.vigente) } } : {}),
      virales: ev.virales, cuentas: ev.cuentas, actualizada: propia?.createdAt ?? null,
    };
  }));
  const cuentasMedidas = new Map<string, Set<string>>();
  for (const v of todos) if (v.veces != null) cuentasMedidas.set(v.nicho, (cuentasMedidas.get(v.nicho) ?? new Set()).add(v.cuenta));
  return {
    tipos: tipos.map((t) => ({ slug: t.slug, nombre: t.nombre, descripcion: t.descripcion, alcance: t.alcance, propio: !!t.creadoPor })),
    nichos: nichos.map((n) => ({ ...n, cuentasMedidas: cuentasMedidas.get(n.nicho)?.size ?? 0, sinTipo: todos.filter((v) => v.nicho === n.nicho && v.tipo === OTRO && (v.veces ?? 0) >= VIRAL_DESDE).length })),
    clientes,
    celdas,
    reglas: { viralDesde: VIRAL_DESDE, ventanaDias: VENTANA_DIAS, minVirales: MIN_VIRALES, minCuentas: MIN_CUENTAS },
  };
}

/** Todos los videos medidos y los manuales, sin filtrar ni cortar: para contar la grilla en una sola lectura. */
async function todosLosVirales(db: Db): Promise<Viral[]> {
  const { medidos, manuales } = await videosMedidos(db);
  const porPost = new Map(manuales.filter((m) => m.postId).map((m) => [m.postId!, m]));
  return medidos.map((p) => aViral(p, porPost.get(p.id)));
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada 3 horas le pone el tipo a los videos nuevos de la competencia. */
export function initVideoTipos(db: Db): void {
  if (timer) return;
  const vuelta = () => {
    void clasificarTiposDeVideo(db)
      .then((r) => { if (r.clasificados || r.fallas) console.log(`[video-tipos] ${r.clasificados} videos clasificados, ${r.sinTexto} sin texto, ${r.fallas} lotes fallidos`); })
      .catch((e) => console.warn("[video-tipos] falló:", e instanceof Error ? e.message : e));
  };
  setTimeout(vuelta, 20 * 60_000);
  timer = setInterval(vuelta, 3 * 3600_000);
}
