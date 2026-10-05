// La regla que estos tests protegen: el presupuesto es la primera palanca del
// sistema que SUBE gasto, y lo único que separa "empujar lo que rinde" de
// "fundir a un cliente" son estos tres guards — unidades, tope de paso y piso.
import { describe, expect, it } from "vitest";
import {
  aMenor,
  aMicros,
  deMenor,
  deMicros,
  HORAS_ENTRE_CAMBIOS,
  MINIMO_DIARIO,
  PASO_MAXIMO,
  validarPaso,
} from "../ads-budget.js";

describe("unidades", () => {
  // Confundir una por otra no da error: da un presupuesto 100 o 1.000.000 de
  // veces más grande, contra la cuenta real de un cliente.
  it("Meta va en centavos", () => {
    expect(aMenor(31_000)).toBe(3_100_000);
    expect(deMenor(3_100_000)).toBe(31_000);
  });

  it("Google va en micros", () => {
    expect(aMicros(31_000)).toBe(31_000_000_000);
    expect(deMicros(31_000_000_000)).toBe(31_000);
  });

  it("ida y vuelta no pierde plata", () => {
    for (const v of [1_000, 31_000, 84_500, 1_234_567]) {
      expect(deMenor(aMenor(v))).toBe(v);
      expect(deMicros(aMicros(v))).toBe(v);
    }
  });

  it("las dos escalas no son intercambiables", () => {
    // El test existe para que nadie "simplifique" usando una sola conversión.
    expect(aMenor(31_000)).not.toBe(aMicros(31_000));
  });
});

describe("validarPaso", () => {
  it("deja pasar un ajuste dentro del tope", () => {
    expect(validarPaso(10_000, 12_000)).toEqual({ ok: true });
    expect(validarPaso(10_000, 8_000)).toEqual({ ok: true });
  });

  it("acepta justo el tope y rechaza un peso más", () => {
    expect(validarPaso(10_000, 10_000 * (1 + PASO_MAXIMO)).ok).toBe(true);
    expect(validarPaso(10_000, 10_000 * (1 + PASO_MAXIMO) + 1).ok).toBe(false);
  });

  it("frena el salto grande en las dos direcciones", () => {
    const subir = validarPaso(10_000, 50_000);
    expect(subir.ok).toBe(false);
    const bajar = validarPaso(10_000, 1_500);
    expect(bajar.ok).toBe(false);
  });

  it("el rechazo dice con qué número reintentar", () => {
    // El mensaje es lo que lee el modelo para corregirse: sin el número sugerido
    // reintenta el mismo valor y vuelve a rebotar.
    const r = validarPaso(10_000, 50_000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("13000");
      expect(r.motivo).toContain("30%");
    }
  });

  it("no deja apagar una campaña por la puerta del presupuesto", () => {
    const r = validarPaso(MINIMO_DIARIO * 1.1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("pausa");
  });

  it.each([0, -5, NaN, Infinity])("rechaza un valor que no es un monto: %s", (v) => {
    expect(validarPaso(10_000, v as number).ok).toBe(false);
  });

  it("sin presupuesto actual NO se escribe", () => {
    // Un umbral que decide sobre la FALTA de un dato no puede afirmar nada: si
    // no sabemos de cuánto se parte, no se puede medir el salto.
    for (const actual of [0, -1, NaN]) {
      const r = validarPaso(actual as number, 10_000);
      expect(r.ok).toBe(false);
    }
  });

  it("el piso gana sobre el tope de paso", () => {
    // Bajar de 1.200 a 1.000 es sólo -17%, dentro del tope, pero queda en el
    // piso: el orden de los guards importa.
    expect(validarPaso(1_200, 999).ok).toBe(false);
  });
});

describe("la política no se afloja sin querer", () => {
  it("un paso del 30% y un cambio por día", () => {
    // Si alguien sube estos números, que sea a propósito: juntos son lo único
    // que impide que ocho corridas razonables multipliquen por ocho.
    expect(PASO_MAXIMO).toBe(0.3);
    expect(HORAS_ENTRE_CAMBIOS).toBe(24);
    expect(MINIMO_DIARIO).toBe(1_000);
  });

  it("el tope de paso solo no frena una escalada: hace falta el enfriamiento", () => {
    // Deja esto escrito en un test porque es el razonamiento que justifica el
    // cooldown, y es el que se pierde cuando alguien lo ve como una molestia.
    let presupuesto = 10_000;
    for (let i = 0; i < 8; i += 1) {
      const siguiente = presupuesto * (1 + PASO_MAXIMO);
      expect(validarPaso(presupuesto, siguiente).ok).toBe(true);
      presupuesto = siguiente;
    }
    expect(presupuesto).toBeGreaterThan(80_000);
  });
});
