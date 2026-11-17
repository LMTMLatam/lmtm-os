// La regla de Naza (17/11): el departamento de pauta optimiza solo, pero nunca
// frena ni apaga. Estos tests fallan si alguna vez se cuela una pausa o una baja.
import { describe, expect, it } from "vitest";
import { OPTIMIZA, puedeIrSola } from "../pauta-optimiza-sola.js";

const sube = { accion: "set_budget" as const, entityType: "adset" as const, entityId: "a1", nuevoDiario: 12_000 };
const mueve = {
  accion: "shift_budget" as const,
  desde: { entityType: "adset" as const, entityId: "a1" },
  hacia: { entityType: "adset" as const, entityId: "a2" },
  monto: 2_000,
};
const sano = { presupuestoActual: 10_000, leads: 12, diasSaldo: null };

describe("puedeIrSola", () => {
  it("nunca pausa ni duplica sola", () => {
    expect(puedeIrSola({ accion: "pause", entityType: "campaign", entityId: "c1" }, sano).ok).toBe(false);
    expect(puedeIrSola({ accion: "duplicate", entityId: "a1" }, sano).ok).toBe(false);
  });

  it("nunca baja presupuesto sola (bajar es frenar)", () => {
    expect(puedeIrSola({ ...sube, nuevoDiario: 8_000 }, sano).ok).toBe(false);
    expect(puedeIrSola({ ...sube, nuevoDiario: 10_000 }, sano).ok).toBe(false);
  });

  it("sube y mueve sola lo que rinde con volumen", () => {
    expect(puedeIrSola(sube, sano).ok).toBe(true);
    expect(puedeIrSola(mueve, sano).ok).toBe(true);
  });

  it("con pocos leads el CPL es ruido: no escala sola", () => {
    expect(puedeIrSola(sube, { ...sano, leads: OPTIMIZA.minLeads - 1 }).ok).toBe(false);
    expect(puedeIrSola(mueve, { ...sano, leads: 1 }).ok).toBe(false);
  });

  it("no sube en una cuenta que se queda sin saldo, ni si no pudo leerlo", () => {
    expect(puedeIrSola(sube, { ...sano, diasSaldo: OPTIMIZA.diasSaldoMinimo - 1 }).ok).toBe(false);
    expect(puedeIrSola(sube, { ...sano, diasSaldo: undefined }).ok).toBe(false);
    expect(puedeIrSola(sube, { ...sano, diasSaldo: 30 }).ok).toBe(true);
  });

  it("sin presupuesto actual conocido no sube", () => {
    expect(puedeIrSola(sube, { ...sano, presupuestoActual: null }).ok).toBe(false);
  });
});
