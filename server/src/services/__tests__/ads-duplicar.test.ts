// La regla que estos tests protegen: la tool se llama `duplicate_winner`, así
// que tiene que verificar que SEA un ganador. Si duplicara cualquier cosa, el
// nombre mentiría y un agente podría clonar un conjunto que no trae nada —
// creando una entidad nueva que gasta plata del cliente.
import { describe, expect, it } from "vitest";
import { DIAS_VENTANA, esGanador, HORAS_ENTRE_COPIAS, LEADS_MINIMOS } from "../ads-duplicar.js";

const ganador = { leads: 20, spend: 40_000, cpl: 2_000, cplCuenta: 3_000 };

describe("esGanador", () => {
  it("un conjunto con volumen y CPL mejor que la cuenta, pasa", () => {
    expect(esGanador(ganador)).toEqual({ ok: true });
  });

  it("empatar con el promedio de la cuenta alcanza", () => {
    // La vara es "no peor", no "notablemente mejor": si rinde igual que el
    // resto, escalarlo es una decisión razonable que puede tomar una persona.
    expect(esGanador({ ...ganador, cpl: 3_000, cplCuenta: 3_000 }).ok).toBe(true);
  });

  it("con pocos leads NO se duplica, por bueno que parezca el CPL", () => {
    const r = esGanador({ ...ganador, leads: LEADS_MINIMOS - 1, cpl: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("casualidad");
  });

  it("si rinde PEOR que el resto de la cuenta, no es el que conviene escalar", () => {
    const r = esGanador({ ...ganador, cpl: 5_000, cplCuenta: 3_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("por ENCIMA");
      // El mensaje tiene que redirigir, no sólo negar.
      expect(r.motivo).toContain("por qué rinde menos");
    }
  });

  it("sin CPL propio no se afirma que rinda", () => {
    expect(esGanador({ ...ganador, cpl: null }).ok).toBe(false);
  });

  it("sin con qué comparar, tampoco", () => {
    // Un umbral que decide sobre la FALTA de un dato no puede concluir. Acá
    // concluir de más crea una entidad que gasta.
    expect(esGanador({ ...ganador, cplCuenta: null }).ok).toBe(false);
  });

  it("el rechazo SIEMPRE explica por qué", () => {
    const casos = [
      { ...ganador, leads: 0 },
      { ...ganador, cpl: null },
      { ...ganador, cplCuenta: null },
      { ...ganador, cpl: 9_999 },
    ];
    for (const c of casos) {
      const r = esGanador(c);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo.length).toBeGreaterThan(20);
    }
  });
});

describe("la política no se afloja sin querer", () => {
  it("5 leads, 30 días, una copia por día", () => {
    expect(LEADS_MINIMOS).toBe(5);
    expect(DIAS_VENTANA).toBe(30);
    expect(HORAS_ENTRE_COPIAS).toBe(24);
  });
});
