// lmtm-redes: la API propia de datos públicos de TikTok e Instagram («nuestro ScrapeCreators», plan 17/11). Corre en
// el NAS de la oficina (lmtm-os/redes/) porque TikTok e Instagram frenan a la IP de Railway. Se llega por Tailscale,
// por el mismo proxy de tailscaled que usa el NAS (nas.ts), con el token en x-api-key. Los agentes nunca ven el token
// ni salen a internet por la oficina: piden por las herramientas virales_* y el ritmo lo pone el servicio.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { MedicionDeRed } from "./video-tipos.js";

const URL_REDES = () => (process.env.REDES_URL?.trim() || "").replace(/\/+$/, "");
const PROXY = () => process.env.NAS_PROXY?.trim() || "127.0.0.1:1055";

export type Red = "tiktok" | "instagram";
export const RUTAS_REDES: Record<Red, { buscar: string; autor: string; video: string }> = {
  tiktok: { buscar: "/v1/tiktok/search/keyword", autor: "/v3/tiktok/profile/videos", video: "/v2/tiktok/video" },
  instagram: { buscar: "/v2/instagram/reels/search", autor: "/v1/instagram/user/reels", video: "/v1/instagram/post" },
};

/** Un video tal como lo devuelve lmtm-redes. */
export interface VideoDeRed {
  red: Red; id: string; url: string; autor: string | null; texto?: string | null; fecha?: string | null; duracion?: number | null;
  vistas: number | null; me_gusta?: number | null; comentarios?: number | null; compartidos?: number | null; guardados?: number | null;
  mediana_autor?: number | null; veces?: number | null; fijado?: boolean;
}

export function redesConfigurado(): string | null {
  if (!URL_REDES() || !process.env.REDES_TOKEN) return "La API de redes (lmtm-redes, en el NAS de la oficina) no está conectada todavía: faltan REDES_URL y REDES_TOKEN en el servidor. Avisá en la tarea.";
  return null;
}

/** Puro: de qué red es un link (null si no es de TikTok ni de Instagram). */
export function redDeLink(url: string): Red | null {
  if (/^https?:\/\/(www\.|vm\.|m\.)?tiktok\.com\//i.test(url)) return "tiktok";
  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(url)) return "instagram";
  return null;
}

/** Puro: el pedido HTTP. Las IP de Tailscale (100.x) van por el proxy de tailscaled; otra (una PC de prueba), directo. */
export function armarPedido(base: string, ruta: string, q: Record<string, unknown>, proxy: string) {
  const u = new URL(base + ruta);
  for (const [k, v] of Object.entries(q)) if (v != null && v !== "") u.searchParams.set(k, String(v));
  const porProxy = /^100\./.test(u.hostname);
  const [host, port] = porProxy ? proxy.split(":") : [u.hostname, u.port || "80"];
  return { host, port: Number(port), path: porProxy ? u.toString() : u.pathname + u.search };
}

function pedir(ruta: string, q: Record<string, unknown>, timeoutMs: number) {
  const p = armarPedido(URL_REDES(), ruta, q, PROXY());
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request({ ...p, method: "GET", headers: { "x-api-key": process.env.REDES_TOKEN ?? "" }, timeout: timeoutMs }, resolve);
    req.on("timeout", () => req.destroy(new Error(`lmtm-redes no respondió en ${Math.round(timeoutMs / 1000)} s`)));
    req.on("error", reject);
    req.end();
  });
}

async function texto(res: http.IncomingMessage) {
  const partes: Buffer[] = [];
  for await (const p of res) partes.push(p as Buffer);
  return Buffer.concat(partes).toString("utf8");
}

/** Puro: la respuesta de lmtm-redes → ok con datos, o el motivo en castellano (429 = esa red frenó: no insistir). */
export function leerRespuesta(status: number, cuerpo: string): { ok: true; datos: any } | { ok: false; mensaje: string } {
  let j: any = null;
  try { j = JSON.parse(cuerpo); } catch { /* no es JSON */ }
  if (status === 200 && j) return { ok: true, datos: j };
  if (status === 429) return { ok: false, mensaje: `${j?.red ?? "La red"} frenó la lectura (${j?.motivo ?? "límite"}). No insistas: se puede volver a probar después de ${j?.reintentar ?? "un rato"}.` };
  if (status === 401) return { ok: false, mensaje: "lmtm-redes rechazó el token (REDES_TOKEN del servidor distinto al del NAS)." };
  return { ok: false, mensaje: `lmtm-redes respondió ${status}: ${j?.error ?? cuerpo.slice(0, 200)}` };
}

