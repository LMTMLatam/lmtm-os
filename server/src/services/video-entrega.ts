// LMTM-OS: entrega del video generado — Drive + Cronopost.
//
// Después de que Higgsfield devuelve el mp4 (video-higgsfield.ts), esto lo
// deja donde el equipo ya trabaja:
//   1. sube el archivo a  <carpeta del cliente>/VIDEOS  en el Drive de la
//      agencia (raíz 1pbhjD…, 82 carpetas de cliente, 76 ya tienen VIDEOS;
//      las que no, se crean al vuelo);
//   2. escribe el link en la columna "Imagen o Video" de la fila de esa pieza
//      en la pestaña Cronopost del sheet del cliente.
// Al equipo solo le queda poner "Dia de publicación" (pedido del usuario 12/8).
//
// NUNCA crea filas nuevas ni pisa una celda que ya tenga contenido: si la fila
// no aparece o ya tiene algo cargado, se avisa y listo. El sheet es del equipo.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";

/** Raíz de Drive donde cada cliente tiene su carpeta (pasada por el usuario). */
const RAIZ_CLIENTES = process.env.LMTM_DRIVE_CLIENTES_FOLDER ?? "1pbhjD-G8K95BhJmDjR1E212DnIIVgK9w";
/** Carpeta "Redes -> Click Up": ahí viven los 71 sheets Cronopost. */
const CARPETA_CRONOPOST = process.env.LMTM_DRIVE_REDES_FOLDER ?? "15ZkCu9M2MTi-f3YPTbC1ttNv0DbBcnVQ";

const PESTANA = "Cronopost";
const COL_NOMBRE = "Nombre";
const COL_VIDEO = "Imagen o Video";
const COL_FECHA = "Dia de publicación";

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

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Google ${new URL(url).pathname} → ${r.status}: ${txt.slice(0, 250)}`);
  return (txt ? JSON.parse(txt) : null) as T;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// ── Drive ────────────────────────────────────────────────────────────────────

interface Archivo { id: string; name: string; mimeType: string; webViewLink?: string }

async function hijos(carpetaId: string): Promise<Archivo[]> {
  const out: Archivo[] = [];
  let page: string | undefined;
  do {
    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.searchParams.set("q", `'${carpetaId}' in parents and trashed=false`);
    u.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink)");
    u.searchParams.set("pageSize", "200");
    u.searchParams.set("supportsAllDrives", "true");
    u.searchParams.set("includeItemsFromAllDrives", "true");
    if (page) u.searchParams.set("pageToken", page);
    const j = await api<{ files?: Archivo[]; nextPageToken?: string }>(u.toString());
    out.push(...(j.files ?? []));
    page = j.nextPageToken;
  } while (page);
  return out;
}

/** Mejor coincidencia por nombre normalizado (las carpetas usan guiones bajos
 *  y variantes: "Amoblamientos_Reno" vs cliente "RENO"). */
function mejorMatch<T extends { name: string }>(items: T[], nombre: string): T | null {
  const a = norm(nombre);
  if (!a) return null;
  let exacto: T | null = null, parcial: T | null = null;
  for (const it of items) {
    const b = norm(it.name).replace(/20\d\d$/, "");
    if (b === a) { exacto = it; break; }
    if (!parcial && (b.includes(a) || a.includes(b)) && Math.min(a.length, b.length) >= 4) parcial = it;
  }
  return exacto ?? parcial;
}

/** Carpeta VIDEOS del cliente; la crea si el cliente no la tiene (6 de 82). */
export async function carpetaVideosDe(clienteNombre: string): Promise<{ id: string; carpetaCliente: string } | null> {
  const carpetas = (await hijos(RAIZ_CLIENTES)).filter((f) => f.mimeType.includes("folder"));
  const dueño = mejorMatch(carpetas, clienteNombre);
  if (!dueño) return null;
  const subs = (await hijos(dueño.id)).filter((f) => f.mimeType.includes("folder"));
  const videos = subs.find((f) => /^videos?$/i.test(f.name.trim()));
  if (videos) return { id: videos.id, carpetaCliente: dueño.id };
  const creada = await api<{ id: string }>("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "VIDEOS", mimeType: "application/vnd.google-apps.folder", parents: [dueño.id] }),
  });
  return { id: creada.id, carpetaCliente: dueño.id };
}

/** Baja el mp4 de Higgsfield y lo sube a Drive. Devuelve el link para compartir. */
export async function subirVideoADrive(
  videoUrl: string,
  carpetaId: string,
  nombreArchivo: string,
): Promise<{ id: string; link: string }> {
  // Los reels se arman con ffmpeg en disco y llegan como file:// — el fetch de
  // Node NO soporta ese esquema (tira "unsupported protocol"), así que se lee
  // del filesystem. Los clips sueltos siguen viniendo por http desde Higgsfield.
  let bytes: Buffer;
  if (videoUrl.startsWith("file://")) {
    bytes = readFileSync(fileURLToPath(videoUrl));
  } else {
    const r = await fetch(videoUrl);
    if (!r.ok) throw new Error(`no se pudo bajar el video (${r.status})`);
    bytes = Buffer.from(await r.arrayBuffer());
  }

  const t = await token();
  const meta = { name: nombreArchivo.endsWith(".mp4") ? nombreArchivo : `${nombreArchivo}.mp4`, parents: [carpetaId] };
  const limite = "-------lmtm" + Math.random().toString(36).slice(2);
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${limite}\r\nContent-Type: video/mp4\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": `multipart/related; boundary=${limite}` },
    body: cuerpo as unknown as BodyInit,
  });
  const txt = await up.text();
  if (!up.ok) throw new Error(`Drive upload ${up.status}: ${txt.slice(0, 250)}`);
  const j = JSON.parse(txt) as { id: string; webViewLink?: string };
  return { id: j.id, link: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view` };
}

