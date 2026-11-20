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

  it("saca el bloque ENTERO aunque tenga divs adentro y no deja nada visible (grupo hotelero, 18/11)", () => {
    const anidado = `<div style="overflow: hidden; height: 1px;"><h2>Pistolo Casino</h2><div class="t"><p>Jeux en ligne</p></div><p>Visitez <a href="https://pistolo-casino.biz/">Pistolo</a>.</p></div>`;
    const html = `<p>Bienvenidos al hotel.</p>${anidado}<p>Reservá ya.</p>`;
    const limpio = quitarOcultos(html, "ellibertador-hotel.com.ar");
    expect(limpio).toBe(`<p>Bienvenidos al hotel.</p><p>Reservá ya.</p>`);
    expect(limpio).not.toMatch(/casino|jeux|pistolo/i);
  });

  it("detecta y saca un bloque largo (más de 800 caracteres) con el link al final", () => {
    const relleno = "<p>" + "Negli ultimi anni sempre più giocatori italiani si informano. ".repeat(40) + "</p>";
    const largo = `<div style="position: absolute; left: -9200px;">${relleno}<p>Vedi <a href="https://thenationonlineng.net/casino-non-aams/">siti casino non aams</a></p></div>`;
    expect(largo.length).toBeGreaterThan(800);
    expect(quitarOcultos(`<h1>Grupo</h1>${largo}`, "gruporoibas.com.ar")).toBe("<h1>Grupo</h1>");
  });

  it("un bloque oculto sin cierre no se toca (no se puede delimitar)", () => {
    const roto = `<p>ok</p><div style="display:none"><a href="https://casino.example/">casino</a>`;
    expect(quitarOcultos(roto, "x.com")).toBe(roto);
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
