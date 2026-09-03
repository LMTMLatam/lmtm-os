// LMTM-OS: Drive de "super redes" (pedido 14/8).
//
// Estructura, en Mi unidad de grow@bylmtm.com:
//   super redes/<CLIENTE>/PLACAS     ← imágenes y carruseles generados
//   super redes/<CLIENTE>/VIDEOS     ← reels y clips generados
//   super redes/<CLIENTE>/PRODUCTOS  ← fotos que carga el equipo (referencia)
//
// Los ids viven en clients.metadata.superRedes para no recorrer Drive en cada
// generación; si falta alguno se crea al vuelo (cliente nuevo).
//
// Las imágenes NO se hacen públicas: para mostrarlas en el panel hay un proxy
// que las baja con nuestro token, y para pasárselas a Higgsfield se descargan
// a un archivo temporal. Publicar fotos de producto de un cliente sería
// compartirlas con cualquiera que tenga el link.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";

const RAIZ_NOMBRE = "super redes";
const SUBCARPETAS = ["PLACAS", "VIDEOS", "PRODUCTOS"] as const;
type Sub = (typeof SUBCARPETAS)[number];

export interface CarpetasCliente {
  carpeta: string;
  placas: string;
  videos: string;
  productos?: string;
}

// ── auth ─────────────────────────────────────────────────────────────────────

let cache: { token: string; expiraEn: number } | null = null;

async function token(): Promise<string> {
  if (cache && cache.expiraEn - 60_000 > Date.now()) return cache.token;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google OAuth no configurado (GOOGLE_OAUTH_*)");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  const b = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !b.access_token) throw new Error(`Google OAuth: ${b.error ?? `HTTP ${r.status}`}`);
  cache = { token: b.access_token, expiraEn: Date.now() + (b.expires_in ?? 3600) * 1000 };
  return cache.token;
}

