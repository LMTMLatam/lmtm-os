import { describe, expect, it } from "vitest";
import { escalaY, topeRedondo } from "./graficos";

describe("escalas de los gráficos", () => {
  it("el eje termina en un número redondo, nunca por debajo del máximo", () => {
    expect(topeRedondo(614_464)).toBe(1_000_000);
    expect(topeRedondo(251)).toBe(500);
    expect(topeRedondo(1.26)).toBe(2);
    expect(topeRedondo(0)).toBe(1);
  });
  it("los valores crecen hacia arriba y los negativos quedan en la base", () => {
    expect(escalaY(0, 100, 140)).toBe(140);
    expect(escalaY(100, 100, 140)).toBe(0);
    expect(escalaY(-5, 100, 140)).toBe(140);
    expect(escalaY(10, 0, 140)).toBe(140);
  });
});
