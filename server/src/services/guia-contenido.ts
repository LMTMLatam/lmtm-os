// LMTM-OS: guía de contenido para Claude (pedido 21/10).
//
// "Quiero un video de tal producto de tal cliente": UNA llamada trae lo que hace
// falta para hacerlo bien gastando pocos tokens. Trae la identidad y la memoria
// del cliente, el material REAL que el equipo tiene en Drive (con link de
// descarga), su web, lo que mejor le funcionó y la receta para producirlo.
//
// EL MATERIAL DE DRIVE
// No hay una carpeta por cliente: el material está repartido en la unidad
// compartida ("Ferrol", "EDITADAS SELECCIONADAS/FERROL", "GRUPO ROIBAS/Ferrol
// Apart-Hotel (FUNES)", carpetas por mes, archivos sueltos). Por eso se indexa
// por NOMBRE: las carpetas y los archivos cuyo nombre lleva el del cliente (o
// su palabra distintiva), más todo lo que cuelga de esas carpetas. El índice
// vive en client_context_cache ("drive-material") y se rehace si tiene más de
// un día. `clients.metadata.driveTerminos` pisa los términos cuando el nombre
// no alcanza.
//
// LAS DESCARGAS
// Los archivos no se hacen públicos. La guía firma un token por cliente que
// vence. /api/public/material/:fileId?t= baja de Drive solo los archivos del
// índice de ESE cliente (más su logo y sus fotos de producto), mientras el
// token no venza.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { clientBrand, clientContextCache, clientProducts, clients, hooks } from "@paperclipai/db";
import { and, asc, desc, eq, ne } from "drizzle-orm";

// ── texto ────────────────────────────────────────────────────────────────────

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palabras = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Palabras que no distinguen a un cliente de otro: no sirven para buscarlo en Drive. */
const GENERICAS = new Set([
  "hotel", "hoteles", "apart", "aparthotel", "grupo", "propiedades", "inmobiliaria", "desarrollos", "estudio",
  "centro", "servicios", "construcciones", "constructora", "consultora", "agencia", "empresa", "empresarios",
  "argentina", "rosario", "buenos", "aires", "plata", "mar", "san", "santa", "global", "latam", "group",
]);
const VACIAS = new Set(["de", "la", "el", "los", "las", "del", "con", "para", "un", "una", "y", "en", "por", "a", "al", "que", "mi", "tu", "su", "video", "reel", "placa"]);

/**
 * Con qué se busca al cliente en Drive. Pura.
 * El nombre completo, más cada palabra de 5+ letras que no sea genérica ni
 * aparezca en el nombre de otro cliente ("Ferrol Apart Hotel" → "ferrol").
 */
export function terminosDeCliente(nombre: string, otrosNombres: string[], override?: unknown): string[] {
  if (Array.isArray(override)) {
    const propios = override.filter((t): t is string => typeof t === "string" && t.trim().length >= 3).map((t) => t.trim());
    if (propios.length) return propios.slice(0, 6);
  }
  const out: string[] = [];
  const completo = nombre.trim().replace(/\s+/g, " ");
  if (completo.replace(/\s/g, "").length >= 4) out.push(completo);
  const ajenas = new Set(otrosNombres.flatMap(palabras));
  for (const w of palabras(nombre)) {
    if (w.length >= 5 && !GENERICAS.has(w) && !ajenas.has(w) && !out.some((t) => norm(t) === w)) out.push(w);
  }
  return out.slice(0, 4);
}

/** Palabras de un pedido ("departamento de 2 habitaciones") para buscarlo. Pura. */
export function palabrasDePedido(pedido: string | null | undefined): string[] {
  return [...new Set(palabras(pedido ?? "").filter((w) => w.length >= 3 && !VACIAS.has(w)))];
}

/**
 * Cuántas palabras del pedido aparecen en el texto (singular o plural). Pura.
 * Las cortas (menos de 5 letras) tienen que empezar una palabra: "opi" no es
 * "propio" ni "copia".
 */
export function puntaje(texto: string, pedido: string[]): number {
  if (!pedido.length) return 0;
  const t = norm(texto);
  const enTexto = palabras(texto);
  const esta = (w: string) => w.length >= 3 && (w.length >= 5 ? t.includes(w) : enTexto.some((p) => p.startsWith(w)));
  return pedido.filter((w) => esta(w) || esta(w.replace(/(es|s)$/, ""))).length;
}

const recortar = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// ── índice de Drive ──────────────────────────────────────────────────────────

export type TipoMaterial = "video" | "foto" | "logo" | "diseño" | "documento" | "audio" | "otro";

export interface ArchivoDrive {
  id: string;
  n: string;
  tipo: TipoMaterial;
  mb: number | null;
  fecha: string;
  ruta: string;
  w?: number;
  h?: number;
  seg?: number;
}

export interface IndiceDrive {
  generadoAt: string;
  terminos: string[];
  carpetas: Array<{ id: string; ruta: string }>;
  archivos: ArchivoDrive[];
  truncado: boolean;
}

interface FileDrive {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
  imageMediaMetadata?: { width?: number; height?: number };
}

const CARPETA = "application/vnd.google-apps.folder";
const MAX_ARCHIVOS = 2500;
const PROFUNDIDAD = 6;
const VIGENCIA_INDICE_MS = 24 * 3600_000;

