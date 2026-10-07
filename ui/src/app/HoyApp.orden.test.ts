// La regla que este test protege: en Hoy, lo urgente y la plata van primero.
//
// Hoy se mira desde el celular. El orden es el contrato (PLAN, superficies):
// arriba SOLO los incidentes de nivel 5, después la plata parada (un número
// que se lee de lejos) y las decisiones, y recién al final lo que espera el
// dato y la cobertura. Es un orden, así que se rompe sin que nadie lo note.
// (Viene de pages/Hoy.orden.test.ts: Hoy pasó a la app propia en la fase C1.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "HoyApp.tsx"), "utf8");

function posicionDe(marca: string): number {
  const i = SRC.indexOf(marca);
  expect(i, `no encontré ${marca} en HoyApp.tsx`).toBeGreaterThan(-1);
  return i;
}

describe("orden de la pantalla Hoy", () => {
  it("incidentes, plata parada, decisiones, lo que espera el dato y la cobertura, en ese orden", () => {
    const orden = [
      posicionDe("<TituloFranja critico>Incidentes"),
      posicionDe("Plata parada por día"),
      posicionDe('aria-label="Filtrar por tema"'),
      posicionDe("Hecho, esperando el dato"),
      posicionDe("Qué estamos viendo"),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("la plata parada se muestra en grande", () => {
    const i = posicionDe("pesos(h.plataParada)");
    const contexto = SRC.slice(Math.max(0, i - 300), i);
    expect(contexto).toMatch(/text-\[(4[4-9]|5\d)px\]/);
  });

  it("sin dato de plata parada dice 'sin dato', no $0", () => {
    const i = posicionDe("h.plataParada != null ?");
    expect(SRC.slice(i, i + 600)).toContain("sin dato");
  });

  it("los cambios de pauta que proponen los agentes van DESPUÉS de las decisiones", () => {
    // 07/10: arriba de todo, Hoy parecía una lista de campañas para pausar.
    expect(posicionDe("<PropuestasAgentes />")).toBeGreaterThan(posicionDe('aria-label="Filtrar por tema"'));
  });

  it("cada decisión cae en un tema", async () => {
    const { temaDe } = await import("./HoyApp");
    expect(temaDe({ tipo: "pauta:gasto_caido" })).toBe("plata");
    expect(temaDe({ tipo: "saldo:bajo" })).toBe("plata");
    expect(temaDe({ tipo: "cadena:sin_calendario" })).toBe("contenido");
    expect(temaDe({ tipo: "cobertura:sin_meta" })).toBe("conexiones");
    expect(temaDe({ tipo: "cola:esperando_persona" })).toBe("esperan");
  });
});
