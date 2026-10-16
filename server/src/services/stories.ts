// LMTM-OS: stories de Instagram (pedido del equipo 16/10: "recordatorios si
// hace mucho no salen stories").
//
// El sistema no sabía nada de stories: el feed de la API de Meta no las trae
// y solo muestra las activas (las últimas 24 h). Acá se leen cada 6 horas y
// se guardan en organic_stories; con eso, la regla del motor avisa en Hoy (y
// como tarea) cuando un cliente que hace stories lleva días sin subir una.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, organicStories, syncLogs } from "@paperclipai/db";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { storiesActivas } from "./ads/providers/meta.js";
import type { Propuesta } from "../decisiones/tipos.js";

export const STORIES = {
  cadaHoras: 6,
  /** Días sin una story para avisar. */
  diasSinStory: 3,
  /** Para avisar, el cliente tuvo que subir al menos esta cantidad en 30 días: hace stories. */
  minimasEnElMes: 2,
};
const JOB = "stories:captura";
const DIA = 86_400_000;

/** Lee las stories activas de cada página y guarda las nuevas. */
export async function capturarStories(db: Db): Promise<{ paginas: number; nuevas: number; errores: number }> {
  const filas = await db
    .select({ clientId: adsAccountMappings.clientId, pageId: adsAccountMappings.pageId, token: adsConnections.accessToken })
    .from(adsAccountMappings)
    .innerJoin(adsConnections, eq(adsConnections.id, adsAccountMappings.connectionId))
    .where(and(
      eq(adsAccountMappings.platform, "meta"),
      isNotNull(adsAccountMappings.pageId),
      isNotNull(adsAccountMappings.clientId),
      eq(adsConnections.status, "active"),
    ));
  // Varias cuentas de anuncios comparten página: una lectura por página.
  const porPagina = new Map<string, { clientId: string; token: string }>();
  for (const f of filas) if (f.pageId && f.clientId && !porPagina.has(f.pageId)) porPagina.set(f.pageId, { clientId: f.clientId, token: f.token });

  const leidos: string[] = [];
  let nuevas = 0;
  let errores = 0;
  for (const [pageId, f] of porPagina) {
    try {
      const r = await storiesActivas(f.token, pageId);
      leidos.push(f.clientId);
      const validas = r.stories.filter((s) => s.timestamp);
      if (r.igUserId && validas.length) {
        const ins = await db.insert(organicStories).values(validas.map((s) => ({
          id: s.id,
          clientId: f.clientId,
          pageId,
          igUserId: r.igUserId!,
          mediaType: s.media_type?.toLowerCase() ?? null,
          permalink: s.permalink ?? null,
          publicadaAt: new Date(s.timestamp!),
        }))).onConflictDoNothing().returning({ id: organicStories.id });
        nuevas += ins.length;
      }
    } catch (e) {
      errores += 1;
      console.warn(`[stories] página ${pageId}:`, e instanceof Error ? e.message.slice(0, 200) : e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  // Qué clientes se pudieron leer: sin esto, una lectura que falla parecería
  // "no subió stories" y el aviso sería falso.
  await db.insert(syncLogs).values({
    jobName: JOB, platform: "meta", status: errores ? "partial" : "completed", completedAt: new Date(),
    recordsSynced: nuevas, metadata: { leidos, errores },
  });
  return { paginas: porPagina.size, nuevas, errores };
}

export interface DatoStories { clientId: string; cliente: string; ultima: Date | null; enElMes: number }

/**
 * El recordatorio: un cliente que hace stories (al menos 2 en 30 días) y lleva
 * `diasSinStory` o más sin subir una. Solo para los que se pudieron leer en la
 * última captura. Puro.
 */
export function propuestasStories(datos: DatoStories[], leidos: ReadonlySet<string>, ahora = new Date()): Propuesta[] {
  const out: Propuesta[] = [];
  for (const d of datos) {
    if (!d.ultima || d.enElMes < STORIES.minimasEnElMes || !leidos.has(d.clientId)) continue;
    const dias = Math.floor((ahora.getTime() - d.ultima.getTime()) / DIA);
    if (dias < STORIES.diasSinStory) continue;
    const fecha = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric" }).format(d.ultima);
    out.push({
      clientId: d.clientId,
      tipo: "contenido:sin_stories",
      clave: `contenido:sin_stories:${d.clientId}`,
      que: `Hace ${dias} días que no salen stories de ${d.cliente} en Instagram`,
      porque: {
        resumen: `La última salió el ${fecha}. En los últimos 30 días subió ${d.enElMes}: es una cuenta que hace stories y se cortó.`,
        datos: [
          { etiqueta: "Días sin stories", valor: dias },
          { etiqueta: "Stories en los últimos 30 días", valor: d.enElMes },
        ],
      },
      arsPorDia: null,
      responsable: "equipo",
      creadaPor: "regla:stories",
      accion: {
        tipo: "tarea",
        titulo: `Subir stories — ${d.cliente}`,
        descripcion: `No sale ninguna story en Instagram desde el ${fecha} (${dias} días). Subir al menos una hoy: detrás de escena, una pregunta o reutilizar el último posteo.`,
      },
      venceEnDias: 3,
    });
  }
  return out;
}

/** Lo que necesita la regla, o null si la captura no corrió bien en las últimas 12 horas. */
export async function datosStories(db: Db, ahora = new Date()): Promise<{ datos: Array<Omit<DatoStories, "cliente">>; leidos: Set<string> } | null> {
  const [captura] = await db
    .select({ metadata: syncLogs.metadata })
    .from(syncLogs)
    .where(and(eq(syncLogs.jobName, JOB), gte(syncLogs.completedAt, new Date(ahora.getTime() - 12 * 3600_000))))
    .orderBy(desc(syncLogs.completedAt))
    .limit(1);
  if (!captura) return null;
  const leidos = new Set(((captura.metadata ?? {}) as { leidos?: string[] }).leidos ?? []);
  const filas = await db
    .select({
      clientId: organicStories.clientId,
      ultima: sql<string>`max(${organicStories.publicadaAt})`,
      enElMes: sql<number>`count(*) filter (where ${organicStories.publicadaAt} >= ${new Date(ahora.getTime() - 30 * DIA).toISOString()}::timestamptz)::int`,
    })
    .from(organicStories)
    .where(isNotNull(organicStories.clientId))
    .groupBy(organicStories.clientId);
  return {
    datos: filas.map((f) => ({ clientId: f.clientId as string, ultima: f.ultima ? new Date(f.ultima) : null, enElMes: Number(f.enElMes) })),
    leidos,
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function initStories(db: Db): void {
  if (timer) return;
  const correr = () =>
    capturarStories(db)
      .then((r) => console.log(`[stories] ${r.paginas} páginas, ${r.nuevas} stories nuevas, ${r.errores} errores`))
      .catch((e) => console.warn("[stories] falló la captura:", e instanceof Error ? e.message : e));
  setTimeout(correr, 10 * 60_000);
  timer = setInterval(correr, STORIES.cadaHoras * 3600_000);
  console.log(`[stories] captura cada ${STORIES.cadaHoras} h`);
}
