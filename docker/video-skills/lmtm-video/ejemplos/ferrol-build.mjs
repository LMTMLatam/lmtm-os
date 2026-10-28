// Genera index.html (estático, editable en Studio) a partir de los tiempos reales
// de la voz (audio_meta + silencedetect) y de los planos de assets/planos.
// Uso: node .work/build.mjs   (desde la raíz del proyecto)
import fs from "node:fs";

const FIN = 33.5;

// Voz: inicio global de cada archivo (el habla real empieza ~0,25 s después).
const VOZ = [
  { id: "l1", start: 0.07, dur: 3.24 },
  { id: "l2", start: 3.19, dur: 3.2 },
  { id: "l3", start: 6.37, dur: 5.76 },
  { id: "l4", start: 11.78, dur: 4.68 },
  { id: "l5", start: 16.32, dur: 4.04 },
  { id: "l6", start: 20.15, dur: 4.68 },
  { id: "l7", start: 25.1, dur: 2.44 },
  { id: "l8", start: 27.56, dur: 4.36 },
];

// Planos verticales (ya recortados y con la velocidad horneada).
const PLANOS = [
  ["s01", 0.0, 3.3, "in"], ["s02", 3.3, 3.1, "out"], ["s03", 6.4, 3.05, "in"],
  ["s04", 9.45, 2.55, "out"], ["s05", 12.0, 1.3, "in"], ["s06", 13.3, 1.65, "out"],
  ["s07", 14.95, 1.53, "in"], ["s08", 16.48, 1.03, "out"], ["s09", 17.51, 0.62, "in"],
  ["s10", 18.13, 1.6, "out"], ["s11", 19.73, 0.8, "in"], ["s12", 20.53, 1.45, "out"],
  ["s13", 21.98, 1.22, "in"], ["s14", 23.2, 1.8, "out"],
];

// Frases en pantalla: [desde, hasta, [[palabra, segundo en que se dice, destacada?]]]
const FRASES = [
  [0.0, 3.15, [["¿Cuándo", 0.08], ["fue", 0.58], ["la", 0.8], ["última", 0.95], ["vez", 1.4], ["que", 1.62], ["bajaste", 1.89, 1], ["un", 2.36, 1], ["cambio?", 2.51, 1]]],
  [3.25, 6.3, [["No", 3.3], ["hace", 3.42], ["falta", 3.74], ["irte", 4.09], ["lejos", 4.39], ["para", 4.79], ["cambiar", 5.11, 1], ["de", 5.67, 1], ["aire.", 5.83, 1]]],
  [6.45, 9.4, [["En", 6.6], ["Funes,", 6.66, 1], ["a", 7.39], ["minutos", 7.51], ["de", 8.31], ["Rosario,", 8.54]]],
  [9.55, 11.95, [["te", 9.71], ["espera", 9.77], ["Ferrol", 10.39, 1], ["Apart", 11.09, 1], ["Hotel.", 11.25, 1]]],
  [12.0, 14.85, [["Departamentos", 12.06], ["totalmente", 13.08, 1], ["equipados,", 13.96, 1]]],
  [14.9, 16.42, [["con", 14.97], ["servicios", 15.18, 1], ["de", 15.73, 1], ["hotel.", 15.85, 1]]],
  [16.48, 18.08, [["Desayuno", 16.63, 1], ["incluido", 17.18, 1]]],
  [18.13, 20.45, [["y", 18.15], ["recepción", 18.18], ["las", 19.0], ["24", 19.34, 1], ["horas.", 19.83, 1]]],
  [20.5, 23.15, [["Pileta,", 20.47, 1], ["terraza…", 21.88, 1]]],
  [23.25, 25.0, [["y", 23.37], ["tiempo", 23.44, 1], ["para", 24.05, 1], ["vos.", 24.43, 1]]],
];

