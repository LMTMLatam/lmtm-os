import { describe, expect, it } from "vitest";
import { armarFranjas, contarCobertura } from "../hoy.js";
import { esIncidenteDeFuente, propuestasDeCobertura } from "../reglas/existentes.js";

const d = (o: Record<string, unknown>) =>
  ({ tipo: "pauta:sin_leads", estado: "abierta", arsPorDia: null, porque: { resumen: "", datos: [] }, ...o }) as never;

describe("franjas de Hoy", () => {
  it("arriba solo los incidentes, aunque ya se esté haciendo algo", () => {
    const f = armarFranjas([
      d({ tipo: "saldo:frenada", estado: "ejecutada", arsPorDia: 30_000, porque: { resumen: "", datos: [], nivel: 5 } }),
      d({ tipo: "pauta:escalar", arsPorDia: 2_000 }),
      d({ tipo: "pauta:fatiga", estado: "ejecutada" }),
      d({ tipo: "cobertura:sin_meta" }),
    ]);
    expect(f.incidentes).toHaveLength(1);
    expect(f.decisiones.map((x: { tipo: string }) => x.tipo)).toEqual(["pauta:escalar"]);
    expect(f.esperando).toHaveLength(1);
    expect(f.sinMeta).toHaveLength(1);
  });

  it("la plata parada suma solo lo que es por cliente (cuentas frenadas y caídas): nunca dos veces lo mismo", () => {
    const f = armarFranjas([
      d({ tipo: "saldo:frenada", arsPorDia: 30_000, porque: { resumen: "", datos: [], nivel: 5 } }),
      d({ tipo: "pauta:gasto_caido", arsPorDia: 20_000 }),
      d({ tipo: "pauta:sin_leads", arsPorDia: 5_000 }),
    ]);
    expect(f.plataParada).toBe(50_000);
  });

  it("lo hecho sigue sumando hasta que el dato confirme, y los clientes son los mismos que se sumaron", () => {
    // Se tocó "Avisarle al cliente": la cuenta sigue frenada. El número grande
    // no puede decir "sin dato" mientras el incidente de abajo dice $30.000.
    const f = armarFranjas([
      d({ clientId: "a", tipo: "saldo:frenada", estado: "ejecutada", arsPorDia: 30_000, porque: { resumen: "", datos: [], nivel: 5 } }),
      d({ clientId: "b", tipo: "pauta:gasto_caido", arsPorDia: null }),
      d({ clientId: "c", tipo: "pauta:sin_leads", arsPorDia: 5_000 }),
    ]);
    expect(f.plataParada).toBe(30_000);
    expect(f.clientesParados).toBe(1);
  });

  it("sin nada medido, la plata parada es 'sin dato', no 0", () => {
    expect(armarFranjas([d({ tipo: "pauta:escalar", arsPorDia: 2_000 })]).plataParada).toBeNull();
  });
});

describe("cobertura", () => {
  it("cuenta clientes por fuente y estado", () => {
    const c = contarCobertura([
      { clientId: "a", fuente: "meta_ads", estado: "ok" },
      { clientId: "a", fuente: "google_ads", estado: "fallando" },
      { clientId: "b", fuente: "meta_ads", estado: "sin_conexion" },
    ]);
    expect(c.clientes).toBe(2);
    expect(c.porFuente.meta_ads.ok).toBe(1);
    expect(c.porFuente.google_ads.fallando).toBe(1);
  });

  it("una fuente de pauta caída es incidente solo si el cliente tenía datos hace poco", () => {
    const ahora = new Date("2026-10-05T12:00:00Z");
    expect(esIncidenteDeFuente({ fuente: "google_ads", ultimoDato: "2026-09-28" }, ahora)).toBe(true);
    expect(esIncidenteDeFuente({ fuente: "meta_ads", ultimoDato: "2026-06-15" }, ahora)).toBe(false); // HANSHI: pausada desde junio
    expect(esIncidenteDeFuente({ fuente: "organico", ultimoDato: "2026-10-04" }, ahora)).toBe(false);
    const [p] = propuestasDeCobertura(
      [{ clientId: "c", cliente: "SERRAT", fuente: "google_ads", estado: "fallando", ultimoDato: "2026-09-13", ultimaCorridaOk: null, fallasSeguidas: 30, fallandoDesde: "2026-09-14T03:00:00Z", ultimoError: "403", detalle: "" }],
      ahora,
    );
    expect(p.porque.nivel).toBe(5);
  });
});
