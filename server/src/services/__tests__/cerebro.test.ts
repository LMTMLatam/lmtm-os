import { describe, expect, it } from "vitest";
import { cobertura, curarMemoria } from "../cerebro.js";

const ahora = new Date("2026-11-15T12:00:00Z");
const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000).toISOString();
const m = (kind: string, content: string, dias: number, pinned = false, confidence: unknown = "0.9") =>
  ({ kind, key: content.slice(0, 10), content, pinned, confidence, updatedAt: hace(dias) });

describe("curarMemoria", () => {
  it("saca riesgos y eventos vencidos, salvo los fijados", () => {
    const r = curarMemoria([m("risk", "saldo bajo en la cuenta", 60), m("risk", "riesgo fijado viejo", 200, true), m("fact", "vende baterías", 400)], ahora);
    expect(r.map((x) => x.content)).toEqual(["riesgo fijado viejo", "vende baterías"]);
  });
  it("saca repetidas por el arranque del texto", () => {
    const r = curarMemoria([m("fact", "Tienen local en 27 de Febrero 2427", 1), m("fact", "tienen local en 27 de febrero 2427!!", 3)], ahora);
    expect(r).toHaveLength(1);
  });
  it("respeta el tope por tipo y marca los supuestos", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => m("preference", `preferencia número ${i}`, i, false, "0.5"));
    const r = curarMemoria(muchas, ahora, 8);
    expect(r).toHaveLength(8);
    expect(r.every((x) => x.supuesto)).toBe(true);
  });
});

describe("cobertura", () => {
  const base = { tono: true, logo: true, colores: true, publico: true, diferencial: true, web: true, productos: 3, competidores: 2, nas: true, pauta: true, memoria: 10 };
  it("completa = 100 %", () => {
    expect(cobertura(base)).toMatchObject({ porcentaje: 100, falta: [] });
  });
  it("dice qué falta", () => {
    const c = cobertura({ ...base, logo: false, productos: 0, memoria: 2 });
    expect(c.falta).toEqual(["logo", "productos o servicios cargados", "memoria (5 notas o más)"]);
    expect(c.porcentaje).toBe(73);
  });
});
