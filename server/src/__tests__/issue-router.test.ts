import { describe, expect, it } from "vitest";
import { classifyArea, resolveSpecialist, type RosterAgent } from "../services/issue-router.js";

// The area regexes are a first-match ordered list, and every past mis-route was
// fixed by tweaking/reordering a regex — which silently regressed an earlier
// fix. This table pins the load-bearing cases (especially the engineering-vs-
// content hijacks) so the next regex edit that breaks one fails CI instead of
// shipping.
describe("classifyArea", () => {
  const cases: Array<[string, string | null]> = [
    // paid wins (and beats content on "campaña de contenido" — paid is first)
    ["Ampliar pauta de Meta del cliente", "paid"],
    ["Revisar CPL de la campaña", "paid"],
    ["Nueva campaña de contenido para el lanzamiento", "paid"],
    // engineering: real infra work
    ["[INFRA] Fix sync orgánico Meta → LMTM-OS", "engineering"],
    ["Error 500 en el endpoint de reportes", "engineering"],
    ["Actualizar el apps script del cliente", "engineering"],
    ["[ENG] deploy del gateway", "engineering"],
    // engineering must NOT hijack content that merely mentions script/logs/500
    ["Escribir el guion para el reel", "content"],
    ["Calendario de contenido de la semana", "content"],
    ["Nuevo carrusel orgánico para Instagram", "content"],
    // other areas
    ["Optimizar keywords y metatags para SEO", "seo"],
    ["Revisar el funnel de leads en Kommo", "crm"],
    ["Diseñar la placa con el logo nuevo", "brand"],
    ["Armar el reporte semanal de métricas", "reports"],
    // nothing matches → null (falls back to triage owner)
    ["Coordinar reunión de equipo", null],
  ];
  for (const [text, expected] of cases) {
    it(`${JSON.stringify(text)} → ${expected}`, () => {
      expect(classifyArea(text)).toBe(expected);
    });
  }
});

describe("resolveSpecialist", () => {
  const roster: RosterAgent[] = [
    { id: "a-paid", name: "Milo (Paid Media)" },
    { id: "a-eng", name: "Esteban (CRM Engineer)" },
    { id: "a-content", name: "Caro (Content)" },
    { id: "a-seo", name: "Sergio (SEO)" },
  ];

  it("routes an infra title to the engineer, not the content agent", () => {
    expect(resolveSpecialist(roster, "[INFRA] Fix sync orgánico Meta")).toBe("a-eng");
  });

  it("routes a content title to the content agent even if it says 'script'", () => {
    expect(resolveSpecialist(roster, "Escribir el guion para el reel")).toBe("a-content");
  });

  it("never routes board/system/wakeup items away from triage (returns null)", () => {
    expect(resolveSpecialist(roster, "[BOARD] Detector stranded_assigned_issue")).toBeNull();
    expect(resolveSpecialist(roster, "wakeup loop del agente")).toBeNull();
  });

  it("returns null when no specialist for the matched area is on the roster", () => {
    expect(resolveSpecialist([{ id: "x", name: "Pablo (PM)" }], "Optimizar keywords SEO")).toBeNull();
  });
});
