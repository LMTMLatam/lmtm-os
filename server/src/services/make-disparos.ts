// LMTM-OS: detector de publicaciones duplicadas mirando las CORRIDAS DE MAKE.
//
// POR QUÉ EXISTE, SI YA HAY UN DETECTOR
// `publicaciones-duplicadas.ts` compara los posts que sincronizamos de Meta.
// Eso sirve solo para los clientes que tienen la página mapeada, y hoy son 25
// de 59: para los otros 34 el detector está estructuralmente ciego. Por eso no
// vio lo de Ikigai (30/8/26), que salió publicado hasta cinco veces.
//
// Las corridas de Make, en cambio, están para TODOS los clientes, mapeados o
// no. Son la única fuente que cubre la cartera entera.
//
// LOS DOS PATRONES QUE BUSCA
//
//   RÁFAGA — el mismo escenario disparado varias veces casi al mismo tiempo.
//   Es la firma de una automatización de ClickUp duplicada: el webhook se llama
//   dos veces con milisegundos de diferencia (caso MAERS, 26/8/26).
//
//   SOLAPE — dos escenarios DISTINTOS disparando la misma pieza. Es lo que pasa
//   cuando queda prendido un autoposter viejo y genérico además del escenario
//   propio del cliente (caso AutoPoster, 30/8/26: pisaba 45 de sus 50 corridas).
//
// LOS UMBRALES NO SON ARBITRARIOS
// Se midieron sobre las corridas reales de los 46 escenarios activos:
//   · duplicaciones reales:      entre 0,1 y 1,9 segundos de separación
//   · dos piezas programadas juntas: 20 segundos o más
// Por eso la ráfaga corta en 5 segundos: bien arriba del máximo real y bien
// abajo del mínimo legítimo. Para el solape entre escenarios distintos se usó
// 60s, contrastado corriendo el reloj de un escenario 7/13/23/37/47/53 minutos:
// con desfase real daba 39 solapes, desfasado daba 0,2 de promedio.

import type { Db } from "@paperclipai/db";
import { makeConfigured, makeListScenarios, makeScenarioLogs, MAX_LOGS_POR_LLAMADA } from "./make.js";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";

/** Una corrida automática de un escenario. */
export interface Disparo {
  escenarioId: number;
  escenario: string;
  cuando: Date;
}

/** Mismo escenario, varias corridas pegadas: automatización duplicada. */
export interface Rafaga {
  escenarioId: number;
  escenario: string;
  cuando: Date;
  veces: number;
  separacionMs: number;
}

/** Dos escenarios distintos disparando lo mismo: uno está de más. */
export interface Solape {
  escenario: string;
  escenarioId: number;
  otro: string;
  otroId: number;
  cuando: Date;
  separacionMs: number;
}

export const RAFAGA_MS = 5_000;
export const SOLAPE_MS = 60_000;
/** Menos que esto no es una ráfaga, es una corrida sola. */
export const MINIMO_RAFAGA = 2;

const porTiempo = (a: Disparo, b: Disparo) => a.cuando.getTime() - b.cuando.getTime();

/**
 * Agrupa las corridas del MISMO escenario que caen una arriba de la otra.
 * Devuelve un item por ráfaga, no uno por corrida.
 */
export function buscarRafagas(disparos: Disparo[], ventanaMs = RAFAGA_MS): Rafaga[] {
  const porEscenario = new Map<number, Disparo[]>();
  for (const d of disparos) {
    const lista = porEscenario.get(d.escenarioId) ?? [];
    lista.push(d);
    porEscenario.set(d.escenarioId, lista);
  }

  const salida: Rafaga[] = [];
  for (const lista of porEscenario.values()) {
    const orden = [...lista].sort(porTiempo);
    let grupo: Disparo[] = [];
    const cerrar = () => {
      if (grupo.length >= MINIMO_RAFAGA) {
        const primero = grupo[0];
        const ultimo = grupo[grupo.length - 1];
        salida.push({
          escenarioId: primero.escenarioId,
          escenario: primero.escenario,
          cuando: primero.cuando,
          veces: grupo.length,
          separacionMs: ultimo.cuando.getTime() - primero.cuando.getTime(),
        });
      }
      grupo = [];
    };
    for (const d of orden) {
      if (!grupo.length) { grupo = [d]; continue; }
      if (d.cuando.getTime() - grupo[grupo.length - 1].cuando.getTime() <= ventanaMs) grupo.push(d);
      else { cerrar(); grupo = [d]; }
    }
    cerrar();
  }
  return salida.sort((a, b) => b.cuando.getTime() - a.cuando.getTime());
}

/**
 * Busca corridas de escenarios DISTINTOS que caen juntas. Cada par se reporta
 * una sola vez, con el escenario más viejo como "otro": el que sobra suele ser
 * el genérico que quedó prendido, y los ids de Make son crecientes.
 */
