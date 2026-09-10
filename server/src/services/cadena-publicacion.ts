// LMTM-OS: verificador de la cadena de publicación, punta a punta.
//
// La regla que ya estaba escrita en el mapa de la agencia pero no implementada
// en ningún lado: **para dar algo por funcionando hay que medir el EFECTO, no
// el estado de la corrida**. Siete sistemas distintos reportan verde sin haber
// hecho nada — Apps Script termina COMPLETED sin escribir una fila, Make marca
// SUCCESS con el filtro cortando todo aguas abajo, y la etiqueta "mandado a
// make" la pone ClickUp ANTES de que Make haga nada.
//
// El caso testigo: MAERS, 28/8 al 5/9/26. Escenario activo, ejecuciones en
// SUCCESS, etiqueta puesta en todas las tareas, cero misses en la auditoría —
// y ocho días sin publicar. `publication-monitor.ts` no lo podía ver porque
// trata la etiqueta como prueba de publicación ("never flag it").
//
// Acá se miran solo señales que alguien tuvo que producir de verdad:
//   destino     → el cliente está en el datastore que lee el despachador
//   despacho    → "Last sent date", que lo escribe MAKE al despachar
//   red         → organic_posts, que es lo que la red devuelve al sync
//
// Se reporta EL PRIMER eslabón roto, no todos: si no hay destino, que la red
// esté muda es consecuencia, no un problema aparte. Un diagnóstico por cliente.

import type { Db } from "@paperclipai/db";
import { clients, organicPosts } from "@paperclipai/db";
import { eq, sql } from "drizzle-orm";
import { makeConfigured, makeDestinos } from "./make.js";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";

const DIA = 86_400_000;

/** Sin despacho en este tiempo, el caño está frío. Nueve días cubre a un
 *  cliente de una publicación semanal sin acusarlo por un feriado largo. */
export const DIAS_SIN_DESPACHO = 9;
/** Make dice que despachó pero la red no muestra nada. Es el patrón MAERS.
 *  Más corto que el anterior a propósito: acá ya sabemos que hubo intento. */
export const DIAS_DESPACHO_SIN_RED = 5;

/** Nuestro propio sync orgánico dejó de traer datos de ese cliente. Sin esto,
 *  un sync parado se lee como "Make publicó y la red no lo muestra" y manda al
 *  equipo a revisar el escenario equivocado. Medido el 10/9/26: los tres
 *  candidatos a red_muda (Ikigai 70d, TAMARINDO 29d, HANSHI 9d sin sync) eran
 *  todos esto. No ver no es lo mismo que no haber pasado. */
export const DIAS_SYNC_CONFIABLE = 3;

export type Eslabon = "sin_destino" | "despachador_mudo" | "red_muda" | "sync_ciego";

export interface CadenaRota {
  clientId: string;
  cliente: string;
  eslabon: Eslabon;
  detalle: string;
  /** Días desde la última señal honesta de ese eslabón. null = nunca hubo. */
  diasSin: number | null;
}

/** Para parear nombres entre ClickUp/Make/DB, que difieren en mayúsculas,
 *  acentos y espacios ("MA Desarrollos" vs "ma desarrollos"). */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

const dias = (d: Date | null): number | null =>
  d ? Math.floor((Date.now() - d.getTime()) / DIA) : null;

export interface EstadoCliente {
  /** null = el cliente no figura en el datastore de Make. */
  diasDesdeDespacho: number | null | undefined;
  tieneDestino: boolean;
  /** false = el cliente no tiene sync orgánico; no se puede juzgar su red. */
  tieneSyncOrganico: boolean;
  diasDesdeSync: number | null;
  diasDesdeUltimoPost: number | null;
}

/**
 * El diagnóstico de un cliente: devuelve EL PRIMER eslabón roto, o null si la
 * cadena está sana. El orden importa — si no hay destino, que la red esté muda
 * es consecuencia y reportar las dos cosas manda a buscar donde no es.
 */
export function diagnosticar(e: EstadoCliente): Eslabon | null {
  if (!e.tieneDestino) return "sin_destino";
  const d = e.diasDesdeDespacho;
  if (d === null || d === undefined || d > DIAS_SIN_DESPACHO) return "despachador_mudo";
  if (!e.tieneSyncOrganico) return null;
  // No ver no es lo mismo que no haber pasado: se chequea ANTES que la red.
  if (e.diasDesdeSync === null || e.diasDesdeSync > DIAS_SYNC_CONFIABLE) return "sync_ciego";
  if (e.diasDesdeUltimoPost !== null && e.diasDesdeUltimoPost > DIAS_DESPACHO_SIN_RED && e.diasDesdeUltimoPost > d) {
    return "red_muda";
  }
  return null;
}

/**
 * Recorre la cadena de cada cliente activo y devuelve el primer eslabón roto.
 *
 * `ciego: true` cuando no se pudo leer Make: sin esa lectura NO se puede decir
 * que un cliente no tiene destino, y reportar "todo bien" estando ciego es
 * exactamente el verde mentiroso que este módulo existe para matar.
 */