// Cierre: "Tu estadía, a tu ritmo." (l7) y el llamado a reservar (l8).
const CIERRE_DESDE = 24.6;
const TITULO = [["Tu", 25.33], ["estadía,", 25.41], ["a", 26.57, 1], ["tu", 26.6, 1], ["ritmo.", 26.72, 1]];
const CTA_AT = 27.8;
const URL_AT = 29.11;

const f = (n) => Number(n.toFixed(3));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const videos = PLANOS.map(([id, start, dur], i) => `
      <div class="toma" id="toma-${id}">
        <video id="v-${id}" class="clip" src="assets/planos/${id}.mp4" muted playsinline
          data-start="${start}" data-duration="${dur}" data-media-start="0" data-track-index="0"></video>
      </div>`).join("");

const frases = FRASES.map(([desde, hasta, palabras], i) => `
      <p class="frase clip" id="frase-${i + 1}" data-start="${desde}" data-duration="${f(hasta - desde)}" data-track-index="3">${palabras
        .map(([w, , dest], j) => `<span class="w${dest ? " dest" : ""}" id="f${i + 1}w${j + 1}">${esc(w)}</span>`)
        .join(" ")}</p>`).join("");

const voces = VOZ.map((v, i) => (v.dur = f(Math.min(v.dur, (VOZ[i + 1]?.start ?? FIN) - v.start)), v)).map((v) => `
    <audio id="voz-${v.id}" src="assets/voice/${v.id}.wav" data-start="${v.start}" data-duration="${v.dur}" data-track-index="${5}" data-volume="1"></audio>`).join("");

const palabraTitulo = ([w, , dest], j) => `<span class="w${dest ? " dest" : ""}" id="tw${j + 1}">${esc(w)}</span>`;
// Dos líneas a propósito (título display): "Tu estadía," / "a tu ritmo."
const titulo = [[0, 2], [2, 5]].map(([a, b]) => `<span class="linea">${TITULO.slice(a, b).map((p, k) => palabraTitulo(p, a + k)).join(" ")}</span>`).join("");

