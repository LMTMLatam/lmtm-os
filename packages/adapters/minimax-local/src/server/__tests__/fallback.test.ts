// La regla que estos tests protegen: caer a otro modelo es correcto cuando el
// preferido está SATURADO, y es un error cuando lo que está mal es el pedido.
// Reintentar un 400 con otro modelo gasta dos veces para fallar igual — y peor,
// tapa un error de configuración detrás de una respuesta que sí llega.
import { describe, expect, it } from "vitest";
import { esSobrecarga, MODELO_DE_RESPALDO } from "../models.js";

describe("esSobrecarga", () => {
  it.each([429, 502, 503, 529])("HTTP %i es saturación: se reintenta", (status) => {
    expect(esSobrecarga(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422, 500])("HTTP %i NO es saturación: se falla y se ve", (status) => {
    expect(esSobrecarga(status)).toBe(false);
  });

  it("200 nunca es saturación", () => {
    expect(esSobrecarga(200)).toBe(false);
  });

  it("también atrapa los códigos propios de MiniMax", () => {
    expect(esSobrecarga(200, 1002)).toBe(true);
    expect(esSobrecarga(200, 1027)).toBe(true);
  });

  it("2013 (modelo inexistente) NO dispara el fallback", () => {
    // Es el error que ya nos comimos con "MiniMax-M3-highspeed": caer a otro
    // modelo lo habría escondido, y el agente habría quedado corriendo con un
    // modelo que nadie eligió hasta que alguien mirara los logs.
    expect(esSobrecarga(400, 2013)).toBe(false);
  });
});

describe("MODELO_DE_RESPALDO", () => {
  it("el preview cae al estable", () => {
    expect(MODELO_DE_RESPALDO["MiniMax-M3.1-Flash-Preview"]).toBe("MiniMax-M3");
  });

  it("los modelos ESTABLES no tienen respaldo", () => {
    // A propósito: un estable que devuelve 529 tiene un problema que conviene
    // ver. Caer de un estable a otro escondería una caída real de MiniMax
    // detrás de una respuesta peor.
    for (const estable of ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2"]) {
      expect(MODELO_DE_RESPALDO[estable]).toBeUndefined();
    }
  });

  it("no hay ciclos: el respaldo de algo nunca vuelve al origen", () => {
    for (const [origen, respaldo] of Object.entries(MODELO_DE_RESPALDO)) {
      expect(MODELO_DE_RESPALDO[respaldo]).not.toBe(origen);
      expect(respaldo).not.toBe(origen);
    }
  });
});
