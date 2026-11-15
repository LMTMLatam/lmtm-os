// NAS de LMTM (QNAP, crudos y videos de los clientes) por WebDAV, a través de Tailscale.
//
// Railway no da TUN: tailscaled corre en modo userspace dentro del contenedor (start.sh)
// y deja un proxy HTTP en 127.0.0.1:1055. Las credenciales del usuario de SOLO LECTURA
// del NAS viven solo en el entorno del servidor; los agentes piden por las herramientas
// nas_listar / nas_bajar y nunca las ven. La regla de acceso de Tailscale deja llegar a
// este nodo (tag:agentes) solo al puerto de WebDAV del NAS.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createHmac, timingSafeEqual } from "node:crypto";

const NAS_URL = () => (process.env.NAS_URL?.trim() || "http://100.106.250.26:5000").replace(/\/+$/, "");
const PROXY = () => process.env.NAS_PROXY?.trim() || "127.0.0.1:1055";

export function nasConfigurado(): string | null {
  if (!process.env.NAS_USER || !process.env.NAS_PASSWORD) return "El NAS no está conectado todavía (faltan NAS_USER y NAS_PASSWORD en el servidor). Avisá en la tarea.";
  return null;
}

/** Ruta del NAS normalizada: siempre empieza con /, sin «..» ni barras invertidas. */
export function rutaNas(ruta: unknown): string | null {
  const r = String(ruta ?? "").trim().replace(/\\/g, "/");
  if (!r || r.split("/").some((s) => s === "..")) return null;
  return "/" + r.replace(/^\/+/, "");
}

const codificar = (ruta: string) => ruta.split("/").map((s) => encodeURIComponent(s)).join("/");

function pedir(method: string, ruta: string, headers: Record<string, string> = {}, body?: string) {
  const [host, port] = PROXY().split(":");
  const auth = Buffer.from(`${process.env.NAS_USER}:${process.env.NAS_PASSWORD}`).toString("base64");
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    // Pedido a un proxy HTTP: la ruta va como URL absoluta.
    const req = http.request(
      { host, port: Number(port), method, path: NAS_URL() + codificar(ruta), headers: { Authorization: `Basic ${auth}`, ...headers }, timeout: 60_000 },
      resolve,
    );
    req.on("timeout", () => req.destroy(new Error("el NAS no respondió en 60 s")));
    req.on("error", reject);
    req.end(body);
  });
}

async function texto(res: http.IncomingMessage) {
  const partes: Buffer[] = [];
  for await (const p of res) partes.push(p as Buffer);
  return Buffer.concat(partes).toString("utf8");
}

export interface ItemNas { nombre: string; ruta: string; carpeta: boolean; mb: number | null; modificado: string | null }

/** Lee la respuesta de un PROPFIND (el prefijo del espacio de nombres varía: D:, d:, lp1:…). */
export function leerPropfind(xml: string, rutaPedida: string): ItemNas[] {
  const items: ItemNas[] = [];
  const base = rutaPedida.replace(/\/+$/, "");
  for (const m of xml.matchAll(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi)) {
    const bloque = m[0];
    const tag = (n: string) => new RegExp(`<(?:\\w+:)?${n}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${n}>`, "i").exec(bloque)?.[1]?.trim() ?? null;
    const href = tag("href");
    if (!href) continue;
    // El href viene escapado como XML (&amp;): sin esto «Bv. Avellaneda 100 Bis & Junín» daba «no existe» (15/11).
    const xml = href.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
    let ruta = decodeURIComponent(xml.replace(/^https?:\/\/[^/]+/i, "")).replace(/\/+$/, "");
    if (ruta === base || ruta === "") continue; // la carpeta misma
    const carpeta = /<(?:\w+:)?collection\b/i.test(bloque);
    const largo = tag("getcontentlength");
    items.push({
      nombre: ruta.split("/").pop() ?? ruta,
      ruta,
      carpeta,
      mb: !carpeta && largo != null && Number.isFinite(Number(largo)) ? Math.round(Number(largo) / 1e5) / 10 : null,
      modificado: tag("getlastmodified"),
    });
  }
  return items.sort((a, b) => Number(b.carpeta) - Number(a.carpeta) || a.nombre.localeCompare(b.nombre));
}

