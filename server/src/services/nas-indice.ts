// LMTM-OS: índice del NAS (plan 15/11, fase 3).
//
// Hasta acá el NAS solo se podía recorrer carpeta por carpeta (PROPFIND de
// profundidad 1): para encontrar «los videos de la fábrica de MONDINO» un agente
// gastaba 10 o 20 llamadas, o no lo encontraba. Ahora:
//  - todas las noches se recorre la carpeta de cada cliente (clients.metadata.nas)
//    y se guarda la lista de archivos en client_context_cache (source «nas-indice»);
//  - buscarEnNas busca por palabras en la ruta y el nombre (sin acentos), por
//    cliente o en todos, y filtra por tipo.
// Lo que se VE en cada video no se indexa de entrada (cuesta): se describe a pedido
// con nas_bajar + video_describir (tope de gasto del plan: USD 20 por mes).

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { clientContextCache, clients } from "@paperclipai/db";
import { listarNas, nasConfigurado, type ItemNas } from "./nas.js";

export const FUENTE_INDICE = "nas-indice";
export type TipoArchivo = "video" | "foto" | "audio" | "diseño" | "documento" | "otro";
export interface ArchivoNas { ruta: string; nombre: string; tipo: TipoArchivo; mb: number | null; fecha: string | null }

export function tipoDe(nombre: string): TipoArchivo {
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(nombre)?.[1] ?? "").toLowerCase();
  if (/^(mp4|mov|mxf|avi|mkv|m4v|mts|webm|3gp)$/.test(ext)) return "video";
  if (/^(jpe?g|png|webp|heic|heif|tiff?|gif|dng|cr2|cr3|nef|arw|raw)$/.test(ext)) return "foto";
  if (/^(mp3|wav|m4a|aac|ogg|flac|aiff?)$/.test(ext)) return "audio";
  if (/^(psd|ai|eps|svg|indd|prproj|aep|drp|fcpxml|xd|fig|sketch)$/.test(ext)) return "diseño";
  if (/^(pdf|docx?|xlsx?|pptx?|txt|csv|key|pages)$/.test(ext)) return "documento";
  return "otro";
}

/** Carpetas que el QNAP llena solo (papelera, miniaturas, snapshots): no se recorren. */
export const esCarpetaDeSistema = (nombre: string) =>
  /^(@|\.)|^(#recycle|\$recycle\.bin|system volume information)$/i.test(nombre) ||
  // Cachés de los editores (Premiere, After Effects, Resolve): miles de archivos que no son material (15/11).
  /^(adobe premiere pro (video|audio) previews|adobe premiere pro auto-save|media cache( files)?|peak files|motion graphics template media|render files|cachéclip|cacheclip|proxy|proxies)$/i.test(nombre) ||
  / masks$/i.test(nombre);

/** Minúsculas, sin acentos, separadores como espacios. Pura. */
export const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-./\\()[\],+]+/g, " ").replace(/\s+/g, " ").trim();

/** Puntaje de un archivo contra las palabras buscadas (0 = no sirve: falta alguna). Pura. */
export function puntaje(a: Pick<ArchivoNas, "ruta" | "nombre">, palabras: string[]): number {
  if (!palabras.length) return 1;
  const ruta = normalizar(a.ruta);
  const nombre = normalizar(a.nombre);
  let p = 0;
  for (const w of palabras) {
    if (!ruta.includes(w)) return 0;
    p += nombre.includes(w) ? 3 : 1;
  }
  return p;
}

/**
 * Recorre una carpeta del NAS entera (en anchura), con topes para no colgarse
 * con una carpeta gigante. `listar` se inyecta para poder probarlo.
 */
