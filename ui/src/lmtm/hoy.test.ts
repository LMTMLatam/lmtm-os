import { describe, expect, it } from "vitest";
import type { Decision } from "../api/decisiones";
import { agruparUrgentes, MAX_SUGERENCIAS, repartirHoy } from "./hoy";

describe("lo urgente, agrupado", () => {
  it("cada urgente cae en su grupo y los grupos vacíos no aparecen", () => {
    const g = agruparUrgentes([d("1", "saldo:bajo"), d("2", "saldo:frenada"), d("3", "cadena:conexion_caida")]);
    expect(g.map((x) => [x.titulo, x.items.length])).toEqual([["Saldos por agotarse", 2], ["Publicación cortada", 1]]);
  });
});

const d = (id: string, tipo: string, arsPorDia: number | null = null) => ({ id, tipo, arsPorDia }) as unknown as Decision;

describe("Hoy: urgente, sugerencias y lo que solo se cuenta", () => {
  it("saldo y publicación cortada son urgentes; conexiones y esperas no ensucian las sugerencias", () => {
    const r = repartirHoy(
      [d("1", "saldo:bajo", 5000), d("2", "cadena:conexion_caida"), d("3", "cobertura:sin_meta"), d("4", "cola:esperando_persona"), d("5", "web:sin_conversiones")],
      [],
    );
    expect(r.urgentes.map((x) => x.id)).toEqual(["1", "2"]);
    expect(r.sugerencias.map((x) => x.id)).toEqual(["5"]);
    expect(r.conexiones).toHaveLength(1);
    expect(r.esperan).toHaveLength(1);
  });
  it("sugiere primero lo que tiene plata, después las oportunidades, y no más de 5", () => {
    const r = repartirHoy(
      [d("a", "web:x"), d("b", "pauta:landing", 100), d("c", "pauta:sumar_keywords", 900), ...["d", "e", "f", "g"].map((id) => d(id, "contenido:angulo"))],
      [d("op", "oportunidad:upsell")],
    );
    expect(r.sugerencias.map((x) => x.id).slice(0, 3)).toEqual(["c", "b", "op"]);
    expect(r.sugerencias).toHaveLength(MAX_SUGERENCIAS);
  });
});
