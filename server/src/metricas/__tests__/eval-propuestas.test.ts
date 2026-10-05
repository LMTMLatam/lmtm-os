import { describe, expect, it } from "vitest";
import { evaluarPropuesta } from "../eval-propuestas.js";
import type { MetricasCampana } from "../campanas.js";

const camp = (p: Partial<MetricasCampana>): MetricasCampana => ({
  plataforma: "meta", campaignId: "c", nombre: "C", estado: "ACTIVE", objetivoCampana: null,
  presupuestoDiario: 10_000, fin: null, inversion: 0, impresiones: 0, clics: 0, leads: 0, cpl: null,
  diasConGasto: 14, ultimoDiaConGasto: "2026-10-04", leadsDudosos: false, conjuntos: [], ...p,
});
const TCPL = { tcpl: { meta: 1000, google: 1000 } };

describe("evaluarPropuesta: pausar", () => {
  it("pausar con 0 leads y gasto de sobra es defendible", () => {
    const r = evaluarPropuesta({ accion: "pause", entityType: "campaign", entityId: "c" }, [camp({ inversion: 5000 })], TCPL);
    expect(r).toEqual({ ok: true, fallas: [] });
  });
  it("pausar antes de 3 × objetivo de gasto es apurarse", () => {
    const r = evaluarPropuesta({ accion: "pause", entityType: "campaign", entityId: "c" }, [camp({ inversion: 2000 })], TCPL);
    expect(r.ok).toBe(false);
    expect(r.fallas[0]).toMatch(/todavía no hay datos/);
  });
  it("pausar algo que rinde dentro de 1,5 × objetivo no tiene motivo", () => {
    const r = evaluarPropuesta({ accion: "pause", entityType: "campaign", entityId: "c" }, [camp({ inversion: 6000, leads: 5, cpl: 1200 })], TCPL);
    expect(r.fallas[0]).toMatch(/no hay motivo de pausa/);
  });
  it("una entidad que no es del cliente se rechaza", () => {
    const r = evaluarPropuesta({ accion: "pause", entityType: "adset", entityId: "ajeno" }, [camp({})], TCPL);
    expect(r.ok).toBe(false);
  });
  it("decidir sobre leads dudosos de Google es una falla", () => {
    const r = evaluarPropuesta(
      { accion: "pause", entityType: "campaign", entityId: "c" },
      [camp({ plataforma: "google", leadsDudosos: true, inversion: 9000, leads: 900, cpl: 10 })], TCPL,
    );
    expect(r.fallas).toContain("decide sobre leads de Google que no son confiables");
  });
});

describe("evaluarPropuesta: lo que no se mide por CPL", () => {
  const pausa = { accion: "pause" as const, entityType: "campaign" as const, entityId: "c" };
  it("una campaña de tráfico sin leads no se pausa por CPL", () => {
    const r = evaluarPropuesta(pausa, [camp({ objetivoCampana: "OUTCOME_TRAFFIC", inversion: 50_000 })], TCPL);
    expect(r.fallas[0]).toMatch(/OUTCOME_TRAFFIC/);
  });
  it("la campaña de marca no se corta por CPL", () => {
    const ctx = { ...TCPL, esMarca: (n: string) => /distrillantas/i.test(n) };
    const r = evaluarPropuesta(pausa, [camp({ plataforma: "google", nombre: "Distrillantas Brand", inversion: 99_963, leads: 6, cpl: 16_661 })], ctx);
    expect(r.fallas[0]).toMatch(/marca/);
  });
  it("Google se mide contra el objetivo de Google, no contra el de Meta", () => {
    const ctx = { tcpl: { meta: 965, google: 8000 } };
    const c = [camp({ plataforma: "google", objetivoCampana: "PERFORMANCE_MAX", inversion: 115_592, leads: 17, cpl: 6800 })];
    expect(evaluarPropuesta(pausa, c, ctx).ok).toBe(false);
    expect(evaluarPropuesta(pausa, c, { tcpl: { meta: 965, google: null } }).fallas[0]).toMatch(/sin objetivo de CPL en google/);
  });
  it("mover plata entre Meta y Google es comparar lo incomparable", () => {
    const r = evaluarPropuesta(
      { accion: "shift_budget", desde: { entityType: "campaign", entityId: "g" }, hacia: { entityType: "campaign", entityId: "m" }, monto: 1000 },
      [camp({ campaignId: "g", plataforma: "google", cpl: 5000, leads: 3 }), camp({ campaignId: "m", cpl: 900, leads: 20 })], TCPL,
    );
    expect(r.fallas[0]).toMatch(/no son comparables/);
  });
});

describe("evaluarPropuesta: presupuesto", () => {
  it("subir 20% algo que está debajo del objetivo pasa; 50% no", () => {
    const c = [camp({ inversion: 8000, leads: 10, cpl: 800 })];
    expect(evaluarPropuesta({ accion: "set_budget", entityType: "campaign", entityId: "c", nuevoDiario: 12_000 }, c, TCPL).ok).toBe(true);
    expect(evaluarPropuesta({ accion: "set_budget", entityType: "campaign", entityId: "c", nuevoDiario: 15_000 }, c, TCPL).fallas[0]).toMatch(/50%/);
  });
  it("escalar algo por encima del objetivo es una falla; bajar no se juzga", () => {
    const c = [camp({ inversion: 8000, leads: 4, cpl: 2000 })];
    expect(evaluarPropuesta({ accion: "set_budget", entityType: "campaign", entityId: "c", nuevoDiario: 11_000 }, c, TCPL).ok).toBe(false);
    expect(evaluarPropuesta({ accion: "set_budget", entityType: "campaign", entityId: "c", nuevoDiario: 8_000 }, c, TCPL).ok).toBe(true);
  });
  it("mover plata hacia lo más caro es una falla", () => {
    const c = [camp({ campaignId: "barata", cpl: 500, leads: 10 }), camp({ campaignId: "cara", cpl: 2000, leads: 3 })];
    const r = evaluarPropuesta(
      { accion: "shift_budget", desde: { entityType: "campaign", entityId: "barata" }, hacia: { entityType: "campaign", entityId: "cara" }, monto: 1000 },
      c, TCPL,
    );
    expect(r.fallas[0]).toMatch(/hacia lo más caro/);
  });
});
