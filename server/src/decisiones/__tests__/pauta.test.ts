import { describe, expect, it } from "vitest";
import {
  esRemarketing,
  etiquetaObjetivo,
  frecuencia7,
  reglaCalificados,
  reglaCostoCalificado,
  reglaEscalar,
  reglaFrecuencia,
  reglaSinLeads,
  validarSubida,
  type AnuncioVentana,
  type ClienteVentana,
  type ConjuntoEscalable,
} from "../reglas/pauta.js";

const cliente = (tcpl: number | null = 10_000): ClienteVentana => ({
  clientId: "c1",
  cliente: "DISTRILLANTAS",
  tcpl,
  desde: "2026-09-21",
  hasta: "2026-10-04",
});

const anuncio = (o: Partial<AnuncioVentana> = {}): AnuncioVentana => ({
  adId: "a1",
  nombre: "Neumáticos 4x4 - video",
  campana: "Prospección AMBA",
  gasto14: 0,
  leads14: 0,
  gasto3: 0,
  impresiones7: 0,
  alcance7: 0,
  ...o,
});

describe("sin leads con 3×TCPL gastado", () => {
  it("sin TCPL no afirma nada", () => {
    expect(reglaSinLeads(cliente(null), [anuncio({ gasto14: 900_000, gasto3: 10_000 })])).toBeNull();
  });

  it("por debajo de 3×TCPL es esperar, no decidir", () => {
    expect(reglaSinLeads(cliente(), [anuncio({ gasto14: 29_999, gasto3: 3_000 })])).toBeNull();
  });

  it("con 3×TCPL y cero leads, cambiar el concepto, con la plata que quema hoy", () => {
    const p = reglaSinLeads(cliente(), [anuncio({ gasto14: 30_000, gasto3: 6_000 })]);
    expect(p?.tipo).toBe("pauta:sin_leads");
    expect(p?.arsPorDia).toBe(2_000); // 6.000 en 3 días
    expect(p?.que).toContain("Cambiar el concepto");
    expect(p?.accion?.tipo).toBe("tarea");
  });

  it("un anuncio que ya se apagó no pide nada (y si lo pidiera no se podría verificar nunca)", () => {
    expect(reglaSinLeads(cliente(), [anuncio({ gasto14: 90_000, gasto3: 0 })])).toBeNull();
  });

  it("varios anuncios muertos del mismo cliente son UNA decisión", () => {
    const p = reglaSinLeads(cliente(), [
      anuncio({ adId: "a1", gasto14: 40_000, gasto3: 3_000 }),
      anuncio({ adId: "a2", nombre: "Llantas - carrusel", gasto14: 50_000, gasto3: 3_000 }),
      anuncio({ adId: "a3", gasto14: 50_000, leads14: 2, gasto3: 3_000 }),
    ]);
    expect(p?.clave).toBe("pauta:sin_leads:c1");
    expect(p?.que).toContain("2 anuncios");
  });
});

describe("el objetivo se nombra según de dónde sale", () => {
  it("el propuesto por nosotros no se presenta como pedido por el cliente", () => {
    expect(etiquetaObjetivo({ tcplFuente: "historial" })).toContain("propuesto");
    expect(etiquetaObjetivo({ tcplFuente: "cliente" })).not.toContain("propuesto");
    const p = reglaSinLeads({ ...cliente(), tcplFuente: "historial" }, [anuncio({ gasto14: 30_000, gasto3: 6_000 })]);
    expect(p?.porque.datos.some((d) => d.etiqueta.includes("propuesto"))).toBe(true);
  });
});

describe("calidad (necesita CRM)", () => {
  it("sin calificados medidos no dice nada: no hay forma honesta de suponerlos", () => {
    expect(reglaCalificados(cliente(), { gasto14: 300_000, leads14: 40, calificados14: null })).toBeNull();
  });

  it("menos de 40% de calificados: cambiar el ángulo", () => {
    const p = reglaCalificados(cliente(), { gasto14: 140_000, leads14: 40, calificados14: 10 });
    expect(p?.tipo).toBe("pauta:calificados_bajos");
    expect(p?.que).toContain("25%");
    // Lo que se va por día en leads que no califican: 10.000/día × 75%.
    expect(p?.arsPorDia).toBe(7_500);
  });

  it("40% o más no es problema", () => {
    expect(reglaCalificados(cliente(), { gasto14: 140_000, leads14: 40, calificados14: 16 })).toBeNull();
  });

  it("costo por calificado: una semana mala es varianza, dos es estructura", () => {
    const mala = { gasto: 70_000, calificados: 4 }; // 17.500 > 15.000
    const buena = { gasto: 70_000, calificados: 7 }; // 10.000
    expect(reglaCostoCalificado(cliente(), [buena, mala])).toBeNull();
    const p = reglaCostoCalificado(cliente(), [mala, mala]);
    expect(p?.tipo).toBe("pauta:costo_calificado_alto");
    expect(p?.que).toContain("1,8 veces");
  });

  it("una semana sin calificados y con gasto cuenta como cara, no como sin dato", () => {
    const p = reglaCostoCalificado(cliente(), [{ gasto: 20_000, calificados: 0 }, { gasto: 20_000, calificados: 0 }]);
    expect(p?.que).toContain("sin un lead calificado");
  });
});

