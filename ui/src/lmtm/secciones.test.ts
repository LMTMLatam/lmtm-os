import { describe, expect, it } from "vitest";
import { SECCIONES_CLIENTE, seccionDe } from "./secciones";

describe("mapa del panel", () => {
  it("la ficha conserva las 14 secciones de siempre, sin repetir", () => {
    const ids = SECCIONES_CLIENTE.map((s) => s.id);
    expect(new Set(ids).size).toBe(14);
    for (const id of ["resumen", "plan-accion", "dashboard", "web", "agentes", "calendario", "que-funciona", "ideas", "ganchos", "tendencias", "productos", "memoria", "competidores", "tasks"]) {
      expect(ids).toContain(id);
    }
  });
  it("una hija marca a su madre, y la ruta más específica gana", () => {
    expect(seccionDe("/trabajo")).toMatchObject({ madre: { to: "/agentes" }, label: "Trabajo" });
    expect(seccionDe("/contenido/calendario")).toMatchObject({ madre: null, label: "Calendario de todos los clientes" });
    expect(seccionDe("/produccion/tipos").label).toBe("Tipos de video");
    expect(seccionDe("/clientes/boero/calendario")).toMatchObject({ madre: { to: "/clientes" }, label: "Clientes" });
    expect(seccionDe("/nada").label).toBeNull();
  });
});