/** Qué es un archivo, o null si es basura del sistema. Pura. */
export function tipoDe(nombre: string, mime: string): TipoMaterial | null {
  if (/^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(nombre) || nombre.startsWith("._")) return null;
  if (mime === CARPETA || mime === "application/vnd.google-apps.shortcut") return null;
  const diseno = /\.(ai|psd|indd|eps|aep|prproj|fig|sketch)$/i.test(nombre) || /photoshop|postscript|illustrator/.test(mime);
  if (/logo|isotipo|isologo/i.test(nombre) && (mime.startsWith("image/") || mime === "application/pdf" || diseno)) return "logo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (diseno || mime === "image/svg+xml") return "diseño";
  // Los RAW de cámara no se usan directo: van como "otro".
  if (/\.(dng|cr2|cr3|nef|arw|raf)$/i.test(nombre)) return "otro";
  if (mime.startsWith("image/")) return "foto";
  if (/google-apps\.(document|spreadsheet|presentation)|pdf|msword|wordprocessing|presentation|text\/(plain|markdown)/.test(mime)) return "documento";
  return "otro";
}

function aArchivo(f: FileDrive, ruta: string): ArchivoDrive | null {
  const tipo = tipoDe(f.name, f.mimeType);
  if (!tipo) return null;
  const a: ArchivoDrive = {
    id: f.id, n: f.name, tipo, ruta,
    mb: f.size ? Math.round(Number(f.size) / 1e5) / 10 : null,
    fecha: (f.modifiedTime ?? "").slice(0, 10),
  };
  const w = f.videoMediaMetadata?.width ?? f.imageMediaMetadata?.width;
  const h = f.videoMediaMetadata?.height ?? f.imageMediaMetadata?.height;
  if (w && h) { a.w = w; a.h = h; }
  if (f.videoMediaMetadata?.durationMillis) a.seg = Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000);
  return a;
}

const comillas = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function listar(q: string, maxPaginas: number): Promise<FileDrive[]> {
  const { drive } = await import("./contenido-drive.js");
  const out: FileDrive[] = [];
  let pagina: string | undefined;
  for (let i = 0; i < maxPaginas; i++) {
    const p = new URLSearchParams({
      q, pageSize: "1000", corpora: "allDrives", includeItemsFromAllDrives: "true", supportsAllDrives: "true",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height))",
      ...(pagina ? { pageToken: pagina } : {}),
    });
    const j = await drive<{ files?: FileDrive[]; nextPageToken?: string }>(`files?${p}`);
    out.push(...(j.files ?? []));
    pagina = j.nextPageToken;
    if (!pagina) break;
  }
  return out;
}

async function nombresDe(ids: string[]): Promise<Map<string, string>> {
  const { drive } = await import("./contenido-drive.js");
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 10) {
    const lote = ids.slice(i, i + 10);
    const r = await Promise.allSettled(lote.map((id) => drive<{ name: string }>(`files/${encodeURIComponent(id)}?fields=name&supportsAllDrives=true`)));
    r.forEach((x, k) => { if (x.status === "fulfilled") out.set(lote[k], x.value.name); });
  }
  return out;
}

