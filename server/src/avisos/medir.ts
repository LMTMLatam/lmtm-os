// LMTM-OS: cuántas veces por día se interrumpió al equipo, y cuántas se
// interrumpiría con la política nueva, sobre el historial real de `wa_outbox`.
//
// "Medir el efecto, no el estado": no alcanza con que la política diga 3 por
// día; hay que pasarle encima lo que el sistema quiso mandar de verdad y
// contar. Esta función reproduce el historial aviso por aviso, en orden, con
// el mismo `decidirAviso` que usa producción (dedupe y tope incluidos).

import { decidirAviso, diaLocal, HORAS_DEDUPE, ORIGENES_MANUALES, type Nivel } from "./politica.js";

export interface FilaOutbox {
  createdAt: Date;
  nivel: number;
  origen: string;
  clave: string;
  /** Lo que pasó de verdad: enviado | agrupado | pendiente | descartado | error */
  estado: string;
}

export interface DiaMedido {
  dia: string;
  /** Avisos que el sistema quiso mandar ese día. */
  avisos: number;
  /** Mensajes que interrumpieron de verdad (estado = enviado). */
  interrupcionesAntes: number;
  /** Mensajes DEL SISTEMA que interrumpirían con la política nueva (los del tope). */
  interrupcionesAhora: number;
  /** Orígenes de lo que interrumpiría con la política nueva. */
  quienInterrumpe: string[];
  /** Los que mandó una persona con un botón (prueba, alerta manual): salen igual y no cuentan para el tope. */
  manuales: number;
}

/** El resumen de las 9:00 es el mensaje del día, no una interrupción. */
export const ORIGEN_RESUMEN = "resumen-diario";

export function medirInterrupciones(filas: FilaOutbox[]): DiaMedido[] {
  const ordenadas = [...filas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const porDia = new Map<string, DiaMedido>();
  const ultimoDicho = new Map<string, number>();
  const interrumpidosPorDia = new Map<string, number>();

  for (const f of ordenadas) {
    const dia = diaLocal(f.createdAt);
    const m = porDia.get(dia) ?? { dia, avisos: 0, interrupcionesAntes: 0, interrupcionesAhora: 0, quienInterrumpe: [], manuales: 0 };
    porDia.set(dia, m);
    if (f.origen === ORIGEN_RESUMEN) continue;
    if (ORIGENES_MANUALES.has(f.origen)) {
      m.manuales += 1;
      continue;
    }
    m.avisos += 1;
    if (f.estado === "enviado") m.interrupcionesAntes += 1;

    const t = f.createdAt.getTime();
    const previo = ultimoDicho.get(f.clave);
    const yaDicho = previo != null && t - previo < HORAS_DEDUPE * 3600_000;
    const nivel = Math.min(5, Math.max(1, Math.round(f.nivel))) as Nivel;
    const d = decidirAviso({ origen: f.origen, nivel, yaDicho, interrupcionesHoy: interrumpidosPorDia.get(dia) ?? 0 });
    if (d.accion === "enviar") {
      m.interrupcionesAhora += 1;
      m.quienInterrumpe.push(f.origen);
      interrumpidosPorDia.set(dia, (interrumpidosPorDia.get(dia) ?? 0) + 1);
      // Solo lo que interrumpió cuenta para el dedupe de una interrupción:
      // lo que va al resumen no llegó todavía (en producción queda pendiente
      // hasta las 9:00), así que no puede tapar un aviso posterior.
      ultimoDicho.set(f.clave, t);
    }
  }
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}
