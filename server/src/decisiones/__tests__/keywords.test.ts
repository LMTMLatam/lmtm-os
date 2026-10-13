import { describe, expect, it } from "vitest";
import { propuestasDeKeywords } from "../reglas/keywords.js";
import type { AuditoriaKeywords } from "../../services/ads-keywords.js";

const base: AuditoriaKeywords = {
  cliente: "BOERO", cuenta: "1234567890", desde: "2026-09-13", dias: 30, terminos: 200, clicsTotal: 200,
  gastoTotal: 300000, conversionesTotal: 40, negativas: [], nuevas: [], pausar: [], ampliaCara: [],
  ahorroMensual: 0, gastoMarcaSinConversion: 0,
};
const t = (termino: string, campaignId: string, costo: number) =>
  ({ termino, keyword: null, campana: `Camp ${campaignId}`, campaignId, clics: 12, impresiones: 300, costo, conversiones: 0 });

describe("keywords de Google → decisiones de Hoy", () => {
  it("negativas: una decisión por campaña, con los términos y su botón", () => {
    const ps = propuestasDeKeywords({ clientId: "c1", cliente: "BOERO" }, {
      ...base, negativas: [t("pintura gratis", "11", 5000), t("trabajo pintor", "11", 4000), t("pintura barata", "22", 3500)],
    });
    expect(ps).toHaveLength(2);
    const p = ps.find((x) => x.clave === "pauta:negativas:c1:11")!;
    expect(p.que).toBe("Agregar 2 negativas en «Camp 11» en Google: $9.000 en 30 días en búsquedas que no trajeron ni una conversión");
    expect(p.accion).toEqual({ tipo: "negativas", campaignId: "11", campana: "Camp 11", terminos: ["pintura gratis", "trabajo pintor"] });
    expect(p.arsPorDia).toBeNull(); // la cuenta puede no estar en pesos
    expect(p.creadaPor).toMatch(/^regla:/);
  });

  it("palabras clave a pausar: una sola decisión por cliente", () => {
    const [p] = propuestasDeKeywords({ clientId: "c1", cliente: "BOERO" }, {
      ...base, pausar: [{ texto: "pintura", concordancia: "BROAD", campana: "Camp 11", clics: 30, costo: 12000, conversiones: 0, qualityScore: 5 }],
    });
    expect(p.que).toBe("Pausar 1 palabra clave en Google: $12.000 en 30 días sin una conversión");
    expect(p.accion).toEqual({ tipo: "pausar_keywords", textos: ["pintura"] });
  });

  it("sin evidencia no se propone: 8 clics a una tasa del 2% esperaban 0,16 conversiones (caso COSA, 13/10)", () => {
    const cosa = { ...base, clicsTotal: 5000, conversionesTotal: 100, negativas: [{ ...t("inmobiliarias rosario", "11", 3464), clics: 8 }] };
    expect(propuestasDeKeywords({ clientId: "c1", cliente: "COSA PROPIEDADES" }, cosa)).toEqual([]);
    // Con 150 clics a esa tasa ya debería haber traído 3: ahí sí.
    const [p] = propuestasDeKeywords({ clientId: "c1", cliente: "COSA PROPIEDADES" }, { ...cosa, negativas: [{ ...t("alquiler temporario", "11", 40000), clics: 150 }] });
    expect(p.tipo).toBe("pauta:negativas");
    // Una cuenta sin conversiones no tiene tasa: no se juzga nada.
    expect(propuestasDeKeywords({ clientId: "c1", cliente: "X" }, { ...base, conversionesTotal: 0, negativas: [t("x", "11", 9000)] })).toEqual([]);
  });

  it("sin nada que proponer, nada; un término sin campaña no se propone", () => {
    expect(propuestasDeKeywords({ clientId: "c1", cliente: "BOERO" }, base)).toEqual([]);
    expect(propuestasDeKeywords({ clientId: "c1", cliente: "BOERO" }, { ...base, negativas: [t("x", "", 5000)] })).toEqual([]);
  });
});
