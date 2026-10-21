import { describe, expect, it } from "vitest";
import {
  esDeContenido, firmarAcceso, leerPagina, palabrasDePedido, puntaje, sinCopias, terminosDeCliente, tipoDe, verificarAcceso,
  type ArchivoDrive,
} from "../guia-contenido.js";

describe("guía de contenido: cómo se busca al cliente en Drive", () => {
  it("nombre completo + la palabra que lo distingue", () => {
    expect(terminosDeCliente("Ferrol Apart Hotel", ["Hotel Libertador", "Hotel Lescano"])).toEqual(["Ferrol Apart Hotel", "ferrol"]);
  });
  it("sin palabras genéricas ni compartidas con otro cliente", () => {
    expect(terminosDeCliente("MA PROPIEDADES", ["MA DESARROLLOS"])).toEqual(["MA PROPIEDADES"]);
    expect(terminosDeCliente("Hotel San Bernardo", ["Luz y Fuerza San Bernardo"])).toEqual(["Hotel San Bernardo"]);
  });
  it("los términos cargados a mano ganan", () => {
    expect(terminosDeCliente("RENO", [], ["Amoblamientos Reno", "Universo reno"])).toEqual(["Amoblamientos Reno", "Universo reno"]);
  });
});

describe("guía de contenido: coincidencias con el pedido", () => {
  it("palabras útiles del pedido, singular o plural", () => {
    const p = palabrasDePedido("un video de los departamentos de 2 habitaciones");
    expect(p).toEqual(["departamentos", "habitaciones"]);
    expect(puntaje("FERROL - DEPARTAMENTO 2 HABITACIONES.mp4", p)).toBe(2);
    expect(puntaje("DSC00816.jpg", p)).toBe(0);
  });
});

describe("guía de contenido: qué es cada archivo", () => {
  it("basura del sistema afuera; logos, videos y diseño reconocidos", () => {
    expect(tipoDe(".DS_Store", "application/octet-stream")).toBeNull();
    expect(tipoDe("Thumbs.db", "application/octet-stream")).toBeNull();
    expect(tipoDe("FERROL-logo.png", "image/png")).toBe("logo");
    expect(tipoDe("C6162.MP4", "video/mp4")).toBe("video");
    expect(tipoDe("Redes Ferrol JUL26.ai", "application/postscript")).toBe("diseño");
    expect(tipoDe("DSC00816.jpg", "image/jpeg")).toBe("foto");
    expect(tipoDe("Guion", "application/vnd.google-apps.document")).toBe("documento");
  });
  it("las copias (mismo nombre y peso) quedan una, la más nueva", () => {
    const a = (id: string, fecha: string, mb: number | null = 36): ArchivoDrive => ({ id, n: "FERROL - DEPTO.mp4", tipo: "video", mb, fecha, ruta: "" });
    expect(sinCopias([a("viejo", "2023-10-27"), a("nuevo", "2025-05-15"), a("otro-peso", "2024-01-01", 19)]).map((x) => x.id)).toEqual(["nuevo", "otro-peso"]);
  });
});

describe("guía de contenido: links de descarga", () => {
  const secreto = "clave-de-prueba";
  it("firma de un cliente que vence en 24 h", () => {
    const ahora = Date.UTC(2026, 9, 21, 12);
    const f = firmarAcceso("cliente-1", ahora, secreto)!;
    expect(verificarAcceso(f.token, ahora + 3600_000, secreto)).toBe("cliente-1");
    expect(verificarAcceso(f.token, ahora + 25 * 3600_000, secreto)).toBeNull();
  });
  it("no se puede cambiar de cliente ni usar otra clave", () => {
    const ahora = Date.UTC(2026, 9, 21, 12);
    const f = firmarAcceso("cliente-1", ahora, secreto)!;
    const [, firma] = f.token.split(".");
    const otro = `${Buffer.from(`cliente-2.${Math.floor(ahora / 1000) + 3600}`).toString("base64url")}.${firma}`;
    expect(verificarAcceso(otro, ahora, secreto)).toBeNull();
    expect(verificarAcceso(f.token, ahora, "otra-clave")).toBeNull();
    expect(firmarAcceso("cliente-1", ahora, null)).toBeNull();
  });
});

describe("guía de contenido: la web", () => {
  it("páginas internas, imágenes útiles y videos (también dentro de JSON)", () => {
    const html = `<html><head><title>Ferrol Apart Hotel |</title><meta name="description" content="Escapadas en Funes">
      <meta property="og:image" content="/og.jpg"></head><body>
      <a href="/habitaciones/">Habitaciones</a><a href="https://otro.com/x">Afuera</a><a href="tel:123">Llamar</a>
      <img src="data:image/png;base64,AAA"><img data-src="/fotos/depto.jpg" alt="Departamento doble"><img src="/icono.svg">
      <script>var v = {"src":"https:\\/\\/ferrolaparthotel.com.ar\\/wp-content\\/uploads\\/2024\\/07\\/FERROL.webm"}</script>
      </body></html>`;
    const w = leerPagina(html, "https://ferrolaparthotel.com.ar/");
    expect(w.titulo).toBe("Ferrol Apart Hotel |");
    expect(w.descripcion).toBe("Escapadas en Funes");
    expect(w.paginas).toEqual([{ url: "https://ferrolaparthotel.com.ar/habitaciones/", texto: "Habitaciones" }]);
    expect(w.imagenes.map((i) => i.url)).toEqual(["https://ferrolaparthotel.com.ar/og.jpg", "https://ferrolaparthotel.com.ar/fotos/depto.jpg"]);
    expect(w.videos).toEqual(["https://ferrolaparthotel.com.ar/wp-content/uploads/2024/07/FERROL.webm"]);
  });
});

describe("guía de contenido: memoria que sirve para producir", () => {
  it("sin pauta ni operación; preferencias siempre", () => {
    expect(esDeContenido({ kind: "risk", key: "x", content: "Tres campañas sin gasto: CPL $6.641" })).toBe(false);
    expect(esDeContenido({ kind: "fact", key: "x", content: "RENO, escenario Make 5863407: Instagram rechaza videos 4K" })).toBe(false);
    expect(esDeContenido({ kind: "fact", key: "x", content: "Las fotos de cocinas están bien, las de placares están viejas" })).toBe(true);
    expect(esDeContenido({ kind: "preference", key: "x", content: "El ángulo corporativo es el que mejor encaja" })).toBe(true);
    expect(esDeContenido({ kind: "context", key: "enfoque-tecnico", content: "..." })).toBe(false);
  });
});

describe("guía de contenido: bitácoras y RAW afuera", () => {
  it("los eventos (resúmenes, corridas) no entran como hechos", () => {
    expect(esDeContenido({ kind: "event", key: "x", content: "Resumen WhatsApp: reunión el lunes" })).toBe(false);
  });
  it("un RAW de cámara no es una foto lista para usar", () => {
    expect(tipoDe("DJI_20261020155010_0009_D.DNG", "image/x-adobe-dng")).toBe("otro");
    expect(tipoDe("DJI_20261020155010_0009_D.JPG", "image/jpeg")).toBe("foto");
  });
});