/** Saca las copias (mismo nombre y mismo peso) y ordena de lo más nuevo a lo más viejo. Pura. */
export function sinCopias(archivos: ArchivoDrive[]): ArchivoDrive[] {
  const vistos = new Set<string>();
  return [...archivos]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .filter((a) => {
      const k = a.mb != null ? `${norm(a.n)}|${a.mb}` : a.id;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

/** Recorre Drive y arma el índice del cliente (no lo guarda). */
export async function indexarDrive(db: Db, clientId: string): Promise<IndiceDrive> {
  const [c] = await db.select({ name: clients.name, metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId));
  if (!c) throw new Error("cliente no encontrado");
  const otros = await db.select({ name: clients.name }).from(clients).where(and(eq(clients.status, "active"), ne(clients.id, clientId)));
  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const terminos = terminosDeCliente(c.name, otros.map((o) => o.name), meta.driveTerminos);

  const archivos = new Map<string, ArchivoDrive>();
  const sumar = (f: FileDrive, ruta: string) => {
    if (archivos.has(f.id) || archivos.size >= MAX_ARCHIVOS) return;
    const a = aArchivo(f, ruta);
    if (a) archivos.set(a.id, a);
  };

  // 1) Lo que lleva el nombre del cliente, en cualquier unidad.
  const hits = await listar(`(${terminos.map((t) => `name contains '${comillas(t)}'`).join(" or ")}) and trashed = false`, 3);
  const semillas = hits.filter((f) => f.mimeType === CARPETA);
  const sueltos = hits.filter((f) => f.mimeType !== CARPETA);

  // Ruta legible: la carpeta madre de cada semilla y de cada archivo suelto.
  const padres = [...new Set([...semillas, ...sueltos].map((f) => f.parents?.[0]).filter((p): p is string => !!p))].slice(0, 100);
  const nombrePadre = await nombresDe(padres);
  const conPadre = (f: FileDrive, propio?: string) => {
    const p = f.parents?.[0] ? nombrePadre.get(f.parents[0]) : undefined;
    return [p, propio].filter(Boolean).join("/");
  };
  for (const f of sueltos) sumar(f, conPadre(f));

  // Lo generado por los agentes (super redes/<cliente>) también es material.
  const superRedes = (meta.superRedes as { carpeta?: string } | undefined)?.carpeta;
  const carpetas: Array<{ id: string; ruta: string }> = semillas.map((s) => ({ id: s.id, ruta: conPadre(s, s.name) }));
  if (superRedes && !carpetas.some((x) => x.id === superRedes)) carpetas.push({ id: superRedes, ruta: `super redes/${c.name}` });

  // 2) Todo lo que cuelga de esas carpetas.
  const visto = new Set(carpetas.map((x) => x.id));
  let nivel = [...carpetas];
  for (let prof = 0; prof < PROFUNDIDAD && nivel.length && archivos.size < MAX_ARCHIVOS; prof++) {
    const siguiente: Array<{ id: string; ruta: string }> = [];
    for (let i = 0; i < nivel.length && archivos.size < MAX_ARCHIVOS; i += 15) {
      const lote = nivel.slice(i, i + 15);
      const hijos = await listar(`(${lote.map((x) => `'${x.id}' in parents`).join(" or ")}) and trashed = false`, 2);
      for (const h of hijos) {
        const padre = lote.find((x) => h.parents?.includes(x.id));
        const ruta = padre?.ruta ?? "";
        if (h.mimeType === CARPETA) {
          if (!visto.has(h.id)) { visto.add(h.id); siguiente.push({ id: h.id, ruta: `${ruta}/${h.name}` }); }
        } else sumar(h, ruta);
      }
    }
    nivel = siguiente;
  }

  // Copias: mismo nombre y mismo peso en otra carpeta. Queda la más reciente.
  const lista = sinCopias([...archivos.values()]);
  return { generadoAt: new Date().toISOString(), terminos, carpetas, archivos: lista, truncado: archivos.size >= MAX_ARCHIVOS || nivel.length > 0 };
}

const enCurso = new Map<string, Promise<IndiceDrive>>();

/** El índice guardado; se rehace si tiene más de un día (o si se pide). */
export async function indiceDrive(db: Db, clientId: string, refrescar = false): Promise<{ indice: IndiceDrive | null; error?: string }> {
  const [fila] = await db.select({ payload: clientContextCache.payload, fetchedAt: clientContextCache.fetchedAt })
    .from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "drive-material")));
  const guardado = (fila?.payload ?? null) as unknown as IndiceDrive | null;
  if (guardado && !refrescar && Date.now() - new Date(fila!.fetchedAt).getTime() < VIGENCIA_INDICE_MS) return { indice: guardado };

  let p = enCurso.get(clientId);
  if (!p) {
    p = indexarDrive(db, clientId).finally(() => enCurso.delete(clientId));
    enCurso.set(clientId, p);
  }
  let indice: IndiceDrive;
  try {
    indice = await p;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return guardado ? { indice: guardado, error: `no se pudo actualizar (${error}); es el índice anterior` } : { indice: null, error };
  }
  // Si no se puede guardar, igual se usa lo recién leído.
  await db.insert(clientContextCache)
    .values({ clientId, source: "drive-material", externalId: "indice", payload: indice as unknown as Record<string, unknown>, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [clientContextCache.clientId, clientContextCache.source],
      set: { payload: indice as unknown as Record<string, unknown>, fetchedAt: new Date(), updatedAt: new Date() },
    })
    .catch((e) => console.warn("[guia] no se guardó el índice de Drive:", String(e instanceof Error ? e.message : e).slice(0, 160)));
  return { indice };
}

// ── la web ───────────────────────────────────────────────────────────────────

export interface MaterialWeb {
  url: string;
  titulo: string | null;
  descripcion: string | null;
  paginas: Array<{ url: string; texto: string }>;
  imagenes: Array<{ url: string; alt: string | null }>;
  videos: string[];
}

const UA = "Mozilla/5.0 (compatible; LMTM-OS; +https://lmtmas.com)";
const VIGENCIA_WEB_MS = 7 * 24 * 3600_000;

const decodificar = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

