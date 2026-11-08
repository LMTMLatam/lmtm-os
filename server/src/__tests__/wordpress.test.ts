import { describe, expect, it } from "vitest";
import { editarTextos, jsonSinEtiquetas, quitarOcultos } from "../services/wordpress.js";
import { accionDesdeParametros, describir } from "../services/hostinger.js";

const SPAM = `<div style="position: absolute; left: -7566px;"><p>Las tragamonedas ofrecen grandes emociones y, con <a href="https://xbet-bolivia.com/" rel="dofollow">1xbet bolivia</a>, puedes registrarte.</p></div>`;

describe("quitar spam oculto", () => {
  it("saca solo el bloque oculto con enlace ajeno y deja el resto igual", () => {
    const html = `<p>Más de 50 años desarrollando tu mejor opción.</p>${SPAM}<div style="display:none"><a href="https://sramascopadilla.com.ar/x">propio</a></div>`;
    expect(quitarOcultos(html, "sramascopadilla.com.ar")).toBe(
      `<p>Más de 50 años desarrollando tu mejor opción.</p><div style="display:none"><a href="https://sramascopadilla.com.ar/x">propio</a></div>`,
    );
  });

  it("un texto sin spam no se toca", () => {
    const html = `<p>Hola</p>`;
    expect(quitarOcultos(html, "x.com")).toBe(html);
  });

  it("recorre los widgets anidados de Elementor y dice qué cambió", () => {
    const els = [{ id: "s1", elType: "section", settings: {}, elements: [{ id: "a467a13", elType: "widget", widgetType: "text-editor", settings: { editor: `<p>ok</p>${SPAM}`, align: "left" } }] }];
    const r = editarTextos(els, (v) => quitarOcultos(v, "sramascopadilla.com.ar"));
    expect(r.cambios.map((c) => c.elemento)).toEqual(["a467a13"]);
    expect(r.elementos[0].elements?.[0].settings?.editor).toBe("<p>ok</p>");
    expect(r.elementos[0].elements?.[0].settings?.align).toBe("left");
  });
});

describe("acciones de contenido", () => {
  it("exige el objeto concreto", () => {
    expect(typeof accionDesdeParametros({ accion: "quitar_spam" })).toBe("string");
    expect(accionDesdeParametros({ accion: "quitar_spam", menuItemId: 118073 })).toEqual({ accion: "quitar_spam", menuItemId: 118073 });
    expect(typeof accionDesdeParametros({ accion: "reemplazar_texto", postId: 5, buscar: "ab", reemplazar: "x" })).toBe("string");
    const a = accionDesdeParametros({ accion: "reemplazar_texto", postId: 5, buscar: "Inicio viejo", reemplazar: "" });
    if (typeof a === "string") throw new Error(a);
    expect(describir(a)).toContain("(nada)");
  });
});

describe("JSON sin etiquetas (firewall de Hostinger)", () => {
  it("no deja ningún < ni > y se decodifica igual", () => {
    const o = { html: "<iframe src=\"x\"></iframe>", t: "a > b" };
    const j = jsonSinEtiquetas(o);
    expect(j).not.toMatch(/[<>]/);
    expect(JSON.parse(j)).toEqual(o);
  });
});
