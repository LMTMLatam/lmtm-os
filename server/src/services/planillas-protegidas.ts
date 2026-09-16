// LMTM-OS: las planillas Cronopost NO se escriben desde acá. Todavía.
//
// POR QUÉ ESTE ARCHIVO EXISTE:
//
// La planilla de Drive MANDA sobre ClickUp. El Apps Script nocturno pisa
// `start_date`, `Dia de publicación` y `Horario` de cada tarea con lo que diga
// el Sheet — reprogramar en ClickUp no sirve, se revierte esa noche. O sea que
// escribir en una de estas planillas no es "agregar una fila": es cambiarle el
// calendario a un cliente, y se propaga solo a las pocas horas.
//
// Los 14 agentes tienen la tool `sheets_append` y están todos en modo acción.
// Alcanza con que uno consiga un spreadsheetId —de un comentario, de Drive, de
// una tarea— para que pueda mover el calendario de un cliente sin que nadie lo
// apruebe. La decisión del usuario el 14/9/26 fue explícita: "todavía no
// activemos lo de escribir en las planillas".
//
// Una decisión así no se sostiene con una convención ni con una línea en una
// skill: el modelo la puede no leer. Se sostiene con un guard en el camino de
// escritura, que es esto.
//
// CUANDO SE HABILITE, que sea con compuerta de aprobación —el mismo patrón que
// ads-actions.ts: propone, un humano aprueba, recién ahí escribe— y no
// borrando este archivo.

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq, isNotNull } from "drizzle-orm";

/** Escape de emergencia, apagado. Existe para poder habilitarlo sin deploy si
 *  algún día hace falta a las tres de la mañana, no para dejarlo prendido. */
const PERMITIDO = process.env.LMTM_PERMITIR_ESCRIBIR_PLANILLAS === "true";

/** Las planillas cambian poco; consultarlas en cada append sería una query por
 *  escritura. Un minuto de caché alcanza y el riesgo es nulo: una planilla que
 *  se acaba de mapear queda protegida un minuto después, no antes de tiempo. */
const TTL_MS = 60_000;
let cache: { at: number; ids: Set<string> } | null = null;

async function planillasDeClientes(db: Db): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids;
  const filas = await db
    .select({ id: clients.sheetsSpreadsheetId })
    .from(clients)
    .where(isNotNull(clients.sheetsSpreadsheetId));
  const ids = new Set(filas.map((f) => (f.id ?? "").trim()).filter(Boolean));
  cache = { at: Date.now(), ids };
  return ids;
}

/**
 * Devuelve el motivo del bloqueo, o null si esa planilla se puede escribir.
 *
 * Ante una falla de DB **bloquea**: no poder comprobar si una planilla es de un
 * cliente no es permiso para escribirla. Es la misma regla que el resto del
 * sistema — no ver no es lo mismo que estar bien.
 */
export async function motivoPlanillaProtegida(db: Db, spreadsheetId: string): Promise<string | null> {
  if (PERMITIDO) return null;
  const id = (spreadsheetId ?? "").trim();
  if (!id) return null; // el handler ya valida que no venga vacío

  let ids: Set<string>;
  try {
    ids = await planillasDeClientes(db);
  } catch (e) {
    console.warn("[planillas] no se pudo verificar, bloqueo por las dudas:", e instanceof Error ? e.message : e);
    return "No se pudo verificar si esa planilla es la de un cliente, así que no se escribe. Probá de nuevo o pedí ayuda a una persona.";
  }

  if (!ids.has(id)) return null;
  return [
    "Esa es la planilla Cronopost de un cliente y escribir ahí está DESACTIVADO.",
    "La planilla manda sobre ClickUp: el script de la noche pisa la fecha y el horario de cada tarea con lo que diga el Sheet, así que una fila mal puesta le cambia el calendario al cliente y se propaga sola.",
    "Si hay que cambiar algo del calendario, decilo en el issue para que lo haga una persona.",
  ].join(" ");
}

/** Para los tests y para el panel: qué planillas están protegidas ahora. */
export async function cuantasProtegidas(db: Db): Promise<number> {
  if (PERMITIDO) return 0;
  return (await planillasDeClientes(db)).size;
}

// ── La otra puerta a la misma ruta: las listas de Redes en ClickUp ─────────
//
// Cerrar la escritura en las planillas (arriba) dejaba abierta una puerta al
// mismo lugar: `clickup_create_task` aceptaba CUALQUIER listId sin chequear
// nada, así que un agente podía crear una tarea directamente en la lista de
// Redes de un cliente. Esa tarea no existe en la planilla Cronopost —que es la
// fuente de verdad— y sin embargo queda en la lista que mira el despachador.
//
// Es el mismo criterio que las planillas y no una regla nueva: lo que define
// qué se publica se carga en la planilla y lo baja el script de la noche. Las
// tareas de trabajo interno (`create_client_task`) no pasan por acá.

/** Las listas de Redes de todos los clientes. Mismo caché y misma razón. */
let cacheListas: { at: number; ids: Set<string> } | null = null;

async function listasDeRedes(db: Db): Promise<Set<string>> {
  if (cacheListas && Date.now() - cacheListas.at < TTL_MS) return cacheListas.ids;
  const filas = await db
    .select({ id: clients.clickupListRedesId })
    .from(clients)
    .where(isNotNull(clients.clickupListRedesId));
  const ids = new Set(filas.map((f) => (f.id ?? "").trim()).filter(Boolean));
  cacheListas = { at: Date.now(), ids };
  return ids;
}

/**
 * Devuelve el motivo del bloqueo, o null si en esa lista se puede crear.
 *
 * Ante una falla de DB **bloquea**, igual que las planillas: no poder comprobar
 * si una lista es la ruta de publicación de un cliente no es permiso para
 * escribir en ella. Con el caché caliente ni siquiera se consulta la DB y se
 * usa el último set conocido — que también deja la puerta cerrada; lo que
 * nunca pasa es que una caída de DB la abra.
 */
export async function motivoListaProtegida(db: Db, listId: string): Promise<string | null> {
  if (PERMITIDO) return null;
  const id = (listId ?? "").trim();
  if (!id) return null; // el handler ya valida que no venga vacío

  let ids: Set<string>;
  try {
    ids = await listasDeRedes(db);
  } catch (e) {
    console.warn("[listas] no se pudo verificar, bloqueo por las dudas:", e instanceof Error ? e.message : e);
    return "No se pudo verificar si esa lista es la de Redes de un cliente, así que no se crea la tarea. Probá de nuevo o pedí ayuda a una persona.";
  }

  if (!ids.has(id)) return null;
  return [
    "Esa es la lista de Redes de un cliente y crear tareas ahí está DESACTIVADO.",
    "El calendario de publicación se carga en la planilla Cronopost, que es la fuente de verdad: una tarea puesta directo en la lista no está en la planilla y el despachador igual la ve.",
    "Si hay que sumar un post, decilo en el issue para que una persona lo cargue en la planilla.",
  ].join(" ");
}
