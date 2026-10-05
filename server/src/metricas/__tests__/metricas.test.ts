import { describe, expect, it } from "vitest";
import { conversionesDudosas, elegirObjetivo, razon, LEADS_MIN_HISTORIAL } from "../index.js";

describe("conversionesDudosas", () => {
  it("Google convirtiendo más de un tercio de los clics no son leads; Meta nunca se marca", () => {
    expect(conversionesDudosas("google", 3857, 4364)).toBe(true); // MA PROPIEDADES, búsqueda
    expect(conversionesDudosas("google", 339, 4697)).toBe(false); // COSA, 7%
    expect(conversionesDudosas("google", 5, 0)).toBe(false);
    expect(conversionesDudosas("meta", 900, 1000)).toBe(false); // mensajes: conversación ≈ clic
  });
});
import { avisoInconsistencia } from "../consistencia.js";

describe("razon", () => {
  it("sin denominador medible no inventa un número", () => {
    expect(razon(1000, 0)).toBeNull();
    expect(razon(1000, null)).toBeNull();
    expect(razon(null, 10)).toBeNull();
    expect(razon(1000, 4)).toBe(250);
  });
});

describe("elegirObjetivo", () => {
  const historial = { inversion: 2_519_604, leads: 2422 };

  it("lo que fijó una persona gana sobre todo", () => {
    expect(elegirObjetivo({ cplCliente: 900, historial, idealRubro: 1500 })).toEqual({ tcpl: 900, tcplFuente: "cliente" });
  });

  it("sin objetivo del cliente: CPL de 30 días × 0,8, redondeado", () => {
    // Distrillantas 31/08-29/09: 2.519.604 / 2.422 = 1.040,3 → × 0,8 = 832
    expect(elegirObjetivo({ cplCliente: null, historial, idealRubro: 1500 })).toEqual({ tcpl: 832, tcplFuente: "historial" });
  });

  it(`con menos de ${LEADS_MIN_HISTORIAL} leads el historial no alcanza y cae al rubro`, () => {
    expect(elegirObjetivo({ cplCliente: null, historial: { inversion: 50_000, leads: 3 }, idealRubro: 1500 }))
      .toEqual({ tcpl: 1500, tcplFuente: "rubro" });
  });

  it("sin nada de lo anterior: null, nunca un número inventado", () => {
    expect(elegirObjetivo({ cplCliente: null, historial: null, idealRubro: null })).toEqual({ tcpl: null, tcplFuente: null });
    expect(elegirObjetivo({ cplCliente: 0, historial: { inversion: 0, leads: 0 }, idealRubro: 0 })).toEqual({ tcpl: null, tcplFuente: null });
  });
});

describe("avisoInconsistencia", () => {
  it("todo cierra: no avisa", () => {
    expect(avisoInconsistencia({ filas: 25153, leadsMal: 0, conversionesMal: 0, huerfanas: 0 })).toBeNull();
  });

  it("si algo no cierra, dice qué y cuánto", () => {
    const t = avisoInconsistencia({ filas: 25153, leadsMal: 632, conversionesMal: 0, huerfanas: 3128 });
    expect(t).toContain("632 filas con leads distintos");
    expect(t).toContain("3128 sin cliente");
    expect(t).not.toContain("ventas distintas");
  });
});
