import { describe, expect, it } from "vitest";
import { agruparMotivos, clasificar } from "../make-errores.js";

const AHORA = new Date("2026-11-22T12:00:00Z").getTime();
const log = (id: string, status: number, hace: number) => ({ id, status, timestamp: new Date(AHORA - hace * 3_600_000).toISOString() });
const dlq = (id: string, reason: string | null, resolved = false) => ({ id, created: "2026-11-21T10:00:00Z", resolved, reason });
const sc = (extra: Record<string, unknown> = {}) => ({ id: 1, name: "Cliente", isActive: true, dlqCount: 0, ...extra });

describe("clasificar un escenario de Make", () => {
  it("la última corrida falló: sigue roto y trae la ejecución para abrir", () => {
    const r = clasificar(sc(), [log("b", 3, 1), log("a", 1, 5)], [], AHORA);
    expect(r.roto?.tipo).toBe("falla");
    expect(r.roto?.ultimaEjecucion).toBe("b");
    expect(r.yaAnda).toBeNull();
  });

  it("falló y después corrió bien: el mail llegó pero ya anda", () => {
    const r = clasificar(sc(), [log("b", 1, 1), log("a", 3, 5)], [], AHORA);
    expect(r.roto).toBeNull();
    expect(r.yaAnda?.escenario).toBe("Cliente");
  });

  it("una advertencia (estado 2) no es una falla", () => {
    const r = clasificar(sc(), [log("a", 2, 1)], [], AHORA);
    expect(r).toEqual({ roto: null, yaAnda: null });
  });

  it("apagado sin nada pendiente no es un error (plantillas y escenarios viejos)", () => {
    expect(clasificar(sc({ isActive: false }), [], [], AHORA)).toEqual({ roto: null, yaAnda: null });
  });

  it("apagado e inválido, o apagado con incompletas, sí", () => {
    expect(clasificar(sc({ isActive: false, isinvalid: true }), [], [], AHORA).roto?.tipo).toBe("apagado");
    const r = clasificar(sc({ isActive: false, dlqCount: 1 }), [], [dlq("x", "Post vacío")], AHORA);
    expect(r.roto?.tipo).toBe("apagado");
    expect(r.roto?.motivos?.[0]?.motivo).toBe("Post vacío");
  });

  it("corre bien pero tiene incompletas sin resolver", () => {
    const r = clasificar(sc({ dlqCount: 2 }), [log("a", 1, 1)], [dlq("x", "Falló Instagram"), dlq("y", "Falló Instagram")], AHORA);
    expect(r.roto?.tipo).toBe("incompletas");
    expect(r.roto?.motivos).toEqual([{ motivo: "Falló Instagram", veces: 2, ultima: expect.any(String) }]);
  });

  it("una falla de hace más de una semana no cuenta", () => {
    expect(clasificar(sc(), [log("a", 3, 24 * 9)], [], AHORA)).toEqual({ roto: null, yaAnda: null });
  });
});

describe("agruparMotivos", () => {
  it("saltea las resueltas y junta las que tienen el mismo motivo", () => {
    const m = agruparMotivos([dlq("a", "X"), dlq("b", "X"), dlq("c", "Y", true), dlq("d", null)]);
    expect(m.map((x) => [x.motivo, x.veces])).toEqual([["X", 2], ["sin motivo informado", 1]]);
  });
});
