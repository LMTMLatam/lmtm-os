// LMTM-OS: Licitaciones de Mercado Público / ChileCompra (pedido 22/7).
//
// Sync diario: baja las licitaciones ACTIVAS (1 llamada), filtra por keywords
// de servicios que la agencia puede ofertar (marketing, publicidad, redes,
// diseño, video, web, comunicaciones), y para las nuevas trae el detalle
// (throttled: la API pública tolera ~1 req/seg). Quedan como "candidata";
// la rutina del agente curador las pasa a "util" (con el por qué) o
// "descartada". Las vencidas se marcan solas.

import type { Db } from "@paperclipai/db";
import { licitaciones } from "@paperclipai/db";
import { eq, inArray, lt, sql as dsql } from "drizzle-orm";

const API = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json";

function ticket(): string {
  return (process.env.CHILECOMPRA_TICKET ?? "").trim();
}

// Servicios que una agencia de marketing digital puede ofertar. Sobre el
// NOMBRE de la licitación (el listado de activas no trae descripción).
const KEYWORDS = /marketing|publicidad|publicitari|difusi[oó]n|comunicacion|redes sociales|community|audiovisual|video|fotograf|dise[ñn]o gr[aá]fico|dise[ñn]o web|branding|imagen corporativa|sitio web|p[aá]gina web|plataforma digital|contenido digital|campañ|prensa|streaming|piezas gr[aá]fic|medios digitales|posicionamiento|difusion/i;

interface MpListado {
  Cantidad: number;
  Listado: Array<{ CodigoExterno: string; Nombre: string; FechaCierre?: string | null }>;
}

async function mp<T>(params: Record<string, string>): Promise<T> {
  const t = ticket();
  if (!t) throw new Error("CHILECOMPRA_TICKET no configurado en el entorno.");
  const u = new URL(API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("ticket", t);
  const r = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Mercado Público HTTP ${r.status}`);
  return (await r.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncLicitaciones(db: Db, opts: { maxDetalles?: number } = {}): Promise<{ activas: number; matcheadas: number; nuevas: number; vencidas: number }> {
  const maxDetalles = opts.maxDetalles ?? 40;
  const data = await mp<MpListado>({ estado: "activas" });
  const matcheadas = (data.Listado ?? []).filter((l) => KEYWORDS.test(l.Nombre));

  const existentes = new Set(
    (await db.select({ codigo: licitaciones.codigo }).from(licitaciones)).map((r) => r.codigo),
  );
  const nuevasList = matcheadas.filter((l) => !existentes.has(l.CodigoExterno)).slice(0, maxDetalles);

  let nuevas = 0;
  for (const l of nuevasList) {
    try {
      // Detalle (descripción, organismo, montos). Throttle: API pública.
      await sleep(1200);
      const det = await mp<{ Listado: Array<Record<string, unknown>> }>({ codigo: l.CodigoExterno });
      const d = det.Listado?.[0] ?? {};
      const comprador = (d.Comprador ?? {}) as Record<string, unknown>;
      const fechas = (d.Fechas ?? {}) as Record<string, unknown>;
      const cierre = (fechas.FechaCierre ?? l.FechaCierre) as string | null;
      await db.insert(licitaciones).values({
        codigo: l.CodigoExterno,
        nombre: String(d.Nombre ?? l.Nombre),
        descripcion: typeof d.Descripcion === "string" ? d.Descripcion : null,
        organismo: typeof comprador.NombreOrganismo === "string" ? comprador.NombreOrganismo : null,
        region: typeof comprador.RegionUnidad === "string" ? comprador.RegionUnidad.trim() : null,
        moneda: typeof d.Moneda === "string" ? d.Moneda : null,
        montoEstimado: d.MontoEstimado != null && Number.isFinite(Number(d.MontoEstimado)) ? String(d.MontoEstimado) : null,
        fechaPublicacion: typeof fechas.FechaPublicacion === "string" ? new Date(fechas.FechaPublicacion) : null,
        fechaCierre: cierre ? new Date(cierre) : null,
        url: `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(l.CodigoExterno)}`,
        estado: "candidata",
        relevancia: `keyword: ${l.Nombre.match(KEYWORDS)?.[0] ?? ""}`,
        raw: d,
      } as never).onConflictDoNothing();
      nuevas += 1;
    } catch (e) {
      console.warn(`[licitaciones] detalle ${l.CodigoExterno} falló: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Vencidas: cerró la fecha y nunca se resolvieron.
  const venc = await db.update(licitaciones)
    .set({ estado: "vencida", updatedAt: new Date() } as never)
    .where(dsql`${licitaciones.estado} in ('candidata','util') and ${licitaciones.fechaCierre} < now()`)
    .returning({ id: licitaciones.id });

  console.log(`[licitaciones] sync: ${data.Cantidad} activas, ${matcheadas.length} matchean, ${nuevas} nuevas, ${venc.length} vencidas`);
  return { activas: data.Cantidad ?? 0, matcheadas: matcheadas.length, nuevas, vencidas: venc.length };
}

export async function listarLicitaciones(db: Db, estados: string[]): Promise<Array<typeof licitaciones.$inferSelect>> {
  const rows = await db.select().from(licitaciones)
    .where(inArray(licitaciones.estado, estados))
    .orderBy(dsql`${licitaciones.fechaCierre} asc nulls last`)
    .limit(300);
  return rows;
}

export async function marcarLicitacion(db: Db, codigo: string, estado: "util" | "descartada" | "candidata", relevancia?: string): Promise<boolean> {
  const r = await db.update(licitaciones)
    .set({ estado, ...(relevancia ? { relevancia } : {}), updatedAt: new Date() } as never)
    .where(eq(licitaciones.codigo, codigo))
    .returning({ id: licitaciones.id });
  return r.length > 0;
}

// Timer diario (misma mecánica que los otros monitores): corre al arrancar
// (tras 2 min de gracia) y después cada 24 h.
let timer: ReturnType<typeof setInterval> | null = null;
export function initLicitaciones(db: Db): void {
  if (timer) return;
  const run = () => void syncLicitaciones(db).catch((e) => console.warn(`[licitaciones] sync falló: ${e instanceof Error ? e.message : String(e)}`));
  setTimeout(run, 2 * 60_000);
  timer = setInterval(run, 24 * 3_600_000);
}
