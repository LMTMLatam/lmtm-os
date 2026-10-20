import { describe, expect, it } from "vitest";
import { pausaSola, POLITICA } from "../piloto-automatico.js";
import { probPocosLeads } from "../../metricas/eval-propuestas.js";

const cuenta = { gastoPlataforma: 1_000_000, pausadoHoy: 0, pausasHoy: 0, campanasConGasto: 5 };

describe("piloto automático: qué pausa solo", () => {
  it("evidencia fuerte: lo hace solo", () => {
    // 0 leads con 8 × objetivo: una campaña en el objetivo casi nunca trae 0.
    expect(pausaSola({ inversion: 8000, leads: 0 }, 1000, cuenta, probPocosLeads).si).toBe(true);
  });
  it("evidencia que alcanza para proponer pero no para hacerlo solo", () => {
    // 1 lead con 6 × objetivo: P ≈ 0,017 → sí; 2 leads con 5 × → P ≈ 0,12 → no.
    expect(pausaSola({ inversion: 5000, leads: 2 }, 1000, cuenta, probPocosLeads).si).toBe(false);
  });
  it("lo que trae consultas no se apaga solo, aunque la evidencia sobre (20/10)", () => {
    // WP AVELLANEDA: 198 leads donde el objetivo esperaba 311 → P ≈ 0, pero CPL 1,6 × objetivo.
    const v = pausaSola({ inversion: 311_000, leads: 198 }, 1000, { ...cuenta, gastoPlataforma: 10_000_000 }, probPocosLeads);
    expect(v.si).toBe(false);
    expect(v.motivo).toMatch(/trae consultas/);
    // A 2,5 × o más sí: 3 leads con 10 × objetivo.
    expect(pausaSola({ inversion: 10_000, leads: 3 }, 1000, cuenta, probPocosLeads).si).toBe(true);
  });
  it("topes: pausas por día, parte del gasto y la última campaña que gasta", () => {
    const fuerte = { inversion: 8000, leads: 0 };
    expect(pausaSola(fuerte, 1000, { ...cuenta, pausasHoy: POLITICA.pausasPorClientePorDia }, probPocosLeads).si).toBe(false);
    expect(pausaSola(fuerte, 1000, { ...cuenta, gastoPlataforma: 15_000 }, probPocosLeads).motivo).toMatch(/más del 40%/);
    expect(pausaSola(fuerte, 1000, { ...cuenta, campanasConGasto: 1 }, probPocosLeads).motivo).toMatch(/única campaña/);
  });
});
