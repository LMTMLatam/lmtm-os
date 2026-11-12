import { describe, expect, it } from "vitest";
import { desglosarConversiones } from "../google.js";

const fila = (fecha: string, camp: string, categoria: string, nombre: string, n: number) => ({
  segments: { date: fecha, conversion_action_category: categoria, conversion_action_name: nombre },
  campaign: { id: camp },
  metrics: { conversions: n },
});

describe("desglosarConversiones", () => {
  it("solo cuenta como consulta las categorías de lead", () => {
    const m = desglosarConversiones([
      fila("2026-11-10", "1", "PAGE_VIEW", "Visita a /propiedades", 120),
      fila("2026-11-10", "1", "SUBMIT_LEAD_FORM", "Formulario contacto", 3.5),
      fila("2026-11-10", "1", "PHONE_CALL_LEAD", "Llamada", 1),
      fila("2026-11-10", "1", "ENGAGEMENT", "Clic WhatsApp flotante", 40),
      fila("2026-11-10", "2", "PURCHASE", "Compra", 2),
    ]);
    expect(m.get("2026-11-10|1")?.consultas).toBe(4.5);
    expect(m.get("2026-11-10|2")?.consultas).toBe(0);
    expect(m.get("2026-11-10|1")?.acciones["Visita a /propiedades"]).toEqual({ categoria: "PAGE_VIEW", n: 120 });
  });

  it("acepta claves en camelCase y suma la misma acción repetida", () => {
    const m = desglosarConversiones([
      { segments: { date: "2026-11-11", conversionActionCategory: "CONTACT", conversionActionName: "Contacto" }, campaign: { id: "9" }, metrics: { conversions: "2" } },
      { segments: { date: "2026-11-11", conversionActionCategory: "CONTACT", conversionActionName: "Contacto" }, campaign: { id: "9" }, metrics: { conversions: 1 } },
    ]);
    expect(m.get("2026-11-11|9")).toEqual({ consultas: 3, acciones: { Contacto: { categoria: "CONTACT", n: 3 } } });
  });
});