export async function rastrear(
  raiz: string,
  o: { maxCarpetas?: number; maxArchivos?: number; esperaReintentoMs?: number; listar?: (ruta: string) => Promise<ItemNas[]> } = {},
): Promise<{ archivos: ArchivoNas[]; carpetas: number; recortado: boolean; errores: string[] }> {
  const listar = o.listar ?? listarNas;
  const maxCarpetas = o.maxCarpetas ?? 3000;
  const maxArchivos = o.maxArchivos ?? 40_000;
  const cola = [raiz];
  const archivos: ArchivoNas[] = [];
  const errores: string[] = [];
  let carpetas = 0;
  while (cola.length && carpetas < maxCarpetas && archivos.length < maxArchivos) {
    // De a 3 carpetas por vez: el NAS va por Tailscale userspace y no aguanta mucho más.
    const tanda = cola.splice(0, 3);
    const res = await Promise.all(tanda.map(async (c) => {
      try { return await listar(c); } catch {
        // El NAS devuelve 502 suelto cuando está cargado: un reintento a los 2 s.
        await new Promise((r) => setTimeout(r, o.esperaReintentoMs ?? 2000));
        try { return await listar(c); } catch (e) { errores.push(`${c}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)); return []; }
      }
    }));
    carpetas += tanda.length;
    for (const items of res) for (const i of items) {
      if (i.carpeta) { if (!esCarpetaDeSistema(i.nombre)) cola.push(i.ruta); continue; }
      if (esCarpetaDeSistema(i.nombre) || /^(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(i.nombre)) continue;
      archivos.push({ ruta: i.ruta, nombre: i.nombre, tipo: tipoDe(i.nombre), mb: i.mb, fecha: i.modificado ? new Date(i.modificado).toISOString().slice(0, 10) : null });
    }
  }
  return { archivos: archivos.slice(0, maxArchivos), carpetas, recortado: cola.length > 0 || archivos.length >= maxArchivos, errores: errores.slice(0, 20) };
}

/** Reindexa el NAS de un cliente (o de todos los que tienen carpeta). */
export async function reindexarNas(db: Db, o: { clientId?: string; soloFaltantes?: boolean } = {}): Promise<Array<{ cliente: string; archivos: number; videos: number; fotos: number; carpetas: number; recortado: boolean; errores: number }>> {
  const falta = nasConfigurado();
  if (falta) throw new Error(falta);
  const lista = await db.select({ id: clients.id, name: clients.name, metadata: clients.metadata }).from(clients)
    .where(o.clientId ? eq(clients.id, o.clientId) : and(
      eq(clients.status, "active"),
      sql`jsonb_array_length(coalesce(${clients.metadata}->'nas', '[]'::jsonb)) > 0`,
      ...(o.soloFaltantes ? [sql`not exists (select 1 from client_context_cache x where x.client_id = ${clients.id} and x.source = ${FUENTE_INDICE})`] : []),
    ));
  const out = [];
  for (const c of lista) {
    const raices = ((c.metadata as { nas?: unknown } | null)?.nas as string[] | undefined) ?? [];
    if (!raices.length) continue;
    const archivos: ArchivoNas[] = [];
    let carpetas = 0, recortado = false;
    const errores: string[] = [];
    for (const r of raices) {
      const x = await rastrear(r);
      archivos.push(...x.archivos); carpetas += x.carpetas; recortado ||= x.recortado; errores.push(...x.errores);
    }
    const payload = { actualizado: new Date().toISOString(), raices, carpetas, recortado, errores, archivos };
    await db.insert(clientContextCache).values({ clientId: c.id, source: FUENTE_INDICE, externalId: raices[0]!, payload, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: [clientContextCache.clientId, clientContextCache.source], set: { payload, externalId: raices[0]!, fetchedAt: new Date(), updatedAt: new Date() } });
    out.push({ cliente: c.name.trim(), archivos: archivos.length, videos: archivos.filter((a) => a.tipo === "video").length, fotos: archivos.filter((a) => a.tipo === "foto").length, carpetas, recortado, errores: errores.length });
  }
  return out;
}

export interface Encontrado extends ArchivoNas { cliente: string; clientId: string }

/** Busca en el índice por palabras (todas tienen que estar en la ruta). */
export async function buscarEnNas(db: Db, o: { q: string; clientIds?: string[]; tipo?: TipoArchivo | null; limite?: number }): Promise<{ resultados: Encontrado[]; total: number; indices: Array<{ cliente: string; actualizado: string | null; archivos: number }> }> {
  // ponytail: jsonb_array_elements sobre todo el índice (2-4 s con 130 mil archivos, 15/11); si pasa de
  // ~10 s, mudar el índice a una tabla propia con un índice trigram sobre la ruta normalizada.
  // El filtro grueso va en la base (el índice entero pesa megas: traerlo en cada búsqueda era caro);
  // el puntaje fino, acá. La ruta se normaliza igual que `normalizar` (minúsculas, sin acentos).
  const palabras = normalizar(o.q).split(" ").filter((w) => w.length >= 2);
  const filtroCliente = o.clientIds?.length ? sql`and x.client_id in (${sql.join(o.clientIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const rutaNorm = sql`translate(lower(a->>'ruta'), 'áéíóúüñàèìòùâêîôû_-./\\()[],+', 'aeiouunaeiouaeiou           ')`;
  const condiciones = palabras.map((w) => sql`and ${rutaNorm} like ${"%" + w + "%"}`);
  const r = await db.execute(sql`
    select x.client_id, c.name cliente, a.value archivo
    from client_context_cache x join clients c on c.id = x.client_id, jsonb_array_elements(x.payload->'archivos') a
    where x.source = ${FUENTE_INDICE} ${filtroCliente} ${o.tipo ? sql`and a->>'tipo' = ${o.tipo}` : sql``} ${sql.join(condiciones, sql` `)}
    limit 5000`);
  const filasBusqueda = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<{ client_id: string; cliente: string; archivo: ArchivoNas }>;
  const todos: Array<Encontrado & { p: number }> = [];
  for (const f of filasBusqueda) {
    const p = puntaje(f.archivo, palabras);
    if (p > 0) todos.push({ ...f.archivo, cliente: String(f.cliente).trim(), clientId: f.client_id, p });
  }
  const filas = await db.select({ clientId: clientContextCache.clientId, cliente: clients.name, actualizado: sql<string | null>`${clientContextCache.payload}->>'actualizado'`, archivos: sql<number>`jsonb_array_length(coalesce(${clientContextCache.payload}->'archivos', '[]'::jsonb))` })
    .from(clientContextCache).innerJoin(clients, eq(clients.id, clientContextCache.clientId))
    .where(and(eq(clientContextCache.source, FUENTE_INDICE), ...(o.clientIds?.length ? [inArray(clientContextCache.clientId, o.clientIds)] : [])));
  todos.sort((a, b) => b.p - a.p || String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")));
  return {
    resultados: todos.slice(0, Math.min(200, o.limite ?? 40)).map(({ p: _p, ...r }) => r),
    total: todos.length,
    indices: filas.map((f) => ({ cliente: f.cliente.trim(), actualizado: f.actualizado, archivos: Number(f.archivos) })),
  };
}

/** Todas las noches (04:00 a 05:00 de Argentina), una vez por día. */
export function initNasIndice(db: Db): void {
  if (nasConfigurado()) return;
  const tick = async () => {
    const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false }).format(new Date()));
    if (hora !== 4) return;
    const { tocaHoy } = await import("./una-vez-por-dia.js");
    if (!(await tocaHoy(db, "nas-indice"))) return;
    try {
      const r = await reindexarNas(db);
      console.log(`[nas-indice] ${r.length} clientes, ${r.reduce((t, x) => t + x.archivos, 0)} archivos`);
    } catch (e) {
      console.warn("[nas-indice] falló:", e instanceof Error ? e.message : e);
    }
  };
  setInterval(() => void tick(), 15 * 60_000).unref();
  // Los clientes que todavía no tienen índice (un cliente nuevo, o un deploy que cortó la
  // pasada): a los 3 minutos de arrancar, sin esperar a la noche.
  setTimeout(async () => {
    try {
      const r = await reindexarNas(db, { soloFaltantes: true });
      if (!r.length) return;
      console.log(`[nas-indice] clientes sin índice: ${r.length}, ${r.reduce((t, x) => t + x.archivos, 0)} archivos`);
    } catch (e) {
      console.warn("[nas-indice] primer índice falló:", e instanceof Error ? e.message : e);
    }
  }, 3 * 60_000).unref();
}
