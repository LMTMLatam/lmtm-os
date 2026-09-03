import { describe, expect, it } from "vitest";
import { esTerminoDeMarca } from "../ads-keywords.js";

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
    // "hotel" sí tiene 4+ letras, así que ese término sí es de marca.
    expect(esTerminoDeMarca("Hotel de SA", "hotel barato")).toBe(true);
  });

  it("sin nombre utilizable, no marca nada como marca", () => {
    expect(esTerminoDeMarca("", "lo que sea")).toBe(false);
    expect(esTerminoDeMarca("A B C", "lo que sea")).toBe(false);
  });
});
