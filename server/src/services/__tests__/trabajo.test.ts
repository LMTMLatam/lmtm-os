import { describe, expect, it } from "vitest";
import { areaDeDecision, fraseAccion, resultadoDeAccion, resultadoWeb, resumirTrabajo, VENTANA_WEB, type ItemTrabajo } from "../trabajo.js";
import { enPasado, fraseParaCliente } from "../../decisiones/informes-store.js";
import { sumarDias } from "../google-web.js";

describe("fraseAccion", () => {
  const pausa = { kind: "pause_ad_entity", entityType: "campaign", detail: { name: "WP AVELLANEDA - SEPTIEMBRE 2026" } };
  const presupuesto = { kind: "set_budget", entityType: "adset", detail: { nombre: "LLANTAS", anterior: 13750, nuevo: 16500 } };
  const negativas = { kind: "add_negative_keywords", entityType: "campaign", detail: { name: "Search", terminos: ["gratis", "usado"] } };

  it("dice el cambio para el equipo y para el cliente", () => {
    expect(fraseAccion(pausa)).toBe("Pausó la campaña «WP AVELLANEDA - SEPTIEMBRE 2026»");
    expect(fraseAccion(pausa, "hicimos")).toBe("Pausamos la campaña «WP AVELLANEDA - SEPTIEMBRE 2026»");
    expect(fraseAccion(presupuesto)).toBe("Cambió el presupuesto del conjunto «LLANTAS»: $13.750 → $16.500 por día");
    expect(fraseAccion({ ...presupuesto, campana: "WP LINIERS" }, "hicimos")).toBe("Cambiamos el presupuesto del conjunto «LLANTAS» de la campaña «WP LINIERS»: $13.750 → $16.500 por día");
    expect(fraseAccion(negativas)).toBe("Sumó 2 palabras negativas en la campaña «Search»: gratis, usado");
  });

  it("en infinitivo pasa el filtro del informe del cliente (sin cifras afuera de las comillas)", () => {
    for (const a of [pausa, presupuesto, negativas, { kind: "pause_keywords", entityType: "keyword", detail: { pausadas: ["a", "b"] } }]) {
      const f = fraseParaCliente(fraseAccion(a, "hacer"));
      expect(f).not.toBeNull();
      expect(enPasado(f!)).not.toBeNull();
    }
    expect(enPasado(fraseParaCliente(fraseAccion(pausa, "hacer"))!)).toBe("Pausamos la campaña «WP AVELLANEDA - SEPTIEMBRE 2026»");
  });
});

describe("resultadoDeAccion", () => {
  const hecha = new Date("2026-10-14T23:24:00Z"); // 14/10 20:24 en Buenos Aires

  it("sin medir todavía dice desde cuándo", () => {
    expect(resultadoDeAccion("pause_ad_entity", null, hecha)).toMatchObject({ estado: "midiendo", seMideEl: "2026-10-22" });
  });
  it("medido con CPL, y con CTR cuando no hubo consultas", () => {
    expect(resultadoDeAccion("pause_ad_entity", { verdict: "improved", clientCplBefore: 1321, clientCplAfter: 980 }, hecha))
      .toMatchObject({ estado: "medido", metrica: "cpl", antes: 1321, despues: 980, veredicto: "mejoro" });
    expect(resultadoDeAccion("set_budget", { verdict: "worse", clientCplBefore: null, clientCplAfter: null, clientCtrBefore: 1.2, clientCtrAfter: 0.8 }, hecha))
      .toMatchObject({ metrica: "ctr", antes: 1.2, despues: 0.8, veredicto: "empeoro" });
  });
  it("sin datos suficientes no inventa veredicto; duplicar no se mide", () => {
    expect(resultadoDeAccion("pause_ad_entity", { verdict: "insufficient_data" }, hecha)).toMatchObject({ estado: "sin_datos", veredicto: null });
    expect(resultadoDeAccion("duplicate_winner", null, hecha)).toBeNull();
  });
});

describe("resultadoWeb", () => {
  const hechaEl = "2026-08-01";
  const serie = (clicsAntes: number, clicsDespues: number, faltaUno = false) => {
    const out: Array<{ fecha: string; gscClics: number | null; gaEventosClave: number | null }> = [];
    for (let i = -VENTANA_WEB; i <= VENTANA_WEB; i++) {
      if (i === 0) continue;
      out.push({ fecha: sumarDias(hechaEl, i), gscClics: faltaUno && i === 5 ? null : i < 0 ? clicsAntes : clicsDespues, gaEventosClave: null });
    }
    return out;
  };

  it("compara 28 días contra 28", () => {
    expect(resultadoWeb(serie(10, 15), hechaEl, "clics_google", new Date("2026-10-15T12:00:00Z")))
      .toMatchObject({ estado: "medido", antes: 280, despues: 420, veredicto: "mejoro" });
  });
  it("un día sin dato no es un día sin visitas", () => {
    expect(resultadoWeb(serie(10, 15, true), hechaEl, "clics_google", new Date("2026-10-15T12:00:00Z"))).toMatchObject({ estado: "sin_datos" });
  });
  it("antes de tener la ventana completa, espera", () => {
    // Search Console llega hasta hoy-3: el 29/08 todavía no está el 28/08.
    expect(resultadoWeb(serie(10, 15), hechaEl, "clics_google", new Date("2026-08-29T12:00:00Z"))).toMatchObject({ estado: "midiendo", seMideEl: "2026-09-01" });
  });
});

describe("areaDeDecision y resumen", () => {
  it("separa web, pauta y lo que no es optimización", () => {
    expect(areaDeDecision("contenido:busquedas")).toEqual({ area: "web", plataforma: "search_console" });
    expect(areaDeDecision("pauta:landing")).toEqual({ area: "web", plataforma: "analytics" });
    expect(areaDeDecision("pauta:sin_leads")).toEqual({ area: "pauta", plataforma: null });
    expect(areaDeDecision("cadena:sin_destino")).toBeNull();
  });

  it("cuenta lo hecho, lo propuesto y lo medido", () => {
    const base: Omit<ItemTrabajo, "id" | "estado" | "resultado" | "automatico" | "area"> = {
      clientId: "c", cliente: "C", clienteSlug: "c", fecha: "2026-10-15T00:00:00Z", plataforma: null, quien: "x", que: "y", porque: null, siguiente: null, enlace: null,
    };
    const medido = (veredicto: "mejoro" | "igual" | "empeoro") => ({ estado: "medido" as const, metrica: "cpl" as const, antes: 1, despues: 1, veredicto, seMideEl: null });
    const r = resumirTrabajo([
      { ...base, id: "1", area: "pauta", estado: "hecho", automatico: true, resultado: medido("mejoro") },
      { ...base, id: "2", area: "pauta", estado: "hecho", automatico: true, resultado: medido("empeoro") },
      { ...base, id: "3", area: "pauta", estado: "hecho", automatico: false, resultado: { ...medido("igual"), estado: "midiendo", veredicto: null } },
      { ...base, id: "4", area: "web", estado: "propuesto", automatico: false, resultado: null },
      { ...base, id: "5", area: "analisis", estado: "hecho", automatico: false, resultado: null },
    ]);
    expect(r).toMatchObject({ hechos: 4, propuestos: 1, automaticos: 2, medidos: 2, mejoraron: 1, empeoraron: 1, igual: 0, midiendo: 1 });
    expect(r.porArea.web).toEqual({ hechos: 0, propuestos: 1 });
  });
});
