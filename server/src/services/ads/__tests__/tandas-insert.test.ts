// El insert de una sola tanda rompio el sync de Distrillantas 9 noches
// seguidas (MAX_PARAMETERS_EXCEEDED) y, como el delete iba antes y sin
// transaccion, dejo al cliente sin julio ni agosto. Esto fija el calculo
// que parte el insert.
import { describe, expect, it } from "vitest";
import { MAX_BIND_PARAMS, filasPorTanda } from "../aggregator.js";

describe("filasPorTanda", () => {
  it("nunca deja pasar una tanda que supere el limite de Postgres", () => {
    for (const columnas of [1, 5, 13, 21, 24, 40, 300]) {
      expect(filasPorTanda(columnas) * columnas).toBeLessThanOrEqual(MAX_BIND_PARAMS);
    }
  });

  it("parte el caso real: 24 columnas no entran de a 3.000 filas", () => {
    // ads_insights tiene 24 columnas en el insert; 3.000 filas = 72.000 params.
    const tanda = filasPorTanda(24);
    expect(tanda).toBeLessThan(3000);
    expect(tanda).toBe(2730);
  });

  it("siempre devuelve al menos una fila, aun con una tabla absurda", () => {
    expect(filasPorTanda(999_999)).toBe(1);
    expect(filasPorTanda(0)).toBeGreaterThan(0);
  });
});
