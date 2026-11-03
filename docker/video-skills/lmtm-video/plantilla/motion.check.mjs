// Control de motion.mjs: node motion.check.mjs. Falla si se rompe lo que ya costó caro.
import assert from "node:assert/strict";
import { alinear, contraste, inserto, momentosDe, subtitulosJs, ganchoPorPalabra, temaDe, tiposRepetidos, validarInserto } from "./motion.mjs";

const marcas = [{ color: "#141416", oscuro: "#141416", claro: "#f0efec" }, { color: "#e4572e" }, { color: "#ffffff" }, { color: "#2f7bff", oscuro: "#0d1220", acento: "#f5d90a" }];
const ctx = (extra = {}) => ({ id: "x", t0: 5, dur: 6, tema: temaDe(marcas[0]), ...extra });
const casos = {
  numero: { tipo: "numero", valor: 1956, texto: "desde *1956*", origen: "guía" },
  lista: { tipo: "lista", titulo: "A *medida*", items: ["uno", "dos", "tres"] },
  pasos: { tipo: "pasos", pasos: [{ txt: "uno" }, { txt: "dos" }] },
  chat: { tipo: "chat", negocio: "Marca", mensajes: [{ de: "cliente", txt: "hola", hora: "21:00" }, { de: "negocio", txt: "hola", hora: "21:01" }], resultado: "Listo" },
  pantalla: { tipo: "pantalla", imagen: "web.png", foco: { x: 40, y: 30 } },
};

// Se anima solo con transformaciones y opacidad, y todo es determinista: cada cuadro se busca en la línea de tiempo.
const todo = [
  ...Object.values(casos).flatMap((I) => inserto(I, ctx()).js),
  ...["tipeo", "golpe", "sube"].flatMap((m) => ganchoPorPalabra([["Hola", 0.1], ["vos", 0.5, 1]], m, 2).js),
  ...["pop", "karaoke", "caja"].flatMap((m) => subtitulosJs([{ desde: 0, hasta: 1, palabras: [["a", 0.1], ["b", 0.4, 1]] }], m)),
].join("\n");
assert.doesNotMatch(todo, /\b(left|top|width|height)\s*:/, "se anima left/top/width/height");
assert.doesNotMatch(todo, /Math\.random|onUpdate|onComplete/, "azar o callbacks en la línea de tiempo");
for (const [k, I] of Object.entries(casos)) assert.deepEqual(validarInserto(I, k), [], k);

// Un chat siempre va marcado: nunca es un testimonio.
assert.match(inserto(casos.chat, ctx()).html, /EJEMPLO/);
assert.ok(validarInserto({ tipo: "chat", negocio: "M", mensajes: [{ de: "cliente", txt: "x".repeat(400) }, { de: "negocio", txt: "y".repeat(400) }] }, "c").some((e) => /no entran/.test(e)));
// Un año sin punto de miles; una cantidad, con.
assert.match(inserto(casos.numero, ctx()).html, /mo-num/);
assert.doesNotMatch(inserto(casos.numero, ctx()).html, /mo-od-sep/);
assert.match(inserto({ ...casos.numero, valor: 12000 }, ctx()).html, /mo-od-sep/);
// Un número sin fuente, o que el guion no dice, no entra.
assert.ok(validarInserto({ tipo: "numero", valor: 1956 }, "n").some((e) => /origen/.test(e)));
assert.ok(validarInserto(casos.numero, "n", "Fabricamos en Argentina").some((e) => /no está en el texto/.test(e)));
assert.deepEqual(validarInserto(casos.numero, "n", "Fabricamos desde *1956.*"), []);
// Uno de cada tipo por reel, y una frase de la voz no se parte en dos ítems (LMTM-6640).
assert.deepEqual(tiposRepetidos([casos.lista, casos.pasos, casos.lista, casos.lista]), ["lista"]);
assert.deepEqual(tiposRepetidos([casos.lista, casos.pasos, casos.numero]), []);
const items = (...i) => ({ tipo: "lista", items: i });
assert.ok(validarInserto(items("Asesoramiento personalizado", "Tu patrimonio"), "l", "Y *asesoramiento personalizado* para tu patrimonio.").some((e) => /una sola frase/.test(e)));
assert.ok(validarInserto(items("Asesoramiento", "Patrimonio"), "l", "Asesoramiento para tu patrimonio.").some((e) => /una sola frase/.test(e)));
assert.deepEqual(validarInserto(items("Inversiones", "Real estate", "Medios de pago"), "l", "Sustenta integra inversiones, real estate y medios de pago."), []);
assert.deepEqual(validarInserto(items("Respaldo institucional", "Visión de largo plazo"), "l", "Con respaldo institucional y visión de largo plazo."), []);
// La captura no se agranda: una vertical baja hasta el foco y la que entra queda quieta (LMTM-6642).
const panea = (relacion) => inserto({ ...casos.pantalla, relacion, foco: { x: 50, y: 50 } }, ctx()).js.join("\n");
assert.doesNotMatch(panea(2), /scale: 1\.2/);
assert.match(panea(2), /x-cam", \{ y: 0 \}, \{ y: -658,/);
assert.doesNotMatch(panea(0.5), /x-cam/);
// Lo que whisper no reconoce se reparte entre vecinas, sin perder las que sí.
const al = alinear([{ t: "desde" }, { t: "1956" }, { t: "hasta" }], [{ text: "desde", start: 1, end: 1.2 }, { text: "mil", start: 1.3, end: 1.4 }, { text: "hasta", start: 3, end: 3.2 }]);
assert.equal(al[0].ini, 1);
assert.equal(al[2].ini, 3);
assert.ok(al[1].ini > 1 && al[1].ini < 3);
// Cada ítem entra cuando se lo nombra; si no se dice, repartidos y dentro del tramo.
const voz = [{ t: "primero", ini: 2 }, { t: "uno", ini: 2.2 }, { t: "después", ini: 3 }, { t: "dos", ini: 3.5 }];
const ts = momentosDe(["uno", "dos"], voz, 2, 3);
assert.ok(Math.abs(ts[0] - 2.15) < 0.01 && Math.abs(ts[1] - 3.45) < 0.01, String(ts));
assert.ok(momentosDe(["nada", "dicho"], voz, 2, 3).every((t) => t >= 2 && t <= 5));
// Con cualquier marca, panel oscuro, claro o de color: lo que se lee se lee.
for (const M of marcas) for (const p of ["oscuro", "claro", "color"]) {
  const T = temaDe(M, p);
  assert.ok(contraste(T.tinta, T.bg) >= 4.5, `tinta ${M.color} ${p}`);
  assert.ok(contraste(T.acento, T.bg) >= 3, `acento ${M.color} ${p}`);
  assert.ok(contraste(T.sobreAcento, T.acento) >= 3, `sobre acento ${M.color} ${p}`);
}
console.log("motion OK");
