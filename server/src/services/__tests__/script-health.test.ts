// La falta de un dato no puede afirmar nada: sin ejecuciones recientes la API
// devuelve {}, también para scripts que nunca corrieron. Solo avisa
// dejoDeCorrer, con el historial del propio script.
import { describe, expect, it } from "vitest";
import { dejoDeCorrer, judge } from "../script-health.js";

describe("judge", () => {
  it("sin ejecuciones no afirma que el script esté roto", () => {
    expect(judge("s1", []).state).toBe("sin_dato");
  });
  it("dos fallas seguidas sí son un problema", () => {
    const procs = [
      { startTime: new Date().toISOString(), processStatus: "FAILED" },
      { startTime: new Date(Date.now() - 86_400_000).toISOString(), processStatus: "FAILED" },
    ];
    expect(judge("s1", procs).state).toBe("failing");
  });
  it("una corrida reciente buena está bien", () => {
    expect(judge("s1", [{ startTime: new Date().toISOString(), processStatus: "COMPLETED" }]).state).toBe("ok");
  });
});

describe("dejoDeCorrer", () => {
  const hoy = new Date("2026-11-05T12:00:00Z");
  it("sin historial no avisa: puede ser un script que nunca corrió", () => {
    expect(dejoDeCorrer(undefined, hoy)).toBe(false);
  });
  it("visto andando hace unos días y ahora sin ejecuciones: avisa", () => {
    expect(dejoDeCorrer("2026-11-02", hoy)).toBe(true);
  });
  it("visto ayer: todavía no", () => {
    expect(dejoDeCorrer("2026-11-04", hoy)).toBe(false);
  });
  it("hace más de un mes: ya se avisó o el cliente está quieto", () => {
    expect(dejoDeCorrer("2026-09-20", hoy)).toBe(false);
  });
});