/** Lo que sirve de una página para producir contenido. Pura. */
export function leerPagina(html: string, url: string): MaterialWeb {
  const base = new URL(url);
  const abs = (u: string | undefined | null) => {
    if (!u) return null;
    const v = decodificar(u.trim());
    if (!v || v.startsWith("data:") || v.startsWith("#") || /^(mailto|tel|javascript|whatsapp):/i.test(v)) return null;
    try { return new URL(v, base).toString(); } catch { return null; }
  };
  const meta = (k: string) =>
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${k}["']`, "i"))?.[1] ?? null;
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;

  const paginas = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const u = abs(m[1]);
    if (!u) continue;
    const pu = new URL(u);
    if (pu.host !== base.host || /\.(jpe?g|png|webp|gif|pdf|zip|mp4|webm)$/i.test(pu.pathname) || /wp-(json|admin|login)|\/feed\/?$/.test(pu.pathname)) continue;
    pu.hash = "";
    const texto = recortar(decodificar(m[2].replace(/<[^>]+>/g, " ")), 60);
    const k = pu.toString();
    if (texto && !paginas.has(k)) paginas.set(k, texto);
  }

  const imagenes = new Map<string, string | null>();
  const og = abs(meta("og:image"));
  if (og) imagenes.set(og, "imagen para compartir");
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i)?.[1];
    const u = abs(src);
    if (!u || /\.svg(\?|$)|gravatar|emoji|facebook\.com\/tr|pixel/i.test(u)) continue;
    if (!imagenes.has(u)) imagenes.set(u, tag.match(/\balt=["']([^"']*)["']/i)?.[1]?.trim() || null);
  }

  const videos = new Set<string>();
  for (const m of html.matchAll(/<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/gi)) { const u = abs(m[1]); if (u) videos.add(u); }
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^"'\s)<>]+?\.(?:mp4|webm|mov)\b/gi)) { const u = abs(m[0].replace(/\\\//g, "/")); if (u) videos.add(u); }
  for (const m of html.matchAll(/<iframe\b[^>]*src=["']([^"']*(?:youtube\.com|youtu\.be|vimeo\.com)[^"']*)["']/gi)) { const u = abs(m[1]); if (u) videos.add(u); }

  return {
    url,
    titulo: titulo ? recortar(decodificar(titulo), 120) : null,
    descripcion: recortar(decodificar(meta("description") ?? meta("og:description") ?? ""), 220) || null,
    paginas: [...paginas].map(([u, texto]) => ({ url: u, texto })).slice(0, 60),
    imagenes: [...imagenes].map(([u, alt]) => ({ url: u, alt: alt ? recortar(decodificar(alt), 80) : null })).slice(0, 80),
    videos: [...videos].slice(0, 20),
  };
}

async function bajarHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": UA } });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** La portada y hasta 6 páginas internas, con caché de una semana. */
export async function materialWeb(db: Db, clientId: string, url: string, refrescar = false): Promise<MaterialWeb | null> {
  const [fila] = await db.select({ payload: clientContextCache.payload, fetchedAt: clientContextCache.fetchedAt })
    .from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "web-material")));
  const guardado = (fila?.payload ?? null) as unknown as MaterialWeb | null;
  if (guardado?.url === url && !refrescar && Date.now() - new Date(fila!.fetchedAt).getTime() < VIGENCIA_WEB_MS) return guardado;

  const portada = await bajarHtml(url);
  if (!portada) return guardado;
  const web = leerPagina(portada, url);
  const internas = web.paginas.filter((p) => p.url.replace(/\/$/, "") !== url.replace(/\/$/, "")).slice(0, 6);
  const leidas = await Promise.all(internas.map(async (p) => {
    const html = await bajarHtml(p.url);
    return html ? leerPagina(html, p.url) : null;
  }));
  for (const l of leidas) {
    if (!l) continue;
    for (const i of l.imagenes) if (web.imagenes.length < 120 && !web.imagenes.some((x) => x.url === i.url)) web.imagenes.push(i);
    for (const v of l.videos) if (!web.videos.includes(v)) web.videos.push(v);
    for (const p of l.paginas) if (web.paginas.length < 80 && !web.paginas.some((x) => x.url === p.url)) web.paginas.push(p);
  }
  await db.insert(clientContextCache)
    .values({ clientId, source: "web-material", externalId: url, payload: web as unknown as Record<string, unknown>, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [clientContextCache.clientId, clientContextCache.source],
      set: { externalId: url, payload: web as unknown as Record<string, unknown>, fetchedAt: new Date(), updatedAt: new Date() },
    })
    .catch((e) => console.warn("[guia] no se guardó la web:", String(e instanceof Error ? e.message : e).slice(0, 160)));
  return web;
}

// ── descargas firmadas ───────────────────────────────────────────────────────

const VIGENCIA_TOKEN_S = 24 * 3600;

function clave(): string | null {
  const s = process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  return s ? `lmtm-material:${s}` : null;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Token de descarga del material de UN cliente, con vencimiento. */
export function firmarAcceso(clientId: string, ahora = Date.now(), secreto = clave()): { token: string; vence: Date } | null {
  if (!secreto) return null;
  const exp = Math.floor(ahora / 1000) + VIGENCIA_TOKEN_S;
  const cuerpo = b64(`${clientId}.${exp}`);
  const firma = createHmac("sha256", secreto).update(cuerpo).digest().subarray(0, 18);
  return { token: `${cuerpo}.${b64(firma)}`, vence: new Date(exp * 1000) };
}

/** El clientId del token si la firma es buena y no venció; si no, null. */
export function verificarAcceso(token: string, ahora = Date.now(), secreto = clave()): string | null {
  if (!secreto || typeof token !== "string") return null;
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest().subarray(0, 18);
  const dada = Buffer.from(firma, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  const [clientId, exp] = Buffer.from(cuerpo, "base64url").toString().split(".");
  if (!clientId || !(Number(exp) * 1000 > ahora)) return null;
  return clientId;
}

/** ¿Este archivo es del cliente? Índice de Drive guardado (no se rehace acá), logo de la marca o foto de un producto. */
export async function archivoDelCliente(db: Db, clientId: string, fileId: string): Promise<boolean> {
  const [fila] = await db.select({ payload: clientContextCache.payload }).from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "drive-material")));
  if ((fila?.payload as unknown as IndiceDrive | undefined)?.archivos?.some((a) => a.id === fileId)) return true;
  const { fileIdDeLink } = await import("./contenido-drive.js");
  const [marca] = await db.select({ logo: clientBrand.logoUrl }).from(clientBrand).where(eq(clientBrand.clientId, clientId));
  if (fileIdDeLink(marca?.logo) === fileId) return true;
  const prods = await db.select({ f: clientProducts.driveFileId, img: clientProducts.imageUrl }).from(clientProducts).where(eq(clientProducts.clientId, clientId));
  return prods.some((p) => p.f === fileId || fileIdDeLink(p.img) === fileId);
}

