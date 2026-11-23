// @vitest-environment jsdom
// La pestaña Competencia de la ficha con lo medido (23/11): lo último en redes y qué trabajan en su web.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/clients", () => ({
  clientsApi: {
    listCompetitors: vi.fn(async () => ({ competitors: [{ id: "1", name: "Vanzini", fbPageUrl: null, notes: null, sampleAds: [] }] })),
    competencia: vi.fn(async () => ({
      dias: 30,
      competidores: [],
      oportunidades: [{ angulo: "emocional", nombre: "Emoción o aspiración", competidores: 2, indiceMediano: 3.3, ejemplo: "https://www.instagram.com/reel/x/" }],
      sinDatos: ["Squadra"],
      ultimas: [{ competidor: "Vanzini", fecha: "2026-11-22", formato: "reel", angulo: "Mostrar el producto o la propiedad", meGusta: 33, comentarios: 1, link: "https://www.instagram.com/reel/y/", texto: "Departamentos con financiación" }],
      web: {
        conWeb: 20, leidas: 18, faltan: 1, nota: "", conSearchConsole: true,
        terminos: [
          { termino: "mercado inmobiliario", competidores: 3, hosts: ["vanzini.com.ar"], posicionDelCliente: null },
          { termino: "inmobiliaria en rosario", competidores: 2, hosts: ["uno-propiedades.com.ar"], posicionDelCliente: 6.5 },
        ],
      },
    })),
    addCompetitor: vi.fn(),
    deleteCompetitor: vi.fn(),
  },
}));

import { CompetidoresTab } from "./Competencia";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("ficha → Competencia", () => {
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it("muestra lo último que publicaron, lo que les rinde y qué trabajan en su web con el puesto del cliente", async () => {
    const root = createRoot(container);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { id: "c1", slug: "ma-propiedades", name: "MA PROPIEDADES" } as any;
    await act(async () => { root.render(<QueryClientProvider client={qc}><CompetidoresTab client={client} /></QueryClientProvider>); });
    // Dos consultas en cadena: la lista de competidores y, con ella, lo medido.
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const t = container.textContent ?? "";
    expect(t).toContain("Lo último que publicaron");
    expect(t).toContain("22/11");
    expect(t).toContain("33 me gusta");
    expect(t).toContain("Emoción o aspiración");
    expect(t).toContain("3,3× lo normal de su cuenta");
    expect(t).toContain("Sin Instagram medido: Squadra.");
    expect(t).toContain("mercado inmobiliario · 3 competidores");
    expect(t).toContain("no aparece en Google");
    expect(t).toContain("puesto 6,5 en Google");
    expect(t).toContain("18 de 20 sitios leídos");
    act(() => root.unmount());
  });
});
