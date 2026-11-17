// 18/11: con el plan semanal de MiniMax daban ~25 corridas por día para 12 agentes, y una
// corrida de 30 a 56 turnos gastaba 2 a 5 M de tokens releyendo el contexto. Estos tests
// cuidan el tope por corrida y la vara de "cuota ajustada".
import { describe, expect, it } from "vitest";
import { consignaDeTurnos, conTopeDeTurnos, CUOTA_AJUSTADA, rastroDeCorte, TURNOS_MAX } from "../motor.js";

describe("rastro de una corrida cortada", () => {
  const ev = (content: unknown[]) => JSON.stringify({ type: "assistant", message: { content } });
  it("junta herramientas y los últimos textos, tolerando la primera línea cortada", () => {
    const salida = ['ype":"assistant","mess', ev([{ type: "text", text: "Miro las campañas" }, { type: "tool_use", name: "mcp__lmtm__lmtmCliente" }]),
      JSON.stringify({ type: "user" }), ev([{ type: "tool_use", name: "mcp__lmtm__lmtmCliente" }]), ev([{ type: "text", text: "Falta el CPL de Google" }])].join("\n");
    const r = rastroDeCorte(salida)!;
    expect(r).toContain("lmtmCliente ×2");
    expect(r).toContain("Falta el CPL de Google");
    expect(r).toContain(`${TURNOS_MAX} turnos`);
  });
  it("sin nada útil no comenta", () => {
    expect(rastroDeCorte("basura\n{}")).toBeNull();
  });
});
import { puntosAdelantado, vaAdelantado, type EstadoCuota } from "../../services/cuota-llm.js";

describe("tope de turnos por corrida", () => {
  it("baja al tope lo que lo pasa y respeta lo que ya es menor", () => {
    expect(conTopeDeTurnos({ maxTurnsPerRun: 45 }).maxTurnsPerRun).toBe(TURNOS_MAX);
    expect(conTopeDeTurnos({ maxTurnsPerRun: 12 }).maxTurnsPerRun).toBe(12);
    expect(conTopeDeTurnos({}).maxTurnsPerRun).toBe(TURNOS_MAX);
  });

  it("no toca el resto de la config del agente", () => {
    const c = conTopeDeTurnos({ maxTurnsPerRun: 45, model: "MiniMax-M3.1-Flash", env: { A: "1" } });
    expect(c.model).toBe("MiniMax-M3.1-Flash");
    expect(c.env).toEqual({ A: "1" });
  });

  it("la consigna pide dejar escrito lo hecho antes del tope, y avisa si es continuación", () => {
    expect(consignaDeTurnos(false)).toContain(`${TURNOS_MAX} turnos`);
    expect(consignaDeTurnos(false)).not.toContain("se cortó");
    expect(consignaDeTurnos(true)).toContain("se cortó por el tope de turnos");
  });
});

describe("puntos adelantados de la cuota semanal", () => {
  const SEMANA = 7 * 86_400_000;
  const inicio = Date.UTC(2026, 10, 16, 0); // domingo 15/11 21:00 en Buenos Aires
  const e = (restante: number): EstadoCuota => ({ semana: { inicio, fin: inicio + SEMANA, restante }, ventana: { fin: inicio, restante: 1 } });

  it("el caso del 17/11: 33% usado con 26,5% transcurrido = 6,5 puntos (ajustada, sin freno semanal)", () => {
    const ahora = inicio + 0.265 * SEMANA;
    expect(puntosAdelantado(e(0.67), ahora)).toBeCloseTo(0.065, 3);
    expect(puntosAdelantado(e(0.67), ahora) >= CUOTA_AJUSTADA).toBe(true);
    expect(vaAdelantado(e(0.67), ahora)).toBe(false);
  });

  it("en ritmo no hay ajuste; con 10 puntos de más frena el ritmo semanal", () => {
    const ahora = inicio + 0.5 * SEMANA;
    expect(puntosAdelantado(e(0.5), ahora)).toBeCloseTo(0, 5);
    expect(vaAdelantado(e(0.39), ahora)).toBe(true);
  });
});
