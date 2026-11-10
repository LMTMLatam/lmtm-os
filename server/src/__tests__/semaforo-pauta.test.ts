import { describe, expect, it } from "vitest";
import { OPORTUNIDAD_CERRADA, semaforoDe } from "../services/semaforo-pauta.js";

describe("semáforo de pauta", () => {
  it("las oportunidades vencidas o convertidas no se muestran como vigentes", () => {
    expect(OPORTUNIDAD_CERRADA).toContain("expired");
    expect(OPORTUNIDAD_CERRADA).toContain("converted");
    expect(OPORTUNIDAD_CERRADA).not.toContain("new");
  });

  it("un score que no se calculó no es rojo; sin pauta tampoco", () => {
    expect(semaforoDe(null, false)).toBe("sin-datos");
    expect(semaforoDe(0, true)).toBe("sin-pauta");
    expect(semaforoDe(0, false)).toBe("rojo");
    expect(semaforoDe(45, false)).toBe("amarillo");
    expect(semaforoDe(70, false)).toBe("verde");
  });
});
