// La regla que este test protege: en Hoy, lo urgente y la plata van primero.
//
// Hoy se mira desde el celular. El orden es el contrato. Desde el 20/11 (pedido
// de Naza: «en la pantalla principal solo las alertas, cosas urgentes;
// prioridades como sugerencias») Hoy es: urgente, los números de la agencia
// (la plata parada, que se lee de lejos) y unas pocas sugerencias. La lista
// entera de decisiones quedó en DecisionesApp, con lo que espera el dato y la
// cobertura al final. Es un orden, así que se rompe sin que nadie lo note.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "HoyApp.tsx"), "utf8");

function posicionDe(marca: string, desde = 0): number {
  const i = SRC.indexOf(marca, desde);
  expect(i, `no encontré ${marca} en HoyApp.tsx`).toBeGreaterThan(-1);
  return i;
}

describe("orden de la pantalla Hoy", () => {
  it("Hoy: urgente, después los números de la agencia y recién ahí las sugerencias", () => {
    const hoy = posicionDe("export function HoyApp()");
    const orden = [
      posicionDe("<Urgente ", hoy),
      posicionDe("<NumerosAgencia ", hoy),
      posicionDe("Sugerencias para hoy", hoy),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("dentro de lo urgente, los incidentes van antes que el resto", () => {
    const urgente = posicionDe("function Urgente(");
    expect(posicionDe("<BloqueIncidente", urgente)).toBeLessThan(posicionDe("<GrupoUrgente", urgente));
  });

  it("Decisiones: los filtros, lo que espera el dato y la cobertura, en ese orden", () => {
    const orden = [
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
    expect(temaDe({ tipo: "web:caida_google" })).toBe("web");
    expect(temaDe({ tipo: "contenido:busquedas" })).toBe("web");
  });
});
