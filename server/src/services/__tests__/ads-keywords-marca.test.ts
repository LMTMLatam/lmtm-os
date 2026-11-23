import { describe, expect, it } from "vitest";
import { auditoriaAPasos, cruzarSeoConAds, esCampanaDeMarca, esTerminoDeMarca } from "../ads-keywords.js";

// Pedido de Marcos 23/11: que el SEO y las keywords de Google Ads se nutran entre sí.
describe("cruzarSeoConAds", () => {
  const esMarca = (s: string) => esTerminoDeMarca("INBELT", s);
  const q = (clave: string, impresiones: number, posicion: number, detalle = "https://inbelt.com.ar/") => ({ clave, detalle, posicion, impresiones });
  const consultas = [
    q("cintas transportadoras usadas", 300, 8.2),
    q("cintas transportadoras usadas", 40, 15, "https://inbelt.com.ar/usadas"), // misma búsqueda, otra página
    q("banda transportadora pvc precio", 120, 12),   // la cubre la keyword "banda transportadora"
    q("rodillos para cinta", 90, 2.1),               // ya sale arriba gratis
    q("inbelt rosario", 500, 9),                     // marca
    q("empalme de cintas", 30, 14),                  // poca demanda
    q("cinta modular plastica", 80, 11),             // ya se le muestra un anuncio
    q("correas industriales", 60, 18),
  ];
  const terminos = [
    { termino: "cinta modular plastica", conversiones: 0, costo: 900 },
    { termino: "correas industriales", conversiones: 2, costo: 5000 },
    { termino: "correas industriales", conversiones: 1, costo: 2500 },  // otra campaña: se suma
    { termino: "reparacion de cintas en planta", conversiones: 3, costo: 8000 }, // la web no aparece
    { termino: "rodillos para cinta", conversiones: 4, costo: 3000 },   // la web ya está 2.ª
    { termino: "inbelt telefono", conversiones: 5, costo: 100 },         // marca
    { termino: "cintas baratas", conversiones: 0, costo: 4000 },         // no convierte
  ];
  const r = cruzarSeoConAds(consultas, terminos, [{ texto: "Banda Transportadora" }], esMarca);

  it("SEO → Ads: demanda donde la web sale abajo y ninguna keyword ni anuncio la cubre", () => {
    expect(r.paraAds.map((x) => x.consulta)).toEqual(["cintas transportadoras usadas"]);
    expect(r.paraAds[0]).toMatchObject({ impresiones: 340, posicion: 8.2, pagina: "https://inbelt.com.ar/" });
  });

  it("Ads → SEO: lo que convierte pagando y no está en la primera página, sin la marca", () => {
    expect(r.paraSeo).toEqual([
      { termino: "correas industriales", conversiones: 3, costo: 7500, posicion: 18 },
      { termino: "reparacion de cintas en planta", conversiones: 3, costo: 8000, posicion: null },
    ]);
  });

  it("sin Search Console no cruza nada y la guía lo dice", () => {
    const vacio = cruzarSeoConAds([], terminos, [], esMarca);
    expect(vacio).toEqual({ conSearchConsole: false, paraAds: [], paraSeo: [] });
    const base = { cliente: "INBELT", cuenta: "1", desde: "2026-10-24", dias: 30, terminos: 7, clicsTotal: 50, gastoTotal: 23500, conversionesTotal: 15, negativas: [], nuevas: [], pausar: [], ampliaCara: [], ahorroMensual: 0, gastoMarcaSinConversion: 0 };
    expect(auditoriaAPasos({ ...base, cruceSeo: vacio }).cuerpo).toContain("Sin Search Console vinculado");
    const guia = auditoriaAPasos({ ...base, cruceSeo: r });
    expect(guia.titulo).toContain("3 acciones");
    expect(guia.cuerpo).toContain("`cintas transportadoras usadas` — 340 impresiones en 28 días, la web sale en la posición 8,2");
    expect(guia.cuerpo).toContain("`reparacion de cintas en planta` — 3 conversión(es) por $8.000; en orgánico no aparece");
  });
});

