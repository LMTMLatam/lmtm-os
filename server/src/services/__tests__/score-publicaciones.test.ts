// Score de publicaciones (pedido 21/11): lo que no se midió no cuenta como cero.
import { describe, expect, it } from "vitest";
import { puntuar, type PostMedido } from "../score-publicaciones.js";
import { insightsHasta, metricasDeInsights } from "../ads/providers/meta.js";

const post = (id: string, extra: Partial<PostMedido> = {}): PostMedido => ({ id, red: "instagram", interaccion: 10, alcance: null, difusion: null, intencion: null, consultas: null, ...extra });

describe("puntuar", () => {
  it("la que más interacción y alcance tuvo queda arriba, contra las de su misma cuenta", () => {
    const posts = [1, 2, 3, 4, 5].map((n) => post(`p${n}`, { interaccion: n * 10, alcance: n * 100, difusion: n }));
    const r = puntuar(posts);
    expect(r.get("p5")!.score).toBe(100);
    expect(r.get("p1")!.score).toBe(20);
    expect(Object.keys(r.get("p5")!.partes).sort()).toEqual(["interaccion", "viralidad"]);
  });

  it("sin pautar no es cero consultas: esa parte no entra en su score", () => {
    const posts = [1, 2, 3, 4, 5].map((n) => post(`p${n}`, { interaccion: n }));
    posts[4]!.consultas = 12; // la mejor en interacción, pautada y con consultas
    posts[0]!.consultas = 0; // pautada y sin consultas
    const r = puntuar(posts);
    expect(r.get("p3")!.partes.consultas).toBeUndefined();
    expect(r.get("p5")!.score).toBe(100);
    expect(r.get("p1")!.partes.consultas).toBe(0);
    expect(r.get("p1")!.score).toBeLessThan(r.get("p3")!.score!);
  });

  it("con poca muestra no califica; Facebook e Instagram no se mezclan", () => {
    const r = puntuar([post("a"), post("b"), post("f", { red: "facebook", interaccion: 9999 })]);
    expect(r.get("a")!.score).toBeNull();
    expect(r.get("f")!.score).toBeNull();
  });
});

describe("insights de Instagram", () => {
  it("lee los dos formatos de respuesta y no inventa lo que Meta no dio", () => {
    expect(metricasDeInsights([{ name: "reach", values: [{ value: 120 }] }, { name: "shares", total_value: { value: 0 } }, { name: "views" }]))
      .toEqual([{ metric: "ig_reach", value: 120 }, { metric: "ig_shares", value: 0 }]);
    expect(metricasDeInsights(undefined)).toEqual([]);
  });
  it("las recientes siempre; las viejas, solo en la corrida de la madrugada", () => {
    const hace = (d: number, ahora: Date) => new Date(ahora.getTime() - d * 86_400_000);
    const tarde = new Date("2026-11-21T15:00:00Z"), madrugada = new Date("2026-11-21T01:00:00Z");
    expect(insightsHasta(hace(10, tarde), tarde)).toBe(true);
    expect(insightsHasta(hace(60, tarde), tarde)).toBe(false);
    expect(insightsHasta(hace(60, madrugada), madrugada)).toBe(true);
  });
});
