import { describe, expect, it } from "vitest";
import { ordenarPorPlata, transicion } from "../ciclo.js";

describe("ciclo de una decisión", () => {
  it("el camino feliz llega a verificada", () => {
    expect(transicion("abierta", { tipo: "aprobar" })).toEqual({ ok: true, estado: "aprobada" });
    expect(transicion("aprobada", { tipo: "ejecutar" })).toEqual({ ok: true, estado: "ejecutada" });
    expect(transicion("ejecutada", { tipo: "verificar" })).toEqual({ ok: true, estado: "verificada" });
  });

  it("ejecutar desde abierta vale: apretar el botón es la firma", () => {
    expect(transicion("abierta", { tipo: "ejecutar" })).toEqual({ ok: true, estado: "ejecutada" });
  });

  it("ejecutada NO es el final: solo el dato la verifica", () => {
    // Nadie puede pasar de abierta o aprobada a verificada sin ejecutar: eso
    // sería dar por hecho lo que solo se mandó a hacer.
    expect(transicion("abierta", { tipo: "verificar" }).ok).toBe(false);
    expect(transicion("aprobada", { tipo: "verificar" }).ok).toBe(false);
  });

  it("si el dato no lo confirma, vuelve a abierta", () => {
    expect(transicion("ejecutada", { tipo: "no_confirmada" })).toEqual({ ok: true, estado: "abierta" });
  });

  it("descartar exige un motivo que diga algo", () => {
    expect(transicion("abierta", { tipo: "descartar", motivo: "" }).ok).toBe(false);
    expect(transicion("abierta", { tipo: "descartar", motivo: "   no " }).ok).toBe(false);
    expect(transicion("abierta", { tipo: "descartar", motivo: "El cliente pausó la pauta por vacaciones" })).toEqual({
      ok: true,
      estado: "descartada",
    });
  });

  it("lo cerrado no se mueve", () => {
    for (const cerrado of ["verificada", "descartada", "vencida"] as const) {
      expect(transicion(cerrado, { tipo: "aprobar" }).ok).toBe(false);
      expect(transicion(cerrado, { tipo: "ejecutar" }).ok).toBe(false);
      expect(transicion(cerrado, { tipo: "descartar", motivo: "un motivo largo" }).ok).toBe(false);
    }
  });

  it("lo ejecutado no se descarta ni vence por plazo: está esperando el dato", () => {
    expect(transicion("ejecutada", { tipo: "descartar", motivo: "ya no hace falta" }).ok).toBe(false);
    expect(transicion("ejecutada", { tipo: "vencer" }).ok).toBe(false);
  });

  it("solo se cierra sin confirmación lo ejecutado: nunca pasa por verificada sin dato", () => {
    expect(transicion("ejecutada", { tipo: "sin_confirmacion" })).toEqual({ ok: true, estado: "vencida" });
    expect(transicion("abierta", { tipo: "sin_confirmacion" }).ok).toBe(false);
  });
});

describe("ordenarPorPlata", () => {
  const f = (id: string, arsPorDia: number | null, dia: number) => ({ id, arsPorDia, createdAt: new Date(2026, 9, dia) });

  it("primero la plata, a igual plata la más vieja, lo no tasable al final pero presente", () => {
    const orden = ordenarPorPlata([f("sin", null, 1), f("chica", 3_000, 4), f("grande", 43_000, 5), f("chica-vieja", 3_000, 2)]);
    expect(orden.map((x) => x.id)).toEqual(["grande", "chica-vieja", "chica", "sin"]);
  });
});
