// Lo que este test protege: en Hoy se ve toda decisión con plata, y lo que se
// pliega se cuenta (nunca desaparece sin decir cuántas son ni de qué).
import { describe, expect, it } from "vitest";
import { frasePlegadas, plegarSinPlata } from "./plegar";

const d = (id: string, arsPorDia: number | null, tipo = "cola:esperando_persona") => ({ id, arsPorDia, tipo });

describe("plegarSinPlata", () => {
  it("muestra todas las que tienen plata aunque sean muchas, y solo algunas sin plata", () => {
    const conPlata = Array.from({ length: 9 }, (_, i) => d(`p${i}`, 1000 - i, "pauta:escalar"));
    const sinPlata = Array.from({ length: 80 }, (_, i) => d(`s${i}`, null, i < 42 ? "cola:esperando_persona" : "cobertura:fallando"));
    const r = plegarSinPlata([...conPlata, ...sinPlata], 5);
    expect(r.visibles.map((x) => x.id)).toEqual([...conPlata.map((x) => x.id), "s0", "s1", "s2", "s3", "s4"]);
    expect(r.plegadas).toHaveLength(75);
    // Las 5 a la vista salieron de la cola, así que de la cola quedan 37.
    expect(r.porFamilia).toEqual([
      { familia: "de datos que no estamos viendo", cantidad: 38 },
      { familia: "esperando a una persona", cantidad: 37 },
    ]);
  });

  it("no reordena: respeta el orden por plata del server", () => {
    const r = plegarSinPlata([d("a", 500), d("b", null), d("c", 100)], 5);
    expect(r.visibles.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("con pocas no pliega nada", () => {
    const r = plegarSinPlata([d("a", null), d("b", null)], 5);
    expect(r.plegadas).toEqual([]);
    expect(r.porFamilia).toEqual([]);
  });

  it("lo que no reconoce no lo inventa: va como 'otros temas'", () => {
    const r = plegarSinPlata([d("a", null, "nuevo:algo")], 0);
    expect(r.porFamilia).toEqual([{ familia: "de otros temas", cantidad: 1 }]);
  });
});

describe("frasePlegadas", () => {
  it("dice cuántas y de qué, en castellano", () => {
    expect(frasePlegadas([{ familia: "esperando a una persona", cantidad: 42 }])).toBe("42 esperando a una persona");
    expect(
      frasePlegadas([
        { familia: "esperando a una persona", cantidad: 42 },
        { familia: "de datos que no estamos viendo", cantidad: 33 },
        { familia: "de pauta", cantidad: 2 },
      ]),
    ).toBe("42 esperando a una persona, 33 de datos que no estamos viendo y 2 de pauta");
  });
});
