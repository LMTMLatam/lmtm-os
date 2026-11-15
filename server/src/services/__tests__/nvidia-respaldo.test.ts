import { describe, expect, it } from "vitest";
import { MODELO_TEXTO, MODELO_TEXTO_RESPALDO, probarRespaldo } from "../nvidia-modelos.js";

describe("respaldo del modelo de texto (15/11)", () => {
  it("prueba el respaldo si el principal murió o no contestó", () => {
    expect(probarRespaldo({ motivo: "http", detalle: "404: Not Found" })).toBe(true);
    expect(probarRespaldo({ motivo: "red", detalle: "The operation was aborted due to timeout" })).toBe(true);
  });
  it("no lo prueba por un error del pedido o una respuesta vacía", () => {
    expect(probarRespaldo({ motivo: "http", detalle: "400: bad request" })).toBe(false);
    expect(probarRespaldo({ motivo: "vacio", detalle: "" })).toBe(false);
  });
  it("los modelos por defecto no son los que murieron", () => {
    expect([MODELO_TEXTO, MODELO_TEXTO_RESPALDO]).not.toContain("nvidia/nemotron-3-super-120b-a12b");
    expect([MODELO_TEXTO, MODELO_TEXTO_RESPALDO]).not.toContain("openai/gpt-oss-20b");
  });
});
