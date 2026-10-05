import { describe, expect, it } from "vitest";
import { armarCampanas, presupuestoEnMoneda, type FilaInsight } from "../campanas.js";

const ins = (p: Partial<FilaInsight>): FilaInsight => ({
  plataforma: "meta", campaignId: "c1", campaignName: "C1", adsetId: "a1",
  inversion: 0, impresiones: 0, clics: 0, leads: 0, dias: [], ...p,
});

describe("armarCampanas", () => {
  it("suma por campaña y por conjunto, ordena por inversión", () => {
    const r = armarCampanas(
      [
        ins({ adsetId: "a1", inversion: 1000, leads: 4, dias: ["2026-10-01", "2026-10-02"] }),
        ins({ adsetId: "a2", inversion: 500, leads: 0, dias: ["2026-10-02"] }),
        ins({ campaignId: "c2", adsetId: "b1", inversion: 3000, leads: 10, dias: ["2026-10-03"] }),
      ],
      [{ id: "c1", plataforma: "meta", nombre: "Campaña 1", estado: "ACTIVE", presupuestoMenor: 3_100_000 }],
      [],
      "2026-10-04",
    );
    expect(r.map((c) => c.campaignId)).toEqual(["c2", "c1"]);
    const c1 = r[1];
    expect(c1).toMatchObject({ inversion: 1500, leads: 4, cpl: 375, diasConGasto: 2, ultimoDiaConGasto: "2026-10-02", presupuestoDiario: 31_000 });
    expect(c1.conjuntos.map((a) => [a.adsetId, a.cpl])).toEqual([["a1", 250], ["a2", null]]);
  });

  it("una campaña activa sin gasto entra con 0 reales; una pausada sin gasto no entra", () => {
    const r = armarCampanas(
      [],
      [
        { id: "act", plataforma: "meta", nombre: "Prendida", estado: "ACTIVE", presupuestoMenor: null },
        { id: "pau", plataforma: "meta", nombre: "Pausada", estado: "PAUSED", presupuestoMenor: null },
      ],
      [{ id: "s1", plataforma: "meta", campaignId: "act", nombre: "Conjunto", estado: "ACTIVE", presupuestoMenor: 500_000 }],
      "2026-10-04",
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ campaignId: "act", inversion: 0, leads: 0, cpl: null, diasConGasto: 0, ultimoDiaConGasto: null });
    expect(r[0].conjuntos[0]).toMatchObject({ adsetId: "s1", presupuestoDiario: 5000, inversion: 0 });
  });

  it("una campaña ACTIVE con la fecha de fin vencida y sin gasto no entra (Meta no le cambia el estado)", () => {
    const r = armarCampanas(
      [],
      [
        { id: "vieja", plataforma: "meta", nombre: "Julio", estado: "ACTIVE", presupuestoMenor: null, fin: "2026-08-31" },
        { id: "viva", plataforma: "meta", nombre: "Octubre", estado: "ACTIVE", presupuestoMenor: null, fin: "2026-11-05" },
      ],
      [], "2026-10-04",
    );
    expect(r.map((c) => [c.campaignId, c.fin])).toEqual([["viva", "2026-11-05"]]);
  });

  it("filas de insights en cero no hacen entrar una campaña; el 2037 de Google es 'sin fin'", () => {
    const r = armarCampanas(
      [ins({ campaignId: "cero" }), ins({ plataforma: "google", campaignId: "g", adsetId: null, inversion: 5 })],
      [{ id: "g", plataforma: "google", nombre: "PMax", estado: "enabled", presupuestoMenor: null, fin: "2037-12-29" }],
      [], "2026-10-04",
    );
    expect(r.map((c) => [c.campaignId, c.fin])).toEqual([["g", null]]);
  });

  it("marca la campaña de Google que 'convierte' la mayoría de sus clics", () => {
    const r = armarCampanas(
      [
        ins({ plataforma: "google", campaignId: "busq", adsetId: null, inversion: 369755, clics: 4364, leads: 3857 }),
        ins({ plataforma: "google", campaignId: "sana", adsetId: null, inversion: 1000, clics: 100, leads: 5 }),
      ],
      [], [], "2026-10-04",
    );
    // la cuenta entera convierte 3862/4464: también "sana" queda dudosa
    expect(r.map((c) => [c.campaignId, c.leadsDudosos])).toEqual([["busq", true], ["sana", true]]);
  });

  it("una campaña de Google sana en una cuenta sana no se marca", () => {
    const r = armarCampanas([ins({ plataforma: "google", campaignId: "s", adsetId: null, inversion: 1000, clics: 100, leads: 5 })], [], [], "2026-10-04");
    expect(r[0].leadsDudosos).toBe(false);
  });

  it("no mezcla un id repetido entre plataformas", () => {
    const r = armarCampanas(
      [ins({ plataforma: "meta", campaignId: "9", inversion: 10 }), ins({ plataforma: "google", campaignId: "9", adsetId: null, inversion: 20 })],
      [], [], "2026-10-04",
    );
    expect(r.map((c) => [c.plataforma, c.inversion])).toEqual([["google", 20], ["meta", 10]]);
    expect(r[0].conjuntos).toEqual([]);
  });
});

describe("presupuestoEnMoneda", () => {
  it("Meta viene en centavos; Google no tiene presupuesto en la campaña", () => {
    expect(presupuestoEnMoneda("meta", 3_100_000)).toBe(31_000);
    expect(presupuestoEnMoneda("google", 31_000_000_000)).toBeNull();
    expect(presupuestoEnMoneda("meta", null)).toBeNull();
    expect(presupuestoEnMoneda("meta", 0)).toBeNull();
  });
});
