import { describe, expect, it } from "vitest";
import { dejoDeGastar, firmaAccion } from "../ads-propuestas.js";

describe("la cola de propuestas de pauta", () => {
  it("misma acción, misma firma aunque cambien los números", () => {
    expect(firmaAccion({ accion: "set_budget", entityType: "adset", entityId: "1", nuevoDiario: 100 }))
      .toBe(firmaAccion({ accion: "set_budget", entityType: "adset", entityId: "1", nuevoDiario: 120 }));
    expect(firmaAccion({ accion: "pause", entityType: "campaign", entityId: "1" }))
      .not.toBe(firmaAccion({ accion: "pause", entityType: "adset", entityId: "1" }));
    expect(firmaAccion({ accion: "shift_budget", desde: { entityType: "adset", entityId: "a" }, hacia: { entityType: "adset", entityId: "b" }, monto: 5 }))
      .toBe("shift:a>b");
  });
  it("dejó de gastar: sin gasto en los 3 días completos antes de hoy", () => {
    // WP - 3 DE FEBRERO 2064: último gasto el 09/10, la proponían pausar el 14/10.
    expect(dejoDeGastar("2026-10-09", "2026-10-14")).toBe(true);
    expect(dejoDeGastar("2026-10-11", "2026-10-14")).toBe(false);
    expect(dejoDeGastar("2026-10-13", "2026-10-14")).toBe(false);
    expect(dejoDeGastar(null, "2026-10-14")).toBe(true);
  });
});
