import { describe, expect, it } from "vitest";
import { codigoDe, personaDelCodigo } from "../conector-personas.js";

const S = "secreto-de-prueba";
const lista = [{ nombre: "Marcos", version: 1, alta: "" }, { nombre: "Nazareno", version: 2, alta: "" }];

describe("links del conector por persona", () => {
  it("cada persona tiene su código y el código dice de quién es", () => {
    const m = codigoDe(lista[0]!, S)!;
    expect(m).toHaveLength(24);
    expect(codigoDe(lista[1]!, S)).not.toBe(m);
    expect(personaDelCodigo(m, lista, S)).toBe("Marcos");
  });
  it("subir la versión (link nuevo) invalida el anterior", () => {
    const viejo = codigoDe({ nombre: "Nazareno", version: 1 }, S)!;
    expect(personaDelCodigo(viejo, lista, S)).toBeNull();
  });
  it("sacar a la persona lo revoca, y sin secreto no hay códigos", () => {
    const m = codigoDe(lista[0]!, S)!;
    expect(personaDelCodigo(m, [lista[1]!], S)).toBeNull();
    expect(codigoDe(lista[0]!, null)).toBeNull();
  });
  it("no depende de mayúsculas del nombre", () => {
    expect(codigoDe({ nombre: "marcos", version: 1 }, S)).toBe(codigoDe(lista[0]!, S));
  });
});
