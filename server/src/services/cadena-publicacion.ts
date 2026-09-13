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
import { getRedesCalendar } from "./clickup-sync.js";
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

/** Cuánto futuro tiene que haber cargado para no avisar. Con menos que esto el
 *  cliente se queda sin contenido antes de que nadie lo note. */
export const DIAS_CALENDARIO_MINIMO = 7;

export type Eslabon =
  | "sin_destino"
  | "sin_calendario"
  | "contenido_incompleto"
  | "despachador_mudo"
  | "red_muda"
  | "sync_ciego";

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
  /** Posts con fecha de acá en adelante. null = no se pudo leer ClickUp, y en
   *  ese caso no se acusa: no ver no es lo mismo que no haber. */
  postsFuturos: number | null;
  /** De esos, cuántos pasarían las compuertas hoy (aprobado + copy + pieza). */
  postsFuturosListos: number | null;
}

/**
 * El diagnóstico de un cliente: devuelve EL PRIMER eslabón roto, o null si la
 * cadena está sana. El orden importa — si no hay destino, que la red esté muda
 * es consecuencia y reportar las dos cosas manda a buscar donde no es.
 */
export function diagnosticar(e: EstadoCliente): Eslabon | null {
  if (!e.tieneDestino) return "sin_destino";
  // El contenido va ANTES del despacho porque es su causa: un despachador mudo
  // con el calendario vacío no es un problema de Make, y mandar a revisar el
  // escenario es hacer perder la tarde. Medido el 11/9/26: COSA PROPIEDADES
  // tenía 11 posts programados y ninguno completo — todos se iban a descartar
  // en silencio, con la tarea igual etiquetada como enviada.
  if (e.postsFuturos !== null) {
    if (e.postsFuturos === 0) return "sin_calendario";
    if (e.postsFuturosListos === 0) return "contenido_incompleto";
  }
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

    // Lo que viene: sin esto solo se ve el pasado, y un cliente con el
    // calendario vacío o con los posts a medio cargar aparece sano hasta que
    // deja de publicar. Si ClickUp falla queda en null y NO se acusa.
    let futuros: number | null = null;
    let listos: number | null = null;
    let proximo: string | null = null;
    let falta: string[] = [];
    try {
      const cal = await getRedesCalendar(db, c.id, Date.now(), Date.now() + 30 * DIA);
      if (cal) {
        futuros = cal.length;
        const ok = cal.filter((p) => p.readyToPublish);
        listos = ok.length;
        proximo = cal[0]?.date?.slice(0, 10) ?? null;
        falta = [...new Set(cal.flatMap((p) => p.missing))];
      }
    } catch (e) {
      console.warn(`[cadena] no se pudo leer el calendario de ${c.name}:`, e instanceof Error ? e.message : e);
    }

    const eslabon = diagnosticar({
      tieneDestino: Boolean(destino),
      diasDesdeDespacho: dDespacho,
      tieneSyncOrganico: tieneSync,
      diasDesdeSync: dSync,
      diasDesdeUltimoPost: dRed,
      postsFuturos: futuros,
      postsFuturosListos: listos,
    });
    if (!eslabon) continue;

    const diasSin = eslabon === 'sin_destino' || eslabon === 'sin_calendario' || eslabon === 'contenido_incompleto' ? null
      : eslabon === 'despachador_mudo' ? dDespacho
      : eslabon === 'sync_ciego' ? dSync : dRed;
    rotas.push({
      clientId: c.id, cliente: c.name, eslabon, diasSin,
      detalle: DETALLE[eslabon]({ dDespacho, dSync, dRed, futuros, listos, proximo, falta }),
    });
  }

  return { rotas, revisados: activos.length, ciego: false };
}

interface Contexto {
  dDespacho: number | null; dSync: number | null; dRed: number | null;
  futuros?: number | null; listos?: number | null; proximo?: string | null; falta?: string[];
}

/** El detalle dice QUÉ mirar, no solo que algo falla: cada eslabón se arregla
 *  en un lugar distinto y sin esto el equipo abre el escenario equivocado. */