export const URL_BASE = () => (process.env.PAPERCLIP_PUBLIC_URL?.trim() || "https://lmtm-os-production.up.railway.app").replace(/\/+$/, "");

// ── el cliente ───────────────────────────────────────────────────────────────

/** Encuentra al cliente por id, slug o nombre (aunque esté mal escrito a medias). */
export async function resolverCliente(db: Db, texto: string): Promise<{ id: string; name: string } | { error: string }> {
  const t = (texto ?? "").trim();
  if (!t) return { error: "Falta el cliente (nombre o id)." };
  const activos = await db.select({ id: clients.id, name: clients.name, slug: clients.slug }).from(clients).where(eq(clients.status, "active"));
  const porId = activos.find((c) => c.id === t);
  if (porId) return porId;
  const q = norm(t).trim();
  const exactos = activos.filter((c) => norm(c.name).trim() === q || c.slug === q);
  if (exactos.length === 1) return exactos[0];
  const qs = palabras(t);
  const parciales = activos.filter((c) => {
    const n = norm(c.name);
    return n.includes(q) || (qs.length > 0 && qs.every((w) => n.includes(w)));
  });
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) return { error: `«${t}» coincide con varios clientes: ${parciales.slice(0, 8).map((c) => `${c.name} (${c.id})`).join(", ")}. Pasá el nombre completo o el id.` };
  return { error: `No encontré un cliente activo «${t}». Usá lmtmListClients para ver los nombres.` };
}

// ── la guía ──────────────────────────────────────────────────────────────────

export type Formato = "reel" | "video" | "historia" | "placa" | "carrusel";

const etiquetaArchivo = (a: ArchivoDrive) => {
  const dims = a.w && a.h ? ` ${a.w}×${a.h}` : "";
  const dur = a.seg ? ` ${a.seg}s` : "";
  const peso = a.mb != null ? ` ${a.mb >= 10 ? Math.round(a.mb) : a.mb}MB` : "";
  return `- \`${a.id}\` ${a.tipo}${dims}${dur}${peso} · ${recortar(a.n, 70)} · ${recortar(a.ruta, 60) || "—"} · ${a.fecha}`;
};

const PRIORIDAD: Record<TipoMaterial, number> = { video: 0, foto: 1, logo: 2, documento: 3, diseño: 4, audio: 5, otro: 6 };

/**
 * El nombre y la ruta de un archivo SIN el nombre del cliente. Pura.
 * 28/10: «llantas» empataba con todo el material de Distrillantas porque
 * «Distrillantas» está en la ruta de cada archivo del cliente.
 */
export function textoSinCliente(texto: string, terminosCliente: string[]): string {
  let t = norm(texto);
  for (const term of terminosCliente.map(norm).filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)) t = t.split(term).join(" ");
  return t;
}

/** Elige qué archivos mostrar: lo que coincide con el pedido y lo más reciente de cada tipo. Pura. */
export function elegirMaterial(archivos: ArchivoDrive[], pedido: string[], formato: Formato, terminosCliente: string[] = []): { relevantes: ArchivoDrive[]; otros: ArchivoDrive[] } {
  const relevantes = pedido.length
    ? archivos
      .map((a) => ({ a, p: puntaje(textoSinCliente(`${a.n} ${a.ruta}`, terminosCliente), pedido) }))
      .filter((x) => x.p > 0)
      .sort((x, y) => y.p - x.p || PRIORIDAD[x.a.tipo] - PRIORIDAD[y.a.tipo] || y.a.fecha.localeCompare(x.a.fecha))
      .slice(0, 14)
      .map((x) => x.a)
    : [];
  const ya = new Set(relevantes.map((a) => a.id));
  const video = formato === "reel" || formato === "video" || formato === "historia";
  const cupo: Partial<Record<TipoMaterial, number>> = relevantes.length
    ? { video: video ? 4 : 1, foto: 4, logo: 2 }
    : { video: video ? 8 : 3, foto: video ? 6 : 10, logo: 2, documento: 3, diseño: 2 };
  const otros: ArchivoDrive[] = [];
  for (const [tipo, n] of Object.entries(cupo) as Array<[TipoMaterial, number]>) {
    otros.push(...archivos.filter((a) => a.tipo === tipo && !ya.has(a.id)).slice(0, n));
  }
  return { relevantes, otros };
}

/** Frases de un texto que mencionan el pedido (para "qué se sabe del producto"). Pura. */
export function frasesCon(texto: string, pedido: string[], max = 3): string[] {
  if (!pedido.length) return [];
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim())
    .filter((f) => f.length > 20 && puntaje(f, pedido) > 0 && !/corrida|LMTM-\d+/i.test(f))
    .slice(0, max)
    .map((f) => recortar(f, 220));
}

/** ¿Una fila de memoria sirve para producir contenido? Las de pauta y operación (saldo, campañas, Make) no. Pura. */
export function esDeContenido(m: { kind: string; key: string; content: string }): boolean {
  // "event" son bitácoras (corridas, resúmenes de WhatsApp): no son hechos del cliente.
  if (m.kind === "context" || m.kind === "event" || m.key === "decisor" || m.key === "identity") return false;
  if (m.kind === "preference" || m.kind === "decision") return true;
  return !/\b(CPL|presupuesto|saldo|adsets?|Google Ads|escenario|Make|CRM)\b|campañas?|inversi[oó]n/i.test(m.content);
}

