// LMTM-OS: lector PROPIO de redes públicas (pedido 11/10: "construí nuestra
// propia herramienta que haga el mismo trabajo que ScrapeCreators").
//
// Para qué: Business Discovery de Instagram (competencia-ig.ts) solo lee
// cuentas de empresa con el usuario bien escrito. De 171 competidores con
// Instagram leyó 26; los otros 145 volvieron "no encontrada" sin decir si la
// cuenta es personal o si el usuario no existe (muchos los cargó un agente
// adivinando). Y 92 competidores tienen página de Facebook cargada.
//
// Qué lee, sin costo:
//  · Instagram: el perfil y sus últimas 12 publicaciones (me gusta,
//    comentarios, formato, fecha, texto) por el mismo pedido que hace la web de
//    Instagram para mostrarle un perfil a alguien que no inició sesión.
//    Distingue "no existe", "privada" y "medida".
//  · Facebook: la página por la Graph API con la conexión de Meta que ya
//    tenemos. Necesita que la app tenga "Page Public Content Access"; sin ese
//    permiso lo dice y no insiste.
//
// Reglas: solo datos públicos, sin iniciar sesión con ninguna cuenta (no se
// arriesgan las de la agencia), a ritmo bajo, sin rotar proxies ni resolver
// captchas. Si Instagram frena al servidor se lanza Bloqueado: la vuelta se
// corta y se reintenta más tarde. Si cambian el formato, el parseo devuelve
// "sin datos" y no inventa nada.
//
// Lo que NO hace (y por qué): la biblioteca de anuncios (la API gratis de Meta
// solo da avisos comerciales de la Unión Europea; la web exige navegador),
// transcripciones y TikTok (no hay competidores con TikTok cargado).

import type { Db } from "@paperclipai/db";
import { adsConnections } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";

const GRAPH = "https://graph.facebook.com/v21.0";

/** La red frenó al servidor (límite o pedido de login): cortar y reintentar más tarde. */
export class Bloqueado extends Error {}
/** La conexión de Meta no tiene permiso para leer páginas ajenas. */
export class SinPermiso extends Error {}

export interface PostPublico {
  id: string;
  texto: string | null;
  formato: "reel" | "video" | "carousel" | "photo";
  /** null = la cuenta oculta el dato. */
  meGusta: number | null;
  comentarios: number | null;
  publicadoAt: Date;
  permalink: string | null;
}

export interface PerfilPublico {
  red: "instagram" | "facebook";
  usuario: string;
  nombre: string | null;
  seguidores: number | null;
  privado: boolean;
  empresa: boolean | null;
  categoria: string | null;
  posts: PostPublico[];
}

const contar = (n: unknown): number | null => (typeof n === "number" && n >= 0 ? n : null);

/** La respuesta de web_profile_info → perfil. Puro: si Instagram cambia el formato, queda sin posts, no inventa. */
export function parsearPerfilInstagram(j: unknown): PerfilPublico | null {
  const u = (j as { data?: { user?: Record<string, any> | null } })?.data?.user;
  if (!u || typeof u.username !== "string") return null;
  const edges: Array<{ node?: Record<string, any> }> = u.edge_owner_to_timeline_media?.edges ?? [];
  const posts: PostPublico[] = [];
  for (const { node: n } of edges) {
    if (!n?.id || !n.taken_at_timestamp) continue;
    const reel = n.product_type === "clips";
    posts.push({
      id: String(n.id),
      texto: n.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
      formato: reel ? "reel" : n.__typename === "GraphSidecar" ? "carousel" : n.is_video ? "video" : "photo",
      meGusta: contar(n.edge_liked_by?.count ?? n.edge_media_preview_like?.count),
      comentarios: contar(n.edge_media_to_comment?.count ?? n.edge_media_preview_comment?.count),
      publicadoAt: new Date(Number(n.taken_at_timestamp) * 1000),
      permalink: n.shortcode ? `https://www.instagram.com/${reel ? "reel" : "p"}/${n.shortcode}/` : null,
    });
  }
  return {
    red: "instagram",
    usuario: u.username.toLowerCase(),
    nombre: u.full_name || null,
    seguidores: contar(u.edge_followed_by?.count),
    privado: !!u.is_private,
    empresa: typeof u.is_business_account === "boolean" ? u.is_business_account : null,
    categoria: u.category_name ?? u.business_category_name ?? null,
    posts,
  };
}

/**
 * Perfil público de Instagram con sus últimas 12 publicaciones.
 * null = el usuario no existe. Bloqueado = Instagram frenó al servidor.
 */
