// @vitest-environment jsdom
// «Nosotros contra la competencia» en Nichos y en la ficha (23/11): con cuántas publicaciones se midió cada lado,
// un sorteo de 124× que no aplasta el gráfico y lo último que le funcionó a la competencia.

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("./HoyApp", () => ({
  Tarjeta: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  TituloFranja: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const ej = (cliente: string, indice: number) => ({
  clientId: `ig:${cliente}`, cliente, slug: cliente, red: "instagram", formato: "reel", angulo: "vitrina", anguloNombre: "Mostrar el producto o la propiedad",
  indice, engagement: 500, fecha: "2026-11-16", permalink: `https://www.instagram.com/reel/${cliente}/`, texto: "Departamento de 2 dormitorios",
});
const fila = (clave: string, nombre: string, publicaciones: number, indice: number) => ({ clave, nombre, publicaciones, cuentas: 5, cuota: 0.04, indice, mejor: ej("x", indice) });

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn(async () => ({
      generadoAt: "2026-11-23T20:00:00Z", dias: 180, publicaciones: 522, cuentas: 8, clasificadas: 500, sinClasificar: 0,
      angulos: [], formatos: [], reutilizar: [], clientes: [],
      nichos: [{ nicho: "inmobiliaria", cuentas: 8, publicaciones: 522, angulos: [fila("institucional", "Marca y equipo", 19, 1.4)], formatos: [fila("Instagram · reel", "Instagram · reel", 273, 1.1)] }],
      competencia: {
        cuentas: 52, publicaciones: 1561, reutilizar: [],
        nichos: [{ nicho: "inmobiliaria", cuentas: 52, publicaciones: 1561, angulos: [fila("interaccion", "Pregunta, encuesta o sorteo", 12, 124.6), fila("novedad", "Novedad o evento", 53, 1.2)], formatos: [fila("Instagram · reel", "Instagram · reel", 668, 1.1)] }],
        ultimo: [{ nicho: "inmobiliaria", ...ej("@alagnapropiedades", 49) }, { nicho: "turismo-hoteleria", ...ej("@otrorubro", 80) }],
        estado: { conInstagram: 175, medidas: 149, noEncontradas: 26, noEmpresa: 0, otras: 0, sinRevisar: 0 },
      },
    })),
  },
}));

import { NichoVsCompetencia } from "./QueFunciona";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("Nichos → nosotros contra la competencia", () => {
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it("dice con cuántas publicaciones se midió cada lado, no desborda con un 124× y trae lo último del rubro", async () => {
    const root = createRoot(container);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => { root.render(<QueryClientProvider client={qc}><NichoVsCompetencia nicho="Inmobiliaria" /></QueryClientProvider>); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const t = container.textContent ?? "";
    expect(t).toContain("Marca y equipo · 19 nuestras, pocas de la competencia");
    expect(t).toContain("Novedad o evento · pocas nuestras, 53 de la competencia");
    expect(t).toContain("124,6×"); // el número va entero…
    const anchos = [...container.querySelectorAll<HTMLElement>("[style]")].map((e) => parseFloat(e.style.width)).filter((x) => !Number.isNaN(x));
    expect(Math.max(...anchos)).toBeLessThanOrEqual(100); // …y la barra no se sale
    expect(anchos.filter((x) => x > 20 && x < 100).length).toBeGreaterThan(0); // las demás barras se siguen viendo
    expect(t).toContain("Lo último que le funcionó a la competencia");
    expect(t).toContain("@alagnapropiedades");
    expect(t).not.toContain("@otrorubro");
    act(() => root.unmount());
  });
});
