import { describe, expect, it } from "vitest";
import {
  coloresDeLaWeb, esAutomatico, fusionarEnfoque, normalizarHex, paletaDelEnfoque, seccionesDeMarca, websCandidatas, websDelEnfoque,
  type MarcaDelEnfoque,
} from "../marca-completa.js";
import { analizarHtml, problemasSeo } from "../seo.js";

const vacia: MarcaDelEnfoque = { colores: [], tipografias: [], tono: null, palabrasSi: [], palabrasNo: [], mensaje: null, publico: null, diferencial: null };

describe("quién gana en la marca", () => {
  it("una persona nunca es pisada: el Enfoque Técnico solo llena sus huecos", () => {
    const actual = { tono: "Cercano, con voseo", publico: null };
    const nueva = { ...vacia, tono: "Formal", publico: "Familias de Rosario" };
    expect(fusionarEnfoque(actual, nueva, true)).toEqual({ publico: "Familias de Rosario" });
  });
  it("sobre lo automático, el documento gana; lo que el documento no dice queda como estaba", () => {
    const actual = { tono: "inferido de posteos", mensaje: "inferido" };
    expect(fusionarEnfoque(actual, { ...vacia, tono: "Del Enfoque" }, false)).toEqual({ tono: "Del Enfoque" });
  });
  it("autores automáticos vs personas", () => {
    expect(esAutomatico(null)).toBe(true);
    expect(esAutomatico("enfoque-tecnico")).toBe(true);
    expect(esAutomatico("aprendizaje-automatico")).toBe(true);
    expect(esAutomatico("panel:user-1")).toBe(false);
  });
});

describe("colores", () => {
  it("normaliza hex y descarta lo que no es", () => {
    expect(normalizarHex("#ABC")).toBe("#aabbcc");
    expect(normalizarHex("azul")).toBeNull();
  });
  it("de la web: theme-color y variables de marca primero, sin grises ni colores de plantilla", () => {
    const html = `<meta name="theme-color" content="#0b3d2e"><style>:root{--color-primary:#c8a46a} body{color:#333333;background:#ffffff} .btn{background:#007bff}</style>`;
    const css = ".a{color:#c8a46a}.b{color:#e94e1b}.c{color:#e94e1b}";
    const c = coloresDeLaWeb(html, css);
    expect(c[0]).toBe("#0b3d2e");
    expect(c).toContain("#c8a46a");
    expect(c).toContain("#e94e1b");
    expect(c).not.toContain("#333333");
    expect(c).not.toContain("#ffffff");
    expect(c).not.toContain("#007bff");
  });
  it("del Enfoque Técnico: solo los hex de la sección de paleta", () => {
    const md = "## Tono de Marca\nCercano #nohex\n## Paleta de colores\n- Verde #0B3D2E\n- Dorado #C8A46A\n## Tipografías\nPoppins";
    expect(paletaDelEnfoque(md)).toEqual(["#0b3d2e", "#c8a46a"]);
    expect(paletaDelEnfoque("## Paleta de colores\nAzul y blanco")).toEqual([]);
  });
});

describe("la web del cliente", () => {
  it("de los links del documento, sin redes, ClickUp, Drive ni portales", () => {
    const md = "Links: https://www.instagram.com/maers, https://maers.com.ar/contacto, www.zonaprop.com.ar/x, https://app.clickup.com/1, www.maersclima.com";
    expect(websCandidatas(md)).toEqual(["https://maers.com.ar/", "https://www.maersclima.com/"]);
  });
  it("un link de referencia no es la web del cliente (caso MONDINO, 13/10)", () => {
    const md = "Referencia de mercado: https://www.cleanenergyministerial.org/\n## Links Relevantes\nSitio web: https://mondinosrl.com.ar";
    expect(websDelEnfoque(md, "MONDINO")).toEqual(["https://mondinosrl.com.ar/"]);
    // Sin parecerse al nombre, cuenta si la línea dice que es la web.
    expect(websDelEnfoque("Página web oficial: https://luzyfuerzasb-hotel.com.ar", "Hotel San Bernardo")).toEqual(["https://luzyfuerzasb-hotel.com.ar/"]);
  });

  it("las secciones de marca entran; la de herramientas no", () => {
    const md = "## Herramientas\nCRM y ERP\n## Tono de Marca\nCercano\n## Cliente Ideal\nFamilias";
    const s = seccionesDeMarca(md);
    expect(s).toContain("Cercano");
    expect(s).toContain("Familias");
    expect(s).not.toContain("ERP");
  });
});

describe("SEO", () => {
  const html = `<html lang="es"><head><title>MAERS</title><meta name="viewport" content="width=device-width"></head>
    <body><h1>Climatización en Rosario</h1><img src="a.jpg"><img src="b.jpg" alt="Equipo"><a href="/servicios">x</a></body></html>`;
  it("lee lo que se puede afirmar del HTML", () => {
    const a = analizarHtml(html, "https://maers.com.ar/");
    expect(a).toMatchObject({ titulo: "MAERS", descripcion: null, h1: ["Climatización en Rosario"], viewport: true, idioma: "es", imagenes: 2, imagenesSinAlt: 1, enlacesInternos: 1, noindex: false });
  });
  it("ordena los problemas por gravedad y no inventa los que no puede medir", () => {
    const a = analizarHtml(html, "https://maers.com.ar/");
    const ps = problemasSeo({ ...a, url: "x", urlFinal: "https://maers.com.ar/", estado: 200, https: true, msCarga: 400, kb: 10, robotsTxt: null, sitemap: false, pagespeed: null });
    expect(ps[0].gravedad).not.toBe("baja");
    expect(ps.map((p) => p.que)).toContain("Sin descripción");
    expect(ps.map((p) => p.que)).toContain("Sin sitemap.xml");
    // robots.txt sin poder leerlo (null) no se informa como faltante.
    expect(ps.map((p) => p.que)).not.toContain("Sin robots.txt");
    expect(ps.some((p) => /Lenta/.test(p.que))).toBe(false);
  });
});
