import { afterEach, describe, expect, it, vi } from "vitest";
import { propuestaSeEjecutaSola } from "../piloto-automatico.js";

const ctx = { tcpl: { meta: 1000, google: null }, esMarca: () => false };

describe("piloto automático: qué hace solo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("frenar anuncios nunca, ni con el piloto prendido (20/10)", async () => {
    vi.stubEnv("LMTM_AUTONOMIA_PAUTA", "1");
    // Sin tocar la base: la pausa se corta antes de leer nada.
    const v = await propuestaSeEjecutaSola({} as never, "c", "cl", { accion: "pause", entityType: "campaign", entityId: "1" }, [], ctx);
    expect(v.si).toBe(false);
    expect(v.motivo).toMatch(/persona/);
  });

  it("duplicar tampoco", async () => {
    vi.stubEnv("LMTM_AUTONOMIA_PAUTA", "1");
    expect((await propuestaSeEjecutaSola({} as never, "c", "cl", { accion: "duplicate", entityId: "1" }, [], ctx)).si).toBe(false);
  });
});