// Animación: un solo timeline pausado, todo con fromTo (seek-safe).
const js = [];
PLANOS.forEach(([id, start, dur, dir], i) => {
  const [a, b] = dir === "in" ? [1.0, 1.075] : [1.075, 1.0];
  const dx = i % 2 ? -18 : 18;
  js.push(`tl.fromTo("#toma-${id}", { scale: ${a}, x: 0 }, { scale: ${b}, x: ${dx}, duration: ${dur}, ease: "none" }, ${start});`);
});
FRASES.forEach(([desde, hasta, palabras], i) => {
  palabras.forEach(([, t], j) => {
    const at = Math.max(desde, t - 0.06);
    js.push(`tl.fromTo("#f${i + 1}w${j + 1}", { opacity: 0, y: 34, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.42, ease: "power3.out" }, ${f(at)});`);
  });
  js.push(`tl.fromTo("#frase-${i + 1}", { opacity: 1, y: 0 }, { opacity: 0, y: -14, duration: 0.24, ease: "power2.in", immediateRender: false }, ${f(hasta - 0.26)});`);
});

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>Ferrol Apart Hotel — Reel anuncio</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Instrument Serif"; font-style: normal; font-weight: 400; src: url("assets/fonts/instrument-serif.woff2") format("woff2"); }
      @font-face { font-family: "Instrument Serif"; font-style: italic; font-weight: 400; src: url("assets/fonts/instrument-serif-italic.woff2") format("woff2"); }
      :root {
        --tinta: #171717; --crema: #f2ebdd; --arena: #d9c7ad; --bronce: #b38a52;
        --blanco: #fffcf6; --arena-clara: #eadcc4; --sepia: #6b5a43;
      }
      html, body { margin: 0; background: var(--tinta); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--tinta); font-family: Montserrat, sans-serif; }
      .toma { position: absolute; inset: 0; transform-origin: 50% 45%; }
      .toma video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

      /* Lectura sobre la imagen: velo inferior + viñeta suave. */
      #velo { position: absolute; inset: 0; pointer-events: none;
        background:
          linear-gradient(to top, rgba(23,23,23,0) 0%, rgba(23,23,23,0.15) 14%, rgba(23,23,23,0.72) 34%, rgba(23,23,23,0.55) 52%, rgba(23,23,23,0) 70%),
          radial-gradient(ellipse at 50% 40%, rgba(23,23,23,0) 55%, rgba(23,23,23,0.45) 100%); }
      #marca { position: absolute; left: 80px; top: 200px; width: 230px; }
      #marca img { display: block; width: 100%; height: auto; }
      #marca-linea { display: block; width: 230px; height: 3px; margin-top: 22px; background: var(--arena); transform-origin: 0 50%; }

      .frase { position: absolute; left: 80px; right: 90px; bottom: 600px; margin: 0;
        font-family: "Instrument Serif", serif; font-size: 112px; line-height: 1.02; letter-spacing: -0.015em;
        color: var(--blanco); text-shadow: 0 2px 24px rgba(23,23,23,0.55); text-wrap: balance; }
      .frase .w { display: inline-block; }
      .frase .dest { font-style: italic; color: var(--arena-clara); }

    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${FIN}">
      <!-- Planos (video institucional del hotel, recortado a 9:16) -->${videos}

      <div id="velo"></div>
      <div id="marca">
        <img src="assets/marca/logo-ferrol.svg" alt="Ferrol Apart Hotel" />
        <span id="marca-linea"></span>
      </div>

      <!-- Subtítulos: la voz en pantalla, palabra por palabra -->${frases}

      <!-- Cierre de marca (sub-composición) -->
      <div id="cierre" data-composition-id="cierre" data-composition-src="compositions/cierre.html"
        data-start="${CIERRE_DESDE}" data-duration="${f(FIN - CIERRE_DESDE)}" data-track-index="4" data-width="1080" data-height="1920"></div>

      <!-- Audio: voz en off (Gemini TTS) + cama musical del institucional -->${voces}
    <audio id="cama" src="assets/audio/cama-institucional.m4a" data-start="0" data-duration="${FIN}" data-track-index="6" data-volume="0.42"
      data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.8,"v":1},{"t":32.2,"v":1},{"t":${FIN},"v":0}]}]}'></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // Planos: empuje / alejamiento lento alternado (cámara que respira)
      ${js.filter((l) => l.includes("#toma-")).join("\n      ")}
      // Marca arriba
      tl.fromTo("#marca img", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.2);
      tl.fromTo("#marca-linea", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.out" }, 0.45);
      tl.fromTo("#marca", { opacity: 1 }, { opacity: 0, duration: 0.4, ease: "power2.in", immediateRender: false }, ${CIERRE_DESDE});
      // Frases sincronizadas a la voz
      ${js.filter((l) => l.includes("#f") && !l.includes("#toma-")).join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", html);
console.log("index.html", html.length, "bytes,", PLANOS.length, "planos,", FRASES.length, "frases");

// ── Cierre: sub-composición con tiempos locales (0 = CIERRE_DESDE) ──
const L = (t) => f(t - CIERRE_DESDE);
const cierre = `<!doctype html>
<html lang="es">
  <head><meta charset="UTF-8" /><title>Cierre — Ferrol</title></head>
  <body>
    <template>
      <style>
        @font-face { font-family: "Instrument Serif"; font-style: normal; font-weight: 400; src: url("assets/fonts/instrument-serif.woff2") format("woff2"); }
        @font-face { font-family: "Instrument Serif"; font-style: italic; font-weight: 400; src: url("assets/fonts/instrument-serif-italic.woff2") format("woff2"); }
        #root { position: absolute; inset: 0; overflow: hidden; font-family: Montserrat, sans-serif;
          --tinta: #171717; --crema: #f2ebdd; --arena: #d9c7ad; --bronce: #b38a52; --sepia: #6b5a43; }
        #cierre-fondo { position: absolute; inset: 0; background: var(--crema); }
        #fantasma { position: absolute; left: -60px; right: -60px; top: 1200px; text-align: center;
          font-family: "Instrument Serif", serif; font-style: italic; font-size: 560px; line-height: 1; color: var(--arena); opacity: 0.32; white-space: nowrap; }
        #marco { position: absolute; inset: 56px; border: 3px solid var(--bronce); opacity: 0.55; }
        #cierre-contenido { position: absolute; left: 90px; right: 90px; top: 330px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        #cierre-logo { width: 400px; height: auto; display: block; }
        #cierre-etiqueta { margin-top: 64px; font-size: 26px; font-weight: 700; letter-spacing: 0.26em; color: var(--sepia); }
        #cierre-titulo { margin: 36px 0 0; font-family: "Instrument Serif", serif; font-weight: 400; font-size: 136px; line-height: 1.0; letter-spacing: -0.02em; color: var(--tinta); }
        #cierre-titulo .linea { display: block; }
        #cierre-titulo .w { display: inline-block; }
        #cierre-titulo .dest { font-style: italic; }
        #cierre-regla { width: 520px; height: 3px; margin-top: 56px; background: var(--bronce); transform-origin: 50% 50%; }
        #cta { margin-top: 64px; display: inline-block; padding: 30px 64px; border-radius: 999px; background: var(--tinta); color: var(--crema); font-size: 42px; font-weight: 700; letter-spacing: 0.01em; }
        #url { margin-top: 34px; font-size: 46px; font-weight: 700; color: var(--tinta); letter-spacing: 0.01em; }
      </style>
      <div id="root" data-composition-id="cierre" data-width="1080" data-height="1920">
        <div id="cierre-fondo"></div>
        <div id="fantasma" aria-hidden="true" data-layout-ignore>Funes</div>
        <div id="marco"></div>
        <div id="cierre-contenido">
          <img id="cierre-logo" src="assets/marca/logo-ferrol-oscuro.svg" alt="Ferrol Apart Hotel" />
          <div id="cierre-etiqueta">FUNES · A MINUTOS DE ROSARIO</div>
          <h1 id="cierre-titulo">${titulo}</h1>
          <div id="cierre-regla"></div>
          <div id="cta">Reservá directo</div>
          <div id="url">ferrolaparthotel.com.ar</div>
        </div>
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.fromTo("#cierre-fondo", { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "power2.inOut" }, 0);
        tl.fromTo("#marco", { opacity: 0, scale: 1.04 }, { opacity: 0.55, scale: 1, duration: 1.1, ease: "power3.out" }, 0.3);
        tl.fromTo("#fantasma", { opacity: 0, x: 90 }, { opacity: 0.32, x: -90, duration: ${f(FIN - CIERRE_DESDE - 0.2)}, ease: "none" }, 0.2);
        tl.fromTo("#cierre-logo", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 0.45);
        tl.fromTo("#cierre-etiqueta", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 0.7);
        ${TITULO.map(([, t], j) => `tl.fromTo("#tw${j + 1}", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "expo.out" }, ${L(t - 0.08)});`).join("\n        ")}
        tl.fromTo("#cierre-regla", { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "expo.inOut" }, ${L(CTA_AT - 0.5)});
        tl.fromTo("#cta", { opacity: 0, scale: 0.86, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, ${L(CTA_AT)});
        tl.fromTo("#url", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${L(URL_AT)});
        tl.fromTo("#cta", { scale: 1 }, { scale: 1.04, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 3, immediateRender: false }, ${L(URL_AT + 0.9)});
        window.__timelines["cierre"] = tl;
      </script>
    </template>
  </body>
</html>
`;
fs.mkdirSync("compositions", { recursive: true });
fs.writeFileSync("compositions/cierre.html", cierre);
console.log("compositions/cierre.html", cierre.length, "bytes");
