// Lo que estos tests protegen: que las pantallas donde se decide digan la
// plata y las acciones como las diría una persona, y que "no sé" nunca se
// muestre como 0.
import { describe, expect, it } from "vitest";
import { etiquetaAccion, fechaLarga, formatoDato, haceCuanto, pesos, tocaLaPauta } from "./formato";

describe("formato LMTM", () => {
  it("pesos con punto de miles y sin decimales", () => {
    expect(pesos(48217.4)).toBe("$48.217");
  });

  it("el botón dice lo que hace", () => {
    expect(etiquetaAccion({ responsable: "equipo", accion: { tipo: "presupuesto", entityType: "adset", entityId: "1", anterior: 15000, nuevoDiario: 18000 } })).toBe("Subir a $18.000");
    expect(etiquetaAccion({ responsable: "equipo", accion: { tipo: "presupuesto", entityType: "adset", entityId: "1", anterior: 15000, nuevoDiario: 12000 } })).toBe("Bajar a $12.000");
    // Un agente puede proponer un cambio sin el anterior: no se sabe si sube o baja.
    expect(etiquetaAccion({ responsable: "agente", accion: { tipo: "presupuesto", entityType: "adset", entityId: "1", nuevoDiario: 12000 } })).toBe("Cambiar a $12.000 por día");
    expect(etiquetaAccion({ responsable: "equipo", accion: { tipo: "tarea", titulo: "x" } })).toBe("Asignar al equipo");
    expect(etiquetaAccion({ responsable: "cliente", accion: { tipo: "tarea", titulo: "x" } })).toBe("Avisarle al cliente");
    expect(etiquetaAccion({ responsable: "equipo", accion: null })).toBe("Ya lo hice");
  });

  it("lo que toca la pauta se ensaya antes; una tarea no", () => {
    expect(tocaLaPauta({ tipo: "pausar", entityType: "adset", entityId: "1" })).toBe(true);
    expect(tocaLaPauta({ tipo: "tarea", titulo: "x" })).toBe(false);
    expect(tocaLaPauta(null)).toBe(false);
  });

  it("un dato sin medir dice 'sin dato', nunca 0", () => {
    expect(formatoDato(null, "ars")).toBe("sin dato");
    expect(formatoDato(0, "ars")).toBe("$0");
    expect(formatoDato("2026-09-13", "texto")).toBe("13/09");
    expect(formatoDato(4.6, "veces")).toBe("4,6 veces");
    expect(formatoDato(30000, "ars_dia")).toBe("$30.000 por día");
  });

  it("fechas y plazos dichos como se dicen acá", () => {
    expect(fechaLarga(new Date(Date.UTC(2026, 9, 7, 1)))).toBe("martes 6 de octubre");
    const ahora = new Date("2026-10-06T12:00:00Z");
    expect(haceCuanto("2026-10-05T10:00:00Z", ahora)).toBe("ayer");
    expect(haceCuanto("2026-10-02T10:00:00Z", ahora)).toBe("hace 4 días");
  });
});