// ── Cronopost ────────────────────────────────────────────────────────────────

const A1 = (col: number): string => {
  let s = "", n = col + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Sheet Cronopost del cliente. Se cachea en clients.metadata.cronopostSheetId
 *  para no recorrer los 71 archivos en cada video. */
export async function cronopostDe(db: Db, clientId: string, clienteNombre: string): Promise<string | null> {
  const [c] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId));
  const meta = (c?.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.cronopostSheetId === "string" && meta.cronopostSheetId) return meta.cronopostSheetId;
  const files = (await hijos(CARPETA_CRONOPOST)).filter((f) => f.mimeType.includes("spreadsheet"));
  const m = mejorMatch(files, clienteNombre);
  if (!m) return null;
  await db.update(clients).set({ metadata: { ...meta, cronopostSheetId: m.id } }).where(eq(clients.id, clientId));
  return m.id;
}

export interface ResultadoSheet { ok: boolean; fila?: number; motivo?: string; creada?: boolean }

/**
 * Escribe el link en "Imagen o Video" de la fila cuya columna "Nombre" coincide
 * con el título de la pieza. No crea filas ni pisa contenido existente.
 */
export async function escribirEnCronopost(
  sheetId: string,
  nombrePieza: string,
  link: string,
  extra?: { copy?: string | null; tipo?: string | null; cliente?: string | null; pisar?: boolean },
): Promise<ResultadoSheet> {
  const rango = `${encodeURIComponent(PESTANA)}!A1:Z2000`;
  const datos = await api<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rango}`,
  );
  const filas = datos.values ?? [];
  if (filas.length === 0) return { ok: false, motivo: "la pestaña Cronopost está vacía" };

  const headers = filas[0].map((h) => norm(String(h)));
  const iNombre = headers.indexOf(norm(COL_NOMBRE));
  const iVideo = headers.indexOf(norm(COL_VIDEO));
  if (iNombre < 0 || iVideo < 0) return { ok: false, motivo: `la planilla no tiene las columnas "${COL_NOMBRE}"/"${COL_VIDEO}"` };

  const objetivo = norm(nombrePieza);
  const candidatas: number[] = [];
  for (let i = 1; i < filas.length; i++) {
    if (norm(String(filas[i][iNombre] ?? "")) === objetivo) candidatas.push(i);
  }
  if (candidatas.length > 1) return { ok: false, motivo: `hay ${candidatas.length} filas llamadas "${nombrePieza}" — no toco ninguna` };

  if (candidatas.length === 0) {
    // Las piezas de Super Redes se llaman con el título de la idea y todavía no
    // están en el calendario, así que NO tienen fila. Antes se avisaba "pegalo
    // a mano" y el equipo quedaba con trabajo manual justo en lo que veníamos a
    // resolver (14/8). Ahora se agrega la fila con lo que sabemos y la fecha
    // queda vacía: al equipo le sigue quedando solo poner "Dia de publicación".
    const nueva: string[] = [];
    const poner = (col: string, valor: string | null | undefined) => {
      if (!valor) return;
      const i = headers.indexOf(norm(col));
      if (i < 0) return;
      while (nueva.length <= i) nueva.push("");
      nueva[i] = valor;
    };
    poner(COL_NOMBRE, nombrePieza);
    poner(COL_VIDEO, link);
    poner("Copy o/y Subtitulo", extra?.copy ?? null);
    poner("Tipo de Contenido", extra?.tipo ?? null);
    poner("Empresa", extra?.cliente ?? null);
    poner("Cliente", extra?.cliente ?? null);
    await api(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`${PESTANA}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [nueva] }) },
    );
    return { ok: true, fila: filas.length + 1, creada: true };
  }

  const fila = candidatas[0];
  const actual = String(filas[fila][iVideo] ?? "").trim();
  // Regenerar a mano (forzar) SÍ pisa: si no, la celda queda con el link de la
  // versión anterior y el equipo cree que no se actualizó (14/8).
  if (actual && !extra?.pisar) return { ok: false, fila: fila + 1, motivo: `la celda ya tenía contenido, no la piso` };

  const celda = `${PESTANA}!${A1(iVideo)}${fila + 1}`;
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(celda)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: [[link]] }) },
  );
  return { ok: true, fila: fila + 1 };
}

