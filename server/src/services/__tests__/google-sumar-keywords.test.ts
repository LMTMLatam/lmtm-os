import { describe, expect, it } from "vitest";
import { planSumarKeywords } from "../ads-actions.js";
import { fraseAccion, salioBien } from "../trabajo.js";

describe("sumar keywords en Google", () => {
  it("no duplica lo que ya es keyword en ese grupo ni toca grupos de otra cuenta", () => {
    const plan = planSumarKeywords(
      [
        { texto: "Pintura Látex", adGroupId: "1" },
        { texto: "pintura látex", adGroupId: "1" }, // repetida en el pedido
        { texto: "membrana", adGroupId: "1" }, // ya existe
        { texto: "impermeabilizante", adGroupId: "999" }, // grupo ajeno o inventado
      ],
      new Set(["1"]),
      new Set(["1|membrana"]),
    );
    expect(plan.crear).toEqual([{ texto: "pintura látex", adGroupId: "1" }]);
    expect(plan.yaEstaban).toEqual(["membrana"]);
    expect(plan.gruposAjenos).toEqual(["impermeabilizante"]);
  });
});

describe("lo que se le cuenta al cliente", () => {
  it("las keywords sumadas y los cambios de la web se dicen en castellano, no con el código interno", () => {
    expect(fraseAccion({ kind: "add_keywords", entityType: "keyword", detail: { agregadas: ["pintura látex", "membrana"] } }, "hicimos"))
      .toBe("Sumamos 2 palabras clave que ya traían consultas en Google: pintura látex, membrana");
    expect(fraseAccion({ kind: "web_quitar_spam", entityType: "web", detail: {} }, "hicimos"))
      .toBe("Sacamos contenido basura (spam) que se había colado en tu web");
    expect(fraseAccion({ kind: "web_actualizar_plugins", entityType: "web", detail: {} }, "hacer")).toBe("Actualizar complementos de la web");
  });

  it("un cambio que falló no se cuenta como hecho", () => {
    expect(salioBien({ detail: { ok: false } })).toBe(false);
    expect(salioBien({ detail: { ok: true } })).toBe(true);
    expect(salioBien({ detail: { terminos: ["x"] } })).toBe(true); // las de pauta no traen `ok`
    expect(salioBien({ detail: null })).toBe(true);
  });
});
