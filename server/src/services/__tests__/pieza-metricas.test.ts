import { describe, expect, it } from "vitest";
import { TENSION_POR_RUBRO, ganadorDePiezas, interaccionDe, leerInsights, posteoDeLaTarea } from "../pieza-metricas.js";

const pieza = (clientId: string, interaccion: number, x: object = {}) => ({ clientId, interaccion, ...x });

describe("el lazo de medición de las piezas", () => {
  it("cada pieza se mide contra lo normal de SU cliente: la cuenta grande no gana por grande", () => {
    const grande = [pieza("g", 1000, { movimiento: "pulso" }), pieza("g", 1000, { movimiento: "pulso" }), pieza("g", 1100, { movimiento: "pulso" })];
    const chica = [pieza("c", 10, { movimiento: "relato" }), pieza("c", 30, { movimiento: "relato" }), pieza("c", 30, { movimiento: "relato" }), pieza("c", 10, { movimiento: "ficha" })];
    const r = ganadorDePiezas([...grande, ...chica]);
    expect(r.find((g) => g.dimension === "estilo")?.valor).toBe("relato");
  });
  it("con pocas piezas no afirma nada", () => {
    expect(ganadorDePiezas([pieza("a", 100, { movimiento: "pulso" }), pieza("a", 1, { movimiento: "ficha" })])).toEqual([]);
    // Un valor con una sola pieza tampoco, aunque el cliente tenga varias.
    expect(ganadorDePiezas([pieza("a", 500, { movimiento: "pulso" }), pieza("a", 10, { movimiento: "ficha" }), pieza("a", 10, { movimiento: "ficha" })]).filter((g) => g.valor === "pulso")).toEqual([]);
  });
  it("lo que no rinde más que lo normal no es ganador", () => {
    const parejas = ["a", "a", "a", "a"].map((c) => pieza(c, 10, { pilar: "vitrina" }));
    expect(ganadorDePiezas(parejas)).toEqual([]);
  });
  it("sin dato no es cero para la cuenta y los guardados valen como compartidos", () => {
    expect(interaccionDe({ reacciones: null, comentarios: null, compartidos: null })).toBe(0);
    expect(interaccionDe({ reacciones: 10, comentarios: 1, compartidos: 1, guardados: 1 })).toBe(10 + 3 + 10);
  });
  it("lo que Meta no devuelve queda null, nunca 0", () => {
    expect(leerInsights([{ name: "reach", values: [{ value: 120 }] }, { name: "saved", total_value: { value: 0 } }])).toEqual({ alcance: 120, vistas: null, guardados: 0, compartidos: null });
    expect(leerInsights(undefined)).toEqual({ alcance: null, vistas: null, guardados: null, compartidos: null });
  });
  it("vincula solo con certeza: un único reel en la ventana de la tarea", () => {
    const f = new Date("2026-11-10T12:00:00Z");
    const reel = (d: string) => ({ createdTime: new Date(d), postType: "reel" });
    expect(posteoDeLaTarea([reel("2026-11-10T14:00:00Z")], f)).not.toBeNull();
    expect(posteoDeLaTarea([reel("2026-11-10T14:00:00Z"), reel("2026-11-11T09:00:00Z")], f)).toBeNull();
    expect(posteoDeLaTarea([reel("2026-11-20T14:00:00Z")], f)).toBeNull();
    expect(posteoDeLaTarea([{ createdTime: new Date("2026-11-10T14:00:00Z"), postType: "photo" }], f)).toBeNull();
    expect(posteoDeLaTarea([{ createdTime: null, postType: "reel" }], f)).toBeNull();
  });
  it("«te escriben cuando estás cerrado» solo donde hay turnos, pedidos, reservas o consultas", () => {
    expect(TENSION_POR_RUBRO["turismo-hoteleria"]?.cerrado).toBe(true);
    expect(TENSION_POR_RUBRO["industria-b2b"]?.cerrado).toBe(false);
    expect(TENSION_POR_RUBRO["construccion-materiales"]?.cerrado).toBe(false);
    expect(TENSION_POR_RUBRO["muebles-amoblamientos"]?.cerrado).toBe(false);
  });
});
