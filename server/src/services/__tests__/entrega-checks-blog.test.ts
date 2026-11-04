// La rutina del blog pedía no repetir temas y nada lo controlaba: 19 de las
// primeras 31 notas fueron "agencia agéntica". Los títulos son los reales.
import { describe, expect, it } from "vitest";
import { notaBlogRepetida } from "../entrega-checks.js";

const anteriores = [
  "Nota blog: Por qué tu negocio no aparece en Google Maps (y cómo arreglarlo)",
  "Nota blog: Qué es una agencia agéntica y por qué cambia el marketing en 2026",
  "Nota blog: 5 errores de marketing digital que más plata queman a las PyMEs",
  "Nota blog: Cuánto cuesta una agencia de marketing digital en Argentina (y qué incluye realmente en 2026)",
  "Nota blog: GEO para PyMEs argentinas: cómo aparecer en ChatGPT y Gemini en 2026",
  "Nota blog: Cuánto invierten las PyMEs argentinas en marketing digital 2026",
  "Nota blog: Cómo captar leads para tu inmobiliaria en Argentina 2026",
];

describe("notaBlogRepetida", () => {
  it.each([
    ["Nota blog: Agencia agéntica: qué es y cómo cambia tu PyME", anteriores[1]],
    ["Nota blog: Ficha de Google: cómo conseguir clientes en tu zona", anteriores[0]],
    ["Nota blog: Google Business Profile: cómo aparecer en Google Maps", anteriores[0]],
    ["Nota blog: Por qué tu negocio no aparece en Google Maps (y cómo arreglarlo)", anteriores[0]],
    ["Nota blog: 5 errores de marketing digital que siguen cometiendo las pymes argentinas en 2026", anteriores[2]],
    ["Nota blog: GEO en Argentina: cómo aparecer en respuestas de IA en 2026", anteriores[4]],
    ["Nota blog: Cómo aparecer en Google AI Overviews (guía 2026)", anteriores[4]],
    ["Nota blog: Captar leads para inmobiliarias en Argentina", anteriores[6]],
  ])("frena %s", (titulo, choca) => {
    expect(notaBlogRepetida(titulo, anteriores)).toBe(choca);
  });

  it.each([
    "Nota blog: CTR altísimo en Google Ads: cuándo desconfiar",
    "Nota blog: Cómo Levis tapó el logo en la cancha del mundial",
    "Nota blog: Qué mirar antes de renovar una campaña de WhatsApp",
    "Nota blog: Cómo llenar un hotel en temporada baja",
  ])("deja pasar %s", (titulo) => {
    expect(notaBlogRepetida(titulo, anteriores)).toBeNull();
  });

  it("sin notas anteriores no frena", () => {
    expect(notaBlogRepetida("Nota blog: Agencia agéntica: qué es", [])).toBeNull();
  });
});
