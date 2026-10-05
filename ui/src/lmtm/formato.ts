// LMTM: cómo se dicen las cosas en las pantallas donde se decide.
//
// Puro y en un solo lugar: es lo que más se va a querer retocar ("¿cómo
// decimos esto?") y lo que tiene que decir lo mismo en Hoy, en Cartera y en
// el resumen de las 9:00.

import type { Accion, Decision, Responsable } from "../api/decisiones";

/** $48.217 — pesos argentinos con punto de miles, sin decimales. */
export function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

/** Quién la tiene que mover, dicho como lo diría una persona. */
export function etiquetaResponsable(r: Responsable): string {
  if (r === "cliente") return "Le toca al cliente";
  if (r === "agente") return "Le toca a un agente";
  return "Le toca al equipo";
}

/** ¿La acción mueve algo en la cuenta de pauta? Ésas se ensayan antes de confirmar. */
export function tocaLaPauta(a: Accion | null): boolean {
  return !!a && a.tipo !== "tarea";
}

/**
 * El texto del botón: dice lo que hace, no "Ejecutar". "Subir a $18.000" se
 * entiende sin leer nada más; "Ejecutar acción" obliga a leer la fila entera.
 */
export function etiquetaAccion(d: Pick<Decision, "accion" | "responsable">): string {
  const a = d.accion;
  if (!a) return "Ya lo hice";
  switch (a.tipo) {
    case "presupuesto":
      // Sin el presupuesto anterior no se sabe si sube o baja: "Subir" en un
      // recorte sería mentirle a quien aprieta.
      if (a.anterior == null) return `Cambiar a ${pesos(a.nuevoDiario)} por día`;
      return a.nuevoDiario < a.anterior ? `Bajar a ${pesos(a.nuevoDiario)}` : `Subir a ${pesos(a.nuevoDiario)}`;
    case "mover_presupuesto":
      return `Mover ${pesos(a.monto)} por día`;
    case "duplicar":
      return "Duplicar (nace pausado)";
    case "pausar":
      return "Pausar";
    case "tarea":
      return d.responsable === "cliente" ? "Avisarle al cliente" : "Asignar al equipo";
  }
}

/** "hace 3 días", "ayer", "hoy" — para lo que espera el dato. */
export function haceCuanto(iso: string | null, ahora = new Date()): string {
  if (!iso) return "";
  const dias = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "lunes 6 de octubre", en Buenos Aires (la pantalla se mira desde acá). */
export function fechaLarga(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .split("-")
    .map(Number);
  const [y, m, dd] = partes;
  return `${DIAS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${dd} de ${MESES[m - 1]}`;
}

/** "8:30" en Buenos Aires. */
export function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** Un dato de la evidencia con su unidad. null → "sin dato", nunca 0. */
export function formatoDato(valor: number | string | null, unidad?: string): string {
  if (valor == null) return "sin dato";
  if (typeof valor === "string") {
    // Fechas YYYY-MM-DD de la evidencia, dichas como DD/MM.
    return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}` : valor;
  }
  switch (unidad) {
    case "ars":
      return pesos(valor);
    case "ars_dia":
      return `${pesos(valor)} por día`;
    case "pct":
      return `${Math.round(valor)}%`;
    case "dias":
      return `${valor} ${valor === 1 ? "día" : "días"}`;
    case "veces":
      return `${String(valor).replace(".", ",")} veces`;
    case "leads":
      return `${valor} ${valor === 1 ? "lead" : "leads"}`;
    default:
      return valor.toLocaleString("es-AR");
  }
}