// El caso real que motivó el guard: el 3/9/26 la auditoría de Distrillantas
// proponía negativizar cinco búsquedas de marca + sucursal, todas con calidad
// 10/10 de Google. Aplicarlas habría apagado el mejor tráfico de la cuenta.
describe("esTerminoDeMarca", () => {
  it("reconoce marca + sucursal (el caso Distrillantas)", () => {
    for (const t of [
      "distrillantas pilar",
      "distrillantas beiro",
      "distrillantas merlo",
      "distrillantas liniers",
      "distrillantas avellaneda",
      "distrillantas cerca de mi",
      // La marca escrita separada (13/10: se proponía como negativa).
      "distri llantas",
      "distri-llantas pilar",
    ]) {
      expect(esTerminoDeMarca("Distrillantas", t)).toBe(true);
    }
  });

  it("deja pasar el desperdicio genuino: sin la marca, no es marca", () => {
    for (const t of ["neumaticos baratos", "gomeria 24 horas", "llantas usadas rosario"]) {
      expect(esTerminoDeMarca("Distrillantas", t)).toBe(false);
    }
  });

  it("ignora acentos y mayúsculas en los dos lados", () => {
    expect(esTerminoDeMarca("Neumáticos Córdoba", "neumaticos cordoba precio")).toBe(true);
    expect(esTerminoDeMarca("NEUMATICOS CORDOBA", "Neumáticos Córdoba")).toBe(true);
  });

  it("ignora palabras cortas del nombre para no tapar desperdicio real", () => {
    // "de" y "sa" aparecen en medio internet: si contaran, todo sería marca y
    // la auditoría no propondría una sola negativa.
    expect(esTerminoDeMarca("Hotel de SA", "cabañas de montaña")).toBe(false);
    // "hotel" es del rubro, no de la marca (12/11): "hotel barato" es desperdicio posible.
    expect(esTerminoDeMarca("Hotel de SA", "hotel barato")).toBe(false);
  });

  it("palabras del rubro no son marca (revisión 12/11)", () => {
    expect(esTerminoDeMarca("COSA PROPIEDADES", "espora propiedades")).toBe(false);
    expect(esTerminoDeMarca("COSA PROPIEDADES", "cosa propiedades rosario")).toBe(true);
    expect(esTerminoDeMarca("GRUPO ROIBAS", "grupo de whatsapp")).toBe(false);
    expect(esTerminoDeMarca("GRUPO ROIBAS", "roibas hotel")).toBe(true);
    // Si el nombre es todo palabras del rubro, la marca es el nombre entero.
    expect(esTerminoDeMarca("Grupo Global", "grupo global sa")).toBe(true);
    expect(esTerminoDeMarca("Grupo Global", "grupo de viajes")).toBe(false);
  });

  it("la marca mal escrita cargada como variante también es marca", () => {
    expect(esTerminoDeMarca("INBELT", "imbelt cintas")).toBe(false);
    expect(esTerminoDeMarca("INBELT", "imbelt cintas", ["imbelt"])).toBe(true);
  });
});

describe("esCampanaDeMarca", () => {
  it("una campaña que compra búsquedas genéricas no es de marca aunque lleve el nombre del cliente", () => {
    expect(esCampanaDeMarca("INBELT", "Search Inbelt refurbished LMTM")).toBe(false);
    expect(esCampanaDeMarca("INBELT", "Inbelt Branding Search LMTM n1 #2")).toBe(true);
    expect(esCampanaDeMarca("Distrillantas", "Distrillantas")).toBe(true);
    expect(esCampanaDeMarca("Distrillantas", "Marca - Distrillantas")).toBe(true);
    expect(esCampanaDeMarca("COSA PROPIEDADES", "Campaign #1")).toBe(false);
  });

  it("sin nombre utilizable, no marca nada como marca", () => {
    expect(esTerminoDeMarca("", "lo que sea")).toBe(false);
    expect(esTerminoDeMarca("A B C", "lo que sea")).toBe(false);
  });
});
