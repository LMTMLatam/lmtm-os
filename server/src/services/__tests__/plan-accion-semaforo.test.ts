// La regla que estos tests protegen: un semáforo donde casi todo está en rojo
// no ordena nada.
//
// QUÉ PASÓ EL 5/10/26, EN PRODUCCIÓN
// El tablero abrió con **39 críticos sobre 59 clientes**. Mirando los rojos,
// había clientes con salud 76 y 77 cuyo ÚNICO problema era "Cumplimiento del
// cotizado: 0%". Alcanzaba con ese número para pintarlos de crítico.
//
// Y ese 0% casi seguro no era real: el cumplimiento se cuenta contra piezas de
// ClickUp etiquetadas, y esa etiqueta ya nos había mentido antes. Un cero ahí
// no distingue "no se hizo nada" de "no pudimos medir".
//
// El costo no es cosmético: el que abre el panel y ve dos tercios en rojo
// concluye que el tablero está roto, y deja de creerle también a lo que sí es
// verdad.
import { describe, expect, it } from "vitest";
import {
  cumplimientoEstaCiego,
  decidirSemaforo,
  FRACCION_CIEGA,
  MINIMO_PARA_JUZGAR,
  type SenalesCliente,
} from "../plan-accion.js";

const sano: SenalesCliente = {
  salud: 80,
  cumplimientoPct: 95,
  scorePauta: 80,
  pautaCorre: true,
  maxLevel: 0,
  cumplimientoCiego: false,
};

describe("decidirSemaforo", () => {
  it("un cliente sano es verde", () => {
    expect(decidirSemaforo(sano)).toBe("verde");
  });

  it("EL CASO REAL: salud 77 y cumplimiento 0% NO es crítico", () => {
    // Es exactamente LMTM en la captura del 5/10: salud 77, cumplimiento 0%,
    // sin intervenciones graves. Estaba en rojo.
    const r = decidirSemaforo({ ...sano, salud: 77, cumplimientoPct: 0 });
    expect(r).not.toBe("rojo");
    expect(r).toBe("amarillo");
  });

  it("el cumplimiento SOLO nunca alcanza para rojo", () => {
    for (const cumpl of [0, 10, 25, 49]) {
      expect(decidirSemaforo({ ...sano, cumplimientoPct: cumpl })).toBe("amarillo");
    }
  });

  it("pero SUMA cuando hay una segunda señal", () => {
    // Cumplimiento malo + salud floja = rojo. Dos señales, no una.
    expect(decidirSemaforo({ ...sano, cumplimientoPct: 0, salud: 60 })).toBe("rojo");
    // Cumplimiento malo + intervención nivel 4 = rojo.
    expect(decidirSemaforo({ ...sano, cumplimientoPct: 0, maxLevel: 4 })).toBe("rojo");
  });

  it("lo que no admite otra lectura sigue pintando rojo solo", () => {
    expect(decidirSemaforo({ ...sano, salud: 30 })).toBe("rojo");          // salud en el piso
    expect(decidirSemaforo({ ...sano, maxLevel: 5 })).toBe("rojo");        // intervención L5
    expect(decidirSemaforo({ ...sano, scorePauta: 20 })).toBe("rojo");     // pauta rota CON gasto
  });

  it("pauta baja SIN gasto no es rojo: es un cliente sin pauta", () => {
    // El bug que ya pintó 40 de 58 clientes en rojo una vez. Sin pauta
    // contratada el score da bajo, y eso no es una cuenta rota.
    expect(decidirSemaforo({ ...sano, scorePauta: 0, pautaCorre: false })).toBe("verde");
  });

  it("si el cumplimiento está ciego, no decide NADA", () => {
    // Ni para rojo ni para impedir el verde: si el número no es de fiar, no
    // puede ni condenar ni absolver.
    expect(decidirSemaforo({ ...sano, cumplimientoPct: 0, cumplimientoCiego: true })).toBe("verde");
    expect(decidirSemaforo({ ...sano, cumplimientoPct: 0, salud: 60, cumplimientoCiego: true })).toBe("amarillo");
  });

  it("sin dato de salud ni de cumplimiento no se condena a nadie", () => {
    expect(decidirSemaforo({ ...sano, salud: null, cumplimientoPct: null, scorePauta: null })).toBe("verde");
  });
});

describe("cumplimientoEstaCiego", () => {
  it("media cartera en 0% es el contador, no la agencia", () => {
    const valores = [0, 0, 0, 0, 0, 90, 80, 70, 60, 95];
    expect(cumplimientoEstaCiego(valores)).toBe(true);
  });

  it("unos pocos en 0% es información real, no ceguera", () => {
    const valores = [0, 90, 80, 70, 60, 95, 88, 77, 91, 85];
    expect(cumplimientoEstaCiego(valores)).toBe(false);
  });

  it("con pocos clientes medidos no se concluye nada", () => {
    // Dos de tres en cero puede ser casualidad; no alcanza para desarmar la
    // métrica de toda la cartera.
    expect(cumplimientoEstaCiego([0, 0, 90])).toBe(false);
  });

  it("los que no se pueden medir no cuentan en la proporción", () => {
    // `null` es "sin lista de ClickUp mapeada", que es otra cosa que un 0%.
    expect(cumplimientoEstaCiego([null, null, null, 90, 85, 80, 95, 70])).toBe(false);
  });

  it("justo en el umbral ya se considera ciego", () => {
    const n = 10;
    const ceros = Math.ceil(n * FRACCION_CIEGA);
    const valores = [...Array(ceros).fill(0), ...Array(n - ceros).fill(90)];
    expect(valores.length).toBeGreaterThanOrEqual(MINIMO_PARA_JUZGAR);
    expect(cumplimientoEstaCiego(valores)).toBe(true);
  });

  it("todo sano no es ciego", () => {
    expect(cumplimientoEstaCiego([90, 85, 100, 95, 88, 92])).toBe(false);
  });
});
