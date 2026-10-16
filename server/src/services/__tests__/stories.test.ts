import { describe, expect, it } from "vitest";
import { propuestasStories } from "../stories.js";

const AHORA = new Date("2026-10-16T15:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);

describe("recordatorio de stories", () => {
  const leidos = new Set(["a", "b", "c", "d"]);

  it("avisa a quien hace stories y se cortó", () => {
    const [p, ...resto] = propuestasStories([
      { clientId: "a", cliente: "RENO", ultima: hace(4), enElMes: 12 },
      { clientId: "b", cliente: "SERRAT", ultima: hace(1), enElMes: 20 }, // al día
    ], leidos, AHORA);
    expect(resto).toEqual([]);
    expect(p.que).toBe("Hace 4 días que no salen stories de RENO en Instagram");
    expect(p.clave).toBe("contenido:sin_stories:a");
    expect(p.responsable).toBe("equipo");
  });

  it("no avisa a quien no hace stories, ni si la lectura de su página falló", () => {
    expect(propuestasStories([
      { clientId: "c", cliente: "X", ultima: hace(10), enElMes: 1 }, // no es una cuenta de stories
      { clientId: "z", cliente: "Y", ultima: hace(10), enElMes: 15 }, // no se pudo leer: no se sabe
      { clientId: "d", cliente: "Z", ultima: null, enElMes: 0 },
    ], leidos, AHORA)).toEqual([]);
  });
});