async function drive<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Drive ${path.split("?")[0]} → ${r.status}: ${txt.slice(0, 200)}`);
  return (txt ? JSON.parse(txt) : null) as T;
}

// ── carpetas ─────────────────────────────────────────────────────────────────

async function buscarCarpeta(nombre: string, padre: string | null): Promise<string | null> {
  const q = [
    `name = '${nombre.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    padre ? `'${padre}' in parents` : "'root' in parents",
  ].join(" and ");
  const j = await drive<{ files?: Array<{ id: string }> }>(
    `files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  return j.files?.[0]?.id ?? null;
}

async function crearCarpeta(nombre: string, padre: string | null): Promise<string> {
  const j = await drive<{ id: string }>("files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nombre,
      mimeType: "application/vnd.google-apps.folder",
      ...(padre ? { parents: [padre] } : {}),
    }),
  });
  return j.id;
}

const obtener = async (nombre: string, padre: string | null): Promise<string> =>
  (await buscarCarpeta(nombre, padre)) ?? (await crearCarpeta(nombre, padre));

/** Carpetas del cliente, cacheadas en clients.metadata.superRedes. */
export async function carpetasDe(db: Db, clientId: string, clienteNombre: string, quiero: Sub[] = ["PLACAS", "VIDEOS"]): Promise<CarpetasCliente> {
  const [c] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId));
  const meta = (c?.metadata ?? {}) as Record<string, unknown>;
  const guardado = (meta.superRedes ?? {}) as Partial<CarpetasCliente>;
  const faltaAlguna = !guardado.carpeta || quiero.some((s) => !guardado[s.toLowerCase() as keyof CarpetasCliente]);
  if (!faltaAlguna) return guardado as CarpetasCliente;

  const raiz = await obtener(RAIZ_NOMBRE, null);
  const carpeta = guardado.carpeta ?? (await obtener(clienteNombre, raiz));
  const out: CarpetasCliente = { ...guardado, carpeta } as CarpetasCliente;
  for (const s of quiero) {
    const k = s.toLowerCase() as keyof CarpetasCliente;
    if (!out[k]) out[k] = await obtener(s, carpeta);
  }
  await db.update(clients).set({ metadata: { ...meta, superRedes: out } }).where(eq(clients.id, clientId));
  return out;
}

// ── subida ───────────────────────────────────────────────────────────────────

async function subirBytes(bytes: Buffer, nombre: string, carpetaId: string, mime: string): Promise<{ id: string; link: string }> {
  const t = await token();
  const limite = "----lmtm" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nombre, parents: [carpetaId] });
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${limite}` },
    body: cuerpo as unknown as BodyInit,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Drive upload ${r.status}: ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt) as { id: string; webViewLink?: string };
  return { id: j.id, link: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view` };
}

/** Sube un archivo remoto (URL) a PLACAS o VIDEOS del cliente. */
export async function subirDesdeUrl(
  db: Db,
  input: { clientId: string; clienteNombre: string; url: string; nombreArchivo: string; destino: "placas" | "videos" },
): Promise<{ id: string; link: string }> {
  const carpetas = await carpetasDe(db, input.clientId, input.clienteNombre);
  // Los reels salen de ffmpeg como file://, y el fetch de Node no soporta ese
  // esquema — se lee del disco.
  let bytes: Buffer;
  let mime = input.destino === "videos" ? "video/mp4" : "image/png";
  if (input.url.startsWith("file://")) {
    bytes = readFileSync(fileURLToPath(input.url));
  } else {
    const r = await fetch(input.url);
    if (!r.ok) throw new Error(`no se pudo bajar el archivo (${r.status})`);
    bytes = Buffer.from(await r.arrayBuffer());
    if (input.destino === "placas") mime = r.headers.get("content-type") ?? "image/png";
  }
  return subirBytes(bytes, input.nombreArchivo, carpetas[input.destino], mime);
}

const limpiarNombre = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").slice(0, 90);

/** Sube una foto de producto / avatar (base64 o data URI) a PRODUCTOS. */
export async function subirImagenDeReferencia(
  db: Db,
  input: { clientId: string; clienteNombre: string; base64: string; nombreArchivo: string },
): Promise<{ id: string; link: string }> {
  const carpetas = await carpetasDe(db, input.clientId, input.clienteNombre, ["PLACAS", "VIDEOS", "PRODUCTOS"]);
  const m = input.base64.match(/^data:([^;]+);base64,(.*)$/s);
  const mime = m?.[1] ?? "image/png";
  const crudo = m?.[2] ?? input.base64;
  const bytes = Buffer.from(crudo, "base64");
  if (bytes.length === 0) throw new Error("la imagen vino vacía");
  // 7MB de imagen ≈ 9.3MB en base64, justo abajo del límite de 10mb del
  // express.json de app.ts. Más grande y el request se rechaza sin mensaje útil.
  if (bytes.length > 7 * 1024 * 1024) throw new Error("la imagen supera 7MB — achicala antes de subirla");
  return subirBytes(bytes, limpiarNombre(input.nombreArchivo), carpetas.productos ?? carpetas.carpeta, mime);
}

/** Baja un archivo de Drive. Se usa para el proxy del panel y para pasarle las
 *  referencias a Higgsfield sin hacerlas públicas. */
export async function bajarDeDrive(fileId: string): Promise<{ bytes: Buffer; mime: string }> {
  const t = await token();
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.ok) throw new Error(`Drive download ${r.status}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") ?? "application/octet-stream" };
}

/** Deja la imagen en un archivo temporal y devuelve la ruta: la CLI de
 *  Higgsfield sube los paths locales sola. */
export async function referenciaLocal(fileId: string, nombre = "ref.png"): Promise<string> {
  const { bytes } = await bajarDeDrive(fileId);
  const dir = mkdtempSync(join(tmpdir(), "lmtm-ref-"));
  const ruta = join(dir, limpiarNombre(nombre));
  writeFileSync(ruta, bytes);
  return ruta;
}

/** Extrae el fileId de un link de Drive (…/file/d/<id>/view). */
export function fileIdDeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/\/file\/d\/([A-Za-z0-9_-]{20,})/) ?? link.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m?.[1] ?? null;
}
