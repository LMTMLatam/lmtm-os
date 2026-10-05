// LMTM-OS: el vocabulario de una decisión.
//
// Una decisión responde cinco preguntas, y si le falta una no sirve para
// decidir: de qué cliente, qué hacer, por qué (con los números), cuánta plata
// por día está en juego y quién la tiene que mover. La sexta es opcional: la
// acción que la ejecuta sola, por una ruta que ya tiene guardas.

export const ESTADOS = ["abierta", "aprobada", "ejecutada", "verificada", "descartada", "vencida"] as const;
export type EstadoDecision = (typeof ESTADOS)[number];

/** Las que todavía piden algo a alguien. Hoy muestra solo estas. */
export const ESTADOS_VIVOS: readonly EstadoDecision[] = ["abierta", "aprobada", "ejecutada"];

export const RESPONSABLES = ["equipo", "cliente", "agente"] as const;
export type Responsable = (typeof RESPONSABLES)[number];

/** Un número de la evidencia, ya con su unidad para que la pantalla no adivine. */
export interface Dato {
  etiqueta: string;
  /** null = no se pudo medir. Se muestra "sin dato", nunca 0. */
  valor: number | string | null;
  unidad?: "ars" | "ars_dia" | "pct" | "dias" | "veces" | "leads" | "texto";
}

/** El "por qué": una frase para una persona y los números de los que salió. */
export interface Porque {
  resumen: string;
  datos: Dato[];
  /** Ventana de los números, YYYY-MM-DD. Ausente cuando el dato no es de pauta. */
  ventana?: { desde: string; hasta: string };
}

/**
 * Lo que el botón ejecuta. Cada tipo va por una ruta que ya existe y ya tiene
 * guardas; acá no se escribe en ninguna plataforma por cuenta propia.
 *
 *   presupuesto        → ads-budget.setBudget   (tope de paso, enfriamiento, piso, compartido)
 *   mover_presupuesto  → ads-budget.shiftBudget (baja primero, sube después)
 *   duplicar           → ads-duplicar           (exige ganador, nace pausada y se verifica)
 *   pausar             → ads-actions.pauseAdEntity
 *   tarea              → ClickUp, en la carpeta del cliente (nunca en la lista de Redes)
 */
export type Accion =
  | { tipo: "presupuesto"; entityType: "campaign" | "adset"; entityId: string; nombre?: string; anterior?: number; nuevoDiario: number }
  | {
      tipo: "mover_presupuesto";
      desde: { entityType: "campaign" | "adset"; entityId: string };
      hacia: { entityType: "campaign" | "adset"; entityId: string };
      monto: number;
    }
  | { tipo: "duplicar"; adsetId: string; nombre?: string }
  | { tipo: "pausar"; entityType: "campaign" | "adset"; entityId: string; nombre?: string }
  | { tipo: "tarea"; titulo: string; descripcion?: string };

/** Qué pasó cuando se ejecutó. Se guarda dentro de `accion.resultado`. */
export interface ResultadoEjecucion {
  ok: boolean;
  detalle: string;
  ensayo: boolean;
  at: string;
  /** Lo que haga falta para verificar después (p. ej. el presupuesto nuevo). */
  efecto?: Record<string, unknown>;
}

/** Lo que una regla (o un agente) propone. El motor lo convierte en fila. */
export interface Propuesta {
  clientId: string;
  /** Familia: "saldo:frenada", "pauta:sin_leads", … */
  tipo: string;
  /** El mismo hecho, la misma clave. Es lo que evita duplicar todos los días. */
  clave: string;
  que: string;
  porque: Porque;
  arsPorDia: number | null;
  responsable: Responsable;
  /** regla:<nombre> | agente:<id> */
  creadaPor: string;
  accion: Accion | null;
  /** Días hasta que deja de tener sentido si nadie la toca. */
  venceEnDias: number;
}

/** Lo que devuelve una regla: si pudo mirar, y qué encontró. */
export interface ResultadoRegla {
  regla: string;
  /**
   * false = no pudo mirar (Make no contestó, falta un dato). En ese caso el
   * motor NO cierra las decisiones abiertas de esta regla: no ver no es lo
   * mismo que estar bien.
   */
  evaluada: boolean;
  propuestas: Propuesta[];
  /** Por qué no se pudo evaluar, para el resumen de la corrida. */
  nota?: string;
}

/** Fila de la tabla, ya tipada para la capa de servicio. */
export interface DecisionFila {
  id: string;
  clientId: string;
  tipo: string;
  que: string;
  porque: Porque;
  arsPorDia: number | null;
  responsable: Responsable;
  estado: EstadoDecision;
  creadaPor: string;
  accion: (Accion & { resultado?: ResultadoEjecucion }) | null;
  venceAt: Date | null;
  motivoDescarte: string | null;
  verificadaAt: Date | null;
  createdAt: Date;
  clave: string;
  ejecutadaAt: Date | null;
  updatedAt: Date;
}
