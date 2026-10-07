import { describe, expect, it } from "vitest";
import { fallasVigentes } from "../make.js";

const ahora = Date.UTC(2026, 9, 7, 12);
const hace = (h: number) => new Date(ahora - h * 3_600_000).toISOString();

describe("fallasVigentes — solo lo que sigue roto", () => {
  it("un fallo viejo seguido de una corrida buena ya no es aviso", () => {
    // CARVUK, 07/10/26: salía "falló al publicar" por un error del 2/10.
    expect(fallasVigentes([
      { status: 3, timestamp: hace(120) },
      { status: 1, timestamp: hace(48) },
    ], ahora)).toHaveLength(0);
  });

  it("cuenta las fallas desde la última buena", () => {
    expect(fallasVigentes([
      { status: 1, timestamp: hace(72) },
      { status: 3, timestamp: hace(24) },
      { status: 3, timestamp: hace(2) },
    ], ahora)).toHaveLength(2);
  });

  it("lo de hace más de una semana no cuenta", () => {
    expect(fallasVigentes([{ status: 3, timestamp: hace(24 * 9) }], ahora)).toHaveLength(0);
  });
});
