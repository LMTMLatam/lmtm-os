// La regla que estos tests protegen: una propuesta que mueve plata se ejecuta
// sola al aprobarla, así que lo único que separa "un click" de "un movimiento
// que nadie entendió" es que el payload esté completo y bien formado.
//
// `esAccionPauta` es el portero: lo que no pasa por acá queda aprobado y SIN
// ejecutar, con el motivo escrito. Nunca se adivina qué quiso decir.
import { describe, expect, it } from "vitest";
import { esAccionPauta, TIPO_ACCION_PAUTA, type PayloadAccionPauta } from "../ads-propuestas.js";

const base = { clientId: "c-1", justificacion: "gastó $84.000 sin leads", resumen: "x" };

describe("esAccionPauta", () => {
  it("acepta una propuesta de duplicar", () => {
    expect(esAccionPauta({ ...base, accion: { accion: "duplicate", entityId: "123" } })).toBe(true);
  });

  it("una propuesta de duplicar sin entidad se rechaza", () => {
    // Aprobar esto crearia una entidad que gasta, o fallaria a mitad de camino.
    expect(esAccionPauta({ ...base, accion: { accion: "duplicate", entityId: "" } })).toBe(false);
  });

  it("acepta una pausa completa", () => {
    expect(esAccionPauta({ ...base, accion: { accion: "pause", entityType: "campaign", entityId: "123" } })).toBe(true);
  });

  it("acepta un cambio de presupuesto completo", () => {
    expect(
      esAccionPauta({ ...base, accion: { accion: "set_budget", entityType: "adset", entityId: "123", nuevoDiario: 12_000 } }),
    ).toBe(true);
  });

  it("acepta un movimiento entre dos entidades", () => {
    expect(
      esAccionPauta({
        ...base,
        accion: {
          accion: "shift_budget",
          desde: { entityType: "adset", entityId: "a" },
          hacia: { entityType: "adset", entityId: "b" },
          monto: 5_000,
        },
      }),
    ).toBe(true);
  });

  it.each([
    ["sin clientId", { ...base, clientId: "", accion: { accion: "pause", entityType: "campaign", entityId: "1" } }],
    ["sin entityId", { ...base, accion: { accion: "pause", entityType: "campaign", entityId: "" } }],
    ["presupuesto sin monto", { ...base, accion: { accion: "set_budget", entityType: "adset", entityId: "1" } }],
    ["monto como texto", { ...base, accion: { accion: "set_budget", entityType: "adset", entityId: "1", nuevoDiario: "12000" } }],
    ["movimiento sin destino", { ...base, accion: { accion: "shift_budget", desde: { entityType: "adset", entityId: "a" }, monto: 1 } }],
    ["acción desconocida", { ...base, accion: { accion: "duplicar", entityId: "1" } }],
    ["sin acción", base],
    ["null", null],
    ["un string", "pausá la campaña 123"],
  ])("rechaza: %s", (_caso, payload) => {
    expect(esAccionPauta(payload)).toBe(false);
  });

  it("un monto como texto no se coerciona", () => {
    // Si esto pasara, `Math.round("12000")` daría 12000 y el movimiento saldría
    // igual — pero `"12e4"` o `"12.000"` darían cualquier cosa contra la cuenta
    // real de un cliente. El tipo se verifica, no se adivina.
    expect(esAccionPauta({ ...base, accion: { accion: "set_budget", entityType: "adset", entityId: "1", nuevoDiario: "12.000" } })).toBe(false);
  });
});

describe("contrato del payload", () => {
  it("el tipo de aprobación es estable", () => {
    // Si cambia, las propuestas viejas quedan pendientes para siempre: nadie las
    // ejecuta porque `approve()` ya no las reconoce.
    expect(TIPO_ACCION_PAUTA).toBe("accion_pauta");
  });

  it("el resultado se escribe en el payload, no reemplaza la propuesta", () => {
    // La persona tiene que poder ver QUÉ aprobó incluso después de que falló.
    const aprobada: PayloadAccionPauta = {
      ...base,
      accion: { accion: "pause", entityType: "campaign", entityId: "123" },
      resultado: { ok: false, detalle: "Meta rechazó la pausa (400)", ejecutadoAt: new Date().toISOString() },
    };
    expect(esAccionPauta(aprobada)).toBe(true);
    expect(aprobada.justificacion).toBe("gastó $84.000 sin leads");
    expect(aprobada.resultado?.ok).toBe(false);
  });
});
