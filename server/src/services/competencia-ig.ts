// LMTM-OS: qué le funciona a la competencia, medido (pedido 08/10).
//
// "Que el sistema busque competencia externa para enriquecer nuestro
// contenido, para Nichos y para el plan de acción de cada cliente." Había 485
// competidores cargados con una nota escrita a mano o por un agente ("muy buen
// contenido en reels") y nadie medía qué publicaban. Los rubros sin cuentas
// propias medidas (5 de 6 hoteles, 4 de 5 de materiales) no tenían con qué
// comparar.
//
// Business Discovery de Instagram devuelve las publicaciones públicas de una
// cuenta de empresa o creador con me gusta y comentarios, usando la conexión de
// Meta que ya tenemos. Cada publicación se mide contra lo normal de SU cuenta,
// igual que las propias (contenido-analisis.ts), y con la misma vara: en
// Instagram no hay compartidos, así que es me gusta + comentarios×3 en los dos
// lados. Nunca se mezclan en un mismo ranking: "la competencia" va aparte.
//
// 11/10: Business Discovery leyó 26 de 171 cuentas; las otras 145 volvieron
// "no encontrada" sin decir si son personales o si el usuario no existe. Ahora
// esas pasan por el lector propio (redes-publicas.ts), que lee el perfil
// público y distingue medida / privada / no existe. Las páginas de Facebook
// (92 con link a la página; otros 299 tienen un sitio web en ese campo) se leen por la Graph API si la app tiene
// permiso. En Facebook tampoco se cuentan compartidos: reacciones +
// comentarios×3, siempre contra la misma cuenta.

import type { Db } from "@paperclipai/db";
import { clients, competenciaPosts, competitors } from "@paperclipai/db";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { analizarPublicaciones, citar, linea, nombreFormato, type AnalisisContenido, type PublicacionMedida } from "./contenido-analisis.js";
import { engagementDe } from "./organico-aprendizaje.js";
import {
  Bloqueado, idDePaginaFacebook, paginaFacebook, perfilInstagram, SinPermiso, tokenDeMeta, type PostPublico,
} from "./redes-publicas.js";

const GRAPH = "https://graph.facebook.com/v21.0";
/** Publicaciones por cuenta en cada lectura (las más nuevas). */
const POR_CUENTA = 30;
/** Cuentas por vuelta: Instagram limita las llamadas por hora. */
const POR_VUELTA = 40;
/** Lecturas con el lector propio por vuelta, y la pausa entre una y otra: ritmo de persona, no de robot. */
const PROPIO_POR_VUELTA = 15;
const PAUSA_PROPIO_MS = 20_000;
/** Cada cuánto se vuelve a medir una cuenta. */
const DIAS_ENTRE_LECTURAS = 6;
const FB_POR_VUELTA = 15;
const FB_DIAS_ENTRE_LECTURAS = 10;

/** "@Hotel.Costa", "https://instagram.com/hotel.costa/" → "hotel.costa"; null si no es un usuario. */
export function usuarioDeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

/** Igual que el sync propio (providers/meta.ts), para que el formato se compare. */
export function formatoDeMedia(m: { media_type?: string; media_product_type?: string }): string {
  return m.media_product_type === "REELS" ? "reel" : m.media_type === "VIDEO" ? "video" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "photo";
}

