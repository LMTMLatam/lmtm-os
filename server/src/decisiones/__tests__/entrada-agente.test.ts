import { describe, expect, it } from "vitest";
import { claveDeAgente, validarAccion, validarEntradaAgente } from "../store.js";

const valida = {
  clientId: "6f1d1b2e-1c7a-4b8e-9a51-0c2d3e4f5a6b",
  tipo: "pauta:fatiga",
  que: "Reemplazar el anuncio «Llantas 4x4» antes del viernes",
  porque: { resumen: "Frecuencia 4,6 en 7 días.", datos: [{ etiqueta: "Frecuencia 7 días", valor: 4.6, unidad: "veces" }] },
  arsPorDia: 12_000,
  responsable: "equipo",
  accion: { tipo: "tarea", titulo: "Reemplazar anuncio con fatiga" },
};

describe("lo que propone un agente", () => {
  it("una propuesta completa entra", () => {
    const r = validarEntradaAgente(valida);
    expect(r.ok).toBe(true);
  });

  it("sin el por qué con números no entra: no se podría defender", () => {
    const r = validarEntradaAgente({ ...valida, porque: { resumen: "porque sí", datos: [] } });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.motivo).toContain("al menos un número");
  });

  it("arsPorDia null es 'no sé'; negativo no existe", () => {
    expect(validarEntradaAgente({ ...valida, arsPorDia: null }).ok).toBe(true);
    expect(validarEntradaAgente({ ...valida, arsPorDia: -5 }).ok).toBe(false);
  });

  it("responsable y tipo se validan contra el contrato", () => {
    expect(validarEntradaAgente({ ...valida, responsable: "jefe" }).ok).toBe(false);
    expect(validarEntradaAgente({ ...valida, tipo: "Pauta Fatiga" }).ok).toBe(false);
  });

  it("las acciones se validan una por una y no aceptan tipos inventados", () => {
    expect(validarAccion({ tipo: "presupuesto", entityType: "adset", entityId: "123", nuevoDiario: 12000 })).toMatchObject({ tipo: "presupuesto" });
    expect(validarAccion({ tipo: "presupuesto", entityType: "ad", entityId: "123", nuevoDiario: 12000 })).toHaveProperty("motivo");
    expect(validarAccion({ tipo: "borrar_campana", entityId: "1" })).toHaveProperty("motivo");
    // Un id con caracteres raros no llega a ninguna URL de Meta.
    expect(validarAccion({ tipo: "pausar", entityType: "adset", entityId: "1/../../me" })).toHaveProperty("motivo");
  });

  it("la clave no cambia por mayúsculas ni espacios: el agente que reintenta no duplica", () => {
    const a = claveDeAgente("ag1", { clientId: "c1", tipo: "pauta:fatiga", que: "Reemplazar  el anuncio X" });
    const b = claveDeAgente("ag1", { clientId: "c1", tipo: "pauta:fatiga", que: "reemplazar el anuncio x" });
    expect(a).toBe(b);
  });
});
