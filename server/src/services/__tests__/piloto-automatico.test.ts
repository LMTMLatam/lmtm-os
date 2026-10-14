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
  it("topes: pausas por día, parte del gasto y la última campaña que gasta", () => {
    const fuerte = { inversion: 8000, leads: 0 };
    expect(pausaSola(fuerte, 1000, { ...cuenta, pausasHoy: POLITICA.pausasPorClientePorDia }, probPocosLeads).si).toBe(false);
    expect(pausaSola(fuerte, 1000, { ...cuenta, gastoPlataforma: 15_000 }, probPocosLeads).motivo).toMatch(/más del 40%/);
    expect(pausaSola(fuerte, 1000, { ...cuenta, campanasConGasto: 1 }, probPocosLeads).motivo).toMatch(/única campaña/);
  });
});
