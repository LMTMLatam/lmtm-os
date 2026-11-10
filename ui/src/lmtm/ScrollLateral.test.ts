import { describe, expect, it } from "vitest";
import { bordes } from "./ScrollLateral";

describe("fila con scroll lateral", () => {
  it("dice de qué lado hay más para ver", () => {
    expect(bordes({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 400 })).toEqual({ izq: false, der: true });
    expect(bordes({ scrollLeft: 300, scrollWidth: 1200, clientWidth: 400 })).toEqual({ izq: true, der: true });
    expect(bordes({ scrollLeft: 800, scrollWidth: 1200, clientWidth: 400 })).toEqual({ izq: true, der: false });
    // Si entra todo, no hay flechas (y la ruedita sigue bajando la página).
    expect(bordes({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 })).toEqual({ izq: false, der: false });
  });
});
