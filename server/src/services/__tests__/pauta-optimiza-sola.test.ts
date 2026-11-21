// La regla de Naza (17/11): el departamento de pauta optimiza solo, pero nunca
// frena ni apaga. Estos tests fallan si alguna vez se cuela una pausa o una baja.
import { describe, expect, it } from "vitest";
import { bajaHastaMinimo, empeoro, OPTIMIZA, puedeIrSola } from "../pauta-optimiza-sola.js";

describe("bajaHastaMinimo (Meta rechazó la baja por su mínimo)", () => {
  const baja = { accion: "set_budget" as const, entityType: "campaign" as const, entityId: "c1", nuevoDiario: 2_450 };
  it("baja hasta el mínimo de Meta, redondeado para arriba", () => {
    expect(bajaHastaMinimo(baja, 3_500, 3_106.5)).toBe(3_107);
  });
  it("si el mínimo no deja bajar nada, no se toca", () => {
    expect(bajaHastaMinimo(baja, 3_500, 3_500)).toBeNull();
    expect(bajaHastaMinimo(baja, 3_500, 4_000)).toBeNull();
  });
  it("una suba, sin mínimo o sin presupuesto de antes: nada", () => {
    expect(bajaHastaMinimo({ ...baja, nuevoDiario: 4_000 }, 3_500, 3_106.5)).toBeNull();
    expect(bajaHastaMinimo(baja, 3_500, undefined)).toBeNull();
    expect(bajaHastaMinimo(baja, null, 3_106.5)).toBeNull();
  });
});

describe("empeoro (deshacer a las 72 h)", () => {
  it("si a su costo anterior debía traer 10 y trajo 2, empeoró", () => {
    expect(empeoro(10_000, 2, 1_000).empeoro).toBe(true);
  });
  it("una caída normal no alcanza para deshacer", () => {
    expect(empeoro(10_000, 7, 1_000).empeoro).toBe(false);
  });
  it("con menos de 3 consultas esperadas no se juzga", () => {
    expect(empeoro(2_000, 0, 1_000)).toEqual({ empeoro: false, esperadas: 2 });
  });
  it("sin CPL de antes no se juzga", () => {
    expect(empeoro(50_000, 0, null).empeoro).toBe(false);
  });
});

const sube = { accion: "set_budget" as const, entityType: "adset" as const, entityId: "a1", nuevoDiario: 12_000 };
const mueve = {
  accion: "shift_budget" as const,
  desde: { entityType: "adset" as const, entityId: "a1" },
  hacia: { entityType: "adset" as const, entityId: "a2" },
  monto: 2_000,
};
const sano = { presupuestoActual: 10_000, leads: 12, diasSaldo: null };

describe("puedeIrSola", () => {
  it("nunca pausa sola (20/11: nada que apague o deshabilite)", () => {
    expect(puedeIrSola({ accion: "pause", entityType: "campaign", entityId: "c1" }, sano).ok).toBe(false);
    expect(puedeIrSola({ accion: "pause", entityType: "adset", entityId: "a1" }, sano).ok).toBe(false);
  });

  it("desde el 20/11 baja presupuesto y duplica ganadores sola (bajar tiene tope y la copia nace pausada)", () => {
    expect(puedeIrSola({ ...sube, nuevoDiario: 8_000 }, sano).ok).toBe(true);
    expect(puedeIrSola({ ...sube, nuevoDiario: 8_000 }, { ...sano, leads: 0 }).ok).toBe(true);
    expect(puedeIrSola({ accion: "duplicate", entityId: "a1" }, sano).ok).toBe(true);
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
