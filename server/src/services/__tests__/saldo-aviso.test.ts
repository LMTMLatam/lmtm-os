import { describe, expect, it } from "vitest";
import { mereceAvisoDeSaldo } from "../balance-monitor.js";

// El filtro del aviso de saldo tiene TRES estados, no dos. Hasta el 16/9/26
// tenía dos: "gastó" y "no gastó" — y una cuenta de la que no teníamos datos
// de gasto caía en el segundo, así que desaparecía sola del reporte semanal
// con el saldo en cero. Los mappings que fallan en silencio no son un caso
// hipotético en este sistema (26 el 8/7/26).

const base = { low: true, activaReciente: true, gastoConocido: true };

describe("mereceAvisoDeSaldo", () => {
  it("cuenta viva con el saldo corto: se avisa", () => {
    expect(mereceAvisoDeSaldo(base)).toBe(true);
  });

  it("cuenta dormida que SABEMOS que no gastó: no se avisa", () => {
    // Es la razón por la que existe el filtro: 9 cuentas dormidas contra 1
    // real el 3/9/26 hacían ilegible el aviso.
    expect(mereceAvisoDeSaldo({ ...base, activaReciente: false })).toBe(false);
  });

  it("EL BUG: sin datos de gasto se avisa igual, no se oculta", () => {
    // Sin gastoConocido, `activaReciente: false` no es una medición: es que no
    // pudimos medir. No poder juzgar si está dormida no autoriza a tapar un
    // saldo en cero — el saldo lo da la plataforma y no depende de nuestro sync.
    expect(mereceAvisoDeSaldo({ low: true, activaReciente: false, gastoConocido: false })).toBe(true);
  });

  it("y el saldo sano nunca se avisa, sepamos o no del gasto", () => {
    expect(mereceAvisoDeSaldo({ low: false, activaReciente: true, gastoConocido: true })).toBe(false);
    expect(mereceAvisoDeSaldo({ low: false, activaReciente: false, gastoConocido: false })).toBe(false);
  });
});
