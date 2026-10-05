// LMTM-OS: autonomía graduada. Qué puede hacer la flota sin preguntar.
//
// LA IDEA
// Que una acción pase de "pedir OK" a "ejecutar y avisar" no se decide por
// decreto ni porque suene razonable: se gana con historial propio y medido.
// `action-outcomes.ts` ya mide, para cada tipo de acción, qué le pasó al CPL del
// cliente en los 7 días siguientes. Acá ese mismo dato decide quién maneja.
//
// Arranca en CERO: sin historial, todo pide OK. Es el default y es el correcto —
// una flota que empieza con autonomía la tiene porque alguien la supuso, no
// porque la haya demostrado.
//
// DOS LLAVES, NO UNA
//   1. el interruptor general (`LMTM_AUTONOMIA_PAUTA=1`), apagado por defecto
//   2. el historial de ESE tipo de acción
// Las dos tienen que estar. Si el equipo decide que nada se ejecute solo nunca,
// alcanza con no prender la primera y todo el resto de este archivo queda inerte.

import type { Db } from "@paperclipai/db";
import { learnings } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { MINIMO_PARA_LECCION } from "./action-outcomes.js";

export type NivelAutonomia = "pide_ok" | "ejecuta_y_avisa";

/** Fracción de casos que tienen que haber MEJORADO el CPL. */
export const PISO_MEJORA = 0.6;

/**
 * Fracción de casos que pueden haber EMPEORADO el CPL.
 *
 * Es bajo a propósito y no es simétrico con PISO_MEJORA: "neutro" es un
 * resultado aceptable para una acción automática —no todo movimiento tiene que
 * mover la aguja— pero "empeoró" es plata del cliente perdida sin que nadie
 * haya mirado. Un 10% de eso ya es suficiente para seguir preguntando.
 */
export const TECHO_EMPEORA = 0.1;

/** Mínimo de casos medidos. El mismo que exige una lección: con menos es anécdota. */
export const MINIMO_CASOS = MINIMO_PARA_LECCION;

export interface Historial {
  mejor: number;
  peor: number;
  igual: number;
  total: number;
}

/**
 * ¿Se ganó el derecho a ejecutar sin preguntar?
 *
 * Pura para poder probarla: es la función que decide si el sistema mueve plata
 * de un cliente sin que nadie la mire, así que tiene que poder leerse entera de
 * un vistazo y tener sus casos de borde escritos.
 */
export function nivelPorHistorial(h: Historial | null): NivelAutonomia {
  if (!h || h.total < MINIMO_CASOS) return "pide_ok";
  if (h.mejor / h.total < PISO_MEJORA) return "pide_ok";
  if (h.peor / h.total > TECHO_EMPEORA) return "pide_ok";
  return "ejecuta_y_avisa";
}

/** ¿Está prendido el interruptor general? */
export function autonomiaHabilitada(): boolean {
  return process.env.LMTM_AUTONOMIA_PAUTA === "1";
}

/**
 * El historial de un tipo de acción, tal como lo dejó `destilarLecciones`.
 *
 * Se lee de `learnings` y no de `agent_actions` a propósito: ahí el dato ya
 * viene agregado y filtrado (los `insufficient_data` quedaron afuera), así que
 * las dos decisiones —qué lección se le cuenta a la flota y qué puede hacer
 * sola— salen exactamente del mismo número. Si divergieran, el panel diría una
 * cosa y el sistema haría otra.
 */
export async function historialDe(db: Db, companyId: string, kind: string): Promise<Historial | null> {
  const [fila] = await db
    .select({ evidence: learnings.evidence })
    .from(learnings)
    .where(and(
      eq(learnings.companyId, companyId),
      eq(learnings.scope, "global"),
      eq(learnings.scopeKey, `accion:${kind}`),
    ))
    .limit(1);

  const e = fila?.evidence as { mejor?: number; peor?: number; igual?: number; total?: number } | null | undefined;
  if (!e || typeof e.total !== "number") return null;
  return {
    mejor: Number(e.mejor ?? 0),
    peor: Number(e.peor ?? 0),
    igual: Number(e.igual ?? 0),
    total: Number(e.total),
  };
}

export interface Veredicto {
  nivel: NivelAutonomia;
  /** Por qué, en una frase, para que quede escrito en el aviso al equipo. */
  motivo: string;
  historial: Historial | null;
}

/** El veredicto completo para un tipo de acción. */
export async function autonomiaDe(db: Db, companyId: string, kind: string): Promise<Veredicto> {
  if (!autonomiaHabilitada()) {
    return { nivel: "pide_ok", motivo: "la autonomía está apagada en este entorno", historial: null };
  }
  const historial = await historialDe(db, companyId, kind).catch(() => null);
  const nivel = nivelPorHistorial(historial);
  if (nivel === "ejecuta_y_avisa" && historial) {
    return {
      nivel,
      motivo: `"${kind}" mejoró el CPL en ${historial.mejor} de ${historial.total} casos medidos y lo empeoró en ${historial.peor}`,
      historial,
    };
  }
  if (!historial) return { nivel, motivo: `todavía no hay casos medidos de "${kind}"`, historial };
  if (historial.total < MINIMO_CASOS) {
    return { nivel, motivo: `sólo hay ${historial.total} casos medidos de "${kind}" y hacen falta ${MINIMO_CASOS}`, historial };
  }
  return {
    nivel,
    motivo: `el historial de "${kind}" no alcanza: mejoró ${historial.mejor} y empeoró ${historial.peor} de ${historial.total}`,
    historial,
  };
}