export async function revisarCadena(db: Db): Promise<{ rotas: CadenaRota[]; revisados: number; ciego: boolean }> {
  if (!makeConfigured()) return { rotas: [], revisados: 0, ciego: true };

  let destinos: Awaited<ReturnType<typeof makeDestinos>>;
  try {
    destinos = await makeDestinos();
  } catch (e) {
    console.warn("[cadena] no se pudo leer el datastore de Make:", e instanceof Error ? e.message : e);
    return { rotas: [], revisados: 0, ciego: true };
  }
  if (destinos.length === 0) return { rotas: [], revisados: 0, ciego: true };

  const porCliente = new Map(destinos.map((d) => [norm(d.cliente), d]));

  const activos = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.status, "active"));

  // Última publicación REAL por cliente y cuándo corrió el sync que la trajo.
  // Las dos fechas juntas separan "la red no muestra nada" de "no estamos
  // mirando": sin el synced_at, un sync parado se lee como outage del cliente.
  const red = await db
    .select({
      clientId: organicPosts.clientId,
      ultimo: sql<string | null>`max(${organicPosts.createdTime})`,
      ultimoSync: sql<string | null>`max(${organicPosts.syncedAt})`,
    })
    .from(organicPosts)
    .groupBy(organicPosts.clientId);
  const ultimoEnRed = new Map<string, Date | null>();
  const ultimoSync = new Map<string, Date | null>();
  for (const r of red) {
    if (!r.clientId) continue;
    ultimoEnRed.set(r.clientId, r.ultimo ? new Date(r.ultimo) : null);
    ultimoSync.set(r.clientId, r.ultimoSync ? new Date(r.ultimoSync) : null);
  }

  const rotas: CadenaRota[] = [];
  for (const c of activos) {
    const destino = porCliente.get(norm(c.name));

    const dDespacho = destino ? dias(destino.ultimoEnvio) : null;
    const tieneSync = ultimoEnRed.has(c.id);
    const dSync = tieneSync ? dias(ultimoSync.get(c.id) ?? null) : null;
    const dRed = tieneSync ? dias(ultimoEnRed.get(c.id) ?? null) : null;

    const eslabon = diagnosticar({
      tieneDestino: Boolean(destino),
      diasDesdeDespacho: dDespacho,
      tieneSyncOrganico: tieneSync,
      diasDesdeSync: dSync,
      diasDesdeUltimoPost: dRed,
    });
    if (!eslabon) continue;

    const diasSin = eslabon === 'sin_destino' ? null
      : eslabon === 'despachador_mudo' ? dDespacho
      : eslabon === 'sync_ciego' ? dSync : dRed;
    rotas.push({ clientId: c.id, cliente: c.name, eslabon, diasSin, detalle: DETALLE[eslabon]({ dDespacho, dSync, dRed }) });
  }

  return { rotas, revisados: activos.length, ciego: false };
}

interface Contexto { dDespacho: number | null; dSync: number | null; dRed: number | null }

/** El detalle dice QUÉ mirar, no solo que algo falla: cada eslabón se arregla
 *  en un lugar distinto y sin esto el equipo abre el escenario equivocado. */
const DETALLE: Record<Eslabon, (c: Contexto) => string> = {
  sin_destino: () =>
    "No está en el datastore de Make: el despachador no tiene a dónde mandarle los posts. Todo lo que se le programe se descarta en silencio.",
  despachador_mudo: (c) =>
    c.dDespacho === null
      ? "Tiene destino configurado pero Make nunca despachó un post."
      : `Make no despacha hace ${c.dDespacho} días. O no hay contenido programado, o las compuertas (APROBADO + Copy) lo están frenando.`,
  sync_ciego: (c) =>
    `El sync orgánico de este cliente no trae datos hace ${c.dSync ?? "siempre"} días. No sabemos si publica o no — arreglar el sync antes de sacar conclusiones (suele ser el token o el permiso de la página).`,
  red_muda: (c) =>
    `Make despachó hace ${c.dDespacho} días y el sync está al día, pero en la red no aparece nada hace ${c.dRed}. Make dice que salió y no salió: revisar los adjuntos de la tarea y el escenario del cliente.`,
};

const TITULO: Record<Eslabon, string> = {
  sin_destino: "🚫 Sin destino en Make — lo que se les programe no va a ningún lado",
  despachador_mudo: "🔇 Make no despacha hace días",
  red_muda: "👻 Make dice que publicó y en la red no está",
  sync_ciego: "🙈 Sync orgánico parado — no estamos viendo si publican",
};

/** Aviso diario. Corre en el tick de db-maintenance. */
export async function avisarCadenaRota(db: Db): Promise<{ rotas: number; entregado: boolean }> {
  const { rotas, ciego } = await revisarCadena(db);
  if (ciego) {
    console.warn("[cadena] ciego (Make no respondió) — no se reporta nada para no decir que está todo bien");
    return { rotas: 0, entregado: false };
  }
  if (rotas.length === 0) return { rotas: 0, entregado: false };

  const lineas: string[] = ["*Cadena de publicación — eslabones rotos*", ""];
  for (const eslabon of ["red_muda", "sync_ciego", "sin_destino", "despachador_mudo"] as Eslabon[]) {
    const grupo = rotas.filter((r) => r.eslabon === eslabon);
    if (grupo.length === 0) continue;
    lineas.push(`*${TITULO[eslabon]}*`);
    for (const r of grupo.slice(0, 15)) lineas.push(`• ${r.cliente}${r.diasSin !== null ? ` — ${r.diasSin}d` : ""}`);
    if (grupo.length > 15) lineas.push(`• …y ${grupo.length - 15} más`);
    lineas.push("");
  }
  lineas.push("_Medido sobre efecto real (datastore de Make + posts en la red), no sobre etiquetas._");

  const team = alertsNumber();
  if (!team) return { rotas: rotas.length, entregado: false };
  const r = await sendWhatsAppToNumber(team, lineas.join("\n"));
  return { rotas: rotas.length, entregado: r.ok };
}