export interface PedidoGuia {
  cliente: string;
  producto?: string | null;
  formato?: Formato | null;
  refrescar?: boolean;
}

/** La guía completa, en markdown compacto. */
export async function guiaContenido(db: Db, p: PedidoGuia): Promise<string> {
  const r = await resolverCliente(db, p.cliente);
  if ("error" in r) return r.error;
  const formato: Formato = p.formato ?? "reel";
  const pedido = palabrasDePedido(p.producto);

  const [cliente] = await db.select({
    id: clients.id, name: clients.name, web: clients.websiteUrl, rubro: clients.industry, metadata: clients.metadata,
  }).from(clients).where(eq(clients.id, r.id));
  const [marca] = await db.select().from(clientBrand).where(eq(clientBrand.clientId, r.id));
  const productos = await db.select().from(clientProducts)
    .where(and(eq(clientProducts.clientId, r.id), eq(clientProducts.active, true))).orderBy(asc(clientProducts.position));
  const { getClientBrain } = await import("./customer-brain.js");
  const memoria = await getClientBrain(db, r.id);
  const ganchos = await db.select({ text: hooks.text, views: hooks.views }).from(hooks)
    .where(eq(hooks.clientId, r.id)).orderBy(desc(hooks.pinned), desc(hooks.views), desc(hooks.timesUsed)).limit(3);
  const { publicaciones } = await import("./novedades.js");
  const desde = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const posts = (await publicaciones(db, desde, r.id).catch(() => []))
    .map((x) => ({ ...x, total: x.reacciones + x.comentarios + x.compartidos }));
  const [drive, web] = await Promise.all([
    indiceDrive(db, r.id, p.refrescar === true),
    cliente.web ? materialWeb(db, r.id, cliente.web, p.refrescar === true).catch(() => null) : Promise.resolve(null),
  ]);

  const L: string[] = [];
  const titulo = [cliente.name, p.producto ? `«${p.producto}»` : null, formato].filter(Boolean).join(" · ");
  L.push(`# Guía de contenido · ${titulo}`);
  L.push(`clientId ${cliente.id} · rubro ${cliente.rubro ?? "sin cargar"} · web ${cliente.web ?? "sin cargar"}`);

  // Identidad
  L.push("", "## Identidad (respetala tal cual)");
  if (!marca) L.push("Sin marca cargada: usá la memoria de abajo y no inventes tono ni colores.");
  else {
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") as string[] : []);
    if (marca.mensaje) L.push(`Mensaje: ${recortar(marca.mensaje, 260)}`);
    if (marca.publico) L.push(`Público: ${recortar(marca.publico, 260)}`);
    if (marca.diferencial) L.push(`Diferencial (lo único que se puede afirmar como beneficio): ${recortar(marca.diferencial, 360)}`);
    if (marca.tono) L.push(`Tono: ${recortar(marca.tono, 260)}`);
    if (lista(marca.palabrasSi).length) L.push(`Frases propias: ${lista(marca.palabrasSi).slice(0, 10).map((x) => `"${x}"`).join(", ")}`);
    if (lista(marca.palabrasNo).length) L.push(`No usar: ${lista(marca.palabrasNo).slice(0, 10).join(", ")}`);
    const colores = lista(marca.colores);
    const tipos = lista(marca.tipografias);
    if (colores.length || tipos.length) L.push(`Paleta: ${colores.join(" ") || "—"} · Tipografías: ${tipos.join(", ") || "sin cargar"}`);
    if (marca.logoUrl) L.push(`Logo: ${marca.logoUrl}`);
  }

  // El producto
  if (p.producto) {
    L.push("", `## El producto: «${p.producto}»`);
    const enCatalogo = productos.filter((x) => puntaje(`${x.name} ${x.description ?? ""}`, pedido) > 0);
    for (const x of enCatalogo.slice(0, 3)) {
      // El catálogo cargado desde Drive (29/10) trae las carpetas del producto:
      // con el link el agente baja las fotos con lmtmDriveBajar, sin buscarlas.
      const carpetas = ((x.metadata as { carpetas?: Array<{ id: string | null; fotos: number; videos: number }> } | null)?.carpetas ?? [])
        .filter((c) => c.id).slice(0, 2)
        .map((c) => ` · carpeta https://drive.google.com/drive/folders/${c.id} (${c.fotos} fotos, ${c.videos} videos)`).join("");
      L.push(`- Catálogo: ${x.name}${x.description ? ` — ${recortar(x.description, 220)}` : ""}${x.driveFileId ? ` · foto \`${x.driveFileId}\`` : x.imageUrl ? ` · foto ${x.imageUrl}` : ""}${carpetas}`);
    }
    if (enCatalogo.some((x) => (x.metadata as { carpetas?: unknown[] } | null)?.carpetas?.length)) {
      L.push("  → Bajá el material de esas carpetas con lmtmDriveBajar; lmtmBuscarMaterial solo si no alcanza.");
    }
    if (!enCatalogo.length) L.push(productos.length ? "No está en el catálogo de productos del cliente." : "El cliente no tiene catálogo de productos cargado.");
    const dichos = memoria.flatMap((m) => frasesCon(m.content, pedido, 2)).slice(0, 4);
    for (const d of dichos) L.push(`- Memoria: ${d}`);
    const paginas = (web?.paginas ?? []).filter((x) => puntaje(`${x.texto} ${x.url}`, pedido) > 0).slice(0, 4);
    for (const x of paginas) L.push(`- Web: ${x.texto} → ${x.url}`);
    const enPosts = posts.filter((x) => puntaje(x.texto, pedido) > 0).sort((a, b) => b.total - a.total).slice(0, 2);
    for (const x of enPosts) L.push(`- Posteo (${x.fecha}, ${x.total} interacciones): "${recortar(x.texto, 120)}"${x.permalink ? ` ${x.permalink}` : ""}`);
    if (!enCatalogo.length && !dichos.length && !paginas.length && !enPosts.length) {
      L.push(`No encontré nada sobre «${p.producto}» en el catálogo, la memoria, la web ni los posteos. NO lo inventes: pedí qué es, cómo se llama exactamente, precio si va, y fotos. Revisá igual el material de Drive de abajo.`);
    }
  }

  // Memoria
  L.push("", "## Lo que sabemos del cliente");
  const { esSupuesto } = await import("./customer-brain.js");
  const cortas = memoria.filter((m) => esDeContenido(m) && !esSupuesto(m.confidence)).slice(0, 8);
  for (const m of cortas) L.push(`- [${m.kind}] ${recortar(m.content, 300)}`);
  const ctx = (key: string) => memoria.find((m) => m.key === key)?.content;
  const review = ctx("content-review-posts");
  if (review) L.push(`- Su contenido: ${recortar(review.replace(/^Review de contenido[^\n]*\n/, "").replace(/#+[^\n]*\n/g, ""), 600)}`);
  const feedback = ctx("super-redes-feedback");
  if (feedback) {
    const consejos = feedback.split("\n").filter((l) => /^\s*-\s+\*\*/.test(l)).map((l) => recortar(l.replace(/[*]/g, "").replace(/^\s*-\s*/, ""), 140)).slice(0, 4);
    if (consejos.length) L.push(`- Qué pide el equipo en las ideas: ${consejos.join(" | ")}`);
  }
  const enfoque = ctx("enfoque-tecnico");
  // El diagnóstico entra solo si no hay marca cargada: si la hay, la identidad ya lo resume.
  if (enfoque && !marca) L.push(`- Diagnóstico (Enfoque Técnico, recorte): ${recortar(enfoque.replace(/#+[^\n]*\n/g, "").replace(/\*\*/g, ""), 700)}`);
  if (!memoria.length) L.push("Sin memoria cargada.");
  L.push("(Memoria completa: lmtmGetClientBrain.)");

  // Lo que funcionó
  const mejores = [...posts].sort((a, b) => b.total - a.total).slice(0, 3);
  {
    L.push("", "## Lo que mejor le funcionó (últimos 6 meses)");
    if (!posts.length) L.push("- Sin posteos orgánicos sincronizados: su página de Instagram/Facebook no está conectada en el sistema.");
    for (const x of mejores) L.push(`- ${x.red} ${x.fecha} · ${x.total} interacciones: "${recortar(x.texto, 120)}"${x.permalink ? ` ${x.permalink}` : ""}`);
    for (const g of ganchos) L.push(`- Gancho probado: "${recortar(g.text, 140)}"`);
  }

  // Material de Drive
  L.push("");
  if (!drive.indice) {
    L.push(`## Material en Drive\nNo se pudo leer Drive (${drive.error ?? "sin datos"}). Pedí el link de la carpeta del cliente.`);
  } else {
    const ix = drive.indice;
    const cuenta = (t: TipoMaterial) => ix.archivos.filter((a) => a.tipo === t).length;
    const resumen = (["video", "foto", "logo", "diseño", "documento", "audio"] as TipoMaterial[])
      .map((t) => [t, cuenta(t)] as const).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`).join(", ");
    const horas = Math.round((Date.now() - new Date(ix.generadoAt).getTime()) / 3600_000);
    L.push(`## Material en Drive (${ix.archivos.length} archivos${resumen ? `: ${resumen}` : ""}; índice de hace ${horas} h${ix.truncado ? ", recortado" : ""})`);
    if (drive.error) L.push(`Aviso: ${drive.error}`);
    if (!ix.archivos.length) L.push(`Nada en Drive con el nombre del cliente (busqué: ${ix.terminos.join(", ")}). Si el material está con otro nombre, cargá clients.metadata.driveTerminos.`);
    else {
      L.push(`Carpetas: ${ix.carpetas.slice(0, 6).map((c) => `${recortar(c.ruta, 60)} (${c.id})`).join(" · ")}`);
      const { relevantes, otros } = elegirMaterial(ix.archivos, pedido, formato, [...ix.terminos, cliente.name]);
      if (pedido.length) L.push(relevantes.length ? `Coinciden con «${p.producto}» (por nombre de archivo o carpeta):` : `Ningún nombre de archivo menciona «${p.producto}»: mirá los de abajo.`);
      if (pedido.length) L.push(`Para encontrarlo por lo que MUESTRA la foto o el video (aunque el archivo se llame DJI_….jpg): lmtmBuscarMaterial con el cliente y «${p.producto}».`);
      for (const a of relevantes) L.push(etiquetaArchivo(a));
      if (otros.length) L.push(relevantes.length ? "Otros recientes:" : "Más recientes por tipo:");
      for (const a of otros) L.push(etiquetaArchivo(a));
    }
    const acceso = firmarAcceso(r.id);
    if (acceso) {
      const vence = acceso.vence.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
      L.push(`Descargar (vence ${vence}): ${URL_BASE()}/api/public/material/<id>?t=${acceso.token}`);
      L.push("Ver en Drive: https://drive.google.com/file/d/<id>/view · carpeta: https://drive.google.com/drive/folders/<id>");
    } else {
      L.push("Sin links de descarga (falta la clave del servidor). Ver en Drive: https://drive.google.com/file/d/<id>/view");
    }
  }

  // La web
  if (web) {
    L.push("", `## Web: ${web.url}`);
    if (web.titulo || web.descripcion) L.push([web.titulo, web.descripcion].filter(Boolean).join(" — "));
    const relevantes = pedido.length ? web.paginas.filter((x) => puntaje(`${x.texto} ${x.url}`, pedido) > 0) : [];
    const paginas = (relevantes.length ? relevantes : web.paginas).slice(0, 6);
    if (paginas.length) L.push(`Páginas: ${paginas.map((x) => `${x.texto} → ${x.url}`).join(" · ")}`);
    if (web.videos.length) L.push(`Videos en la web: ${web.videos.slice(0, 4).join(" · ")}`);
    const imgs = (pedido.length ? web.imagenes.filter((x) => puntaje(`${x.alt ?? ""} ${x.url}`, pedido) > 0) : []).concat(web.imagenes).slice(0, 5);
    if (imgs.length) L.push(`Imágenes de la web: ${[...new Set(imgs.map((x) => x.url))].join(" · ")}`);
  } else if (cliente.web) L.push("", `## Web: ${cliente.web} (no se pudo leer ahora)`);

  // Receta
  const esVideo = formato === "reel" || formato === "video" || formato === "historia";
  L.push("", "## Cómo producirlo");
  if (esVideo) {
    L.push(
      "Con terminal (Claude Code + HyperFrames, el mejor resultado):",
      "1. Bajá el material con `curl -L -o archivo \"<link de descarga>\"`; armá una hoja de contacto (ffmpeg) y elegí 8–14 planos.",
      "2. 9:16: recortá cada plano a 608×1080 y escalá a 1080×1920 (lanczos). Evitá planos con logos o textos ajenos sobreimpresos.",
      "3. Guion de 25–40 s: gancho en los primeros 2 s, 3–4 frases con el diferencial, cierre con frase de marca y llamado (web o WhatsApp). Solo datos de esta guía.",
      "4. Voz: lmtmVideoVoz (español rioplatense), una frase por llamada; tiempos con lmtmVideoTranscribir. Música baja, tallada debajo de la voz.",
      "5. Subtítulos palabra por palabra (la mayoría mira sin sonido) y placa final con logo, frase y llamado. `npx hyperframes check` antes de renderizar (skill lmtm-video).",
      "Sin terminal (claude.ai): pedile la pieza al agente «Productor de contenido» (issue asignado o la etiqueta «generar contenido» en ClickUp). La arma con este mismo material.",
    );
  } else {
    L.push(
      "- Con terminal: placa o carrusel TERMINADO con HyperFrames (skill lmtm-placas): fotos reales de arriba, texto en HTML con la paleta y tipografías, logo. Fondos que falten: lmtmContenidoImagen (sin texto).",
      "- Sin terminal (claude.ai): pedile la pieza al agente «Productor de contenido» (issue asignado o la etiqueta «generar contenido» en ClickUp).",
    );
  }
  L.push(
    "", "## Reglas",
    "- Solo lo que dicen esta guía o la memoria: sin precios, promos, cifras, premios ni testimonios inventados (si hacen falta: [completar: …]).",
    "- Voz del cliente (tono y frases propias de arriba), voseo, nada de lo que dice «No usar».",
    "- El texto en pantalla lo pone la edición: los modelos de video escriben con faltas.",
    "- Antes de gastar créditos o publicar, mostrá el plan y esperá el OK de la persona.",
  );
  return L.join("\n");
}

// ── indexado diario ──────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;

/** Rehace de a uno los índices de más de 20 h: la primera guía del día no espera a Drive. */
export async function refrescarIndices(db: Db): Promise<{ hechos: number; errores: number }> {
  const activos = await db.select({ id: clients.id }).from(clients).where(eq(clients.status, "active"));
  const guardados = await db.select({ id: clientContextCache.clientId, at: clientContextCache.fetchedAt })
    .from(clientContextCache).where(eq(clientContextCache.source, "drive-material"));
  const frescos = new Set(guardados.filter((f) => Date.now() - new Date(f.at).getTime() < 20 * 3600_000).map((f) => f.id));
  let hechos = 0;
  let errores = 0;
  for (const c of activos) {
    if (frescos.has(c.id)) continue;
    const r = await indiceDrive(db, c.id, true).catch(() => ({ indice: null, error: "falló" }));
    if (r.indice && !r.error) hechos++;
    else errores++;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { hechos, errores };
}

export function initIndiceDrive(db: Db): void {
  if (timer) return;
  const correr = () =>
    refrescarIndices(db)
      .then((r) => console.log(`[guia] índices de Drive: ${r.hechos} rehechos, ${r.errores} con error`))
      .catch((e) => console.warn("[guia] falló el indexado:", String(e instanceof Error ? e.message : e).slice(0, 160)));
  setTimeout(correr, 30 * 60_000);
  timer = setInterval(correr, 24 * 3600_000);
  console.log("[guia] índice de Drive de los clientes cada 24 h");
}