const DETALLE: Record<Eslabon, (c: Contexto) => string> = {
  sin_destino: () =>
    "No está en el datastore de Make: el despachador no tiene a dónde mandarle los posts. Todo lo que se le programe se descarta en silencio.",
  sin_calendario: (c) =>
    `No tiene ningún post con fecha de acá en adelante${c.dDespacho !== null ? ` (el último despacho fue hace ${c.dDespacho} días)` : ""}. No hay nada que publicar: se carga en la planilla del cliente, no en ClickUp — el script nocturno pisa lo que se edite acá.`,
  contenido_incompleto: (c) =>
    `Tiene ${c.futuros} posts programados y ninguno va a salir: les falta ${c.falta?.length ? c.falta.join(" / ") : "aprobación, copy o pieza"}. El primero es el ${c.proximo ?? "próximo"}. Al llegar la fecha el despachador los descarta en silencio y la tarea igual queda etiquetada como enviada — hay que completarlos ANTES, aprobar después no sirve.`,
  despachador_mudo: (c) =>
    c.dDespacho === null
      ? "Tiene destino y contenido listo, pero Make nunca despachó un post. Revisar la automatización de ClickUp de su lista de Redes."
      : `Make no despacha hace ${c.dDespacho} días y sí hay contenido listo por delante: el problema está en el caño, no en la carga.`,
  sync_ciego: (c) =>
    `El sync orgánico de este cliente no trae datos hace ${c.dSync ?? "siempre"} días. No sabemos si publica o no — arreglar el sync antes de sacar conclusiones (suele ser el token o el permiso de la página).`,
  red_muda: (c) =>
    `Make despachó hace ${c.dDespacho} días y el sync está al día, pero en la red no aparece nada hace ${c.dRed}. Make dice que salió y no salió: revisar los adjuntos de la tarea y el escenario del cliente.`,
};

const TITULO: Record<Eslabon, string> = {
  sin_destino: "🚫 Sin destino en Make — lo que se les programe no va a ningún lado",
  sin_calendario: "📭 Sin calendario cargado — se quedan sin publicar",
  contenido_incompleto: "⏳ Tienen calendario pero ningún post está completo",
  despachador_mudo: "🔇 Make no despacha hace días",
  red_muda: "👻 Make dice que publicó y en la red no está",
  sync_ciego: "🙈 Sync orgánico parado — no estamos viendo si publican",
};

// ── Precondición: no producir hacia un caño roto ───────────────────────────
//
// Un colega no escribe posts todo el mes para un cliente cuyo canal de
// publicación no existe: arregla el caño primero. Hoy la flota le genera
// contenido a 15 clientes que no tienen destino en Make, y ese contenido se
// descarta en silencio. Esto se consulta ANTES de producir.

/** El listado de destinos cambia poco y la precondición se consulta una vez por
 *  cliente: sin este caché, generar para 59 clientes son 59 llamadas a Make. */
const CACHE_MS = 5 * 60_000;
let cacheDestinos: { at: number; valor: Awaited<ReturnType<typeof makeDestinos>> } | null = null;

async function destinosCacheados(): Promise<Awaited<ReturnType<typeof makeDestinos>>> {
  if (cacheDestinos && Date.now() - cacheDestinos.at < CACHE_MS) return cacheDestinos.valor;
  const valor = await makeDestinos();
  cacheDestinos = { at: Date.now(), valor };
  return valor;
}

export interface Precondicion {
  listo: boolean;
  motivo: string;
  /** null cuando la cadena está sana o cuando no se pudo verificar. */
  eslabon: Eslabon | null;
  /** true = no se pudo comprobar. Se deja producir: frenar la agencia entera
   *  porque Make no contesta sería peor que el problema que esto evita. */
  sinVerificar: boolean;
}

/**
 * ¿Tiene sentido producir contenido para este cliente?
 *
 * Solo mira el eslabón que hace inútil producir: si no hay destino, lo que se
 * genere se descarta. Que el despachador esté callado o que el sync esté ciego
 * NO frena la producción — son problemas a resolver, pero el contenido que se
 * genere mientras tanto sí va a salir cuando se destrabe.
 */
export async function puedeProducir(db: Db, clientId: string): Promise<Precondicion> {
  if (!makeConfigured()) {
    return { listo: true, motivo: "Make no está configurado: no se puede verificar, se deja producir.", eslabon: null, sinVerificar: true };
  }
  const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c) return { listo: false, motivo: "No existe ese cliente.", eslabon: null, sinVerificar: false };

  let destinos: Awaited<ReturnType<typeof makeDestinos>>;
  try {
    destinos = await destinosCacheados();
  } catch (e) {
    console.warn("[cadena] precondición sin verificar:", e instanceof Error ? e.message : e);
    return { listo: true, motivo: "No se pudo leer Make: se deja producir.", eslabon: null, sinVerificar: true };
  }
  if (destinos.length === 0) {
    return { listo: true, motivo: "El datastore de Make vino vacío: se deja producir.", eslabon: null, sinVerificar: true };
  }

  const objetivo = norm(c.name);
  if (destinos.some((d) => norm(d.cliente) === objetivo)) {
    return { listo: true, motivo: "Tiene destino de publicación configurado.", eslabon: null, sinVerificar: false };
  }
  return {
    listo: false,
    eslabon: "sin_destino",
    sinVerificar: false,
    motivo: `${c.name} no tiene destino de publicación en Make: cualquier contenido que se le genere se va a descartar en silencio al llegar su fecha. Antes de producir hay que darlo de alta en el datastore de destinos (y crearle el escenario si no lo tiene).`,
  };
}

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