export async function listarNas(ruta: string): Promise<ItemNas[]> {
  const res = await pedir("PROPFIND", ruta.endsWith("/") ? ruta : ruta + "/", { Depth: "1", "Content-Type": "application/xml" },
    `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>`);
  const cuerpo = await texto(res);
  if (res.statusCode === 401 || res.statusCode === 403) throw new Error(`el NAS rechazó el acceso a ${ruta} (${res.statusCode})`);
  if (res.statusCode === 404) throw new Error(`no existe ${ruta} en el NAS`);
  if (res.statusCode !== 207) throw new Error(`el NAS respondió ${res.statusCode} al listar ${ruta}`);
  return leerPropfind(cuerpo, ruta);
}

// ── links de descarga firmados (para Claude por el conector, 11/11) ─────────
// Un token = UN archivo del NAS, vence en 6 h. Lo firma la herramienta nas_link y lo
// valida GET /api/public/nas (routes/material.ts). Sin sesión, para `curl`.

const VIGENCIA_LINK_S = 6 * 3600;
/** Cada espacio firma con su propia clave: un link del NAS no abre un archivo generado, ni al revés. */
const claveLink = (espacio = "nas") => {
  const s = process.env.PAPERCLIP_AGENT_JWT_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  return s ? `lmtm-${espacio}:${s}` : null;
};

function firmarRuta(ruta: string, ahora: number, secreto: string | null): { token: string; vence: Date } | null {
  if (!secreto) return null;
  const exp = Math.floor(ahora / 1000) + VIGENCIA_LINK_S;
  const cuerpo = Buffer.from(JSON.stringify({ r: ruta, e: exp })).toString("base64url");
  const firma = createHmac("sha256", secreto).update(cuerpo).digest().subarray(0, 18).toString("base64url");
  return { token: `${cuerpo}.${firma}`, vence: new Date(exp * 1000) };
}

/** La ruta firmada si la firma es buena y no venció; si no, null. */
function leerRuta(token: string, ahora: number, secreto: string | null): string | null {
  if (!secreto || typeof token !== "string") return null;
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest().subarray(0, 18);
  const dada = Buffer.from(firma, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  try {
    const { r, e } = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as { r?: unknown; e?: unknown };
    return typeof r === "string" && Number(e) * 1000 > ahora ? r : null;
  } catch {
    return null;
  }
}

export function firmarLinkNas(ruta: string, ahora = Date.now(), secreto = claveLink()): { token: string; vence: Date } | null {
  return firmarRuta(ruta, ahora, secreto);
}

/** La ruta del NAS del token si la firma es buena y no venció; si no, null. */
export function verificarLinkNas(token: string, ahora = Date.now(), secreto = claveLink()): string | null {
  const r = leerRuta(token, ahora, secreto);
  return r == null ? null : rutaNas(r);
}

/** Un archivo generado en el servidor (clip, voz, música, imagen) para bajarlo desde una PC del equipo (13/11). */
export function firmarLinkArchivo(ruta: string, ahora = Date.now(), secreto = claveLink("archivo")): { token: string; vence: Date } | null {
  return firmarRuta(ruta, ahora, secreto);
}

export function verificarLinkArchivo(token: string, ahora = Date.now(), secreto = claveLink("archivo")): string | null {
  return leerRuta(token, ahora, secreto);
}

/** GET de un archivo del NAS, pasando Range (para adelantar videos y retomar). */
export function abrirNas(ruta: string, range?: string) {
  return pedir("GET", ruta, range ? { Range: range } : {});
}

/** Baja un archivo del NAS a `destino` (carpeta). Devuelve la ruta local. */
export async function bajarNas(ruta: string, destino: string, topeBytes = 3e9): Promise<string> {
  const res = await pedir("GET", ruta);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`el NAS respondió ${res.statusCode} al bajar ${ruta}`);
  }
  const largo = Number(res.headers["content-length"] ?? 0);
  if (largo > topeBytes) {
    res.destroy();
    throw new Error(`${ruta} pesa ${Math.round(largo / 1e6)} MB (más de ${topeBytes / 1e6} MB)`);
  }
  fs.mkdirSync(destino, { recursive: true });
  const local = path.join(destino, (ruta.split("/").pop() || "archivo").replace(/[\\/:*?"<>|]/g, "-"));
  await pipeline(res, fs.createWriteStream(local));
  return local;
}
