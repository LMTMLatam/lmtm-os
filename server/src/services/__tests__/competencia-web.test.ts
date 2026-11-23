// Qué trabaja la competencia en su web (pedido de Marcos 23/11: «nutrir la competencia»).
import { describe, expect, it } from "vitest";
import { cruzarConBusquedas, loCubre, palabrasClave, terminosDeLaCompetencia, type WebLeida } from "../competencia-web.js";

const web = (host: string, titulo: string, encabezados: string[] = [], descripcion: string | null = null): WebLeida => ({ host, titulo, descripcion, encabezados });

describe("terminosDeLaCompetencia", () => {
  const webs = [
    web("perez.com.ar", "Inmobiliaria Pérez | Alquiler de departamentos en Funes", ["Tasaciones sin cargo"]),
    web("gomez.com", "Gómez Propiedades - Alquiler de Departamentos en Funes y Roldán", ["Venta de lotes", "Tasaciones sin cargo"]),
    web("solo.com", "Solo Bienes Raíces", ["Venta de lotes en barrios cerrados"]),
  ];
  const t = terminosDeLaCompetencia(webs);

  it("solo cuenta lo que repiten dos competidores: la marca de uno no es un término del rubro", () => {
    // Como está escrito, con sus preposiciones.
    expect(t.map((x) => x.termino)).toEqual(["alquiler de departamentos en funes", "tasaciones sin cargo", "venta de lotes"]);
    expect(t.find((x) => x.termino === "venta de lotes")).toMatchObject({ competidores: 2, hosts: ["gomez.com", "solo.com"] });
    expect(t.some((x) => /perez|gomez|solo/.test(x.termino))).toBe(false);
  });

  it("el término de dos palabras que solo vive dentro de uno de tres no se repite", () => {
    expect(t.some((x) => x.termino === "alquiler de departamentos" || x.termino === "departamentos en funes")).toBe(false);
  });

  it("un eslogan no es un término: «la mejor opción» no cuenta", () => {
    expect(terminosDeLaCompetencia([web("a.com", "Tu mejor opción"), web("b.com", "La mejor opción con años de experiencia")])).toEqual([]);
  });

  it("no cruza el separador del título: «Pérez | Alquiler» no es un término", () => {
    const dos = terminosDeLaCompetencia([web("a.com", "Casas | Funes"), web("b.com", "Casas - Funes")]);
    expect(dos).toEqual([]);
  });

  it("sin acentos, sin mayúsculas y sin la s final, igual de los dos lados", () => {
    // «fune» no se muestra nunca: es la raíz con la que se compara.
    expect(palabrasClave("Alquiler de Departamentos en Funés")).toEqual(["alquiler", "departamento", "fune"]);
    expect(loCubre({ palabras: palabrasClave("alquiler departamentos Funes") }, ["departamento en alquiler funes centro"])).toBe(true);
    expect(loCubre({ palabras: palabrasClave("venta de lotes") }, ["venta de casas", "lotes en roldan"])).toBe(false);
  });
});

describe("cruzarConBusquedas", () => {
  const terminos = terminosDeLaCompetencia([
    web("a.com", "Alquiler de departamentos en Funes", ["Tasaciones sin cargo"]),
    web("b.com", "Alquiler de departamentos en Funes", ["Tasaciones sin cargo"]),
  ]);

  it("dice el mejor puesto del cliente para una búsqueda con esas palabras, o que no aparece", () => {
    const r = cruzarConBusquedas(terminos, [
      { clave: "alquiler departamentos funes", posicion: 14.2 },
      { clave: "alquiler de departamento en funes dueño directo", posicion: 6.5 },
      { clave: "tasaciones", posicion: 3 }, // no trae «cargo»: no es el término
    ]);
    expect(r.find((x) => x.termino === "alquiler de departamentos en funes")!.posicionDelCliente).toBe(6.5);
    expect(r.find((x) => x.termino === "tasaciones sin cargo")!.posicionDelCliente).toBeNull();
  });

  it("sin Search Console no inventa un puesto", () => {
    expect(cruzarConBusquedas(terminos, null).every((x) => x.posicionDelCliente === null)).toBe(true);
  });
});
