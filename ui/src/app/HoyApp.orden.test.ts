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
    // 20/11: lo que lograron los agentes va arriba, apenas después de los números («que muestren que está sirviendo»).
    const orden = [posicionDe('titulo="Inversión · 30 días"', hoy), posicionDe("<ImpactoAgentes />", hoy), posicionDe("Alertas</h2>", hoy), posicionDe('titulo="Inversión por día"', hoy)];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(SRC.slice(hoy, fin)).not.toContain("<Urgente ");
    expect(SRC.slice(hoy, fin)).not.toContain("<Lista ");
  });

  // 20/11 (Naza): «unificá pendientes y aprobaciones en una sección».
  it("Pendientes: urgente, después lo que se aprueba y al final lo que se hace", () => {
    const P = readFileSync(join(__dirname, "PendientesApp.tsx"), "utf8");
    const app = P.indexOf("export function PendientesApp()");
    const orden = [P.indexOf("<Urgente ", app), P.indexOf("<DecisionesDePauta ", app), P.indexOf("<PropuestasAgentes />", app), P.indexOf("<ParaHacer ", app)];
    expect(orden.every((i) => i > app)).toBe(true);
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

  it("los números de arriba se leen de lejos", () => {
    const i = posicionDe("function Numero(");
    expect(SRC.slice(i, i + 900)).toMatch(/text-\[(2[8-9]|[3-5]\d)px\]/);
  });

  it("sin dato de plata parada dice 'sin dato', no $0", () => {
    expect(posicionDe("h?.plataParada != null ? pesos(h.plataParada) : null")).toBeGreaterThan(-1);
    const i = posicionDe("function Numero(");
    expect(SRC.slice(i, i + 900)).toContain("sin dato");
  });

  it("la lista de para hacer no repite lo urgente ni lo que se aprueba", () => {
    const i = posicionDe("export function ParaHacer(");
    const fin = posicionDe("export function ", i + 10);
    expect(SRC.slice(i, fin)).not.toContain("<BloqueIncidente");
    expect(SRC.slice(i, fin)).not.toContain("<PropuestasAgentes");
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
    // Importa la pantalla entera (gráficos incluidos): con todos los tests en paralelo pasaba los 5 s por defecto.
  }, 30_000);
});
