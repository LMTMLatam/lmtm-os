// El generador diario sumaba ideas a colas que nadie miraba. El texto es el real
// del feedback que escribe competitor-content.ts.
import { describe, expect, it } from "vitest";
import { colaDeIdeasFrenada } from "../competitor-content.js";

const feedback = (a: number, t: number, p: number) =>
  `- Ideas del agente: 100 en la lista → ${a} aprobadas, ${t} tomadas (revisión/producción), ${p} pendientes. Descartadas por el equipo (borradas/renombradas): 28.`;

describe("colaDeIdeasFrenada", () => {
  it("frena si hay muchas pendientes y ninguna adopción", () => {
    expect(colaDeIdeasFrenada(feedback(0, 0, 100))).toBe(true);
    expect(colaDeIdeasFrenada(feedback(0, 0, 30))).toBe(true);
  });
  it("sigue si el equipo aprobó o tomó alguna", () => {
    expect(colaDeIdeasFrenada(feedback(1, 0, 100))).toBe(false);
    expect(colaDeIdeasFrenada(feedback(0, 2, 100))).toBe(false);
  });
  it("sigue si la cola todavía es chica o no hay feedback", () => {
    expect(colaDeIdeasFrenada(feedback(0, 0, 29))).toBe(false);
    expect(colaDeIdeasFrenada(null)).toBe(false);
    expect(colaDeIdeasFrenada("otro texto")).toBe(false);
  });
});