export interface EntregaResultado {
  driveLink?: string;
  driveError?: string;
  /** Resultado de escribir el campo "Enlace de publicacion" de la tarea.
   *  Reemplazó al Cronopost el 18/8 — ver escribirEnlacePublicacion. */
  enlace?: ResultadoEnlace;
}

/** Orquesta las dos patas. Cada una falla por separado: si Drive anda pero el
 *  sheet no, el equipo igual tiene el archivo donde va. */
export async function entregarVideo(
  db: Db,
  input: {
    clientId: string; clienteNombre: string; nombrePieza: string; videoUrl: string;
    /** La tarea de ClickUp donde va el enlace. */
    taskId?: string;
    copy?: string | null; tipo?: string | null; pisar?: boolean;
  },
): Promise<EntregaResultado> {
  const out: EntregaResultado = {};

  let link: string | undefined;
  try {
    // Desde el 14/8 todo va a "super redes/<cliente>/VIDEOS" (decisión del
    // usuario: no usar las carpetas viejas). Las placas usan la misma raíz, así
    // que video e imagen quedan juntos en la carpeta del cliente.
    const { subirDesdeUrl } = await import("./contenido-drive.js");
    const limpio = input.nombrePieza.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
    const sello = new Date().toISOString().slice(0, 10);
    const r = await subirDesdeUrl(db, {
      clientId: input.clientId, clienteNombre: input.clienteNombre,
      url: input.videoUrl, nombreArchivo: `${limpio} — ${sello}.mp4`, destino: "videos",
    });
    link = r.link;
    out.driveLink = r.link;
  } catch (e) {
    out.driveError = (e instanceof Error ? e.message : String(e)).slice(0, 250);
  }

  // El link va al campo "Enlace de publicacion" de la MISMA tarea, no al
  // Cronopost: la tarea ya es la pieza, así que no hay fila que buscar ni que
  // crear en una planilla que el equipo edita a mano (cambio pedido 18/8).
  if (input.taskId) {
    out.enlace = await escribirEnlacePublicacion(input.taskId, link ?? input.videoUrl, { pisar: input.pisar });
  }

  return out;
}

export const COLUMNA_FECHA = COL_FECHA;

// ── Enlace de publicación en ClickUp ─────────────────────────────────────────
//
// Reemplaza la escritura en el Cronopost (decisión del usuario 18/8: "no
// escribir en el sheet, sino completar el campo enlace de publicacion de
// clickup en su lugar").
//
// Por qué es mejor: el sheet obligaba a encontrar la fila de la pieza por
// nombre —y si no existía, a crearla— o sea adivinar dónde va algo en una
// planilla que el equipo edita a mano. La tarea de ClickUp, en cambio, ES la
// pieza: no hay nada que buscar ni que crear, y el link queda donde el equipo
// ya está trabajando.

/** El campo se llama "Enlace de publicacion" (sin tilde) y es short_text. Se
 *  resuelve por NOMBRE y no por id: el id puede variar entre spaces y romper en
 *  silencio en los clientes que no comparten configuración. */
const CAMPO_ENLACE = /enlace de publicaci[oó]n/i;

export interface ResultadoEnlace {
  ok: boolean;
  /** Qué se escribió, para poder mostrarlo en el comentario. */
  valor?: string;
  motivo?: string;
}

/**
 * Deja el link del contenido generado en el campo "Enlace de publicacion" de la
 * tarea.
 *
 * NO pisa un valor que ya esté cargado salvo que se pida explícitamente: si el
 * equipo ya publicó y pegó el link real del posteo, el nuestro no debe taparlo.
 */
export async function escribirEnlacePublicacion(
  taskId: string,
  link: string,
  opts: { pisar?: boolean } = {},
): Promise<ResultadoEnlace> {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) return { ok: false, motivo: "falta CLICKUP_API_TOKEN" };
  const H = { Authorization: token, "Content-Type": "application/json" };

  try {
    const r = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, { headers: H });
    if (!r.ok) return { ok: false, motivo: `no se pudo leer la tarea (${r.status})` };
    const t = (await r.json()) as { custom_fields?: Array<{ id: string; name?: string; value?: unknown }> };
    const campo = (t.custom_fields ?? []).find((f) => CAMPO_ENLACE.test(f.name ?? ""));
    if (!campo) return { ok: false, motivo: 'la lista no tiene el campo "Enlace de publicacion"' };

    const actual = typeof campo.value === "string" ? campo.value.trim() : "";
    if (actual && !opts.pisar) {
      return { ok: false, motivo: "el campo ya tenía un enlace cargado (no se pisó)" };
    }

    const w = await fetch(
      `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/field/${encodeURIComponent(campo.id)}`,
      { method: "POST", headers: H, body: JSON.stringify({ value: link }) },
    );
    if (!w.ok) return { ok: false, motivo: `ClickUp rechazó la escritura (${w.status}): ${(await w.text()).slice(0, 150)}` };
    return { ok: true, valor: link };
  } catch (e) {
    return { ok: false, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}
