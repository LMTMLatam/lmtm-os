// LMTM: qué va en cada parte de Hoy (pedido de Naza 20/11: «en la pantalla principal
// solo las alertas, cosas urgentes; las decisiones a mano no las usamos mucho;
// prioridades como sugerencias»). La lista entera sigue en /decisiones.

import type { Decision } from "../api/decisiones";

/** Lo que corta la pauta o la publicación hoy: va arriba, aunque no tenga plata medida. */
const URGENTES = new Set(["cadena:conexion_caida", "cadena:escenario_apagado", "cadena:destino_sin_escenario", "pauta:gasto_caido"]);
export const esUrgente = (d: Pick<Decision, "tipo">) => d.tipo.startsWith("saldo:") || URGENTES.has(d.tipo);

/** Puro. Lo urgente agrupado por tipo, para leerlo de un vistazo (20/11: 17 filas seguidas tapaban el resto de Hoy). */
export function agruparUrgentes(urgentes: Decision[]): Array<{ titulo: string; items: Decision[] }> {
  const grupos = [
    { titulo: "Saldos por agotarse", pasa: (d: Decision) => d.tipo.startsWith("saldo:") },
    { titulo: "Publicación cortada", pasa: (d: Decision) => d.tipo.startsWith("cadena:") },
    { titulo: "Pauta que dejó de gastar", pasa: (d: Decision) => d.tipo === "pauta:gasto_caido" },
  ];
  return grupos.map((g) => ({ titulo: g.titulo, items: urgentes.filter(g.pasa) })).filter((g) => g.items.length > 0);
}

/** Cuántas sugerencias mostrar: más que esto es volver a la lista. */
export const MAX_SUGERENCIAS = 5;

/**
 * Puro. Reparte lo abierto de Hoy:
 *  - urgentes: saldo, publicación cortada, gasto caído (los incidentes van aparte, arriba de todo);
 *  - sugerencias: lo que más vale (primero lo que tiene plata, después las oportunidades), sin el ruido de conexiones
 *    ni de tareas que esperan una respuesta;
 *  - esperan y conexiones: solo se cuentan, con link a la lista.
 */
export function repartirHoy(decisiones: Decision[], oportunidades: Decision[]) {
  const urgentes = decisiones.filter(esUrgente).sort((a, b) => (b.arsPorDia ?? 0) - (a.arsPorDia ?? 0));
  const esperan = decisiones.filter((d) => d.tipo === "cola:esperando_persona");
  const conexiones = decisiones.filter((d) => d.tipo.startsWith("cobertura:"));
  const resto = decisiones.filter((d) => !esUrgente(d) && d.tipo !== "cola:esperando_persona" && !d.tipo.startsWith("cobertura:"));
  const conPlata = resto.filter((d) => d.arsPorDia != null).sort((a, b) => (b.arsPorDia ?? 0) - (a.arsPorDia ?? 0));
  const sinPlata = resto.filter((d) => d.arsPorDia == null);
  const sugerencias = [...conPlata, ...oportunidades, ...sinPlata].slice(0, MAX_SUGERENCIAS);
  return { urgentes, sugerencias, esperan, conexiones, total: decisiones.length + oportunidades.length };
}
