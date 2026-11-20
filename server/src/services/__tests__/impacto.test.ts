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
    expect(r).toMatchObject({ mejoraron: 1, igual: 1, empeoraron: 1, midiendo: 1, pausado: { gastoSemana: 60000, consultasSemana: 2 } });
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

  it("indexa los clics a 100 antes del corte y descarta las semanas a medias", () => {
    const f = (semana: string, conAgentes: boolean, clics: number, dias = 7) => ({ semana, conAgentes, clics, dias });
    const r = indexarSemanas(
      [f("2026-10-20", true, 100), f("2026-10-20", false, 1000), f("2026-10-27", true, 300), f("2026-10-27", false, 3000),
        f("2026-11-10", true, 300), f("2026-11-10", false, 2000), f("2026-11-17", true, 50, 3), f("2026-11-17", false, 400, 3)],
      "2026-11-08",
    );
    expect(r).toEqual([
      { semana: "2026-10-20", conAgentes: 50, sinAgentes: 50 },
      { semana: "2026-10-27", conAgentes: 150, sinAgentes: 150 },
      { semana: "2026-11-10", conAgentes: 150, sinAgentes: 100 },
    ]);
  });
});
