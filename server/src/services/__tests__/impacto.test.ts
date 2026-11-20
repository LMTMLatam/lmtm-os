import { describe, expect, it } from "vitest";
import { cambiosWeb, impactoPauta, indexarSemanas } from "../impacto.js";

const accion = (clientId: string, createdAt: string, outcome: Record<string, unknown> | null, kind = "pause_ad_entity") => ({ clientId, cliente: clientId.toUpperCase(), slug: clientId, kind, createdAt, outcome });

describe("impacto de los agentes", () => {
  it("cuenta veredictos y toma, por cliente, el costo antes del primer cambio y después del último", () => {
    const r = impactoPauta([
      accion("a", "2026-10-20", { verdict: "improved", clientCplBefore: 1600, clientCplAfter: 1400, entitySpend7dBefore: 50000, entityLeads7dBefore: 2 }),
      accion("a", "2026-10-14", { verdict: "neutral", clientCplBefore: 2000, clientCplAfter: 1900, entitySpend7dBefore: 10000, entityLeads7dBefore: 0 }),
      accion("b", "2026-10-15", { verdict: "worse", clientCplBefore: "5000", clientCplAfter: "6000" }, "set_budget"),
      accion("c", "2026-11-19", null, "set_budget"),
    ]);
    expect(r).toMatchObject({ mejoraron: 1, igual: 1, empeoraron: 1, midiendo: 1 });
    expect(r.clientes).toEqual([
      { cliente: "A", slug: "a", cambios: 2, cplAntes: 2000, cplDespues: 1400 },
      { cliente: "B", slug: "b", cambios: 1, cplAntes: 5000, cplDespues: 6000 },
    ]);
  });

  it("agrupa los cambios de web por lo que resuelven", () => {
    expect(cambiosWeb([{ kind: "web_quitar_spam", clientId: "a" }, { kind: "web_actualizar_plugins", clientId: "a" }, { kind: "web_actualizar_wordpress", clientId: "b" }])).toEqual({
      webs: 2,
      total: 3,
      porTipo: [{ tipo: "Actualizaciones", n: 2 }, { tipo: "Spam quitado", n: 1 }],
    });
  });

  it("cada web cuenta desde que tiene Google conectado: el salto de conectarla no es mejora", () => {
    const f = (clientId: string, semana: string, conAgentes: boolean, clics: number | null, dias = 7) => ({ clientId, semana, conAgentes, clics, dias });
    const r = indexarSemanas(
      [
        // La web con agentes se conecta la semana del 12/10 (0 antes): cuenta desde el 19/10.
        f("a", "2026-10-05", true, 0), f("a", "2026-10-12", true, 80), f("a", "2026-10-19", true, 600), f("a", "2026-10-26", true, 600), f("a", "2026-11-02", true, 900), f("a", "2026-11-09", true, 50, 3),
        f("b", "2026-10-05", false, 100), f("b", "2026-10-12", false, 100), f("b", "2026-10-19", false, 100), f("b", "2026-10-26", false, 100), f("b", "2026-11-02", false, 100), f("b", "2026-11-09", false, 40, 3),
        // Conectada tarde y sin agentes: queda afuera.
        f("c", "2026-10-26", false, 0), f("c", "2026-11-02", false, 5000),
      ],
      "2026-11-01",
    );
    expect(r).toEqual([
      { semana: "2026-10-19", conAgentes: 100, sinAgentes: 100 },
      { semana: "2026-10-26", conAgentes: 100, sinAgentes: 100 },
      { semana: "2026-11-02", conAgentes: 150, sinAgentes: 100 },
    ]);
  });
  it("sin dos semanas antes del corte y una después, no hay comparación", () => {
    const f = (clientId: string, semana: string, conAgentes: boolean, clics: number) => ({ clientId, semana, conAgentes, clics, dias: 7 });
    expect(indexarSemanas([f("a", "2026-10-26", true, 10), f("a", "2026-11-02", true, 10), f("b", "2026-10-26", false, 10), f("b", "2026-11-02", false, 10)], "2026-11-01")).toEqual([]);
  });
});