/** Lo que se guarda en competitors.ig_estado cuando Instagram no la devuelve. */
export function estadoDeError(msg: string): string {
  if (/business|creator|professional/i.test(msg)) return "no_es_empresa";
  if (/\(#110\)|invalid user|cannot be found|does not exist|not found/i.test(msg)) return "no_encontrada";
  return msg.slice(0, 200);
}

type FilaPost = typeof competenciaPosts.$inferInsert;

const aFila = (usuario: string, p: PostPublico): FilaPost => ({
  id: p.id, usuario, texto: p.texto, formato: p.formato, meGusta: p.meGusta, comentarios: p.comentarios,
  publicadoAt: p.publicadoAt, permalink: p.permalink, syncedAt: new Date(),
});

async function guardarPosts(db: Db, filas: FilaPost[]): Promise<void> {
  for (const fila of filas) {
    await db.insert(competenciaPosts).values(fila).onConflictDoUpdate({
      target: competenciaPosts.id,
      set: { meGusta: fila.meGusta, comentarios: fila.comentarios, texto: fila.texto, syncedAt: fila.syncedAt },
    });
  }
}

const esLimite = (codigo: number | undefined, msg: string) => [4, 17, 32, 613].includes(codigo ?? -1) || /rate limit|too many calls|request limit/i.test(msg);
/** Permiso o token: es de la conexión, no de la cuenta buscada. No se marca a nadie. */
const esDeLaConexion = (codigo: number | undefined, msg: string) => [10, 190, 200].includes(codigo ?? -1) || /permission|access token|session has expired/i.test(msg);
/**
 * Lo que no es uno de estos se reintenta en la próxima vuelta.
 * no_existe: el lector propio confirmó que el usuario no existe (mal cargado).
 * privada: existe pero es privada, no hay nada público que medir.
 */
const ESTADOS_FINALES = new Set(["ok", "no_encontrada", "no_es_empresa", "no_existe", "privada"]);
/** Business Discovery no la devolvió: va al lector propio. */
const PARA_PROPIO = new Set(["no_encontrada", "no_es_empresa"]);

/** Instagram con el lector propio. Bloqueado se propaga: corta la vuelta. */
async function leerInstagramPropio(db: Db, usuario: string): Promise<{ estado: string; seguidores: number | null; publicaciones: number }> {
  const p = await perfilInstagram(usuario);
  if (!p) return { estado: "no_existe", seguidores: null, publicaciones: 0 };
  if (p.privado) return { estado: "privada", seguidores: p.seguidores, publicaciones: 0 };
  await guardarPosts(db, p.posts.map((x) => aFila(usuario, x)));
  return { estado: "ok", seguidores: p.seguidores, publicaciones: p.posts.length };
}

let corriendo = false;

/**
 * Mide las cuentas de la competencia que hace más tiempo no se leen. Corre por
 * vueltas (POR_VUELTA cuentas) para no pasarse del límite de Instagram.
 */
export async function medirCompetencia(db: Db): Promise<{ medidas: number; publicaciones: number; sinMedir: number; motivo?: string }> {
  if (corriendo) return { medidas: 0, publicaciones: 0, sinMedir: 0, motivo: "ya corriendo" };
  corriendo = true;
  try {
    const filas = await db
      .select({ id: competitors.id, ig: competitors.igHandle, revisado: competitors.igRevisadoAt, estado: competitors.igEstado })
      .from(competitors)
      .innerJoin(clients, eq(clients.id, competitors.clientId))
      .where(and(eq(clients.status, "active"), isNotNull(competitors.igHandle)));
    const porUsuario = new Map<string, { ids: string[]; revisado: number; propio: boolean }>();
    for (const f of filas) {
      const u = usuarioDeInstagram(f.ig);
      // Confirmado que no existe: el usuario está mal cargado. No se insiste; si
      // lo corrigen es otro usuario y entra solo.
      if (!u || f.estado === "no_existe") continue;
      const prev = porUsuario.get(u);
      const propio = !!f.estado && PARA_PROPIO.has(f.estado);
      // Un error que no es de la cuenta (red, Instagram caído) no espera 6 días;
      // tampoco la que Business Discovery no devolvió y todavía no pasó por el lector propio.
      const t = f.revisado && f.estado && ESTADOS_FINALES.has(f.estado) && !propio ? new Date(f.revisado).getTime() : 0;
      porUsuario.set(u, { ids: [...(prev?.ids ?? []), f.id], revisado: Math.min(prev?.revisado ?? t, t), propio: (prev?.propio ?? false) || propio });
    }
    const limite = Date.now() - DIAS_ENTRE_LECTURAS * 86_400_000;
    const tanda = [...porUsuario.entries()].filter(([, v]) => v.revisado < limite).sort((a, b) => a[1].revisado - b[1].revisado).slice(0, POR_VUELTA);
    if (tanda.length === 0) return { medidas: 0, publicaciones: 0, sinMedir: 0 };

    const meta = await tokenDeMeta(db);
    const cuenta = meta?.igId ? { igId: meta.igId, token: meta.token } : null;

    let medidas = 0, publicaciones = 0, sinMedir = 0, propios = 0;
    let motivo: string | undefined;
    for (const [usuario, { ids, propio }] of tanda) {
      let estado = "ok";
      let seguidores: number | null = null;
      let probarPropio = propio || !cuenta;
      if (!probarPropio && cuenta) {
        const campos = `business_discovery.username(${usuario}){followers_count,media.limit(${POR_CUENTA}){id,caption,like_count,comments_count,media_type,media_product_type,timestamp,permalink}}`;
        try {
          const r = await fetch(`${GRAPH}/${cuenta.igId}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(cuenta.token)}`, { signal: AbortSignal.timeout(20_000) });
          const j = (await r.json().catch(() => ({}))) as {
            error?: { message?: string; code?: number };
            business_discovery?: {
              followers_count?: number;
              media?: { data?: Array<{ id: string; caption?: string; like_count?: number; comments_count?: number; media_type?: string; media_product_type?: string; timestamp?: string; permalink?: string }> };
            };
          };
          if (!r.ok || j.error) {
            const msg = j.error?.message ?? `HTTP ${r.status}`;
            // Límite de Instagram: se corta la vuelta sin marcar nada; sigue en la próxima.
            if (esLimite(j.error?.code, msg)) { motivo = `límite de Instagram: ${msg.slice(0, 120)}`; break; }
            if (esDeLaConexion(j.error?.code, msg)) return { medidas, publicaciones, sinMedir: tanda.length - medidas, motivo: `la conexión no puede buscar cuentas: ${msg.slice(0, 160)}` };
            estado = estadoDeError(msg);
            // Business Discovery no la da (personal o usuario raro): el lector propio sí la puede leer.
            probarPropio = PARA_PROPIO.has(estado);
          } else {
            seguidores = j.business_discovery?.followers_count ?? null;
            const media = (j.business_discovery?.media?.data ?? []).filter((m) => m.timestamp);
            await guardarPosts(db, media.map((m) => ({
              id: m.id, usuario, texto: m.caption ?? null, formato: formatoDeMedia(m),
              // Sin like_count la cuenta oculta los me gusta: null, no 0.
              meGusta: m.like_count ?? null, comentarios: m.comments_count ?? null,
              publicadoAt: new Date(m.timestamp!), permalink: m.permalink ?? null, syncedAt: new Date(),
            })));
            publicaciones += media.length;
          }
        } catch (e) {
          estado = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        }
      }
      if (probarPropio) {
        // El lector propio va de a poco: lo que no entra queda para la próxima vuelta sin marcar.
        if (propios >= PROPIO_POR_VUELTA) continue;
        if (propios > 0) await new Promise((res) => setTimeout(res, PAUSA_PROPIO_MS));
        propios += 1;
        try {
          const r = await leerInstagramPropio(db, usuario);
          estado = r.estado;
          seguidores = r.seguidores;
          publicaciones += r.publicaciones;
        } catch (e) {
          if (e instanceof Bloqueado) { motivo = e.message; break; }
          estado = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        }
      } else {
        await new Promise((res) => setTimeout(res, 8_000));
      }
      if (estado === "ok") medidas += 1; else sinMedir += 1;
      await db.update(competitors).set({ igEstado: estado, igSeguidores: seguidores, igRevisadoAt: new Date() }).where(inArray(competitors.id, ids));
    }
    return { medidas, publicaciones, sinMedir, motivo };
  } finally {
    corriendo = false;
  }
}

/** Por qué no se pudo leer Facebook en la última vuelta (para mostrarlo). null = anduvo o no corrió. */
let motivoFacebook: string | null = null;

/** Páginas de Facebook de la competencia que no tienen Instagram medido, por la Graph API. */
export async function medirCompetenciaFacebook(db: Db): Promise<{ medidas: number; publicaciones: number; sinMedir: number; motivo?: string }> {
  const filas = await db
    .select({ id: competitors.id, fb: competitors.fbPageUrl, igEstado: competitors.igEstado, revisado: competitors.fbRevisadoAt, estado: competitors.fbEstado })
    .from(competitors)
    .innerJoin(clients, eq(clients.id, competitors.clientId))
    .where(and(eq(clients.status, "active"), isNotNull(competitors.fbPageUrl)));
  const porPagina = new Map<string, { ids: string[]; revisado: number }>();
  for (const f of filas) {
    if (f.igEstado === "ok" || f.estado === "no_existe") continue; // ya se mide por Instagram / no existe
    const id = idDePaginaFacebook(f.fb);
    if (!id) continue;
    const t = f.revisado && f.estado && ["ok", "sin_publicaciones"].includes(f.estado) ? new Date(f.revisado).getTime() : 0;
    const prev = porPagina.get(id);
    porPagina.set(id, { ids: [...(prev?.ids ?? []), f.id], revisado: Math.min(prev?.revisado ?? t, t) });
  }
  const limite = Date.now() - FB_DIAS_ENTRE_LECTURAS * 86_400_000;
  const tanda = [...porPagina.entries()].filter(([, v]) => v.revisado < limite).sort((a, b) => a[1].revisado - b[1].revisado).slice(0, FB_POR_VUELTA);
  if (tanda.length === 0) return { medidas: 0, publicaciones: 0, sinMedir: 0 };
  const meta = await tokenDeMeta(db);
  if (!meta) return { medidas: 0, publicaciones: 0, sinMedir: tanda.length, motivo: (motivoFacebook = "no hay ninguna conexión de Meta activa") };

  let medidas = 0, publicaciones = 0, sinMedir = 0;
  for (const [id, { ids }] of tanda) {
    let estado = "ok";
    try {
      const p = await paginaFacebook(meta.token, id);
      if (!p) estado = "no_existe";
      else {
        await guardarPosts(db, p.posts.map((x) => aFila(`fb:${id}`, x)));
        publicaciones += p.posts.length;
        if (p.posts.length === 0) estado = "sin_publicaciones";
      }
    } catch (e) {
      // Sin permiso o frenado: es de la app o del momento, no de la página. No se marca a nadie.
      if (e instanceof SinPermiso) return { medidas, publicaciones, sinMedir: tanda.length - medidas, motivo: (motivoFacebook = `la app de Meta no tiene permiso para leer páginas ajenas (Page Public Content Access): ${e.message.slice(0, 120)}`) };
      if (e instanceof Bloqueado) return { medidas, publicaciones, sinMedir: tanda.length - medidas, motivo: e.message };
      estado = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }
    if (estado === "ok") medidas += 1; else sinMedir += 1;
    await db.update(competitors).set({ fbEstado: estado, fbRevisadoAt: new Date() }).where(inArray(competitors.id, ids));
    await new Promise((res) => setTimeout(res, 3_000));
  }
  motivoFacebook = null;
  return { medidas, publicaciones, sinMedir };
}

/** Las publicaciones de la competencia como las propias: cada cuenta es "un cliente" con su nicho. */
export async function cargarPublicacionesCompetencia(db: Db, dias = 180): Promise<PublicacionMedida[]> {
  // El rubro de una cuenta de la competencia es el del cliente que la tiene
  // cargada (el más repetido si son varios).
  const filas = await db
    .select({ ig: competitors.igHandle, fb: competitors.fbPageUrl, nombre: competitors.name, nicho: clients.industry })
    .from(competitors)
    .innerJoin(clients, eq(clients.id, competitors.clientId))
    .where(and(eq(clients.status, "active"), isNotNull(clients.industry)));
  const votos = new Map<string, Map<string, number>>();
  const nombres = new Map<string, string>();
  const votar = (clave: string, nicho: string) => {
    const m = votos.get(clave) ?? new Map<string, number>();
    m.set(nicho, (m.get(nicho) ?? 0) + 1);
    votos.set(clave, m);
  };
  for (const f of filas) {
    if (!f.nicho) continue;
    const u = usuarioDeInstagram(f.ig);
    if (u) votar(u, f.nicho);
    const id = idDePaginaFacebook(f.fb);
    if (id) { votar(`fb:${id}`, f.nicho); nombres.set(`fb:${id}`, f.nombre); }
  }
  const nichoDe = new Map([...votos].map(([u, m]) => [u, [...m].sort((a, b) => b[1] - a[1])[0][0]]));

  const desde = new Date(Date.now() - dias * 86_400_000);
  const posts = await db
    .select()
    .from(competenciaPosts)
    .where(and(gte(competenciaPosts.publicadoAt, desde), isNotNull(competenciaPosts.meGusta)));
  return posts
    .filter((p) => nichoDe.has(p.usuario))
    .map((p) => {
      const fb = p.usuario.startsWith("fb:");
      return {
        id: p.id,
        clientId: fb ? p.usuario : `ig:${p.usuario}`,
        cliente: fb ? `${nombres.get(p.usuario) ?? p.usuario.slice(3)} (Facebook)` : `@${p.usuario}`,
        slug: p.usuario,
        nicho: nichoDe.get(p.usuario) ?? null,
        red: fb ? ("facebook" as const) : ("instagram" as const),
        formato: nombreFormato(p.formato),
        angulo: p.angulo,
        // No se cuentan compartidos de la competencia: la comparación es siempre
        // contra la misma cuenta, así que 0 en los dos lados no sesga.
        engagement: engagementDe(p.meGusta ?? 0, p.comentarios ?? 0, 0),
        fecha: p.publicadoAt.toISOString().slice(0, 10),
        permalink: p.permalink,
        texto: p.texto ?? "",
      };
    });
}

let cache: { at: number; data: AnalisisContenido } | null = null;

/** Qué le funciona a la competencia, por rubro. Misma cuenta que lo propio, aparte. */
export async function analisisCompetencia(db: Db, fresco = false): Promise<AnalisisContenido> {
  if (!fresco && cache && Date.now() - cache.at < 30 * 60_000) return cache.data;
  const data = analizarPublicaciones(await cargarPublicacionesCompetencia(db), 180);
  cache = { at: Date.now(), data };
  return data;
}

/** Cuántas cuentas de la competencia hay, cuántas se midieron y por qué no las otras. */
export async function estadoCompetencia(db: Db): Promise<{
  conInstagram: number; medidas: number; noEncontradas: number; noEmpresa: number; otras: number; sinRevisar: number;
  noExisten: number; privadas: number; conFacebook: number; medidasFacebook: number; motivoFacebook: string | null;
}> {
  const filas = await db
    .select({ ig: competitors.igHandle, estado: competitors.igEstado, fb: competitors.fbPageUrl, fbEstado: competitors.fbEstado })
    .from(competitors)
    .innerJoin(clients, eq(clients.id, competitors.clientId))
    .where(eq(clients.status, "active"));
  const porUsuario = new Map<string, string | null>();
  const porPagina = new Map<string, string | null>();
  for (const f of filas) {
    const u = usuarioDeInstagram(f.ig);
    if (u) porUsuario.set(u, f.estado);
    if (!u || f.estado !== "ok") {
      const id = idDePaginaFacebook(f.fb);
      if (id) porPagina.set(id, f.fbEstado);
    }
  }
  const e = [...porUsuario.values()];
  const cuantos = (x: string) => e.filter((v) => v === x).length;
  return {
    conInstagram: e.length,
    medidas: cuantos("ok"),
    // Pendientes del lector propio: Business Discovery no las devolvió.
    noEncontradas: cuantos("no_encontrada"),
    noEmpresa: cuantos("no_es_empresa"),
    noExisten: cuantos("no_existe"),
    privadas: cuantos("privada"),
    otras: e.filter((x) => x && !ESTADOS_FINALES.has(x)).length,
    sinRevisar: e.filter((x) => !x).length,
    conFacebook: porPagina.size,
    medidasFacebook: [...porPagina.values()].filter((x) => x === "ok").length,
    motivoFacebook,
  };
}

/**
 * Para los agentes y el generador de ideas: qué le funciona a la competencia
 * del rubro. "" si el rubro no tiene dos cuentas de la competencia medidas. Puro.
 */
export function textoCompetencia(a: AnalisisContenido, nicho: string | null | undefined): string {
  if (!nicho) return "";
  const n = a.nichos.find((x) => x.nicho.toLowerCase() === nicho.toLowerCase());
  if (!n) return "";
  const cuentas = new Set(a.clientes.filter((c) => c.nicho?.toLowerCase() === nicho.toLowerCase()).map((c) => c.clientId));
  const ejemplos = a.reutilizar.filter((e) => cuentas.has(e.clientId)).slice(0, 3);
  const out = [
    `LO QUE LE FUNCIONA A LA COMPETENCIA en "${n.nicho}" — ${n.cuentas} cuentas de competidores (Instagram y Facebook), ${n.publicaciones} publicaciones, cada una contra lo normal de su propia cuenta (me gusta o reacciones + comentarios×3):`,
  ];
  if (n.angulos.length) out.push(`- Ángulos que más rinden: ${n.angulos.slice(0, 3).map(linea).join("; ")}.`);
  if (n.formatos.length) out.push(`- Formatos: ${n.formatos.slice(0, 4).map(linea).join("; ")}.`);
  if (ejemplos.length) out.push("- Publicaciones de la competencia que doblaron lo normal de su cuenta:", ...ejemplos.map((e) => `  · ${citar(e)}`));
  out.push("Tomá el ángulo o el formato para diferenciarte, nunca el texto ni la marca del competidor.");
  return out.join("\n");
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada 3 horas una vuelta: las cuentas nuevas primero, después cada 6 días (Facebook cada 10). */
export function initCompetenciaIg(db: Db): void {
  if (timer) return;
  const vuelta = () => {
    void medirCompetencia(db)
      .then((r) => { if (r.medidas || r.sinMedir || r.motivo) console.log(`[competencia-ig] ${r.medidas} cuentas medidas (${r.publicaciones} publicaciones), ${r.sinMedir} sin medir${r.motivo ? ` — ${r.motivo}` : ""}`); })
      .then(() => medirCompetenciaFacebook(db))
      .then((r) => { if (r.medidas || r.sinMedir || r.motivo) console.log(`[competencia-fb] ${r.medidas} páginas medidas (${r.publicaciones} publicaciones), ${r.sinMedir} sin medir${r.motivo ? ` — ${r.motivo}` : ""}`); })
      .catch((e) => console.warn("[competencia-ig] falló:", e instanceof Error ? e.message : e));
  };
  setTimeout(vuelta, 12 * 60_000);
  timer = setInterval(vuelta, 3 * 3600_000);
}
