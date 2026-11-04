// La falta de un dato no puede afirmar nada: la API de Apps Script devuelve {}
// también para scripts sanos, y eso abría tareas falsas de "no corre".
import { describe, expect, it } from "vitest";
import { judge } from "../script-health.js";

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
