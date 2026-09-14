import { describe, expect, it } from "vitest";
import { REGLAS, aRed, esCarrusel, esVideo, topeDeTexto, validarPieza } from "../redes-reglas.js";

describe("aRed — el campo Plataformas lo cargan personas", () => {
  it("reconoce las seis redes que usa la agencia", () => {
    expect(aRed("Instagram")).toBe("instagram");
    expect(aRed("Facebook")).toBe("facebook");
    expect(aRed("LinkedIn")).toBe("linkedin");
    expect(aRed("YouTube")).toBe("youtube");
    expect(aRed("Pinterest")).toBe("pinterest");
    expect(aRed("Google My Business")).toBe("gmb");
  });

  it("aguanta mayúsculas, espacios y nombres viejos", () => {
    expect(aRed("  INSTAGRAM ")).toBe("instagram");
    expect(aRed("Tik Tok")).toBe("tiktok");
    expect(aRed("Twitter")).toBe("x");
    expect(aRed("X")).toBe("x");
    expect(aRed("Perfil de Empresa")).toBe("gmb");
  });

  it("lo que no reconoce devuelve null, no adivina", () => {
    // Adivinar acá es peor que no saber: una red mal mapeada valida contra las
    // reglas equivocadas y el post falla igual, pero ahora con un OK encima.
    expect(aRed("Onlyfans")).toBeNull();
    expect(aRed("")).toBeNull();
  });
});

describe("validarPieza — qué va a fallar cuando llegue la fecha", () => {
  const base = { redes: ["Instagram"], largoTexto: 100, formato: "Placa" };

  it("una pieza que cumple no reporta nada", () => {
    expect(validarPieza(base).problemas).toEqual([]);
  });

  // El caso más común: un copy escrito para Instagram que también va a
  // Pinterest, donde el tope es cuatro veces menor.
  it("detecta el texto que se pasa del tope de la red más chica", () => {
    const r = validarPieza({ ...base, redes: ["Instagram", "Pinterest"], largoTexto: 900 });
    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0].red).toBe("pinterest");
    expect(r.problemas[0].problema).toContain("900");
    expect(r.problemas[0].problema).toContain("500");
    expect(r.problemas[0].problema).toContain("Sobran 400");
  });

  it("YouTube con un formato que no es video no va a salir", () => {
    const r = validarPieza({ ...base, redes: ["YouTube"], formato: "Placa" });
    expect(r.problemas.some((p) => p.problema.includes("solo publica video"))).toBe(true);
  });

  it("pero un Reel a YouTube está bien", () => {
    expect(validarPieza({ ...base, redes: ["YouTube"], formato: "Reel" }).problemas).toEqual([]);
  });

  it("un carrusel de 12 no entra en Instagram", () => {
    const r = validarPieza({ ...base, formato: "Carrusel", cantidadPiezas: 12 });
    expect(r.problemas[0].problema).toContain("12");
    expect(r.problemas[0].problema).toContain("10");
  });

  // Sin el dato de cuántas piezas hay, decir que está bien es tan falso como
  // decir que está mal. Es la misma regla que el resto del sistema.
  it("sin saber cuántas piezas tiene, no inventa un veredicto", () => {
    expect(validarPieza({ ...base, formato: "Carrusel" }).problemas).toEqual([]);
    expect(validarPieza({ ...base, formato: "Carrusel", cantidadPiezas: null }).problemas).toEqual([]);
  });

  it("no repite la misma red cargada dos veces", () => {
    const r = validarPieza({ ...base, redes: ["Instagram", "instagram", " INSTAGRAM "], largoTexto: 9000 });
    expect(r.problemas).toHaveLength(1);
  });
});

// Del mapa de la agencia: el despachador 1427144 no tiene ruta para estas redes
// y las descarta EN SILENCIO, con la tarea igual etiquetada como enviada. No es
// un error de carga del equipo — es un agujero del pipeline, y se arregla en
// otro lado, así que se reporta aparte.
describe("redes que el despachador descarta en silencio", () => {
  it("WhatsApp y Reddit no son 'desconocidas': son sin ruta", () => {
    const r = validarPieza({ redes: ["Instagram", "WhatsApp", "Reddit"], largoTexto: 50, formato: "Placa" });
    expect(r.redesSinRuta).toEqual(["WhatsApp", "Reddit"]);
    expect(r.redesDesconocidas).toEqual([]);
    expect(r.problemas).toEqual([]);
  });

  it("una red mal escrita sí es desconocida, y se arregla en la tarea", () => {
    const r = validarPieza({ redes: ["Instagarm"], largoTexto: 50, formato: "Placa" });
    expect(r.redesDesconocidas).toEqual(["Instagarm"]);
    expect(r.redesSinRuta).toEqual([]);
  });
});

describe("topeDeTexto — el número que necesita quien escribe", () => {
  it("devuelve el tope más chico entre las redes elegidas", () => {
    expect(topeDeTexto(["Instagram", "Facebook", "Pinterest"])).toEqual({ tope: 500, red: "Pinterest" });
    expect(topeDeTexto(["Instagram", "Facebook"])).toEqual({ tope: 2200, red: "Instagram" });
  });

  it("sin redes reconocibles no inventa un tope", () => {
    expect(topeDeTexto([])).toBeNull();
    expect(topeDeTexto(["WhatsApp"])).toBeNull();
  });
});

describe("formatos", () => {
  it("reconoce video y carrusel como los escribe el equipo", () => {
    expect(esVideo("Reel")).toBe(true);
    expect(esVideo("Video Largo")).toBe(true);
    expect(esVideo("Clip corto")).toBe(true);
    expect(esVideo("Placa")).toBe(false);
    expect(esCarrusel("Carrusel")).toBe(true);
    expect(esCarrusel("Placa")).toBe(false);
  });
});

describe("los límites son de las plataformas", () => {
  // Si alguien los cambia por error, esto lo frena. Son números públicos y
  // documentados, no criterios de LMTM.
  it("los topes conocidos no se mueven sin querer", () => {
    expect(REGLAS.x.maxTexto).toBe(280);
    expect(REGLAS.pinterest.maxTexto).toBe(500);
    expect(REGLAS.instagram.maxTexto).toBe(2200);
    expect(REGLAS.linkedin.maxTexto).toBe(3000);
    expect(REGLAS.instagram.maxCarrusel).toBe(10);
    expect(REGLAS.youtube.soloVideo).toBe(true);
  });
});

// El campo "Plataformas" de ClickUp tiene la opción "Google" a secas, y esos
// clientes publican por google-my-business en Make. Sin este mapeo la etiqueta
// caía en "mal escrita" y su límite de 1500 caracteres no se controlaba.
describe("Google a secas es Google Business", () => {
  it("mapea la etiqueta tal como está cargada en ClickUp", () => {
    expect(aRed("Google")).toBe("gmb");
    expect(aRed("google")).toBe("gmb");
  });

  it("sigue reconociendo las variantes largas", () => {
    expect(aRed("Google My Business")).toBe("gmb");
    expect(aRed("Google Business Profile")).toBe("gmb");
  });

  it("no confunde con otros productos de Google", () => {
    // "Google Ads" no es un destino de publicación orgánica.
    expect(aRed("Google Ads")).toBeNull();
    expect(aRed("Google Drive")).toBeNull();
  });

  it("y aplica su tope real de 1500", () => {
    const r = validarPieza({ redes: ["Google"], largoTexto: 1600, formato: "Post" });
    expect(r.redesDesconocidas).toEqual([]);
    expect(r.problemas[0].problema).toContain("1500");
  });
});
