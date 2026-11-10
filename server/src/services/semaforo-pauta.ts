// LMTM-OS: el semáforo de Pauta (/growth/semaforo-pauta). Puro, para probarlo.

/**
 * Oportunidades que ya no piden nada. El motor las vence a los 14 días
 * (`expired`): sin excluirlas, el 10/11 el semáforo listaba como vigentes
 * avisos de junio a septiembre (10.814 vencidas contra 10 nuevas).
 */
export const OPORTUNIDAD_CERRADA = ["done", "dismissed", "descartada", "expired", "converted"] as const;

export type Semaforo = "verde" | "amarillo" | "rojo" | "sin-pauta" | "sin-datos";

/**
 * Sin pauta no hay score (un 0 se leía como "pauta pésima"). Y un score que
 * no se calculó no es rojo: es que no sabemos.
 */
export function semaforoDe(score: number | null, sinPauta: boolean): Semaforo {
  if (sinPauta) return "sin-pauta";
  if (score == null || !Number.isFinite(score)) return "sin-datos";
  return score >= 70 ? "verde" : score >= 40 ? "amarillo" : "rojo";
}
