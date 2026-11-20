import { describe, expect, it } from "vitest";
import { alternar, MAX_FIJADOS } from "./fijados";

describe("clientes fijados", () => {
  const c = (n: number) => ({ slug: `c${n}`, nombre: `Cliente ${n}` });
  it("fija y desfija con el mismo gesto", () => {
    const una = alternar([], c(1));
    expect(una).toEqual([c(1)]);
    expect(alternar(una, c(1))).toEqual([]);
  });
  it("con el riel lleno sale el más viejo", () => {
    const llena = Array.from({ length: MAX_FIJADOS }, (_, i) => c(i));
    const r = alternar(llena, c(99));
    expect(r).toHaveLength(MAX_FIJADOS);
    expect(r[0]).toEqual(c(1));
    expect(r.at(-1)).toEqual(c(99));
  });
});
