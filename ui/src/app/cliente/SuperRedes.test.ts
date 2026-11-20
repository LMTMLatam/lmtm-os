import { describe, expect, it } from "vitest";
import { pasaFiltro, type IdeaSuperRedes } from "./SuperRedes";

const idea = (o: Partial<IdeaSuperRedes>): IdeaSuperRedes => ({
  id: "t1", nombre: "Idea", url: null, status: null, creada: null, tipo: "Reel", estado: "IDEA", aprobacion: null, copy: null,
  pedida: false, generada: false, productor: null, ...o,
});

describe("filtros de Super Redes", () => {
  it("una idea pendiente de aprobación va a «Para aprobar», no a «Aprobadas»", () => {
    const i = idea({ aprobacion: "PENDIENTE" });
    expect(pasaFiltro(i, "aprobar")).toBe(true);
    expect(pasaFiltro(i, "aprobadas")).toBe(false);
  });
  it("lo pedido por el panel o por la etiqueta cuenta como pedido hasta que se genera", () => {
    expect(pasaFiltro(idea({ productor: { identifier: "LMTM-1", status: "todo" } }), "pedidas")).toBe(true);
    expect(pasaFiltro(idea({ pedida: true }), "pedidas")).toBe(true);
    expect(pasaFiltro(idea({ pedida: true, generada: true }), "pedidas")).toBe(false);
    expect(pasaFiltro(idea({ pedida: true, generada: true }), "generadas")).toBe(true);
  });
  it("«Aprobada» se lee del campo, sin importar mayúsculas", () => {
    expect(pasaFiltro(idea({ aprobacion: "Aprobado" }), "aprobadas")).toBe(true);
    expect(pasaFiltro(idea({ aprobacion: "RECHAZADO" }), "aprobadas")).toBe(false);
  });
});
