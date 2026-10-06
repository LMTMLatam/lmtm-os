// La regla que este test protege: en Hoy, lo urgente y la plata van primero.
//
// Hoy se mira desde el celular. El orden es el contrato (PLAN, superficies):
// arriba SOLO los incidentes de nivel 5, después la plata parada (un número
// que se lee de lejos) y las decisiones ordenadas por plata, y recién al final
// lo que espera el dato y la cobertura. Es un orden, así que se rompe sin que
// nadie lo note: la próxima franja que alguien quiera destacar se agrega
// arriba y lo urgente queda abajo del pliegue.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "Hoy.tsx"), "utf8");

function posicionDe(marca: string): number {
  const i = SRC.indexOf(marca);
  expect(i, `no encontré ${marca} en Hoy.tsx`).toBeGreaterThan(-1);
  return i;
}

describe("orden de la pantalla Hoy", () => {
  it("incidentes, plata parada, decisiones, lo que espera el dato y la cobertura, en ese orden", () => {
    const orden = [
      posicionDe('titulo="Incidentes"'),
      posicionDe("Plata parada por día"),
      posicionDe('titulo="Para decidir hoy"'),
      posicionDe('titulo="Hecho, esperando el dato"'),
      posicionDe('titulo="Qué estamos viendo"'),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("la plata parada se muestra en grande", () => {
    // Empezó como un span de 12px al lado de un título y se perdía. Es el
    // único dato que dice cuánto cuesta no hacer nada hoy.
    const i = posicionDe("pesos(h.plataParada)");
    const contexto = SRC.slice(Math.max(0, i - 300), i);
    expect(contexto).toMatch(/text-\[(4[4-9]|5\d)px\]/);
  });

  it("sin dato de plata parada dice 'sin dato', no $0", () => {
    const i = posicionDe("h.plataParada != null ?");
    expect(SRC.slice(i, i + 600)).toContain("sin dato");
  });
});
