// LMTM-OS: el tracker de videos del equipo (plan 21/11, doc de Marcos).
//
// El equipo de video lleva un Excel por mes en Drive («TRACKER_NOVIEMBRE.xlsx»):
// la hoja «Resumen» tiene, por cliente, los videos encargados (lo vendido: «ese
// número es la fuente oficial») y los entregados. Acá se lee ESA hoja para ponerla
// en la cuenta del cliente al lado de lo que se mide en Instagram.
//
// Son .xlsx, no planillas de Google: un .xlsx es un zip con XML adentro. Se lee con
// zlib de Node; no se sumó una librería de Excel por una hoja de tres columnas.
// shortcut: lee celdas con valor (texto, número, fórmula ya calculada); no fechas ni
// estilos. Si el tracker cambia de forma, `resumenDeTracker` devuelve [] y la cuenta
// lo muestra como «sin tracker», no como cero.

import { inflateRawSync } from "node:zlib";
import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";

const CARPETA = process.env.LMTM_TRACKER_VIDEO_FOLDER || "1OcvVVReG_bfiUoO-R9-FjcdMxAoTikxr";

/** Los archivos de un zip (método 0 y 8), por nombre. Pura. */
export function leerZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error("no es un zip");
  const cuantos = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0; i < cuantos; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    // El encabezado local repite nombre y extra, con largos que pueden diferir de los del directorio.
    const datos = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const crudo = buf.subarray(datos, datos + comprimido);
    if (metodo === 0) out.set(nombre, crudo);
    else if (metodo === 8) out.set(nombre, inflateRawSync(crudo));
    p += 46 + largoNombre + extra + comentario;
  }
  return out;
}

const texto = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const columna = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const textosDe = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => texto(m[1])).join("");

/** Las filas de una hoja de un .xlsx (la que se llame como `hoja`, o la primera). Pura. */
export function filasDeXlsx(buf: Buffer, hoja: RegExp): string[][] {
  const zip = leerZip(buf);
  const leer = (n: string) => zip.get(n)?.toString("utf8") ?? "";
  const compartidos = [...leer("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textosDe(m[1]));
  const hojas = [...leer("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    nombre: texto(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? ""),
    rid: /\br:id="([^"]*)"/.exec(m[0])?.[1] ?? "",
  }));
  const elegida = hojas.find((h) => hoja.test(h.nombre)) ?? hojas[0];
  if (!elegida) return [];
  const rel = [...leer("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${elegida.rid}"`));
  const destino = /\bTarget="([^"]*)"/.exec(rel ?? "")?.[1];
  if (!destino) return [];
  const xml = leer(destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`);
  const filas: string[][] = [];
  for (const f of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila: string[] = [];
    for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      if (!ref) continue;
      const tipo = /\bt="([^"]*)"/.exec(c[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1];
      fila[columna(ref)] = tipo === "s" ? compartidos[Number(v)] ?? "" : tipo === "inlineStr" ? textosDe(c[2] ?? "") : texto(v ?? "");
    }
    filas.push(Array.from(fila, (x) => x ?? ""));
  }
  return filas;
}

export interface FilaTracker { cliente: string; encargados: number; entregados: number }

/** De la hoja «Resumen»: cliente, videos encargados y entregados. [] si no reconoce la forma. Pura. */
export function resumenDeTracker(filas: string[][]): FilaTracker[] {
  const cab = filas.findIndex((f) => /^cliente$/i.test((f[0] ?? "").trim()) && /videos?\s*enc/i.test(f[1] ?? "") && /entregad/i.test(f[2] ?? ""));
  if (cab < 0) return [];
  const out: FilaTracker[] = [];
  for (const f of filas.slice(cab + 1)) {
    const cliente = (f[0] ?? "").trim();
    if (!cliente || /^totales?$/i.test(cliente)) break;
    const enc = Number(f[1]);
    const ent = Number(f[2]);
    if (!Number.isFinite(enc) || !Number.isFinite(ent)) continue;
    out.push({ cliente, encargados: enc, entregados: ent });
  }
  return out;
}

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** «TRACKER_NOVIEMBRE.xlsx» creado en nov-2026 → «2026-11». El año sale de la fecha de creación (el archivo se arma al empezar el mes). Pura. */
export function mesDeTracker(nombre: string, creado: string): string | null {
  const m = /^TRACKER[_ ]([A-ZÁÉÍÓÚ]+)/i.exec(nombre);
  const i = m ? MESES.indexOf(m[1].toUpperCase()) : -1;
  if (i < 0) return null;
  const f = new Date(creado);
  if (Number.isNaN(f.getTime())) return null;
  // Un tracker de diciembre creado en enero es del año anterior; uno de enero creado en diciembre, del siguiente.
  const anio = f.getUTCFullYear() + (i - f.getUTCMonth() > 6 ? -1 : f.getUTCMonth() - i > 6 ? 1 : 0);
  return `${anio}-${String(i + 1).padStart(2, "0")}`;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * A qué cliente del sistema corresponde un nombre del tracker («Cosa Prop», «Hiper»,
 * «Ramasco»). Igual, o contenido en uno solo; ante dos candidatos NO elige. Pura.
 */
export function clienteDeTracker<T extends { name: string }>(nombre: string, lista: T[]): T | null {
  const n = norm(nombre);
  if (n.length < 3) return null;
  const igual = lista.filter((c) => norm(c.name) === n);
  if (igual.length === 1) return igual[0];
  const contiene = lista.filter((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
  return contiene.length === 1 ? contiene[0] : null;
}

export type VideosPorMes = Map<string, Map<string, { encargados: number; entregados: number }>>;

let guardado: { at: number; valor: VideosPorMes; sinCliente: string[] } | null = null;

/** Por mes («YYYY-MM») y por cliente: videos encargados y entregados según el tracker. Guardado 30 min. */
export async function videosDelTracker(db: Db, meses: string[]): Promise<{ porMes: VideosPorMes; sinCliente: string[] }> {
  if (guardado && Date.now() - guardado.at < 30 * 60_000 && meses.every((m) => guardado!.valor.has(m))) return { porMes: guardado.valor, sinCliente: guardado.sinCliente };
  const { token } = await import("./contenido-drive.js");
  const h = { Authorization: `Bearer ${await token()}` };
  const q = encodeURIComponent(`'${CARPETA}' in parents and trashed = false and name contains 'TRACKER'`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: h });
  if (!r.ok) throw new Error(`Drive ${r.status} al listar los trackers`);
  const archivos = ((await r.json()) as { files?: Array<{ id: string; name: string; createdTime: string }> }).files ?? [];
  const activos = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active"));
  const porMes: VideosPorMes = new Map();
  const sinCliente = new Set<string>();
  for (const mes of meses) {
    porMes.set(mes, new Map());
    const a = archivos.find((x) => mesDeTracker(x.name, x.createdTime) === mes);
    if (!a) continue;
    const d = await fetch(`https://www.googleapis.com/drive/v3/files/${a.id}?alt=media&supportsAllDrives=true`, { headers: h });
    if (!d.ok) throw new Error(`Drive ${d.status} al bajar ${a.name}`);
    for (const f of resumenDeTracker(filasDeXlsx(Buffer.from(await d.arrayBuffer()), /resumen/i))) {
      const c = clienteDeTracker(f.cliente, activos);
      if (!c) { sinCliente.add(f.cliente); continue; }
      porMes.get(mes)!.set(c.id, { encargados: f.encargados, entregados: f.entregados });
    }
  }
  guardado = { at: Date.now(), valor: porMes, sinCliente: [...sinCliente].sort() };
  return { porMes, sinCliente: guardado.sinCliente };
}
