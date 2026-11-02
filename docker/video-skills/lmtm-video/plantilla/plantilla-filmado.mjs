// Plantilla del reel FILMADO con motion gráficos (pedido del usuario 01/11, sobre el
// formato del reel de @generaimpacto): la persona o las tomas a pantalla completa,
// títulos en jerarquía que entran con la voz (chica + GRANDE en el color de la marca
// + media), tarjetas con datos e insertos a pantalla completa (número que cuenta con
// barras, antes y después, grilla de material, foto o clip).
//
// El diseño está acá y no se toca. Los datos los calcula filmado.mjs desde guion.json:
//   node plantilla-filmado.mjs filmado.json   → index.html
import fs from "node:fs";
import { CSS_MOTION, TIPOS_INSERTO, inserto, temaDe } from "./motion.mjs";

const S = JSON.parse(fs.readFileSync(process.argv[2] || "filmado.json", "utf8"));
const FIN = Number(S.duracion);
const M = S.marca ?? {};
const f = (n) => Number(Number(n).toFixed(3));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const esFoto = (a) => /\.(jpe?g|png|webp)$/i.test(a);
const fuente = M.fuente ?? "Montserrat";
// La tipografía del cliente (marca.fuenteArchivo, un .woff2 dentro del proyecto). Con un solo peso, el rango evita la
// negrita falsa del navegador: pedido de RENO, LMTM-6543.
const caraFuente = (url) => (M.fuenteArchivo ? `@font-face { font-family: "${fuente}"; src: url("${esc(url)}"); font-weight: 100 900; font-display: block; }` : "");
const fondo = S.fondo; // oscuro de la marca para tarjetas e insertos
const acento = S.acento;
const filtroLogo = M.logoBlanco ? "brightness(0) invert(1) " : "";
// *palabra* resalta: en los títulos de insertos y cierre.
const conClave = (t, base) => String(t ?? "").split(/\s+/).filter(Boolean).map((w) => `<span class="${base}${w.includes("*") ? " clave" : ""}">${esc(w.replace(/\*/g, ""))}</span>`).join(" ");
const tl = [];
const clip = (id, desde, hasta, pista, clase, html) => `<div id="${id}" class="clip ${clase}" data-start="${f(desde)}" data-duration="${f(hasta - desde)}" data-track-index="${pista}">${html}</div>`;
// El panel de un inserto NO lleva data-start: el extractor de cuadros no suma el del
// contenedor a los videos de adentro (cuadros equivocados). Se muestra con la línea de tiempo.
const panel = (id, clase, html) => `<div id="${id}" class="${clase}" style="opacity:0">${html}</div>`;
const medio = (id, archivo, desde, hasta, pista) => (esFoto(archivo)
  ? `<img id="${id}" class="clip medio" src="${esc(archivo)}" alt="" data-start="${f(desde)}" data-duration="${f(hasta - desde)}" data-track-index="${pista}" />`
  : `<video id="${id}" class="clip medio" src="${esc(archivo)}" muted playsinline data-start="${f(desde)}" data-duration="${f(hasta - desde)}" data-media-start="0" data-track-index="${pista}"></video>`);

// ── La toma: un salto de encuadre en cada corte esconde el corte ────────────
tl.push(`tl.set("#toma", { scale: 1 }, 0);`);
(S.cortes ?? []).forEach((c, i) => tl.push(`tl.set("#toma", { scale: ${i % 2 ? 1 : 1.07} }, ${f(c)});`));

// ── Títulos ─────────────────────────────────────────────────────────────────
const titulos = (S.titulos ?? []).map((T, i) => {
  const lugar = T.zona === "abajo" ? `bottom:${T.bottom ?? 440}px` : `top:${T.top ?? 400}px`;
  let n = 0;
  const lineas = T.lineas.map((L) => {
    const palabras = L.palabras.map(([w, t]) => {
      const id = `t${i}w${n++}`;
      tl.push(`tl.fromTo("#${id}", { opacity: 0, y: ${L.clase === "grande" ? 46 : 26}, scale: ${L.clase === "grande" ? 0.86 : 1} }, { opacity: 1, y: 0, scale: 1, duration: ${L.clase === "grande" ? 0.36 : 0.24}, ease: "back.out(2)" }, ${f(Math.max(T.desde, t - 0.06))});`);
      return `<span class="w" id="${id}">${esc(w)}</span>`;
    }).join(" ");
    const color = L.clase === "grande" && T.colorClave ? `color:${T.colorClave};` : "";
    const tam = L.tam ? `font-size:${L.tam}px;` : "";
    return `<div class="l ${L.clase}" style="${color}${tam}">${palabras}</div>`;
  }).join("");
  tl.push(`tl.fromTo("#titulo-${i}", { opacity: 1, y: 0 }, { opacity: 0, y: -14, duration: 0.16, ease: "power2.in", immediateRender: false }, ${f(T.hasta - 0.16)});`);
  return `<div id="titulo-${i}" class="clip titulo${T.velo ? " velo" : ""}" style="${lugar};color:${T.tinta}" data-start="${f(T.desde)}" data-duration="${f(T.hasta - T.desde)}" data-track-index="3">${lineas}</div>`;
}).join("\n      ");

