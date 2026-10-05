// MA PROPIEDADES y HANSHI se quedaban sin creativos: Meta cortaba con
// "Please reduce the amount of data you're asking for" y el sync entero caía.
import { describe, expect, it } from "vitest";
import { limiteReducido } from "../meta.js";

const PESADA = '{"error":{"code":1,"message":"Please reduce the amount of data you\'re asking for, then retry your request"}}';

describe("limiteReducido", () => {
  it("ante 'reduce the amount of data' achica la página a la mitad", () => {
    expect(limiteReducido(50, PESADA)).toBe(25);
    expect(limiteReducido(25, PESADA)).toBe(12);
    expect(limiteReducido(9, PESADA)).toBe(5);
  });

  it("en el mínimo no sigue achicando: falla y queda registrado", () => {
    expect(limiteReducido(5, PESADA)).toBeNull();
  });

  it("otro error no es asunto de tamaño", () => {
    expect(limiteReducido(50, '{"error":{"code":10,"message":"(#10) requires pages_read_user_content"}}')).toBeNull();
    expect(limiteReducido(50, '{"error":{"code":2,"message":"Service temporarily unavailable"}}')).toBeNull();
  });
});
