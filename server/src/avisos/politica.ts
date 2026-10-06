// LMTM-OS: quién puede interrumpir al equipo por WhatsApp. Puro.
//
// EL PROBLEMA
// Se desconectó Distrillantas y el dueño no se enteró: el canal estaba quemado.
// Con el embudo (wa-embudo) cada aviso quedó registrado con nivel, pero el nivel
// lo elegía cada módulo, y casi todos se ponían 4 o 5: catorce emisores, cada
// uno convencido de que lo suyo era urgente. El nivel 4 interrumpía hasta 8
// veces por día, el 5 sin tope, y encima salían dos briefs (8:00 y 18:00).
//
// LA REGLA NUEVA (PLAN.md, B2)
// Solo interrumpe el nivel 5, y el nivel 5 no se lo pone cualquiera: lo pueden
// usar los incidentes (que salen del motor de decisiones, uno por incidente
// nuevo) y los envíos que hace una persona a mano. Todo otro módulo queda, como
// mucho, en nivel 4, y el nivel 4 va al resumen diario de las 9:00 con links a
// Hoy. Además, tope duro: 3 interrupciones por día en toda la agencia. Pasado
// el tope, el aviso DEGRADA al resumen; no se pierde.
//
// Es la misma función la que decide en producción (wa-embudo) y la que se usa
// para medir contra el historial de `wa_outbox` (medir.ts): lo que se midió es
// lo que corre.

export type Nivel = 1 | 2 | 3 | 4 | 5;

/** Desde este nivel el mensaje interrumpe en el momento. Debajo va al resumen. */
export const NIVEL_INTERRUMPE: Nivel = 5;

/** Interrupciones por día, en toda la agencia (PLAN.md: "≤ 3 por día"). */
export const TOPE_INTERRUPCIONES_DIA = 3;

/** Ventana de dedupe: el mismo hecho no se avisa dos veces seguidas. */
export const HORAS_DEDUPE = 24;

/**
 * Los únicos orígenes que pueden pedir nivel 5.
 *
 *  · incidentes                → el motor, un mensaje por corrida con lo NUEVO
 *  · alertas-cliente (manual)  → una persona apretó "avisar"
 *  · prueba-gateway            → una persona probando el canal
 *
 * Para sumar uno acá hace falta lo mismo que para sumar un archivo al embudo:
 * una razón que no sea "lo mío es urgente". Lo que es plata parada o una
 * conexión caída ya llega como incidente.
 */
export const ORIGENES_QUE_INTERRUMPEN: ReadonlySet<string> = new Set([
  "incidentes",
  "alertas-cliente (manual)",
  "prueba-gateway",
]);

/**
 * Los que manda una PERSONA apretando un botón. Interrumpen siempre y no
 * cuentan para el tope: el tope existe para que el sistema no queme el canal,
 * no para que alguien que prueba el gateway reciba "falló" a la cuarta prueba
 * o que un "avisar" pedido a propósito quede esperando hasta mañana.
 */
export const ORIGENES_MANUALES: ReadonlySet<string> = new Set(["alertas-cliente (manual)", "prueba-gateway"]);

export type DecisionAviso =
  | { accion: "enviar" }
  | { accion: "digest"; motivo?: string }
  | { accion: "descartar"; motivo: string };

/** El nivel con el que se trata un aviso: el pedido, salvo que el origen no pueda interrumpir. */
export function nivelEfectivo(origen: string, nivel: Nivel): Nivel {
  if (nivel < NIVEL_INTERRUMPE) return nivel;
  return ORIGENES_QUE_INTERRUMPEN.has(origen) ? nivel : 4;
}

/**
 * Qué hacer con un aviso.
 *
 * `yaDicho` = el mismo hecho (misma clave) ya se le dijo al equipo en la
 * ventana de dedupe. `interrupcionesHoy` = cuántos mensajes del sistema
 * interrumpieron hoy (hora de Buenos Aires), de cualquier origen salvo los
 * manuales.
 */
export function decidirAviso(input: { origen: string; nivel: Nivel; yaDicho: boolean; interrupcionesHoy: number }): DecisionAviso {
  const { origen, nivel, yaDicho, interrupcionesHoy } = input;
  if (nivel <= 1) return { accion: "descartar", motivo: "nivel 1: queda registrado, no se manda" };
  if (yaDicho) return { accion: "descartar", motivo: `ya se avisó lo mismo en las últimas ${HORAS_DEDUPE}h` };

  const efectivo = nivelEfectivo(origen, nivel);
  if (efectivo < NIVEL_INTERRUMPE) {
    return nivel >= NIVEL_INTERRUMPE
      ? { accion: "digest", motivo: "solo interrumpen los incidentes: va al resumen de las 9:00" }
      : { accion: "digest" };
  }
  if (ORIGENES_MANUALES.has(origen)) return { accion: "enviar" };
  // El tope degrada, no descarta: que el cuarto incidente del día no
  // interrumpa es la regla; que desaparezca sería volver a perder un Distrillantas.
  if (interrupcionesHoy >= TOPE_INTERRUPCIONES_DIA) {
    return { accion: "digest", motivo: `ya hubo ${TOPE_INTERRUPCIONES_DIA} interrupciones hoy: va al resumen` };
  }
  return { accion: "enviar" };
}

const ZONA = "America/Argentina/Buenos_Aires";

/** Día de Buenos Aires (YYYY-MM-DD) de un instante: el "hoy" del tope. */
export function diaLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
