import { describe, expect, it } from "vitest";
import { columnasEnMarcha, type PedidoAgente } from "./contenido-en-marcha";

const p = (id: string, estado: string, actualizado: string): PedidoAgente => ({ id, identifier: id, titulo: id, estado, creado: actualizado, actualizado });

describe("Contenido: pedidos en marcha", () => {
  it("junta Producción y Edición por estado, lo más nuevo primero, sin lo listo ni lo cancelado", () => {
    const c = columnasEnMarcha([p("P1", "todo", "2026-11-19"), p("P2", "done", "2026-11-20"), p("P3", "blocked", "2026-11-18")], [p("E1", "todo", "2026-11-20"), p("E2", "cancelled", "2026-11-20")]);
    expect(c.map((x) => [x.titulo, x.pedidos.map((y) => `${y.origen}:${y.id}`)])).toEqual([
      ["En cola", ["Edición:E1", "Producción:P1"]],
      ["Produciendo", []],
      ["Para revisar", []],
      ["Frenados", ["Producción:P3"]],
    ]);
  });
});