export async function consultarRedes(ruta: string, q: Record<string, unknown> = {}, timeoutMs = 280_000) {
  const falta = redesConfigurado();
  if (falta) return { ok: false as const, mensaje: falta };
  try {
    const res = await pedir(ruta, q, timeoutMs);
    return leerRespuesta(res.statusCode ?? 0, await texto(res));
  } catch (e) {
    return { ok: false as const, mensaje: `No se pudo hablar con lmtm-redes: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Baja un video de TikTok o Instagram (por lmtm-redes) a `destino`. Devuelve la ruta local. */
export async function bajarDeRedes(url: string, destino: string, topeBytes = 300e6): Promise<string> {
  const falta = redesConfigurado();
  if (falta) throw new Error(falta);
  const res = await pedir("/descargar", { url }, 280_000);
  if (res.statusCode !== 200) {
    const r = leerRespuesta(res.statusCode ?? 0, await texto(res));
    throw new Error(r.ok ? "respuesta inesperada" : r.mensaje);
  }
  if (Number(res.headers["content-length"] ?? 0) > topeBytes) {
    res.destroy();
    throw new Error(`el video pesa más de ${topeBytes / 1e6} MB`);
  }
  const nombre = /filename="([^"]+)"/.exec(String(res.headers["content-disposition"] ?? ""))?.[1] ?? "video.mp4";
  fs.mkdirSync(destino, { recursive: true });
  const local = path.join(destino, nombre.replace(/[\\/:*?"<>|]/g, "-"));
  await pipeline(res, fs.createWriteStream(local));
  return local;
}

/** Puro: la lista para un agente, del más viral al menos (una línea por video, sin el JSON entero). */
export function resumenVideos(videos: VideoDeRed[]): string {
  const n = (x: number | null | undefined) => (x == null ? "?" : x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : x >= 1e3 ? `${Math.round(x / 1e3)} mil` : String(x));
  return [...videos].sort((a, b) => (b.veces ?? -1) - (a.veces ?? -1)).map((v) =>
    `${v.veces != null ? `${v.veces}×` : "s/m"} · ${n(v.vistas)} vistas (mediana ${n(v.mediana_autor)}) · @${v.autor ?? "?"} · ${v.fecha ?? "?"}` +
    `${v.duracion ? ` · ${Math.round(v.duracion)} s` : ""}${v.fijado ? " · fijado" : ""} · ${v.url}${v.texto ? `\n    ${v.texto.replace(/\s+/g, " ").slice(0, 140)}` : ""}`,
  ).join("\n");
}

/**
 * Mide UN video en el momento (no confía en números que traiga un agente): sus datos y la mediana de su autor.
 * En Instagram las reproducciones salen de los últimos 12 reels del autor: si es más viejo, quedan en null.
 */
export async function medirVideo(url: string): Promise<{ ok: true; autor: string; medicion: MedicionDeRed } | { ok: false; mensaje: string }> {
  const red = redDeLink(url);
  if (!red) return { ok: false, mensaje: "El link tiene que ser de TikTok o de Instagram." };
  const v = await consultarRedes(RUTAS_REDES[red].video, { url });
  if (!v.ok) return v;
  const d = v.datos as VideoDeRed;
  if (!d.autor) return { ok: false, mensaje: "lmtm-redes no pudo saber quién publicó ese video." };
  const a = await consultarRedes(RUTAS_REDES[red].autor, { handle: d.autor });
  const mediana: number | null = a.ok ? a.datos.mediana_vistas ?? null : null;
  const propio = a.ok ? ((a.datos.videos ?? a.datos.reels ?? []) as VideoDeRed[]).find((x) => x.id === d.id) : undefined;
  const vistas = d.vistas ?? propio?.vistas ?? null;
  return {
    ok: true, autor: d.autor,
    medicion: {
      red, vistas, meGusta: d.me_gusta ?? null, comentarios: d.comentarios ?? null, compartidos: d.compartidos ?? null,
      guardados: d.guardados ?? null, medianaAutor: mediana, veces: vistas != null && mediana ? Math.round((vistas / mediana) * 100) / 100 : null,
      publicado: d.fecha ?? null, texto: d.texto ?? null,
    },
  };
}
