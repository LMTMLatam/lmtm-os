// La regla que estos tests protegen: un vigilante que corre todos los días no
// puede volver a levantar la misma señal apenas alguien cierra la anterior.
// Antes de esto había 284 avisos de riesgo de churn en 60 días, muchos con
// cero días de diferencia entre uno y el siguiente (medido el 30/8/26).
import { describe, expect, it } from "vitest";
import { dentroDeLaEspera } from "../client-tasks.js";
import { DIAS_SIN_REPETIR } from "../retention-watch.js";

const ahora = new Date("2026-08-30T12:00:00Z");
const haceDias = (d: number) => new Date(ahora.getTime() - d * 86_400_000);

describe("dentroDeLaEspera", () => {
  // El caso real: SKYGARDEN avisado dos veces el mismo día.
  it("frena un aviso del mismo día", () => {
    expect(dentroDeLaEspera(haceDias(0), 7, ahora)).toBe(true);
  });

  it("frena uno de ayer", () => {
    expect(dentroDeLaEspera(haceDias(1), 7, ahora)).toBe(true);
  });

  it("deja pasar el que ya cumplió la espera", () => {
    expect(dentroDeLaEspera(haceDias(8), 7, ahora)).toBe(false);
  });

  it("justo en el límite ya puede volver a avisar", () => {
    expect(dentroDeLaEspera(haceDias(7), 7, ahora)).toBe(false);
  });

  it("sin aviso previo nunca frena", () => {
    expect(dentroDeLaEspera(null, 7, ahora)).toBe(false);
    expect(dentroDeLaEspera(undefined, 7, ahora)).toBe(false);
  });

  // Si alguien pasa 0 o algo raro, la espera se apaga: nunca puede tapar avisos
  // por accidente.
  it.each([0, -3, NaN, Infinity])("con dias=%s no frena nada", (dias) => {
    expect(dentroDeLaEspera(haceDias(0), dias as number, ahora)).toBe(false);
  });

  it("acepta una fecha que viene como string desde la DB", () => {
    expect(dentroDeLaEspera(new Date(haceDias(2).toISOString()), 7, ahora)).toBe(true);
  });
});

describe("DIAS_SIN_REPETIR", () => {
  // 7 evitaba el 87% de los avisos repetidos; 14 solo agregaba un punto y
  // tapaba más tiempo una señal que puede reaparecer de verdad.
  it("es 7 días", () => {
    expect(DIAS_SIN_REPETIR).toBe(7);
  });

  it("alcanza para frenar los avisos del mismo día y del día siguiente", () => {
    expect(dentroDeLaEspera(haceDias(0), DIAS_SIN_REPETIR, ahora)).toBe(true);
    expect(dentroDeLaEspera(haceDias(0.5), DIAS_SIN_REPETIR, ahora)).toBe(true);
    expect(dentroDeLaEspera(haceDias(2.1), DIAS_SIN_REPETIR, ahora)).toBe(true);
  });
});