export function buscarSolapes(disparos: Disparo[], ventanaMs = SOLAPE_MS): Solape[] {
  const orden = [...disparos].sort(porTiempo);
  const vistos = new Set<string>();
  const salida: Solape[] = [];
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length; j++) {
      const dt = orden[j].cuando.getTime() - orden[i].cuando.getTime();
      if (dt > ventanaMs) break;
      if (orden[i].escenarioId === orden[j].escenarioId) continue;
      const clave = `${orden[i].escenarioId}-${orden[j].escenarioId}-${orden[i].cuando.getTime()}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const [nuevo, viejo] = orden[i].escenarioId > orden[j].escenarioId
        ? [orden[i], orden[j]]
        : [orden[j], orden[i]];
      salida.push({
        escenario: nuevo.escenario,
        escenarioId: nuevo.escenarioId,
        otro: viejo.escenario,
        otroId: viejo.escenarioId,
        cuando: orden[i].cuando,
        separacionMs: dt,
      });
    }
  }
  return salida.sort((a, b) => b.cuando.getTime() - a.cuando.getTime());
}

/**
 * Ranking de quién co-ocurre con más escenarios DISTINTOS.
 *
 * Ojo con leer esto como una acusación: casi todos los clientes publican en
 * hora redonda, así que co-ocurrir es lo normal y el ranking siempre devuelve
 * algo. Lo probé el 30/8/26: correr el reloj (el contraste que sirve para
 * saber si un solape es real) da "infinito" para media cartera, porque
 * desfasar siete minutos saca a todos de la hora redonda a la vez.
 *
 * Lo único que separa de verdad a un autoposter genérico de un cliente es la
 * CANTIDAD de socios distintos: el genérico cae al lado de todos, un cliente
 * solo al lado de los que comparten su horario. Por eso el veredicto lo da
 * `sospechosoClaro`, con un margen, y no esta función.
 */
export function elQueSobra(solapes: Solape[]): Array<{ escenarioId: number; escenario: string; pisa: number; aCuantos: number }> {
  const conteo = new Map<number, { escenario: string; pisa: number; otros: Set<number> }>();
  for (const s of solapes) {
    for (const [id, nombre, contra] of [
      [s.escenarioId, s.escenario, s.otroId] as const,
      [s.otroId, s.otro, s.escenarioId] as const,
    ]) {
      const e = conteo.get(id) ?? { escenario: nombre, pisa: 0, otros: new Set<number>() };
      e.pisa += 1;
      e.otros.add(contra);
      conteo.set(id, e);
    }
  }
  return [...conteo.entries()]
    .map(([escenarioId, v]) => ({ escenarioId, escenario: v.escenario, pisa: v.pisa, aCuantos: v.otros.size }))
    .sort((a, b) => b.aCuantos - a.aCuantos || b.pisa - a.pisa);
}

/** Cuánto tiene que despegarse del segundo para que valga acusarlo. */
export const MARGEN_SOSPECHA = 2;
/** Debajo de esto no hay muestra suficiente para decir nada. */
export const MINIMO_SOCIOS = 6;

/**
 * Devuelve el escenario que sobra SOLO si se despega claramente del resto.
 * Con los datos reales del 30/8/26: AutoPoster 28 socios contra 13 del
 * segundo (2,15x) → lo nombra. El día que ese se apague, el ranking queda
 * 13 contra 12 (1,08x) → no nombra a nadie, que es lo correcto: ahí ya no
 * hay un genérico de más, solo clientes compartiendo horario.
 */
export function sospechosoClaro(
  ranking: ReturnType<typeof elQueSobra>,
): ReturnType<typeof elQueSobra>[number] | null {
  const [primero, segundo] = ranking;
  if (!primero || primero.aCuantos < MINIMO_SOCIOS) return null;
  const referencia = segundo?.aCuantos ?? 0;
  if (referencia > 0 && primero.aCuantos < referencia * MARGEN_SOSPECHA) return null;
  return primero;
}

/* ───────────────────────── el barrido ───────────────────────── */

/** Escenarios que no publican contenido de clientes: no tiene sentido mirarlos. */
const NO_PUBLICAN = /gateway|health|monitor|todoist|plantilla|template/i;
/** Tope de escenarios por barrido, para no comerse el rate limit de Make. */
export const TOPE_ESCENARIOS = 60;

export interface Cosecha {
  disparos: Disparo[];
  leidos: number;
  fallados: number;
}

export async function juntarDisparos(): Promise<Cosecha> {
  if (!makeConfigured()) return { disparos: [], leidos: 0, fallados: 0 };
  const escenarios = (await makeListScenarios())
    .filter((s) => s.isActive !== false && !NO_PUBLICAN.test(s.name ?? ""))
    .slice(0, TOPE_ESCENARIOS);

  const disparos: Disparo[] = [];
  let leidos = 0, fallados = 0;
  for (const e of escenarios) {
    try {
      const logs = await makeScenarioLogs(e.id, MAX_LOGS_POR_LLAMADA);
      leidos += 1;
      for (const l of logs) {
        // Solo lo automático: una corrida a mano o un replay no es una duplicación
        // del sistema, es alguien apretando un botón (pasó con Lescano el 26/8).
        if (l.type && l.type !== "auto") continue;
        if (l.replayOfExecutionId) continue;
        const cuando = new Date(l.timestamp);
        if (Number.isNaN(cuando.getTime())) continue;
        disparos.push({ escenarioId: e.id, escenario: (e.name ?? "").trim(), cuando });
      }
    } catch {
      // Un escenario que no se puede leer no puede frenar el barrido entero,
      // pero SÍ se cuenta: si no se pudo leer ninguno, "no hay duplicados" es
      // mentira y hay que decirlo en vez de reportar verde.
      fallados += 1;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { disparos, leidos, fallados };
}

export interface ResumenDisparos {
  rafagas: Rafaga[];
  solapes: Solape[];
  sobran: ReturnType<typeof elQueSobra>;
  leidos: number;
  fallados: number;
  /** true cuando no se pudo leer nada: "sin duplicados" no sería una respuesta honesta. */
  ciego: boolean;
}

export async function revisarDisparos(): Promise<ResumenDisparos> {
  const { disparos, leidos, fallados } = await juntarDisparos();
  const solapes = buscarSolapes(disparos);
  return {
    rafagas: buscarRafagas(disparos),
    solapes,
    sobran: elQueSobra(solapes),
    leidos,
    fallados,
    ciego: leidos === 0 && fallados > 0,
  };
}

/**
 * Avisa por WhatsApp. No abre tareas por cliente a propósito: cuando un
 * autoposter genérico pisa a 28 clientes, 28 tareas tapan el tablero y esconden
 * que el arreglo es uno solo. Va un mensaje que nombra al escenario culpable.
 */
export async function avisarDisparosRepetidos(_db: Db): Promise<{ rafagas: number; solapes: number; avisado: boolean; ciego: boolean }> {
  const { rafagas, solapes, sobran, ciego, fallados } = await revisarDisparos();

  // Que la API de Make no conteste NO es lo mismo que que no haya duplicados.
  // Si se calla acá, el detector queda en verde para siempre — que es justo el
  // modo de falla que este archivo existe para tapar.
  if (ciego) {
    const numero = alertsNumber();
    if (numero) {
      await sendWhatsAppToNumber(numero, `*⚠️ No pude revisar Make*

Ninguno de los ${fallados} escenarios devolvió su historial, así que hoy NO sé si hubo publicaciones duplicadas. No es que no haya: es que no pude mirar.`);
    }
    return { rafagas: 0, solapes: 0, avisado: !!numero, ciego: true };
  }

  if (!rafagas.length && !solapes.length) return { rafagas: 0, solapes: 0, avisado: false, ciego: false };

  const linea: string[] = ["*⚠️ Publicaciones disparadas de más (Make)*", ""];

  const culpable = sospechosoClaro(sobran);
  if (culpable) {
    linea.push(
      `Hay un escenario que cae al lado de *${culpable.aCuantos} escenarios distintos*, muy por encima del resto: *${culpable.escenario}*.`,
      `Eso es lo que hace un autoposter genérico que quedó prendido de más. Es un solo arreglo, no ${culpable.aCuantos}.`,
      `Confirmalo antes de apagarlo: mirá si sus corridas publican algo propio o siempre caen encima de otro escenario.`,
      "",
    );
  }
  if (rafagas.length) {
    linea.push(`*Mismo escenario disparado varias veces* (automatización de ClickUp duplicada):`);
    for (const r of rafagas.slice(0, 6)) {
      linea.push(`  · ${r.escenario} — ${r.veces} veces en ${(r.separacionMs / 1000).toFixed(1)}s, el ${r.cuando.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`);
    }
    if (rafagas.length > 6) linea.push(`  · …y ${rafagas.length - 6} más`);
    linea.push("");
  }
  // Los solapes sueltos NO se listan cuando no hay un sospechoso claro: casi
  // toda la cartera publica en hora redonda, así que serían decenas de líneas
  // de ruido que tapan las ráfagas, que sí son inequívocas.
  if (solapes.length && !culpable) {
    linea.push(`_(${solapes.length} corridas de escenarios distintos cayeron juntas, pero ninguno se despega del resto: es hora redonda compartida, no un escenario de más.)_`, "");
  }
  linea.push("_Las corridas de Make figuran en verde igual: esto no se ve mirando el historial._");

  const numero = alertsNumber();
  if (numero) await sendWhatsAppToNumber(numero, linea.join("\n"));
  return { rafagas: rafagas.length, solapes: solapes.length, avisado: !!numero, ciego: false };
}
