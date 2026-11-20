import { describe, expect, it } from "vitest";
import { alertasDeAgencia, movimientoCartera } from "./alertas";

const cliente = (ctr: number | null, cpl: number | null = 5000) => ({ id: "x", slug: "x", name: "x", syncStatus: null, ads30d: { spend: 1000, leads: 10, ctr, cpl, impressions: 1 } });
const nicho = (clientes: ReturnType<typeof cliente>[], ev: Record<string, number>) => ({ niche: "inmobiliaria", clients: clientes, benchmark: { pattern: "", evidence: ev } }) as never;

describe("alertas de la agencia", () => {
  it("avisa cuando más de la mitad del nicho está muy por debajo del CTR ideal (los datos de hoy: 4 de 8 en inmobiliaria)", () => {
    const a = alertasDeAgencia({ nichos: [nicho([cliente(0.02), cliente(0.01), cliente(0.04), cliente(0.06)], { idealCtr: 0.05 })] });
    expect(a[0]).toMatchObject({ tono: "atencion", grande: "2 de 4" });
  });
  it("no avisa con menos de 3 clientes medidos ni si la mayoría está bien", () => {
    expect(alertasDeAgencia({ nichos: [nicho([cliente(0.01), cliente(0.01)], { idealCtr: 0.05 })] })).toEqual([]);
    expect(alertasDeAgencia({ nichos: [nicho([cliente(0.05), cliente(0.06), cliente(0.01)], { idealCtr: 0.05 })] })).toEqual([]);
  });
  it("compara la frecuencia con la competencia del mismo nicho, en las dos direcciones", () => {
    const contenido = (nuestras: number, deEllos: number) =>
      ({ publicaciones: 0, dias: 180, formatos: [], angulos: [], nichos: [{ nicho: "inmobiliaria", cuentas: 8, publicaciones: nuestras, angulos: [], formatos: [] }],
        competencia: { nichos: [{ nicho: "inmobiliaria", cuentas: 52, publicaciones: deEllos, angulos: [], formatos: [] }] } }) as never;
    expect(alertasDeAgencia({ contenido: contenido(528, 1483) })[0]).toMatchObject({ tono: "bien", grande: "2,3×" });
    expect(alertasDeAgencia({ contenido: contenido(80, 1500) })[0]).toMatchObject({ tono: "atencion" });
  });
});

describe("movimiento de la cartera", () => {
  it("cuenta quién bajó, quién se mantuvo y quién subió (±10%), sin los dudosos ni los sin dato", () => {
    const f = (cpl: number | null, cplAnterior: number | null, leadsDudosos = false) => ({ semana: { cpl, cplAnterior, leadsDudosos } });
    expect(movimientoCartera({ clientes: [f(80, 100), f(105, 100), f(130, 100), f(50, 100, true), f(null, 100)] } as never)).toEqual({ bajo: 1, igual: 1, subio: 1 });
  });
});