// ── Tarjetas ────────────────────────────────────────────────────────────────
const tarjetas = (S.tarjetas ?? []).map((K, i) => {
  const id = `tarjeta-${i}`;
  tl.push(`tl.fromTo("#${id}", { opacity: 0, y: 70, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: "back.out(1.6)" }, ${f(K.desde)});`);
  tl.push(`tl.fromTo("#${id}", { opacity: 1, y: 0 }, { opacity: 0, y: 40, duration: 0.24, ease: "power2.in", immediateRender: false }, ${f(K.hasta - 0.24)});`);
  if (K.tachado) tl.push(`tl.fromTo("#${id} .raya", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.out" }, ${f(K.desde + 0.5)});`);
  const arriba = K.etiqueta || K.tachado
    ? `<div class="k-arriba"><span class="k-etiqueta">${esc(K.etiqueta)}</span>${K.tachado ? `<span class="k-tachado">${esc(K.tachado)}<i class="raya"></i></span>` : ""}</div>` : "";
  const valor = K.valor
    ? `<div class="k-valor">${K.antes ? `<span class="k-antes">${esc(K.antes)}</span>` : ""}<span class="k-numero">${esc(K.valor)}</span>${K.nota ? `<span class="k-nota">${esc(K.nota)}</span>` : ""}</div>` : "";
  return clip(id, K.desde, K.hasta, 4, "tarjeta", `${arriba}<div class="k-abajo">${K.imagen ? `<img class="k-imagen" src="${esc(K.imagen)}" alt=""${K.imagen === M.logo && M.logoBlanco ? ' style="filter:brightness(0) invert(1);object-fit:contain"' : ""} />` : ""}<div class="k-titulo">${esc(K.titulo)}</div>${valor}</div>`);
}).join("\n      ");

// ── Insertos ────────────────────────────────────────────────────────────────
let pistaMedio = 10;
const insertos = (S.insertos ?? []).map((I, i) => {
  const id = `inserto-${i}`;
  const { desde: d, hasta: h } = I;
  tl.push(`tl.fromTo("#${id}", { opacity: 0 }, { opacity: 1, duration: 0.14, ease: "none" }, ${f(d)});`);
  tl.push(`tl.set("#${id}", { opacity: 0 }, ${f(h)});`);
  if (I.tipo === "media") {
    tl.push(`tl.fromTo("#${id}-m", { scale: 1 }, { scale: 1.08, duration: ${f(h - d)}, ease: "none" }, ${f(d)});`);
    return panel(id, "inserto", medio(`${id}-m`, I.archivo, d, h, pistaMedio++));
  }
  if (TIPOS_INSERTO.includes(I.tipo)) {
    const r = inserto(I, { id, t0: d, dur: h - d, tema: temaDe(M, S.panel ?? "oscuro"), momentos: I.momentos, sinSubs: true });
    tl.push(...r.js);
    return `<div id="${id}" class="inserto ${r.clase}" style="opacity:0;${r.estilo}">${r.html}</div>`;
  }
  if (I.tipo === "antes-despues") {
    tl.push(`tl.fromTo("#${id}-a", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, ${f(d + 0.1)});`);
    tl.push(`tl.fromTo("#${id}-d", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, ${f(d + 0.35)});`);
    tl.push(`tl.fromTo("#${id}-f", { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(2)" }, ${f(d + 0.6)});`);
    return panel(id, "inserto panel", `
        <div class="i-titulo">${conClave(I.titulo, "w")}</div>
        <div class="par">
          <div class="marco" id="${id}-a">${medio(`${id}-am`, I.antes, d, h, pistaMedio++)}<span class="rotulo">${esc(I.rotuloAntes ?? "ANTES")}</span></div>
          <div class="flecha" id="${id}-f">→</div>
          <div class="marco despues" id="${id}-d">${medio(`${id}-dm`, I.despues, d, h, pistaMedio++)}<span class="rotulo">${esc(I.rotuloDespues ?? "DESPUÉS")}</span></div>
        </div>
        ${I.pie ? `<div class="i-pie">${conClave(I.pie, "w")}</div>` : ""}`);
  }
  // grilla: el material del cliente, inclinado, que entra en cascada
  const celdas = I.medios.map((m, k) => {
    tl.push(`tl.fromTo("#${id}-c${k}", { opacity: 0, y: 70, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.36, ease: "back.out(1.5)" }, ${f(d + 0.1 + k * 0.07)});`);
    return `<div class="celda" id="${id}-c${k}">${medio(`${id}-g${k}`, m, d, h, pistaMedio++)}</div>`;
  }).join("");
  tl.push(`tl.fromTo("#${id}-grilla", { y: 30 }, { y: -40, duration: ${f(h - d)}, ease: "none" }, ${f(d)});`);
  return panel(id, "inserto panel", `
        <div class="i-titulo">${conClave(I.titulo, "w")}</div>
        <div class="grilla" id="${id}-grilla">${celdas}</div>`);
}).join("\n      ");

