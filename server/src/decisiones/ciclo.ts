// LMTM-OS: el ciclo de vida de una decisión. Puro, para poder probarlo entero.
//
//   abierta ──aprobar──▶ aprobada ──ejecutar──▶ ejecutada ──verificar──▶ verificada
//      │                    │                      │
//      │                    │                      ├─no se confirmó──▶ abierta
//      │                    │                      └─ningún dato en 21 días──▶ vencida
//      ├──descartar(motivo)─┴──▶ descartada
//      └──vencer────────────┴──▶ vencida
//
// La regla que importa: "ejecutada" NO es el final. Mover un presupuesto o
// crear una tarea no prueba nada; el final es que el próximo dato muestre que
// el problema se fue. Ésa es la lección de toda la casa (el verde miente): un
// sistema que da por hecho lo que solo se mandó a hacer termina reportando
// éxito sin haber hecho el trabajo.

import type { EstadoDecision } from "./tipos.js";

export type Evento =
  | { tipo: "aprobar" }
  | { tipo: "descartar"; motivo: string }
  | { tipo: "ejecutar" }
  | { tipo: "verificar" }
  | { tipo: "no_confirmada" }
  | { tipo: "vencer" }
  | { tipo: "sin_confirmacion" };

export type Transicion = { ok: true; estado: EstadoDecision } | { ok: false; motivo: string };

/** Un motivo de descarte que no dice nada no le enseña nada a la regla. */
export const MOTIVO_MINIMO = 5;

const DESDE: Record<Evento["tipo"], readonly EstadoDecision[]> = {
  aprobar: ["abierta"],
  // Se puede descartar lo aprobado: alguien dijo "dale" y después vio que no.
  descartar: ["abierta", "aprobada"],
  // Ejecutar sin pasar por "aprobada" es apretar el botón: el click ES la firma.
  ejecutar: ["abierta", "aprobada"],
  verificar: ["ejecutada"],
  no_confirmada: ["ejecutada"],
  vencer: ["abierta", "aprobada"],
  // Lo ejecutado que ningún dato pudo confirmar ni desmentir en mucho tiempo
  // (una tarea de un agente, un presupuesto de Google que el sync no trae).
  // No se puede dar por verificado, y dejarlo vivo para siempre es un cementerio.
  sin_confirmacion: ["ejecutada"],
};

const HACIA: Record<Evento["tipo"], EstadoDecision> = {
  aprobar: "aprobada",
  descartar: "descartada",
  ejecutar: "ejecutada",
  verificar: "verificada",
  // Vuelve a pedir atención: se hizo algo y el problema sigue.
  no_confirmada: "abierta",
  vencer: "vencida",
  sin_confirmacion: "vencida",
};

/** ¿Se puede aplicar este evento a una decisión en este estado? */
export function transicion(actual: EstadoDecision, evento: Evento): Transicion {
  if (evento.tipo === "descartar") {
    const motivo = (evento.motivo ?? "").trim();
    if (motivo.length < MOTIVO_MINIMO) {
      return { ok: false, motivo: "Para descartar hace falta un motivo: es lo que después ajusta la regla que la propuso." };
    }
  }
  if (!DESDE[evento.tipo].includes(actual)) {
    return { ok: false, motivo: `Una decisión ${actual} no se puede ${VERBO[evento.tipo]}.` };
  }
  return { ok: true, estado: HACIA[evento.tipo] };
}

const VERBO: Record<Evento["tipo"], string> = {
  aprobar: "aprobar",
  descartar: "descartar",
  ejecutar: "ejecutar",
  verificar: "verificar",
  no_confirmada: "devolver a abierta",
  vencer: "vencer",
  sin_confirmacion: "cerrar sin confirmación",
};

/**
 * El orden de Hoy: primero la plata. A igual plata, la más vieja (lo que
 * espera hace más tiempo ya costó más). Lo que no se puede tasar va al final,
 * pero va: si se escondiera, no saldría nunca de la lista.
 */
export function ordenarPorPlata<T extends { arsPorDia: number | null; createdAt: Date | string }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => {
    const pa = a.arsPorDia ?? -1;
    const pb = b.arsPorDia ?? -1;
    if (pb !== pa) return pb - pa;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
