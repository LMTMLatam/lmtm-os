import { describe, expect, it } from "vitest";
import { leadsFromActions } from "../meta.js";

// El equipo reportó el 21/9/26 que el panel decía 548 consultas donde Meta
// decía 312 (Distrillantas, WP - MENSAJES LINIERS). La causa: se sumaban
// cuatro action_type, y dos de ellos son el mismo evento con distinto nombre.

const a = (t: string, v: number) => ({ action_type: t, value: String(v) });
const CONVERSACION = "onsite_conversion.messaging_conversation_started_7d";

describe("leadsFromActions", () => {
  it("EL BUG: lead y lead_grouped son el mismo evento, no se suman", () => {
    // Fila real de Distrillantas del 15/9: Meta devolvió 18 conversaciones y
    // los mismos 6 leads bajo tres nombres. Se guardaban 30 (18+6+6).
    const acciones = [
      a(CONVERSACION, 18),
      a("lead", 6),
      a("onsite_conversion.lead", 6),
      a("onsite_conversion.lead_grouped", 6),
      a("post_engagement", 315),
    ];
    expect(leadsFromActions(acciones)).toBe(18);
  });

  it("una campaña de mensajes reporta conversaciones, no los leads de pixel", () => {
    // Ads Manager muestra SOLO el evento que la campaña optimiza. Sumarle los
    // leads del pixel infla el resultado y abarata el CPL en la misma medida.
    expect(leadsFromActions([a(CONVERSACION, 312), a("lead", 124), a("onsite_conversion.lead_grouped", 124)])).toBe(312);
  });

  it("sin conversaciones, el resultado son los formularios — deduplicados", () => {
    expect(leadsFromActions([a("lead", 40), a("onsite_conversion.lead_grouped", 40)])).toBe(40);
    expect(leadsFromActions([a("leadgen_other", 7)])).toBe(7);
  });

  it("NO se pierde el caso que motivó contar conversaciones (MAERS 8/7/26)", () => {
    // Eran 7 conversaciones reales que se reportaban como 0 leads y disparaban
    // falsas alarmas de "gasto sin conversiones".
    expect(leadsFromActions([a(CONVERSACION, 7), a("post_engagement", 90)])).toBe(7);
  });

  it("ignora todo lo que no es un resultado", () => {
    expect(leadsFromActions([a("link_click", 21), a("video_view", 293), a("omni_purchase", 6)])).toBe(0);
    expect(leadsFromActions(undefined)).toBe(0);
    expect(leadsFromActions([])).toBe(0);
  });

  it("tolera valores rotos sin explotar", () => {
    expect(leadsFromActions([{ action_type: CONVERSACION, value: undefined }])).toBe(0);
    expect(leadsFromActions([{ value: "5" } as never])).toBe(0);
  });
});
