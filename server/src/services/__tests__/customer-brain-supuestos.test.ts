// La regla que estos tests protegen: un supuesto no se le presenta a un agente
// como si fuera un hecho medido del cliente.
//
// El caso real: un cliente sin referencias propias recibe un perfil derivado
// del NICHO con confidence 0.6. El texto decía de dónde salía, pero el armador
// del contexto tiraba la confianza y la línea llegaba igual que un dato medido.
// De ahí salió un agente hablando de una inmobiliaria para un cliente que no
// lo era, y lo tuvo que corregir una persona.
import { describe, expect, it } from "vitest";
import { AVISO_SUPUESTOS, esSupuesto, leerDecisor, textoDeDecisor, UMBRAL_CERTEZA } from "../customer-brain.js";

describe("esSupuesto", () => {
  it("un dato medido no es supuesto", () => {
    expect(esSupuesto(1)).toBe(false);
    expect(esSupuesto(0.9)).toBe(false);
  });

  it("justo en el umbral NO es supuesto, debajo sí", () => {
    expect(esSupuesto(UMBRAL_CERTEZA)).toBe(false);
    expect(esSupuesto(UMBRAL_CERTEZA - 0.01)).toBe(true);
  });

  it("el perfil derivado del nicho (0.6) es supuesto", () => {
    // Es exactamente el valor con el que se guarda el perfil prestado.
    expect(esSupuesto(0.6)).toBe(true);
  });

  it("la confianza llega como TEXTO desde la DB y se lee igual", () => {
    // `confidence` es numeric en Postgres y el driver lo devuelve como string:
    // compararlo sin parsear daría NaN y rompería la clasificación entera.
    expect(esSupuesto("0.9")).toBe(false);
    expect(esSupuesto("0.60")).toBe(true);
  });

  it.each([null, undefined, "", "mucha", NaN, {}])(
    "una confianza ilegible (%s) se trata como SUPUESTO",
    (v) => {
      // Falla del lado seguro: obligar a verificar de más cuesta mucho menos
      // que afirmar de menos sobre el negocio de un cliente.
      expect(esSupuesto(v)).toBe(true);
    },
  );
});

describe("el aviso", () => {
  it("dice qué NO hacer, no sólo que el dato es flojo", () => {
    // Una advertencia que sólo informa se lee como ruido; la que cambia la
    // conducta tiene que nombrar la conducta.
    expect(AVISO_SUPUESTOS).toContain("No las afirmes");
    expect(AVISO_SUPUESTOS).toContain("vea el cliente");
    expect(AVISO_SUPUESTOS).toContain("SUPUESTO");
  });
});

describe("decisor", () => {
  it("sin metadata no hay decisor", () => {
    for (const m of [null, undefined, {}, { decisor: null }, { decisor: "Juan" }, "texto"]) {
      expect(leerDecisor(m)).toBeNull();
    }
  });

  it("ignora los campos vacios en vez de guardar strings en blanco", () => {
    expect(leerDecisor({ decisor: { quien: "  ", canal: "WhatsApp" } })).toEqual({ canal: "WhatsApp" });
  });

  it("una ficha con solo campos vacios es como no tenerla", () => {
    expect(leerDecisor({ decisor: { quien: "", queLoFrena: "   " } })).toBeNull();
  });

  it("cuando NO esta cargado, el texto dice que NO se invente", () => {
    // "no esta cargado" a secas se lee como permiso para improvisar.
    const t = textoDeDecisor(null);
    expect(t).toContain("NO CARGADO");
    expect(t).toContain("No inventes");
    expect(t).toContain("pedí que lo carguen");
  });

  it("cuando esta completo, dice que todo le habla a esa persona", () => {
    const t = textoDeDecisor({
      quien: "Marcelo, dueno",
      queLeImporta: "leads que cierren",
      queLoFrena: "le fue mal con otra agencia",
      comoHablarle: "directo y con numeros",
      canal: "WhatsApp",
    });
    expect(t).toContain("Marcelo");
    expect(t).toContain("le habla a esta persona");
    expect(t).not.toContain("Sin cargar");
  });

  it("una ficha a medias NOMBRA lo que falta", () => {
    // Media ficha completada en silencio invita a rellenar el resto a ojo.
    const t = textoDeDecisor({ quien: "Marcelo" });
    expect(t).toContain("Marcelo");
    expect(t).toContain("Sin cargar todavia".replace("todavia", "todavía"));
    expect(t).toContain("no lo supongas");
  });
});
