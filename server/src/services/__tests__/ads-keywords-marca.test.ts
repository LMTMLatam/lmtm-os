import { describe, expect, it } from "vitest";
import { esCampanaDeMarca, esTerminoDeMarca } from "../ads-keywords.js";

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