// ── Cierre sobre la toma ────────────────────────────────────────────────────
const C = S.cierre;
let cierre = "";
if (C) {
  tl.push(`tl.fromTo("#marca", { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power2.in", immediateRender: false }, ${f(C.desde)});`);
  tl.push(`tl.fromTo("#cierre-velo", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.inOut" }, ${f(C.desde)});`);
  tl.push(`tl.fromTo("#cierre-logo", { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.7)" }, ${f(C.desde + 0.15)});`);
  tl.push(`tl.fromTo("#cierre-titulo .w", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.36, ease: "back.out(2)", stagger: 0.14 }, ${f(C.desde + 0.35)});`);
  if (C.cta) tl.push(`tl.fromTo("#cta", { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, ${f(C.desde + 0.8)});`);
  if (C.url) tl.push(`tl.fromTo("#url", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, ${f(C.desde + 1.05)});`);
  cierre = clip("cierre", C.desde, FIN, 6, "", `
        <div id="cierre-velo"></div>
        <div id="cierre-contenido">
          <img id="cierre-logo" src="${esc(M.logo)}" alt="" />
          <div id="cierre-titulo">${conClave(C.titulo, "w")}</div>
          ${C.cta ? `<div id="cta">${esc(C.cta)}</div>` : ""}
          ${C.url ? `<div id="url">${esc(C.url)}</div>` : ""}
        </div>`);
}
tl.push(`tl.fromTo("#marca", { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.1);`);

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(S.titulo ?? "Reel")}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${caraFuente(M.fuenteArchivo)}
      :root { --acento: ${acento}; --fondo: ${fondo}; }
      html, body { margin: 0; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; font-family: ${fuente}, sans-serif; }
      #toma, #toma video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #toma { transform-origin: 50% 38%; }
      #marca { position: absolute; left: 76px; top: 280px; width: ${Number(M.anchoLogo ?? 150)}px; }
      #marca img { display: block; width: 100%; height: auto; filter: ${filtroLogo}drop-shadow(0 1px 3px rgba(0,0,0,0.5)) drop-shadow(0 6px 18px rgba(0,0,0,0.35)); }
      .titulo { position: absolute; left: 110px; right: 110px; text-align: center; line-height: 1.02; isolation: isolate; }
      .titulo.velo::before { content: ""; position: absolute; inset: -70px -110px; z-index: -1; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 50%, rgba(0,0,0,0) 74%); }
      .titulo .l + .l { margin-top: 10px; }
      .titulo .w { display: inline-block; }
      .chica { font-size: 62px; font-weight: 500; letter-spacing: -0.01em; }
      .grande { font-size: 128px; font-weight: 900; letter-spacing: -0.03em; text-transform: uppercase; }
      .media { font-size: 76px; font-weight: 800; letter-spacing: -0.02em; }
      .tarjeta { position: absolute; left: 64px; right: 64px; bottom: 440px; padding: 34px 40px; border-radius: 38px; background: color-mix(in srgb, var(--fondo) 92%, transparent); color: #fff; box-shadow: 0 24px 60px rgba(0,0,0,0.42); border: 2px solid rgba(255,255,255,0.1); }
      .k-arriba { display: flex; justify-content: space-between; align-items: center; padding-bottom: 22px; margin-bottom: 26px; border-bottom: 2px solid rgba(255,255,255,0.14); }
      .k-etiqueta { font-size: 34px; font-weight: 700; color: rgba(255,255,255,0.72); }
      .k-tachado { position: relative; font-size: 42px; font-weight: 800; color: rgba(255,255,255,0.72); }
      .raya { position: absolute; left: -6px; right: -6px; top: 50%; height: 6px; background: var(--acento); transform-origin: 0 50%; }
      .k-abajo { display: flex; align-items: center; gap: 28px; }
      .k-imagen { width: 118px; height: 118px; object-fit: cover; border-radius: 24px; flex: none; }
      .k-titulo { flex: 1; min-width: 0; font-size: 46px; font-weight: 800; line-height: 1.1; }
      .k-valor { display: grid; grid-template-columns: auto auto; justify-content: end; align-items: baseline; column-gap: 14px; flex: none; text-align: right; }
      .k-antes { font-size: 44px; font-weight: 800; color: var(--acento); }
      .k-numero { font-size: 118px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; }
      .k-nota { grid-column: 1 / -1; font-size: 26px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.72); }
      .inserto { position: absolute; inset: 0; overflow: hidden; }
      .inserto.panel { background: radial-gradient(ellipse at 50% 34%, color-mix(in srgb, var(--acento) 26%, var(--fondo)) 0%, var(--fondo) 68%); color: #fff; display: flex; flex-direction: column; align-items: center; padding: 300px 70px 420px; box-sizing: border-box; }
      .medio { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .i-titulo, .i-pie { text-align: center; font-size: 72px; font-weight: 500; line-height: 1.06; }
      .i-titulo .w, .i-pie .w { display: inline-block; }
      .clave { font-weight: 900; font-size: 1.28em; color: color-mix(in srgb, var(--acento) 80%, #fff); letter-spacing: -0.02em; }
      .par { display: flex; align-items: center; justify-content: center; gap: 0; margin: 56px 0; width: 100%; }
      .marco { position: relative; flex: none; width: 430px; height: 764px; border-radius: 34px; overflow: hidden; border: 4px solid rgba(255,255,255,0.25); background: #000; }
      .marco.despues { border-color: var(--acento); box-shadow: 0 0 56px color-mix(in srgb, var(--acento) 60%, transparent); }
      .rotulo { position: absolute; left: 50%; top: 22px; transform: translateX(-50%); white-space: nowrap; padding: 10px 22px; border-radius: 999px; background: rgba(0,0,0,0.72); color: #fff; font-size: 24px; font-weight: 800; letter-spacing: 0.14em; }
      .flecha { position: relative; z-index: 2; flex: none; width: 92px; height: 92px; margin: 0 -24px; border-radius: 50%; background: #fff; color: #000; font-size: 52px; font-weight: 900; display: flex; align-items: center; justify-content: center; }
      .grilla { display: grid; grid-template-columns: repeat(3, 284px); gap: 22px; margin-top: 70px; transform: rotate(-5deg); }
      .celda { position: relative; height: 480px; border-radius: 28px; overflow: hidden; background: #000; }
${(S.insertos ?? []).some((I) => TIPOS_INSERTO.includes(I.tipo)) ? CSS_MOTION : ""}
      #cierre { position: absolute; inset: 0; }
      #cierre-velo { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.56) 42%, rgba(0,0,0,0.12) 72%, rgba(0,0,0,0) 86%); }
      #cierre-contenido { position: absolute; left: 110px; right: 110px; bottom: 460px; display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff; }
      #cierre-logo { width: ${Number(M.anchoLogoCierre ?? 300)}px; height: auto; filter: ${filtroLogo}drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }
      #cierre-titulo { margin-top: 26px; font-size: 88px; font-weight: 800; line-height: 1.04; letter-spacing: -0.02em; text-wrap: balance; }
      #cierre-titulo .w { display: inline-block; }
      #cta { margin-top: 38px; padding: 26px 64px; border-radius: 999px; background: ${S.acentoLegible ? acento : "#fff"}; color: ${S.tintaCta}; font-size: 44px; font-weight: 800; }
      #url { margin-top: 24px; font-size: 44px; font-weight: 800; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${FIN}">
      <div id="toma"><video id="base" class="clip" src="${esc(S.video)}" muted playsinline data-start="0" data-duration="${FIN}" data-media-start="0" data-track-index="0"></video></div>
      ${M.logo ? `<div id="marca"><img src="${esc(M.logo)}" alt="" /></div>` : ""}
      ${insertos}
      ${titulos}
      ${tarjetas}
      ${cierre}
      <audio id="sonido" src="${esc(S.audio)}" data-start="0" data-duration="${FIN}" data-track-index="5" data-volume="1"></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${tl.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", html);
console.log(`listo: index.html (${S.titulos?.length ?? 0} títulos, ${S.tarjetas?.length ?? 0} tarjetas, ${S.insertos?.length ?? 0} insertos)`);