export async function perfilInstagram(usuario: string): Promise<PerfilPublico | null> {
  const r = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(usuario)}`, {
    headers: {
      // El identificador público de la web de Instagram: sin él responde 400.
      "x-ig-app-id": "936619743392459",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 404) return null;
  const txt = await r.text();
  // Límite, pedido de login o redirección a la pantalla de ingreso: es un freno, no un dato.
  if ([401, 403, 429].includes(r.status) || (r.status >= 300 && r.status < 400) || /wait a few minutes|login_required|checkpoint/i.test(txt)) {
    throw new Bloqueado(`Instagram frenó la lectura (HTTP ${r.status})`);
  }
  if (!r.ok) throw new Error(`Instagram respondió HTTP ${r.status}`);
  let j: unknown;
  try { j = JSON.parse(txt); } catch { throw new Bloqueado("Instagram devolvió una página en vez de datos (probable pedido de login)"); }
  return parsearPerfilInstagram(j);
}

/**
 * "https://www.facebook.com/HotelCosta/" → "hotelcosta"; "profile.php?id=123" → "123";
 * un link de la Biblioteca de Anuncios con view_all_page_id=123 → "123".
 * null si no es una página (299 competidores tienen un sitio web en este campo).
 */
export function idDePaginaFacebook(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!/(?:facebook|fb)\.com\//i.test(s)) return null;
  const deAnuncios = s.match(/view_all_page_id=(\d+)/i);
  if (deAnuncios) return deAnuncios[1];
  const id = s.match(/facebook\.com\/profile\.php\?id=(\d+)/i);
  if (id) return id[1];
  const m = s.match(/(?:^|\/\/|\.)(?:facebook|fb)\.com\/(?:pg\/)?([^/?#\s]+)/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (["ads", "groups", "share", "sharer", "watch", "events", "people", "pages", "reel", "story.php", "permalink.php", "photo.php", "profile.php"].includes(slug)) return null;
  return /^[a-z0-9.\-_]{2,80}$/.test(slug) ? slug : null;
}

/** La respuesta de la Graph API de una página → perfil. Puro. */
export function parsearPaginaFacebook(id: string, j: Record<string, any>): PerfilPublico {
  const posts: PostPublico[] = (j.posts?.data ?? [])
    .filter((p: Record<string, any>) => p?.id && p.created_time)
    .map((p: Record<string, any>) => {
      const tipo = p.attachments?.data?.[0]?.media_type as string | undefined;
      const link: string | null = p.permalink_url ?? null;
      return {
        id: `fb:${p.id}`,
        texto: p.message ?? null,
        formato: /\/reel\//.test(link ?? "") ? "reel" : tipo === "video" ? "video" : tipo === "album" ? "carousel" : "photo",
        meGusta: contar(p.reactions?.summary?.total_count),
        comentarios: contar(p.comments?.summary?.total_count),
        publicadoAt: new Date(p.created_time),
        permalink: link,
      } satisfies PostPublico;
    });
  return {
    red: "facebook", usuario: id, nombre: j.name ?? null,
    seguidores: contar(j.followers_count ?? j.fan_count), privado: false, empresa: true,
    categoria: j.category ?? null, posts,
  };
}

/** Un token de página de una conexión de Meta activa (para la Graph API). */
export async function tokenDeMeta(db: Db): Promise<{ igId: string | null; token: string } | null> {
  const conns = await db
    .select({ token: adsConnections.accessToken })
    .from(adsConnections)
    .where(and(eq(adsConnections.platform, "meta"), eq(adsConnections.status, "active")));
  for (const c of conns) {
    try {
      const url = `${GRAPH}/me/accounts?fields=id,access_token,instagram_business_account{id}&limit=100&access_token=${encodeURIComponent(c.token)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const j = (await r.json().catch(() => ({}))) as { data?: Array<{ access_token?: string; instagram_business_account?: { id?: string } }> };
      const conIg = (j.data ?? []).find((p) => p.access_token && p.instagram_business_account?.id);
      if (conIg) return { igId: conIg.instagram_business_account!.id!, token: conIg.access_token! };
      const cualquiera = (j.data ?? []).find((p) => p.access_token);
      if (cualquiera) return { igId: null, token: cualquiera.access_token! };
    } catch {
      /* la próxima conexión */
    }
  }
  return null;
}

/**
 * Página pública de Facebook con sus últimas 25 publicaciones.
 * null = no existe. SinPermiso = la app no tiene Page Public Content Access.
 */
export async function paginaFacebook(token: string, id: string): Promise<PerfilPublico | null> {
  const campos = "name,category,followers_count,fan_count,posts.limit(25){id,message,created_time,permalink_url,attachments{media_type},reactions.summary(true).limit(0),comments.summary(true).limit(0)}";
  const r = await fetch(`${GRAPH}/${encodeURIComponent(id)}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(25_000) });
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  const err = j.error as { message?: string; code?: number } | undefined;
  if (err) {
    const msg = err.message ?? `HTTP ${r.status}`;
    if ([4, 17, 32, 613].includes(err.code ?? -1)) throw new Bloqueado(`Facebook frenó la lectura: ${msg.slice(0, 120)}`);
    if ([10, 200].includes(err.code ?? -1) || /Page Public Content Access|pages_read_engagement|permission/i.test(msg)) throw new SinPermiso(msg.slice(0, 200));
    if (err.code === 803 || /does not exist|cannot be loaded|Unsupported get request/i.test(msg)) return null;
    throw new Error(`Facebook: ${msg.slice(0, 200)}`);
  }
  return parsearPaginaFacebook(id, j);
}

/** Interacción como la nuestra: me gusta (o reacciones) + comentarios×3. */
const interaccion = (p: PostPublico) => (p.meGusta == null ? null : p.meGusta + (p.comentarios ?? 0) * 3);

/** Para agentes y Claude: el perfil con cada publicación contra lo normal de SU cuenta. Puro. */
export function resumenParaAgente(p: PerfilPublico) {
  const valores = p.posts.map(interaccion).filter((x): x is number => x != null).sort((a, b) => a - b);
  const mediana = valores.length ? valores[Math.floor(valores.length / 2)] : null;
  return {
    red: p.red, usuario: p.usuario, nombre: p.nombre, seguidores: p.seguidores, privado: p.privado,
    empresa: p.empresa, categoria: p.categoria, interaccionNormal: mediana,
    publicaciones: p.posts.map((x) => {
      const i = interaccion(x);
      return {
        fecha: x.publicadoAt.toISOString().slice(0, 10), formato: x.formato, meGusta: x.meGusta, comentarios: x.comentarios,
        // Cuántas veces lo normal de la cuenta. null si oculta los me gusta o no hay con qué comparar.
        vecesLoNormal: i != null && mediana ? Math.round((i / mediana) * 10) / 10 : null,
        permalink: x.permalink, texto: x.texto?.slice(0, 280) ?? null,
      };
    }),
  };
}
