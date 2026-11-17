// 17/11 (Naza): "muchas veces los agentes proponen pausar campañas cuando el
// objetivo de la campaña no se mide en insights". Las consultas (leads) solo
// miden lo que optimiza consultas. Estos son los casos reales del 17/11.
import { describe, expect, it } from "vitest";
import { googleNoMideConsultas, metaNoMideConsultas, type MetricasCampana, type MetricasConjunto } from "../campanas.js";
import { evaluarPropuesta } from "../eval-propuestas.js";

describe("metaNoMideConsultas", () => {
  it("conversaciones y formularios se miden", () => {
    for (const o of ["CONVERSATIONS", "LEAD_GENERATION", "QUALITY_LEAD"]) expect(metaNoMideConsultas(o, null)).toBeNull();
    expect(metaNoMideConsultas("OFFSITE_CONVERSIONS", "LEAD")).toBeNull();
  });

  it("clics, visitas al perfil, alcance y compras no", () => {
    // MA PROPIEDADES tiene conjuntos de "Interacción" que optimizan clics hacia WhatsApp.
    for (const o of ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "PROFILE_VISIT", "REACH", "THRUPLAY"]) {
      expect(metaNoMideConsultas(o, null)).toContain("no consultas");
    }
    expect(metaNoMideConsultas("OFFSITE_CONVERSIONS", "PURCHASE")).toContain("PURCHASE");
  });

  it("sin el dato no se afirma nada", () => {
    expect(metaNoMideConsultas(null, null)).toBeNull();
  });
});

describe("googleNoMideConsultas", () => {
  it("SRP «Búsqueda 1»: 60 contactos que Google categoriza como interacción → no se mide", () => {
    expect(googleNoMideConsultas(0, { ENGAGEMENT: 60 }, 161)).toContain("ENGAGEMENT");
  });

  it("MA «Pmax Marzo 2024»: optimiza visitas (2.686) contra 12 consultas → no se mide", () => {
    expect(googleNoMideConsultas(12, { PAGE_VIEW: 2686, ENGAGEMENT: 444, CONTACT: 12 }, 6636)).toContain("PAGE_VIEW");
  });

  it("Distrillantas Pmax-7: optimiza compras → no se mide por consultas", () => {
    expect(googleNoMideConsultas(1, { PURCHASE: 12, MESSAGE_LEAD: 1 }, 2020)).toContain("PURCHASE");
  });

  it("BOERO «REsearch x2»: 11.021 clics y cero conversiones de cualquier tipo → es la medición", () => {
    expect(googleNoMideConsultas(0, undefined, 11021)).toContain("medición");
  });

  it("COSA «Barrios Cerrados»: casi todo consultas → se mide", () => {
    expect(googleNoMideConsultas(38, { MESSAGE_LEAD: 36, PHONE_CALL_LEAD: 2 }, 263)).toBeNull();
  });

  it("sin clics no hay nada que juzgar", () => {
    expect(googleNoMideConsultas(0, undefined, 0)).toBeNull();
  });
});

describe("el evaluador no deja pausar lo que las consultas no miden", () => {
  const TCPL = { tcpl: { meta: 1000, google: 1000 } };
  const conj = (p: Partial<MetricasConjunto>): MetricasConjunto => ({
    adsetId: "s", nombre: "S", estado: "ACTIVE", presupuestoDiario: 5_000, optimizacion: null, noSeMide: null,
    inversion: 20_000, impresiones: 10_000, clics: 300, leads: 0, cpl: null, ...p,
  });
  const camp = (p: Partial<MetricasCampana>): MetricasCampana => ({
    plataforma: "meta", campaignId: "c", nombre: "C", estado: "ACTIVE", objetivoCampana: "OUTCOME_ENGAGEMENT",
    presupuestoDiario: null, fin: null, inversion: 40_000, impresiones: 20_000, clics: 600, leads: 0, cpl: null,
    diasConGasto: 14, ultimoDiaConGasto: "2026-11-16", leadsDudosos: false, medicion: null, conjuntos: [], ...p,
  });

  it("un conjunto que optimiza clics no se pausa por 0 consultas", () => {
    const clics = conj({ adsetId: "clics", optimizacion: "LINK_CLICKS", noSeMide: metaNoMideConsultas("LINK_CLICKS", null) });
    const v = evaluarPropuesta({ accion: "pause", entityType: "adset", entityId: "clics" }, [camp({ conjuntos: [clics] })], TCPL);
    expect(v.ok).toBe(false);
    expect(v.fallas.join()).toContain("LINK_CLICKS");
  });

  it("en una campaña mezclada, el conjunto de conversaciones sí se juzga", () => {
    const clics = conj({ adsetId: "clics", noSeMide: metaNoMideConsultas("LINK_CLICKS", null) });
    const conv = conj({ adsetId: "conv", optimizacion: "CONVERSATIONS" });
    const c = camp({ medicion: clics.noSeMide, conjuntos: [clics, conv] });
    // Gastó 20 × objetivo sin consultas: se puede pausar.
    expect(evaluarPropuesta({ accion: "pause", entityType: "adset", entityId: "conv" }, [c], TCPL).ok).toBe(true);
    // La campaña entera no, porque la mezcla no la miden las consultas.
    expect(evaluarPropuesta({ accion: "pause", entityType: "campaign", entityId: "c" }, [c], TCPL).ok).toBe(false);
  });

  it("una campaña de Google sin medición no se pausa", () => {
    const g = camp({ plataforma: "google", objetivoCampana: "SEARCH", medicion: googleNoMideConsultas(0, undefined, 11021) });
    expect(evaluarPropuesta({ accion: "pause", entityType: "campaign", entityId: "c" }, [g], TCPL).ok).toBe(false);
  });
});
