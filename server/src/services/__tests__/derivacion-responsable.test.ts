import { describe, expect, it } from "vitest";
import { areaDeTarea, elegirResponsable } from "../cotizado.js";

// Títulos reales de derivaciones de SEBASTIAN RAMASCO PADILLA que fueron a copy (10/11).
describe("a quién se deriva una tarea", () => {
  it("lo de pauta va a pauta, no a copy", () => {
    expect(areaDeTarea("Recargar saldo en cuentas Meta topped out (2 de 3 en spend cap agotado)")).toBe("pauta");
    expect(areaDeTarea("[HUMANO-BM] SRP Google Ads: corregir conversiones mal configuradas")).toBe("pauta");
    expect(areaDeTarea("Rebalancear presupuesto Meta 18-34 y agregar 2-3 variantes")).toBe("pauta");
    expect(areaDeTarea("[URGENTE] Cuenta act_491276408427625 casi sin saldo")).toBe("pauta");
  });

  it("el riesgo de baja y el contacto con el cliente van a gestión de cuenta", () => {
    expect(areaDeTarea("[RIESGO CHURN] SEBASTIAN RAMASCO PADILLA")).toBe("cuenta");
    expect(areaDeTarea("Contactar preventivamente a Sebastián por performance")).toBe("cuenta");
  });

  it("diseño sigue siendo diseño y lo demás, copy y programación", () => {
    expect(areaDeTarea("Placa para el lanzamiento de San Martín 370")).toBe("diseño");
    expect(areaDeTarea("⚠️ Publicación duplicada en facebook: SEBASTIAN RAMASCO PADILLA")).toBe("copy");
    // "bm" y "cpl" como palabras: no se confunden dentro de otra.
    expect(areaDeTarea("Programar el carrusel de bmw")).toBe("copy");
  });

  it("si el área no tiene a nadie cargado, cae en copy y después en diseño", () => {
    const r = { diseno: "Paz", copyProgramacion: "Caro", pauta: "Esteban", cuenta: "Carolina" };
    expect(elegirResponsable("pauta", r)).toEqual({ nombre: "Esteban", area: "pauta" });
    expect(elegirResponsable("cuenta", r)).toEqual({ nombre: "Carolina", area: "gestión de cuenta" });
    expect(elegirResponsable("pauta", { ...r, pauta: null })).toEqual({ nombre: "Caro", area: "copy y programación" });
    expect(elegirResponsable("copy", { diseno: "Paz", copyProgramacion: null })).toEqual({ nombre: "Paz", area: "diseño" });
  });
});

describe("cierre de derivaciones", () => {
  it("la clave que se guarda es la que busca el cierre ('tareas:' || identifier)", async () => {
    const { claveDeDerivacion, ISSUE_TERMINADO } = await import("../vigilantes.js");
    expect(claveDeDerivacion("LMTM-6644")).toBe("tareas:LMTM-6644");
    expect([...ISSUE_TERMINADO]).toEqual(["done", "cancelled"]);
  });
});
