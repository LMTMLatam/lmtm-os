// La regla que estos tests protegen: el sistema mueve plata de un cliente sin
// que nadie mire SOLO si se ganó el derecho con historial medido. Todo lo que
// no sea eso —poco historial, historial mediocre, historial con daño— vuelve a
// pedir OK.
import { afterEach, describe, expect, it } from "vitest";
import {
  autonomiaHabilitada,
  MINIMO_CASOS,
  nivelPorHistorial,
  PISO_MEJORA,
  TECHO_EMPEORA,
} from "../ads-autonomia.js";

const h = (mejor: number, peor: number, igual = 0) => ({ mejor, peor, igual, total: mejor + peor + igual });

describe("nivelPorHistorial", () => {
  it("sin historial pide OK", () => {
    // El default importa más que cualquier umbral: una flota que empieza
    // autónoma lo es porque alguien lo supuso, no porque lo haya demostrado.
    expect(nivelPorHistorial(null)).toBe("pide_ok");
  });

  it("con pocos casos pide OK aunque sean todos buenos", () => {
    expect(nivelPorHistorial(h(MINIMO_CASOS - 1, 0))).toBe("pide_ok");
  });

  it("con historial bueno y suficiente, ejecuta y avisa", () => {
    expect(nivelPorHistorial(h(8, 0, 2))).toBe("ejecuta_y_avisa");
  });

  it("un solo caso que EMPEORÓ alcanza para volver a preguntar", () => {
    // Asimétrico a propósito: "neutro" es aceptable para una acción automática,
    // "empeoró" es plata del cliente perdida sin que nadie haya mirado.
    expect(nivelPorHistorial(h(9, 1))).toBe("ejecuta_y_avisa"); // 10% justo en el techo
    expect(nivelPorHistorial(h(8, 2))).toBe("pide_ok"); // 20% ya es demasiado
  });

  it("mayoría de neutros no alcanza: hay que MEJORAR, no sólo no romper", () => {
    expect(nivelPorHistorial(h(3, 0, 7))).toBe("pide_ok");
  });

  it("justo en los dos umbrales, ejecuta", () => {
    const total = 10;
    expect(nivelPorHistorial({ mejor: total * PISO_MEJORA, peor: total * TECHO_EMPEORA, igual: 3, total })).toBe(
      "ejecuta_y_avisa",
    );
  });

  it("un historial todo malo nunca se gana el derecho", () => {
    expect(nivelPorHistorial(h(0, 10))).toBe("pide_ok");
  });

  it("total en cero no divide por cero ni se cuela", () => {
    expect(nivelPorHistorial({ mejor: 0, peor: 0, igual: 0, total: 0 })).toBe("pide_ok");
  });
});

describe("el interruptor general", () => {
  const previo = process.env.LMTM_AUTONOMIA_PAUTA;
  afterEach(() => {
    if (previo === undefined) delete process.env.LMTM_AUTONOMIA_PAUTA;
    else process.env.LMTM_AUTONOMIA_PAUTA = previo;
  });

  it("viene APAGADO", () => {
    delete process.env.LMTM_AUTONOMIA_PAUTA;
    expect(autonomiaHabilitada()).toBe(false);
  });

  it("solo lo prende un 1 explícito", () => {
    for (const v of ["0", "", "true", "si", "yes"]) {
      process.env.LMTM_AUTONOMIA_PAUTA = v;
      expect(autonomiaHabilitada()).toBe(false);
    }
    process.env.LMTM_AUTONOMIA_PAUTA = "1";
    expect(autonomiaHabilitada()).toBe(true);
  });
});

describe("los umbrales no se aflojan sin querer", () => {
  it("60% de mejora, 10% de daño, 5 casos", () => {
    expect(PISO_MEJORA).toBe(0.6);
    expect(TECHO_EMPEORA).toBe(0.1);
    expect(MINIMO_CASOS).toBe(5);
  });
});
