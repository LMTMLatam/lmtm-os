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
  // 20/11 (Naza): «la parte principal deberían ser gráficos […] no acción humana, eso derivalo a otro lado».
  it("Hoy: los números de la agencia, después las alertas y recién ahí los gráficos; sin acciones a mano", () => {
    const hoy = posicionDe("export function HoyApp()");
    const fin = posicionDe("const AREA =", hoy);
    const orden = [posicionDe('titulo="Inversión · 30 días"', hoy), posicionDe("Alertas</h2>", hoy), posicionDe('titulo="Inversión por día"', hoy)];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(SRC.slice(hoy, fin)).not.toContain("<Urgente ");
    expect(SRC.slice(hoy, fin)).not.toContain("<Lista ");
  });

  it("Pendientes: lo urgente va antes que la lista entera", () => {
    const pendientes = posicionDe("export function DecisionesApp()");
    expect(posicionDe("<Urgente ", pendientes)).toBeLessThan(posicionDe("<Contenido ", pendientes));
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

  it("los números de arriba se leen de lejos", () => {
    const i = posicionDe("function Numero(");
    expect(SRC.slice(i, i + 900)).toMatch(/text-\[(2[8-9]|[3-5]\d)px\]/);
  });

  it("sin dato de plata parada dice 'sin dato', no $0", () => {
    expect(posicionDe("h?.plataParada != null ? pesos(h.plataParada) : null")).toBeGreaterThan(-1);
    const i = posicionDe("function Numero(");
    expect(SRC.slice(i, i + 900)).toContain("sin dato");
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
