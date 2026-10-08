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

import type { Db } from "@paperclipai/db";
import { adsConnections, clients, competenciaPosts, competitors } from "@paperclipai/db";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { analizarPublicaciones, citar, linea, nombreFormato, type AnalisisContenido, type PublicacionMedida } from "./contenido-analisis.js";
import { engagementDe } from "./organico-aprendizaje.js";

const GRAPH = "https://graph.facebook.com/v21.0";
/** Publicaciones por cuenta en cada lectura (las más nuevas). */
const POR_CUENTA = 30;
/** Cuentas por vuelta: Instagram limita las llamadas por hora. */
const POR_VUELTA = 40;
/** Cada cuánto se vuelve a medir una cuenta. */
const DIAS_ENTRE_LECTURAS = 6;

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

const esLimite = (codigo: number | undefined, msg: string) => [4, 17, 32, 613].includes(codigo ?? -1) || /rate limit|too many calls|request limit/i.test(msg);
/** Permiso o token: es de la conexión, no de la cuenta buscada. No se marca a nadie. */
const esDeLaConexion = (codigo: number | undefined, msg: string) => [10, 190, 200].includes(codigo ?? -1) || /permission|access token|session has expired/i.test(msg);
/** Lo que no es "ok" ni un motivo de la cuenta se reintenta en la próxima vuelta. */
const ESTADOS_FINALES = new Set(["ok", "no_encontrada", "no_es_empresa"]);

