import { describe, expect, it } from "vitest";
import { PISO_ARS_POR_DIA, ordenarPorCosto, plataParada, type CostoCliente } from "../costo-de-no-hacer.js";

describe("plataParada", () => {
  it("mide la caída de gasto diario", () => {
    expect(plataParada(30_000, 0)).toBe(30_000);
    expect(plataParada(30_000, 10_000)).toBe(20_000);
  });

  it("un cliente que gasta igual o más no tiene nada parado", () => {
    expect(plataParada(30_000, 30_000)).toBe(0);
    expect(plataParada(10_000, 25_000)).toBe(0);
  });

  it("el que nunca gastó no tiene plata parada", () => {
    // Sin esto, las cuentas dormidas entrarían con costo 0 pero ocupando lugar.
    expect(plataParada(0, 0)).toBe(0);
  });

  it("por debajo del piso no cuenta", () => {
    expect(plataParada(1000, 1000 - (PISO_ARS_POR_DIA - 1))).toBe(0);
    expect(plataParada(1000, 1000 - PISO_ARS_POR_DIA)).toBe(PISO_ARS_POR_DIA);
  });
});

describe("ordenarPorCosto", () => {
  const costos = new Map<string, CostoCliente>([
    ["caro", { clientId: "caro", arsPorDia: 43_119, gastoDiarioPrevio: 88_365, gastoDiarioActual: 45_246 }],
    ["barato", { clientId: "barato", arsPorDia: 3_056, gastoDiarioPrevio: 3_056, gastoDiarioActual: 0 }],
  ]);

  it("lo que cuesta plata va primero, sin importar la antigüedad", () => {
    const filas = [
      { id: "viejo", clientId: null, diasParado: 76 },
      { id: "barato", clientId: "barato", diasParado: 2 },
      { id: "caro", clientId: "caro", diasParado: 1 },
    ];
    expect(ordenarPorCosto(filas, costos).map((f) => f.id)).toEqual(["caro", "barato", "viejo"]);
  });

  it("a igual costo, primero lo más viejo", () => {
    // Lo que no se puede tasar tiene que salir de la cola alguna vez: si solo
    // ordenara por plata, lo intasable no se toca nunca.
    const filas = [
      { id: "nuevo", clientId: null, diasParado: 3 },
      { id: "antiguo", clientId: null, diasParado: 76 },
    ];
    expect(ordenarPorCosto(filas, costos).map((f) => f.id)).toEqual(["antiguo", "nuevo"]);
  });

  it("el cliente sin costo medido queda en cero, no rompe", () => {
    const r = ordenarPorCosto([{ id: "x", clientId: "desconocido", diasParado: 1 }], costos);
    expect(r[0].arsPorDia).toBe(0);
  });
});
