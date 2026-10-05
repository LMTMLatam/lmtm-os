// Lo que este test protege: el orden de la Cartera. Primero la plata en
// riesgo; a igual plata, los que están más lejos de SU objetivo; lo que no
// tiene plata medida va después de lo que sí, nunca como si fuera 0.
import { describe, expect, it } from "vitest";
import { ordenarCartera, type FilaCartera } from "../cartera.js";

const fila = (cliente: string, o: Partial<FilaCartera> = {}): FilaCartera => ({
  clientId: cliente,
  cliente,
  slug: cliente.toLowerCase(),
  plataEnRiesgo: null,
  semana: { inversion: 1, leads: 1, cpl: 1, objetivo: 1, objetivoFuente: "cliente", leadsDudosos: false, cplAnterior: null },
  estado: "en_objetivo",
  fuentesConProblemas: [],
  sinPauta: false,
  decisiones: 0,
  proxima: null,
  informe: null,
  ...o,
});

describe("orden de la cartera", () => {
  it("plata en riesgo primero; a igual plata, el más lejos del objetivo; después por nombre", () => {
    const orden = ordenarCartera([
      fila("ZETA", { estado: "muy_arriba" }),
      fila("ALFA"),
      fila("MEDIO", { plataEnRiesgo: 10_000 }),
      fila("GRANDE", { plataEnRiesgo: 48_217 }),
      fila("BETA", { estado: "arriba" }),
      fila("CERO", { plataEnRiesgo: 0 }),
    ]).map((f) => f.cliente);
    expect(orden).toEqual(["GRANDE", "MEDIO", "CERO", "ZETA", "BETA", "ALFA"]);
  });
});
