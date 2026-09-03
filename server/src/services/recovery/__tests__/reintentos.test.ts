// La regla que estos tests protegen: la recuperación automática no puede
// convertirse en un lazo. El caso real es LMTM-3820, recuperado 38 veces con
// seis minutos entre intento e intento, sin destrabarse nunca (30/8/26).
import { describe, expect, it } from "vitest";
import {
  decidirRecuperacion,
  tituloParaPersona,
  ESPERA_ENTRE_INTENTOS_MS,
  MAX_INTENTOS,
  PREFIJO_HUMANO,
} from "../reintentos.js";

const ahora = new Date("2026-08-30T15:00:00Z");
const haceMin = (m: number) => new Date(ahora.getTime() - m * 60_000);

describe("decidirRecuperacion", () => {
  it("la primera vez recupera", () => {
    expect(decidirRecuperacion({ intentosPrevios: 0, ultimoIntento: null, ahora }))
      .toEqual({ accion: "recuperar" });
  });

  // El caso exacto que generaba el lazo.
  it("no reintenta seis minutos después del intento anterior", () => {
    const d = decidirRecuperacion({ intentosPrevios: 1, ultimoIntento: haceMin(6), ahora });
    expect(d.accion).toBe("esperar");
    expect(d.accion === "esperar" && d.motivo).toContain("6 min");
  });

  it("reintenta cuando ya pasó la espera", () => {
    expect(decidirRecuperacion({ intentosPrevios: 1, ultimoIntento: haceMin(121), ahora }).accion)
      .toBe("recuperar");
  });

  it("justo en el límite de la espera ya reintenta", () => {
    const limite = new Date(ahora.getTime() - ESPERA_ENTRE_INTENTOS_MS);
    expect(decidirRecuperacion({ intentosPrevios: 1, ultimoIntento: limite, ahora }).accion)
      .toBe("recuperar");
  });

  it("se rinde al llegar al tope de intentos", () => {
    const d = decidirRecuperacion({ intentosPrevios: MAX_INTENTOS, ultimoIntento: haceMin(500), ahora });
    expect(d.accion).toBe("rendirse");
    expect(d.accion === "rendirse" && d.motivo).toContain(String(MAX_INTENTOS));
  });

  // Importante: rendirse gana sobre esperar. Si ya no va a haber otro intento,
  // decir "esperá" dejaría el issue colgado para siempre sin pasar a nadie.
  it("se rinde aunque el último intento sea reciente", () => {
    expect(decidirRecuperacion({ intentosPrevios: 38, ultimoIntento: haceMin(6), ahora }).accion)
      .toBe("rendirse");
  });

  it("aguanta números raros sin romperse", () => {
    expect(decidirRecuperacion({ intentosPrevios: NaN, ultimoIntento: null, ahora }).accion).toBe("recuperar");
    expect(decidirRecuperacion({ intentosPrevios: -5, ultimoIntento: null, ahora }).accion).toBe("recuperar");
  });

  it("los topes son 3 intentos y 2 horas", () => {
    expect(MAX_INTENTOS).toBe(3);
    expect(ESPERA_ENTRE_INTENTOS_MS).toBe(7_200_000);
  });
});

describe("tituloParaPersona", () => {
  it("marca el issue para la cola humana", () => {
    expect(tituloParaPersona("Revisar pauta de GALA")).toBe(`${PREFIJO_HUMANO} Revisar pauta de GALA`);
  });

  it("no vuelve a marcar lo ya marcado", () => {
    const ya = `${PREFIJO_HUMANO} Revisar pauta de GALA`;
    expect(tituloParaPersona(ya)).toBe(ya);
  });

  it("no se pasa del largo de la columna", () => {
    expect(tituloParaPersona("x".repeat(250)).length).toBeLessThanOrEqual(200);
  });

  it("tolera un título vacío", () => {
    expect(tituloParaPersona("")).toBe(PREFIJO_HUMANO);
  });
});
