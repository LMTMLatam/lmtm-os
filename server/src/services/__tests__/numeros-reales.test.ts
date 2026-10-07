// Ningún número del panel puede salir de un valor por defecto (pedido 7/10:
// "que no haya ni un número falso").
//
// QUÉ PASABA
// - La salud /100 rellenaba con 50 lo que no se medía: clientes sin pauta, sin
//   calendario y sin cuenta leída daban 78 "sin razones".
// - MONDINO daba salud 100 con "saldo crítico" como razón: la razón salía de un
//   aviso del 3/9 que nadie cerró y no movía el número.
// - Un cliente sin ningún dato salía VERDE en el semáforo ("en orden, sostener").
// - El score sin pauta salía 0/100 y se pintaba de rojo.
import { describe, expect, it } from "vitest";
import { componerSalud } from "../vigilantes.js";
import { operativaMedida, scoreVisible } from "../account-scoring.js";
import { decidirSemaforo, type SenalesCliente } from "../plan-accion.js";
import { formatoInstagram } from "../cotizado.js";

describe("componerSalud", () => {
  it("sin nada medido no hay número", () => {
    expect(componerSalud({ pauta: null, operativa: null, contenido: null })).toBeNull();
  });
  it("lo no medido no pesa: solo contenido → el número es el de contenido", () => {
    expect(componerSalud({ pauta: null, operativa: null, contenido: 80 })).toBe(80);
  });
  it("con todo medido pondera 40/30/30", () => {
    expect(componerSalud({ pauta: 50, operativa: 100, contenido: 100 })).toBe(80);
  });
  it("sin pauta reparte entre operativa y contenido mitad y mitad", () => {
    expect(componerSalud({ pauta: null, operativa: 40, contenido: 100 })).toBe(70);
  });
});

describe("score visible", () => {
  it("operativa por defecto (sin ClickUp o sin fechas) no es dato", () => {
    expect(operativaMedida({ noClickup: true })).toBe(false);
    expect(operativaMedida({ opsNote: "cargar fechas" })).toBe(false);
    expect(operativaMedida({ compliance: 0.8 })).toBe(true);
  });
  it("sin pauta, la salud de pauta es null (no 0)", () => {
    const v = scoreVisible({ healthScore: 0, opsScore: 55, components: { noAds: true, opsSinDato: true } });
    expect(v.healthScore).toBeNull();
    expect(v.opsScore).toBeNull();
  });
  it("con datos, pasa el número", () => {
    const v = scoreVisible({ healthScore: 72, opsScore: 90, components: { ctr: 1.5, compliance: 0.9 } });
    expect(v).toMatchObject({ healthScore: 72, opsScore: 90 });
  });
});

describe("semáforo sin datos", () => {
  const nada: SenalesCliente = { salud: null, cumplimientoPct: null, scorePauta: null, pautaCorre: false, maxLevel: 0, cumplimientoCiego: false };
  it("un cliente sin ninguna señal NO es verde", () => {
    expect(decidirSemaforo(nada)).toBe("sin-datos");
  });
  it("un cumplimiento ciego tampoco cuenta como dato", () => {
    expect(decidirSemaforo({ ...nada, cumplimientoPct: 0, cumplimientoCiego: true })).toBe("sin-datos");
  });
  it("con una señal medida ya se juzga", () => {
    expect(decidirSemaforo({ ...nada, salud: 85 })).toBe("verde");
  });
});

describe("formato de Instagram", () => {
  it("reel y video cuentan como video; carrusel y foto como posteo", () => {
    expect(formatoInstagram("reel")).toBe("videos");
    expect(formatoInstagram("video")).toBe("videos");
    expect(formatoInstagram("carousel")).toBe("posteos");
    expect(formatoInstagram("photo")).toBe("posteos");
    expect(formatoInstagram(null)).toBe("posteos");
  });
});