/** Una cuenta de Instagram de empresa nuestra desde la que preguntar, con su token de página. */
async function cuentaParaBuscar(db: Db): Promise<{ igId: string; token: string } | null> {
  const conns = await db
    .select({ token: adsConnections.accessToken })
    .from(adsConnections)
    .where(and(eq(adsConnections.platform, "meta"), eq(adsConnections.status, "active")));
  for (const c of conns) {
    try {
      const url = `${GRAPH}/me/accounts?fields=id,access_token,instagram_business_account{id}&limit=100&access_token=${encodeURIComponent(c.token)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const j = (await r.json().catch(() => ({}))) as { data?: Array<{ access_token?: string; instagram_business_account?: { id?: string } }> };
      for (const p of j.data ?? []) {
        if (p.access_token && p.instagram_business_account?.id) return { igId: p.instagram_business_account.id, token: p.access_token };
      }
    } catch {
      /* la próxima conexión */
    }
  }
  return null;
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
    const porUsuario = new Map<string, { ids: string[]; revisado: number }>();
    for (const f of filas) {
      const u = usuarioDeInstagram(f.ig);
      if (!u) continue;
      const prev = porUsuario.get(u);
      // Un error que no es de la cuenta (red, Instagram caído) no espera 6 días.
      const t = f.revisado && f.estado && ESTADOS_FINALES.has(f.estado) ? new Date(f.revisado).getTime() : 0;
      porUsuario.set(u, { ids: [...(prev?.ids ?? []), f.id], revisado: Math.min(prev?.revisado ?? t, t) });
    }
    const limite = Date.now() - DIAS_ENTRE_LECTURAS * 86_400_000;
    const tanda = [...porUsuario.entries()].filter(([, v]) => v.revisado < limite).sort((a, b) => a[1].revisado - b[1].revisado).slice(0, POR_VUELTA);
    if (tanda.length === 0) return { medidas: 0, publicaciones: 0, sinMedir: 0 };

    const cuenta = await cuentaParaBuscar(db);
    if (!cuenta) return { medidas: 0, publicaciones: 0, sinMedir: tanda.length, motivo: "ninguna conexión de Meta tiene una cuenta de Instagram de empresa" };

    let medidas = 0, publicaciones = 0, sinMedir = 0;
    for (const [usuario, { ids }] of tanda) {
      const campos = `business_discovery.username(${usuario}){followers_count,media.limit(${POR_CUENTA}){id,caption,like_count,comments_count,media_type,media_product_type,timestamp,permalink}}`;
      let estado = "ok";
      let seguidores: number | null = null;
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
          if (esLimite(j.error?.code, msg)) { console.warn(`[competencia-ig] límite de Instagram después de ${medidas}: ${msg.slice(0, 120)}`); break; }
          if (esDeLaConexion(j.error?.code, msg)) return { medidas, publicaciones, sinMedir: tanda.length - medidas, motivo: `la conexión no puede buscar cuentas: ${msg.slice(0, 160)}` };
          estado = estadoDeError(msg);
          sinMedir += 1;
        } else {
          seguidores = j.business_discovery?.followers_count ?? null;
          const media = (j.business_discovery?.media?.data ?? []).filter((m) => m.timestamp);
          for (const m of media) {
            const fila = {
              id: m.id, usuario, texto: m.caption ?? null, formato: formatoDeMedia(m),
              // Sin like_count la cuenta oculta los me gusta: null, no 0.
              meGusta: m.like_count ?? null, comentarios: m.comments_count ?? null,
              publicadoAt: new Date(m.timestamp!), permalink: m.permalink ?? null, syncedAt: new Date(),
            };
            await db.insert(competenciaPosts).values(fila).onConflictDoUpdate({
              target: competenciaPosts.id,
              set: { meGusta: fila.meGusta, comentarios: fila.comentarios, texto: fila.texto, syncedAt: fila.syncedAt },
            });
          }
          publicaciones += media.length;
          medidas += 1;
        }
      } catch (e) {
        estado = (e instanceof Error ? e.message : String(e)).slice(0, 200);
        sinMedir += 1;
      }
      await db.update(competitors).set({ igEstado: estado, igSeguidores: seguidores, igRevisadoAt: new Date() }).where(inArray(competitors.id, ids));
      await new Promise((res) => setTimeout(res, 8_000));
    }
    return { medidas, publicaciones, sinMedir };
  } finally {
    corriendo = false;
  }
}

/** Las publicaciones de la competencia como las propias: cada cuenta es "un cliente" con su nicho. */
export async function cargarPublicacionesCompetencia(db: Db, dias = 180): Promise<PublicacionMedida[]> {
  // El rubro de una cuenta de la competencia es el del cliente que la tiene
  // cargada (el más repetido si son varios).
  const filas = await db
    .select({ ig: competitors.igHandle, nicho: clients.industry })
    .from(competitors)
    .innerJoin(clients, eq(clients.id, competitors.clientId))
    .where(and(eq(clients.status, "active"), isNotNull(competitors.igHandle), isNotNull(clients.industry)));
  const votos = new Map<string, Map<string, number>>();
  for (const f of filas) {
    const u = usuarioDeInstagram(f.ig);
    if (!u || !f.nicho) continue;
    const m = votos.get(u) ?? new Map<string, number>();
    m.set(f.nicho, (m.get(f.nicho) ?? 0) + 1);
    votos.set(u, m);
  }
  const nichoDe = new Map([...votos].map(([u, m]) => [u, [...m].sort((a, b) => b[1] - a[1])[0][0]]));

  const desde = new Date(Date.now() - dias * 86_400_000);
  const posts = await db
    .select()
    .from(competenciaPosts)
    .where(and(gte(competenciaPosts.publicadoAt, desde), isNotNull(competenciaPosts.meGusta)));
  return posts
    .filter((p) => nichoDe.has(p.usuario))
    .map((p) => ({
      id: p.id,
      clientId: `ig:${p.usuario}`,
      cliente: `@${p.usuario}`,
      slug: p.usuario,
      nicho: nichoDe.get(p.usuario) ?? null,
      red: "instagram" as const,
      formato: nombreFormato(p.formato),
      angulo: p.angulo,
      engagement: engagementDe(p.meGusta ?? 0, p.comentarios ?? 0, 0),
      fecha: p.publicadoAt.toISOString().slice(0, 10),
      permalink: p.permalink,
      texto: p.texto ?? "",
    }));
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
export async function estadoCompetencia(db: Db): Promise<{ conInstagram: number; medidas: number; noEncontradas: number; noEmpresa: number; otras: number; sinRevisar: number }> {
  const filas = await db
    .select({ ig: competitors.igHandle, estado: competitors.igEstado })
    .from(competitors)
    .innerJoin(clients, eq(clients.id, competitors.clientId))
    .where(and(eq(clients.status, "active"), isNotNull(competitors.igHandle)));
  const porUsuario = new Map<string, string | null>();
  for (const f of filas) {
    const u = usuarioDeInstagram(f.ig);
    if (u) porUsuario.set(u, f.estado);
  }
  const e = [...porUsuario.values()];
  return {
    conInstagram: e.length,
    medidas: e.filter((x) => x === "ok").length,
    noEncontradas: e.filter((x) => x === "no_encontrada").length,
    noEmpresa: e.filter((x) => x === "no_es_empresa").length,
    otras: e.filter((x) => x && !["ok", "no_encontrada", "no_es_empresa"].includes(x)).length,
    sinRevisar: e.filter((x) => !x).length,
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
    `LO QUE LE FUNCIONA A LA COMPETENCIA en "${n.nicho}" — ${n.cuentas} cuentas de Instagram de competidores, ${n.publicaciones} publicaciones, cada una contra lo normal de su propia cuenta (me gusta + comentarios×3):`,
  ];
  if (n.angulos.length) out.push(`- Ángulos que más rinden: ${n.angulos.slice(0, 3).map(linea).join("; ")}.`);
  if (n.formatos.length) out.push(`- Formatos: ${n.formatos.slice(0, 4).map(linea).join("; ")}.`);
  if (ejemplos.length) out.push("- Publicaciones de la competencia que doblaron lo normal de su cuenta:", ...ejemplos.map((e) => `  · ${citar(e)}`));
  out.push("Tomá el ángulo o el formato para diferenciarte, nunca el texto ni la marca del competidor.");
  return out.join("\n");
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Cada 3 horas una vuelta: las cuentas nuevas primero, después cada 6 días. */
export function initCompetenciaIg(db: Db): void {
  if (timer) return;
  const vuelta = () => {
    void medirCompetencia(db)
      .then((r) => { if (r.medidas || r.sinMedir || r.motivo) console.log(`[competencia-ig] ${r.medidas} cuentas medidas (${r.publicaciones} publicaciones), ${r.sinMedir} sin medir${r.motivo ? ` — ${r.motivo}` : ""}`); })
      .catch((e) => console.warn("[competencia-ig] falló:", e instanceof Error ? e.message : e));
  };
  setTimeout(vuelta, 12 * 60_000);
  timer = setInterval(vuelta, 3 * 3600_000);
}

