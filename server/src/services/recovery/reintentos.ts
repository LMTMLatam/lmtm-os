// LMTM-OS: cuándo dejar de auto-recuperar un issue y pasarlo a una persona.
//
// EL PROBLEMA QUE ARREGLA
// La recuperación de issues varados deduplicaba solo contra una recuperación
// ABIERTA. Cuando el agente cerraba la recuperación sin destrabar el origen, el
// barrido siguiente veía el origen todavía varado y abría otra. Medido el
// 30/8/26: 288 issues de recuperación en 30 días sobre apenas 93 orígenes
// distintos — el 68% eran re-recuperaciones del mismo issue. LMTM-3820 se
// recuperó 38 veces, una cada 6 minutos.
//
// Un lazo que reintenta cada seis minutos no está arreglando nada: está
// tapando que no puede. Así que ahora hay dos frenos.
//
//   ESPERA   — no reintentar el mismo origen antes de que pase un rato. Un
//              reintento inmediato repite exactamente las condiciones que ya
//              fallaron.
//   RENDIRSE — después de unos cuantos intentos se deja de insistir y el issue
//              pasa a la cola humana. Que la automatización no pueda es un dato
//              útil; seguir intentando en silencio no.

export const ESPERA_ENTRE_INTENTOS_MS = 2 * 3_600_000; // 2 horas
export const MAX_INTENTOS = 3;

export type DecisionRecuperacion =
  | { accion: "recuperar" }
  | { accion: "esperar"; motivo: string }
  | { accion: "rendirse"; motivo: string };

export interface EstadoReintentos {
  /** Recuperaciones ya creadas para este origen, en cualquier estado. */
  intentosPrevios: number;
  /** Cuándo se creó la última, si hubo alguna. */
  ultimoIntento: Date | null;
  ahora?: Date;
}

export function decidirRecuperacion(estado: EstadoReintentos): DecisionRecuperacion {
  const ahora = estado.ahora ?? new Date();
  const intentos = Number.isFinite(estado.intentosPrevios) ? Math.max(0, Math.trunc(estado.intentosPrevios)) : 0;

  // Primero rendirse, después esperar: si ya se agotaron los intentos no tiene
  // sentido decir "esperá", porque no va a haber otro intento.
  if (intentos >= MAX_INTENTOS) {
    return {
      accion: "rendirse",
      motivo: `Ya se intentó recuperar este issue ${intentos} veces sin destrabarlo. Lo sigue una persona.`,
    };
  }

  if (estado.ultimoIntento) {
    const desde = ahora.getTime() - new Date(estado.ultimoIntento).getTime();
    if (desde < ESPERA_ENTRE_INTENTOS_MS) {
      const minutos = Math.max(1, Math.round(desde / 60_000));
      return {
        accion: "esperar",
        motivo: `El intento anterior fue hace ${minutos} min; reintentar tan seguido repite las condiciones que ya fallaron.`,
      };
    }
  }

  return { accion: "recuperar" };
}

/** Prefijo que usa el resto del sistema para lo que necesita una persona. */
export const PREFIJO_HUMANO = "[HUMANO]";

/** Título del issue de origen cuando la automatización se rinde. */
export function tituloParaPersona(titulo: string): string {
  const limpio = (titulo ?? "").trim();
  if (limpio.startsWith(PREFIJO_HUMANO)) return limpio;
  return `${PREFIJO_HUMANO} ${limpio}`.trim().slice(0, 200);
}
