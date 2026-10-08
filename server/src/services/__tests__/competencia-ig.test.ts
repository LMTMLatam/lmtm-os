import { describe, expect, it } from "vitest";
import { estadoDeError, formatoDeMedia, textoCompetencia, usuarioDeInstagram } from "../competencia-ig.js";
import { analizarPublicaciones, type PublicacionMedida } from "../contenido-analisis.js";

describe("competencia medida (08/10)", () => {
  it("el usuario sale de @, de un link o de texto suelto; lo demás no es un usuario", () => {
    expect(usuarioDeInstagram("@CostaGalanaMdq")).toBe("costagalanamdq");
    expect(usuarioDeInstagram("https://www.instagram.com/hojofunes/?hl=es")).toBe("hojofunes");
    expect(usuarioDeInstagram("Hotel Costa Galana")).toBeNull();
    expect(usuarioDeInstagram(null)).toBeNull();
  });

  it("formato igual que el propio y el estado dice por qué no se midió", () => {
    expect(formatoDeMedia({ media_type: "VIDEO", media_product_type: "REELS" })).toBe("reel");
    expect(formatoDeMedia({ media_type: "CAROUSEL_ALBUM" })).toBe("carousel");
    expect(estadoDeError("(#110) Invalid user id")).toBe("no_encontrada");
    expect(estadoDeError("Only business or creator accounts can be discovered")).toBe("no_es_empresa");
  });

  it("el texto para agentes cita el rubro con muestra y no inventa si no hay", () => {
    const pubs: PublicacionMedida[] = [];
    for (const cuenta of ["a", "b"]) {
      for (let i = 0; i < 10; i++) {
        pubs.push({
          id: `${cuenta}${i}`, clientId: `ig:${cuenta}`, cliente: `@${cuenta}`, slug: cuenta, nicho: "turismo-hoteleria", red: "instagram",
          formato: i < 4 ? "reel" : "foto", angulo: i < 4 ? "detras" : "vitrina", engagement: i < 4 ? 60 : 20,
          fecha: "2026-10-01", permalink: `https://instagram.com/p/${cuenta}${i}`, texto: "x",
        });
      }
    }
    const a = analizarPublicaciones(pubs, 180, new Date("2026-10-08T12:00:00Z"));
    const t = textoCompetencia(a, "turismo-hoteleria");
    expect(t).toContain("2 cuentas de Instagram de competidores");
    expect(t).toContain("nunca el texto");
    expect(textoCompetencia(a, "inmobiliaria")).toBe("");
  });
});
