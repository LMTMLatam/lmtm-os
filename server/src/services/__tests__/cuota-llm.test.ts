import { afterEach, describe, expect, it } from "vitest";
import {
  cuotaPausadaHasta, leerEstado, motivoDeCorte, olvidarPausas, pausarPorCuota, proveedorDe, resetDe, SONDEO_MS, vaAdelantado,
  type EstadoCuota,
} from "../cuota-llm.js";

const MINIMAX = "https://api.minimax.io/anthropic";
const DIA = 24 * 3600_000;
// Semana real del plan: domingo 18/10 21:00 → domingo 25/10 21:00 (hora argentina).
const INICIO = 1792368000000;
const FIN = 1792972800000;
const estado = (restante: number, ventana = 1): EstadoCuota => ({
  semana: { inicio: INICIO, fin: FIN, restante },
  ventana: { fin: INICIO + 5 * 3600_000, restante: ventana },
});

describe("cuota del proveedor de los agentes (22/10)", () => {
  afterEach(() => olvidarPausas());

  it("el proveedor sale del ANTHROPIC_BASE_URL del agente", () => {
    expect(proveedorDe({ env: { ANTHROPIC_BASE_URL: `${MINIMAX}/` } })).toBe(MINIMAX);
    expect(proveedorDe({ env: {} })).toBe("anthropic");
    expect(proveedorDe(null)).toBe("anthropic");
  });

  it("sin hora de reset corta hasta el próximo sondeo; con hora, hasta esa hora", () => {
    const ahora = Date.UTC(2026, 9, 22, 12);
    expect(pausarPorCuota(MINIMAX, null, ahora).getTime()).toBe(ahora + SONDEO_MS);
    expect(pausarPorCuota(MINIMAX, FIN, ahora).getTime()).toBe(FIN);
    expect(cuotaPausadaHasta(MINIMAX, ahora + DIA)).not.toBeNull();
    expect(cuotaPausadaHasta(MINIMAX, FIN + 1)).toBeNull();
    expect(cuotaPausadaHasta("http://127.0.0.1:4000", ahora)).toBeNull();
  });

  it("lee la respuesta real de /coding_plan/remains", () => {
    const e = leerEstado({ model_remains: [
      { model_name: "video", weekly_start_time: 1, weekly_end_time: 2, current_weekly_remaining_percent: 100, end_time: 3, current_interval_remaining_percent: 100 },
      { model_name: "general", start_time: 1792699200000, end_time: 1792713600000, weekly_start_time: INICIO, weekly_end_time: FIN,
        current_interval_remaining_percent: 100, current_weekly_remaining_percent: 0 },
    ] })!;
    expect(e.semana).toEqual({ inicio: INICIO, fin: FIN, restante: 0 });
    expect(resetDe(e)).toBe(FIN);
    expect(leerEstado({})).toBeNull();
  });

  it("la ventana de 5 h en cero también corta, hasta su fin", () => {
    expect(resetDe(estado(0.5, 0))).toBe(INICIO + 5 * 3600_000);
    expect(resetDe(estado(0.5, 0.3))).toBeNull();
  });

  it("ritmo: lo gastado no puede adelantarse a lo transcurrido de la semana (+10 %)", () => {
    const martes = INICIO + 1.5 * DIA; // ~21 % de la semana
    expect(vaAdelantado(estado(0.25), martes)).toBe(true); // gastó 75 %
    expect(vaAdelantado(estado(0.75), martes)).toBe(false); // gastó 25 %
    expect(vaAdelantado(estado(0.1), FIN - 1000)).toBe(false); // gastó 90 % casi al final
  });

  it("decisión: corte, ritmo, tope diario sin datos; lo pedido a mano pasa ritmo y tope", () => {
    const martes = INICIO + 1.5 * DIA;
    const base = { corridasHoy: 0, tope: 80, ahora: martes };
    expect(motivoDeCorte({ ...base, pausadaHasta: new Date(), fuente: "on_demand", estado: null })).toBe("llm.cuota_agotada");
    expect(motivoDeCorte({ ...base, pausadaHasta: null, fuente: "automation", estado: estado(0.25) })).toBe("llm.ritmo_semanal");
    expect(motivoDeCorte({ ...base, pausadaHasta: null, fuente: "on_demand", estado: estado(0.25) })).toBeNull();
    expect(motivoDeCorte({ ...base, pausadaHasta: null, fuente: "timer", estado: null, corridasHoy: 80 })).toBe("llm.tope_diario");
    expect(motivoDeCorte({ ...base, pausadaHasta: null, fuente: "timer", estado: null, corridasHoy: 79 })).toBeNull();
  });
});
