import { describe, expect, it } from "vitest";
import { mesDeFila, senalDeCobro, seriesDeSeguidores, textoInformeTrimestral, ultimosMeses } from "../cuenta.js";
import { cotizadoDeFicha, piezasDelRol, ventanaDeMes, type CotizadoRow } from "../cotizado.js";

describe("señal de cobro del trimestre", () => {
  it("pide dos meses medidos", () => {
    expect(senalDeCobro([130, null, null])).toBe("sin-datos");
    expect(senalDeCobro([])).toBe("sin-datos");
  });
  it("sobre-servicio con 2 de 3 meses en 120 % o más", () => {
    expect(senalDeCobro([120, 95, 140])).toBe("sobre-servicio");
    expect(senalDeCobro([119, 95, 140])).toBe("en-linea");
  });
  it("sub-servicio con 2 de 3 meses en 70 % o menos", () => {
    expect(senalDeCobro([70, 40, 100])).toBe("sub-servicio");
    expect(senalDeCobro([71, 40, 100])).toBe("en-linea");
  });
  it("un mes alto y uno bajo no es señal", () => {
    expect(senalDeCobro([150, 50, 100])).toBe("en-linea");
  });
});

describe("meses", () => {
  it("el mes en curso y los anteriores, cruzando el año", () => {
    expect(ultimosMeses(new Date("2026-02-10T12:00:00Z"), 3)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
  it("un mes cerrado vale entero; el que corre, la parte que pasó", () => {
    const cerrado = ventanaDeMes("2026-10", new Date("2026-11-21T00:00:00Z"));
    expect(cerrado.cerrado).toBe(true);
    expect(cerrado.prorrateo).toBe(1);
    expect(cerrado.hasta.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const corre = ventanaDeMes("2026-11", new Date("2026-11-16T00:00:00Z"));
    expect(corre.cerrado).toBe(false);
    expect(corre.prorrateo).toBe(0.5);
  });
});

const filaBase: CotizadoRow = {
  clienteSheet: "X", clientId: "1", clientName: "X", slug: "x",
  cotizado: {
    igPosteosSemana: 3, igReelesMes: 4, igVideosMes: 0, igStoriesSemana: 2, pautaIg: false, pautaLinkedin: false, pautaMeta: true, pautaGoogle: false,
    linkedinPosteosSemana: null, tiktokVideosMes: null, inversionMetaMes: 300000, inversionGoogleMes: null, avisosMes: 6,
  },
  realizado: { posteosMes: 10, videosMes: 2, storiesMes: 5, spendMeta: 140000, spendGoogle: 0, avisos: 4 },
  sinListaClickup: false, fuente: "instagram", esperadoMes: { posteos: 13, videos: 4, stories: 9 }, cumplimientoPct: 71,
};

describe("la cuenta del mes", () => {
  it("lo cotizado en plata y avisos se compara contra la parte del mes que pasó", () => {
    const m = mesDeFila(filaBase, "2026-11", false, 50);
    expect(m.inversionMeta).toEqual({ cotizado: 150000, realizado: 140000 });
    expect(m.avisos).toEqual({ cotizado: 3, realizado: 4 });
    expect(m.inversionGoogle.cotizado).toBeNull();
  });
  it("lee lo cotizado de la ficha y descarta lo que no es número", () => {
    expect(cotizadoDeFicha({ cotizado: { metaMes: 100, googleMes: "200", avisosMes: -1 } })).toEqual({ inversionMetaMes: 100, inversionGoogleMes: null, avisosMes: null });
    expect(cotizadoDeFicha(null)).toEqual({ inversionMetaMes: null, inversionGoogleMes: null, avisosMes: null });
  });
});

describe("seguidores", () => {
  it("ordena por mes y saltea lo roto", () => {
    expect(seriesDeSeguidores({ seguidores: { instagram: { "2026-11": 1200, "2026-10": 1100, x: 5 }, facebook: "no" } }))
      .toEqual({ instagram: [{ mes: "2026-10", n: 1100 }, { mes: "2026-11", n: 1200 }] });
  });
});

describe("informe trimestral", () => {
  const salud = { indice: 80, razones: [], leads: { ultimos30: 12, previos30: 9, dudosos: false }, calidadPauta: null, seguidores: { instagram: [{ mes: "2026-08", n: 1000 }, { mes: "2026-10", n: 1100 }] }, mejoras30: 3, oportunidades: 2 };
  it("dice la señal, los meses cerrados y lo que no está cargado", () => {
    const meses = ["2026-08", "2026-09", "2026-10"].map((mes) => mesDeFila({ ...filaBase, cumplimientoPct: 125 }, mes, true, 100));
    const t = textoInformeTrimestral({
      meses: [], cuenta: { clientId: "1", slug: "x", name: "X", meses: [...meses, mesDeFila(filaBase, "2026-11", false, 50)], senal: "sobre-servicio" },
      salud, cotizado: { metaMes: 300000, googleMes: null, avisosMes: 6 }, abonoMes: null, moneda: "ARS", nombre: "X",
    });
    expect(t).toContain("Período: 2026-08 a 2026-10.");
    expect(t).toContain("revisar el precio");
    expect(t).not.toContain("## 2026-11");
    expect(t).toContain("| Inversión Google | sin cargar | $0 |");
    expect(t).toContain("Seguidores en instagram: 1.100 (+100 desde 2026-08)");
    expect(t).toContain("sin pauta corriendo");
  });
  it("sin planilla no inventa", () => {
    const t = textoInformeTrimestral({ meses: [], cuenta: null, salud, cotizado: { metaMes: null, googleMes: null, avisosMes: null }, abonoMes: null, moneda: "ARS", nombre: "X" });
    expect(t).toContain("no está en la planilla");
  });
});

describe("carga del equipo en piezas", () => {
  // Fila de la planilla: col 2 posteos IG/semana, 3 reels/mes, 4 videos/mes, 9 posteos LinkedIn/semana, 12 videos TikTok/mes.
  const row: unknown[] = []; row[2] = "3"; row[3] = "4"; row[4] = "1"; row[9] = "1"; row[12] = "2";
  it("edición y filmaker cargan los videos; diseño, todo lo que se publica; pauta no se mide en piezas", () => {
    expect(piezasDelRol("Edición", row)).toBe(7);
    expect(Math.round(piezasDelRol("Diseño", row))).toBe(24);
    expect(piezasDelRol("Pauta", row)).toBe(0);
    expect(piezasDelRol("Copy", [])).toBe(0);
  });
});
