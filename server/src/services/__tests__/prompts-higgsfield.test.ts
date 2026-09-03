// Checks de los validadores de prompt de Higgsfield.
//
// Son funciones puras y chicas, pero cada una nació de una falla real en
// producción y todas fallan en silencio: el prompt sale igual, solo que malo, y
// recién se ve en la imagen ya pagada. Los casos de acá son los que se
// encontraron probando contra las ideas reales de ClickUp el 17/8.

import { describe, expect, it } from "vitest";
import { esIngles, limpiarPrompt, marcaEnPrompt, recortar } from "../video-higgsfield.js";
import { formatoDe, planDe } from "../contenido-tipos.js";

describe("esIngles", () => {
  it("acepta un prompt de Higgsfield bien armado", () => {
    expect(esIngles("close-up of car battery with frost on terminals, cold blue ambient lighting, slow push-in")).toBe(true);
  });

  it("rechaza el spanglish que devolvía MiniMax", () => {
    expect(esIngles("Cinematic shot of cabinets de mangera lisa con luz natural")).toBe(false);
  });

  it("rechaza el copy en español que pegaba el fallback", () => {
    expect(esIngles("Reel educativo-preventivo con gancho estacional. Se muestran 5 señales de que la batería falla")).toBe(false);
  });
});

describe("marcaEnPrompt", () => {
  it("detecta la marca ajena que dispara ip_detected", () => {
    expect(marcaEnPrompt("mechanic's hand holding smartphone displaying WhatsApp icon", "BRACHETTA")).toBe("WhatsApp");
  });

  it("detecta el nombre del propio cliente", () => {
    expect(marcaEnPrompt("Distrillantas storefront at golden hour", "Distrillantas")).toBe("Distrillantas");
  });

  it("no salta con palabras cortas del nombre del cliente", () => {
    // "MA" y "Grupo" aparecen en cualquier texto: saltar ahí descartaba prompts buenos.
    expect(marcaEnPrompt("a bright modern apartment interior, soft window light", "GRUPO MA")).toBeNull();
  });

  it("deja pasar un prompt limpio", () => {
    expect(marcaEnPrompt("close-up of a car battery on a workshop bench, 85mm portrait lens", "BRACHETTA")).toBeNull();
  });
});

describe("limpiarPrompt", () => {
  it("saca el encabezado markdown que agrega el modelo", () => {
    // Se le pide "solo el prompt" y devolvió esto igual (18/8); viajaba al
    // modelo de video como parte de la escena.
    expect(limpiarPrompt("**Prompt:**\nA close-up of a car battery, warm light"))
      .toBe("A close-up of a car battery, warm light");
  });

  it("saca comillas, viñetas y bloques de código", () => {
    expect(limpiarPrompt('```\n- "wide shot of a workshop, soft light"\n```'))
      .toBe("wide shot of a workshop, soft light");
  });

  it("saca el preámbulo conversacional", () => {
    expect(limpiarPrompt("Here is the prompt: slow dolly across a lobby"))
      .toBe("slow dolly across a lobby");
  });

  it("no toca un prompt que ya viene limpio", () => {
    const p = "close-up of a tire tread, overcast light, 85mm";
    expect(limpiarPrompt(p)).toBe(p);
  });
});

describe("recortar", () => {
  it("no parte la última palabra", () => {
    const largo = "cinematic shot of a workshop, warm light, urgency meets professionalism, together";
    const corto = recortar(largo, 70);
    expect(corto.length).toBeLessThanOrEqual(70);
    expect(corto.endsWith("tog")).toBe(false);
    expect(largo.startsWith(corto)).toBe(true);
  });

  it("deja intacto lo que ya entra", () => {
    expect(recortar("short prompt", 100)).toBe("short prompt");
  });
});

describe("formatoDe", () => {
  it("usa el dropdown cuando está cargado", () => {
    expect(formatoDe("Clip corto")).toBe("clip");
    expect(formatoDe("Reel")).toBe("reel");
    expect(formatoDe("Vivo")).toBe("ninguno");
  });

  it("lee el título cuando el dropdown está vacío", () => {
    // 5 de 5 ideas reales de GRUPO MA venían sin tipo cargado y una tarea
    // llamada "Reel de transformación…" generaba UNA placa.
    expect(formatoDe(null, "Reel de transformación de terreno baldío")).toBe("reel");
    expect(formatoDe("", "Carrusel proceso de obra: de terreno vacío")).toBe("carrusel");
  });

  it("ignora la palabra si aparece lejos del título", () => {
    const texto = "Los errores más caros del inversor\nEste contenido funciona bien como reel";
    expect(formatoDe(null, texto)).toBe("placa");
  });

  it("sin señal alguna cae a placa, que es lo más barato", () => {
    expect(formatoDe(null, "Lo que nadie te cuenta")).toBe("placa");
  });
});

describe("planDe", () => {
  it("un reel son 3 clips", () => {
    expect(planDe("Reel", "Reel: tour").piezas).toBe(3);
  });

  it("respeta la cantidad de placas escrita en el título", () => {
    expect(planDe("Carrusel", "Carrusel 6 pasos para elegir batería").piezas).toBe(6);
  });
});