describe("frecuencia en prospección fría", () => {
  const conFrec = (f: number, o: Partial<AnuncioVentana> = {}) =>
    anuncio({ impresiones7: Math.round(10_000 * f), alcance7: 10_000, gasto3: 3_000, ...o });

  it("frecuencia es cota inferior y pide volumen", () => {
    expect(frecuencia7({ impresiones7: 900, alcance7: 100 })).toBeNull();
    expect(frecuencia7({ impresiones7: 30_000, alcance7: 10_000 })).toBe(3);
  });

  it("> 4 reemplazar, > 2,5 avisar", () => {
    const ps = reglaFrecuencia(cliente(), [conFrec(4.5, { adId: "x" }), conFrec(3, { adId: "y" }), conFrec(2, { adId: "z" })]);
    expect(ps.map((p) => p.tipo).sort()).toEqual(["pauta:fatiga", "pauta:fatiga_aviso"]);
    const aviso = ps.find((p) => p.tipo === "pauta:fatiga_aviso");
    // Avisar no tiene plata en juego todavía.
    expect(aviso?.arsPorDia).toBeNull();
  });

  it("el remarketing no se mide con la vara de la prospección fría", () => {
    expect(esRemarketing("RMKT - visitantes web")).toBe(true);
    expect(reglaFrecuencia(cliente(), [conFrec(6, { campana: "Remarketing 30d" })])).toEqual([]);
  });

  it("no necesita TCPL: la fatiga no depende del objetivo", () => {
    expect(reglaFrecuencia(cliente(null), [conFrec(5)])).toHaveLength(1);
  });
});

describe("escalar", () => {
  const ahora = new Date("2026-10-05T12:00:00Z");
  const conjunto = (o: Partial<ConjuntoEscalable> = {}): ConjuntoEscalable => ({
    entityType: "adset",
    entityId: "s1",
    nombre: "Ganador",
    presupuestoDiario: 10_000,
    gasto14: 60_000,
    leads14: 10, // CPL 6.000 < TCPL 10.000
    impresiones7: 20_000,
    alcance7: 10_000,
    ultimoCambio: null,
    ...o,
  });

  it("sube 20% exacto lo que trae leads debajo del objetivo", () => {
    const p = reglaEscalar(cliente(), [conjunto()], ahora);
    expect(p?.accion).toMatchObject({ tipo: "presupuesto", anterior: 10_000, nuevoDiario: 12_000 });
    expect(p?.arsPorDia).toBe(2_000);
  });

  it("no escala lo caro, lo que no juntó datos, ni lo que se movió hace menos de 3 días", () => {
    expect(reglaEscalar(cliente(), [conjunto({ gasto14: 120_000 })], ahora)).toBeNull(); // CPL 12.000 > TCPL
    expect(reglaEscalar(cliente(), [conjunto({ gasto14: 20_000, leads14: 5 })], ahora)).toBeNull(); // < 3×TCPL
    expect(reglaEscalar(cliente(), [conjunto({ ultimoCambio: new Date("2026-10-03T12:00:00Z") })], ahora)).toBeNull();
    expect(reglaEscalar(cliente(), [conjunto({ impresiones7: 35_000 })], ahora)).toBeNull(); // frecuencia 3,5
  });

  it("uno por cliente: el que trae el lead más barato", () => {
    const p = reglaEscalar(cliente(), [conjunto({ entityId: "caro", gasto14: 90_000 }), conjunto({ entityId: "barato" })], ahora);
    expect(p?.clave).toBe("pauta:escalar:barato");
  });

  it("validarSubida aplica el ritmo del playbook a lo que proponen los agentes", () => {
    expect(validarSubida(10_000, 12_000, null, ahora)).toBeNull();
    expect(validarSubida(10_000, 12_500, null, ahora)).toContain("20%");
    expect(validarSubida(10_000, 11_000, new Date("2026-10-04T12:00:00Z"), ahora)).toContain("3 días");
    expect(validarSubida(10_000, 8_000, new Date("2026-10-04T12:00:00Z"), ahora)).toBeNull(); // bajar no es escalar
  });
});
