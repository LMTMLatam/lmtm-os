// Genera index.html y compositions/cierre.html (estáticos, editables en Studio) a partir de
// los tiempos reales de la voz (audio_meta) y de los planos de assets/planos.
// Mismo esqueleto que el reel de Ferrol, con la identidad del Hiper de la Pelu.
// Uso: node .work/build.mjs   (desde la raíz del proyecto)
import fs from "node:fs";

const FIN = 21.8;

// Voz: inicio global de cada archivo (el habla real empieza ~0,2 s después).
const VOZ = [
  { id: "l1", start: 0.1, dur: 1.76 },
  { id: "l2", start: 1.7, dur: 4.36 },
  { id: "l3", start: 5.65, dur: 3.8 },
  { id: "l4", start: 9.1, dur: 2.8 },
  { id: "l5", start: 11.55, dur: 3.88 },
  { id: "l6", start: 15.3, dur: 2.04 },
  { id: "l7", start: 17.1, dur: 3.16 },
];

// Planos verticales (ya recortados y con la velocidad horneada): [id, desde, duración, empuje]
const PLANOS = [
  ["o1", 0.0, 2.95, "in"], ["o2", 2.95, 1.15, "out"], ["o6", 4.1, 1.65, "in"],
  ["o4", 5.75, 0.8, "out"], ["e1", 6.55, 0.85, "in"], ["e3", 7.4, 0.55, "out"],
  ["o3", 7.95, 1.45, "in"], ["o8", 9.4, 1.38, "out"], ["e4", 10.78, 1.27, "in"],
  ["e6", 12.05, 1.35, "out"], ["e5", 13.4, 0.85, "in"], ["o7", 14.25, 1.4, "out"],
];

// Frases en pantalla: [desde, hasta, [[palabra, segundo en que se dice, destacada?]]]
const FRASES = [
  [0.05, 1.72, [["¿Buscás", 0.19], ["OPI", 0.62, 1], ["en", 1.02], ["Rosario?", 1.18, 1]]],
  [1.75, 3.05, [["En", 1.85], ["el", 1.96], ["Hiper", 2.0, 1], ["de", 2.4, 1], ["la", 2.53, 1], ["Pelu", 2.68, 1]]],
  [3.05, 5.86, [["somos", 3.1], ["distribuidores", 3.5, 1], ["exclusivos", 4.62, 1], ["de", 5.42], ["OPI.", 5.64, 1]]],
  [5.86, 7.9, [["Esmaltes,", 5.86, 1], ["semipermanente", 6.47, 1]]],
  [7.9, 9.25, [["y", 7.95], ["lo", 7.96], ["nuevo", 8.1, 1], ["de", 8.47], ["la", 8.61], ["marca.", 8.75]]],
  [9.25, 10.75, [["¿No", 9.18], ["sabés", 9.34], ["cuál", 9.74, 1], ["elegir?", 10.06, 1]]],
  [10.75, 11.75, [["Te", 10.8], ["asesoramos.", 10.97, 1]]],
  [11.75, 13.3, [["Un", 11.56], ["negocio", 11.87], ["familiar,", 12.45, 1]]],
  [13.3, 15.15, [["con", 13.38], ["más", 13.45], ["de", 13.63], ["1.500", 13.75, 1], ["productos.", 14.48, 1]]],
];

// Cierre: "Elegí tu OPI en el Hiper." (l6) y "Consultanos en hiperdelapelu.com.ar" (l7).
const CIERRE_DESDE = 15.15;
const TITULO = [["Elegí", 15.31], ["tu", 15.85], ["OPI", 16.07, 1], ["en", 16.4], ["el", 16.62], ["Hiper.", 16.83]];
const CTA_AT = 17.42;
const URL_AT = 18.18;

const f = (n) => Number(n.toFixed(3));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const videos = PLANOS.map(([id, start, dur]) => `
      <div class="toma" id="toma-${id}">
        <video id="v-${id}" class="clip" src="assets/planos/${id}.mp4" muted playsinline
          data-start="${start}" data-duration="${dur}" data-media-start="0" data-track-index="0"></video>
      </div>`).join("");

// Palabra destacada: marcador naranja detrás (se dibuja de izquierda a derecha).
const palabra = (id, w, dest) => dest
  ? `<span class="w dest" id="${id}"><span class="m" id="${id}m"></span><span class="t">${esc(w)}</span></span>`
  : `<span class="w" id="${id}">${esc(w)}</span>`;

const frases = FRASES.map(([desde, hasta, palabras], i) => `
      <p class="frase clip" id="frase-${i + 1}" data-start="${desde}" data-duration="${f(hasta - desde)}" data-track-index="3">${palabras
        .map(([w, , dest], j) => palabra(`f${i + 1}w${j + 1}`, w, dest))
        .join(" ")}</p>`).join("");

const voces = VOZ.map((v, i) => (v.dur = f(Math.min(v.dur, (VOZ[i + 1]?.start ?? FIN) - v.start)), v)).map((v) => `
    <audio id="voz-${v.id}" src="assets/voice/${v.id}.wav" data-start="${v.start}" data-duration="${v.dur}" data-track-index="5" data-volume="1"></audio>`).join("");

// Dos líneas a propósito (título display): "Elegí tu OPI" / "en el Hiper."
const titulo = [[0, 3], [3, 6]].map(([a, b]) => `<span class="linea">${TITULO.slice(a, b).map(([w, , dest], k) => `<span class="w${dest ? " dest" : ""}" id="tw${a + k + 1}">${esc(w)}</span>`).join(" ")}</span>`).join("");

// Animación: un solo timeline pausado, todo con fromTo (seek-safe).
const tomas = PLANOS.map(([id, start, dur, dir], i) => {
  const [a, b] = dir === "in" ? [1.0, 1.07] : [1.07, 1.0];
  const dx = i % 2 ? -16 : 16;
  return `tl.fromTo("#toma-${id}", { scale: ${a}, x: 0 }, { scale: ${b}, x: ${dx}, duration: ${dur}, ease: "none" }, ${start});`;
});
const textos = [];
FRASES.forEach(([desde, hasta, palabras], i) => {
  palabras.forEach(([, t, dest], j) => {
    const id = `#f${i + 1}w${j + 1}`;
    const at = f(Math.max(desde, t - 0.06));
    textos.push(`tl.fromTo("${id}", { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "back.out(2)" }, ${at});`);
    if (dest) textos.push(`tl.fromTo("${id}m", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "expo.out" }, ${f(at + 0.08)});`);
  });
  textos.push(`tl.fromTo("#frase-${i + 1}", { opacity: 1, y: 0 }, { opacity: 0, y: -16, duration: 0.2, ease: "power2.in", immediateRender: false }, ${f(hasta - 0.22)});`);
});

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>Hiper de la Pelu — OPI — Reel anuncio</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      :root {
        --naranja: #f36c21; --grafito: #404040; --niebla: #f4f4f4; --blanco: #ffffff;
        --sombra: #1f1f1f;
      }
      html, body { margin: 0; background: var(--sombra); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--sombra); font-family: Montserrat, sans-serif; }
      .toma { position: absolute; inset: 0; transform-origin: 50% 45%; }
      .toma video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

      /* Lectura sobre la imagen: velo inferior + viñeta suave. */
      #velo { position: absolute; inset: 0; pointer-events: none;
        background:
          linear-gradient(to top, rgba(31,31,31,0.1) 0%, rgba(31,31,31,0.3) 12%, rgba(31,31,31,0.66) 24%, rgba(31,31,31,0.45) 38%, rgba(31,31,31,0) 54%),
          radial-gradient(ellipse at 50% 40%, rgba(31,31,31,0) 58%, rgba(31,31,31,0.38) 100%); }
      #marca { position: absolute; left: 76px; top: 170px; width: 190px; }
      #marca img { display: block; width: 100%; height: auto; filter: drop-shadow(0 6px 18px rgba(31,31,31,0.35)); }

      .frase { position: absolute; left: 80px; right: 80px; bottom: 420px; margin: 0;
        font-weight: 800; font-size: 100px; line-height: 1.12; letter-spacing: -0.025em;
        color: var(--blanco); text-shadow: 0 2px 22px rgba(31,31,31,0.5); text-wrap: balance; }
      .frase .w { display: inline-block; }
      .frase .dest { position: relative; text-shadow: none; }
      .frase .dest .t { position: relative; }
      .frase .dest .m { position: absolute; left: -0.1em; right: -0.1em; top: 0.12em; bottom: 0.04em;
        background: var(--naranja); border-radius: 14px; transform-origin: 0 50%; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${FIN}">
      <!-- Planos (material de OPI y de la masterclass en el Hiper, recortados a 9:16) -->${videos}

      <div id="velo"></div>
      <div id="marca"><img src="assets/marca/logo-hiper.png" alt="El Hiper de la Pelu" /></div>

      <!-- Subtítulos: la voz en pantalla, palabra por palabra -->${frases}

      <!-- Cierre de marca (sub-composición) -->
      <div id="cierre" data-composition-id="cierre" data-composition-src="compositions/cierre.html"
        data-start="${CIERRE_DESDE}" data-duration="${f(FIN - CIERRE_DESDE)}" data-track-index="4" data-width="1080" data-height="1920"></div>

      <!-- Audio: voz en off (Gemini TTS) + cama musical (audio del video de GELevate del cliente) -->${voces}
    <audio id="cama" src="assets/audio/cama.m4a" data-start="0" data-duration="${FIN}" data-track-index="6" data-volume="0.3"
      data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.5,"v":1},{"t":${f(FIN - 1.4)},"v":1},{"t":${FIN},"v":0}]}]}'></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // Planos: empuje / alejamiento alternado
      ${tomas.join("\n      ")}
      // Marca arriba
      tl.fromTo("#marca", { opacity: 0, y: -18, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, 0.15);
      tl.fromTo("#marca", { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power2.in", immediateRender: false }, ${CIERRE_DESDE});
      // Frases sincronizadas a la voz
      ${textos.join("\n      ")}
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
  <head><meta charset="UTF-8" /><title>Cierre — Hiper de la Pelu</title></head>
  <body>
    <template>
      <style>
        #root { position: absolute; inset: 0; overflow: hidden; font-family: Montserrat, sans-serif;
          --naranja: #f36c21; --grafito: #404040; --niebla: #f4f4f4; --blanco: #ffffff; --gris-fantasma: #e6e6e6; --naranja-texto: #dc5c14; }
        #cierre-fondo { position: absolute; inset: 0; background: var(--niebla); }
        #fantasma { position: absolute; left: -80px; right: -80px; top: 1180px; text-align: center;
          font-weight: 900; font-size: 620px; line-height: 1; letter-spacing: -0.04em; color: var(--gris-fantasma); white-space: nowrap; }
        #mancha { position: absolute; width: 760px; height: 760px; right: -330px; bottom: -300px;
          background: var(--naranja); border-radius: 46% 54% 42% 58% / 52% 44% 56% 48%; opacity: 0.9; }
        #cierre-contenido { position: absolute; left: 80px; right: 80px; top: 300px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        #cierre-logo { width: 380px; height: auto; display: block; }
        #cierre-etiqueta { margin-top: 56px; font-size: 28px; font-weight: 700; letter-spacing: 0.24em; color: var(--grafito); }
        #cierre-titulo { margin: 30px 0 0; font-weight: 900; font-size: 150px; line-height: 1.0; letter-spacing: -0.035em; color: var(--grafito); }
        #cierre-titulo .linea { display: block; }
        #cierre-titulo .w { display: inline-block; }
        #cierre-titulo .dest { color: var(--naranja-texto); }
        #cierre-regla { width: 460px; height: 8px; border-radius: 4px; margin-top: 56px; background: var(--naranja); transform-origin: 50% 50%; }
        #cta { margin-top: 60px; display: inline-block; padding: 30px 70px; border-radius: 999px; background: var(--naranja); color: var(--blanco); font-size: 46px; font-weight: 800; letter-spacing: 0.01em; }
        #url { margin-top: 34px; font-size: 50px; font-weight: 800; color: var(--grafito); letter-spacing: -0.005em; }
      </style>
      <div id="root" data-composition-id="cierre" data-width="1080" data-height="1920">
        <div id="cierre-fondo"></div>
        <div id="fantasma" aria-hidden="true" data-layout-ignore>OPI</div>
        <div id="mancha" aria-hidden="true" data-layout-ignore></div>
        <div id="cierre-contenido">
          <img id="cierre-logo" src="assets/marca/logo-hiper.png" alt="El Hiper de la Pelu" />
          <div id="cierre-etiqueta">ROSARIO · +1.500 PRODUCTOS</div>
          <h1 id="cierre-titulo">${titulo}</h1>
          <div id="cierre-regla"></div>
          <div id="cta">Consultanos</div>
          <div id="url">hiperdelapelu.com.ar</div>
        </div>
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.fromTo("#cierre-fondo", { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.inOut" }, 0);
        tl.fromTo("#mancha", { opacity: 0, scale: 0.6, rotation: -20 }, { opacity: 0.9, scale: 1, rotation: 8, duration: ${f(FIN - CIERRE_DESDE - 0.3)}, ease: "power2.out" }, 0.25);
        tl.fromTo("#fantasma", { opacity: 0, x: 110 }, { opacity: 1, x: -110, duration: ${f(FIN - CIERRE_DESDE - 0.2)}, ease: "none" }, 0.2);
        tl.fromTo("#cierre-logo", { opacity: 0, scale: 0.7, rotation: -12 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.7)" }, 0.3);
        tl.fromTo("#cierre-etiqueta", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.55);
        ${TITULO.map(([, t], j) => `tl.fromTo("#tw${j + 1}", { opacity: 0, y: 46, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: "back.out(2)" }, ${L(Math.max(t - 0.06, CIERRE_DESDE + 0.2))});`).join("\n        ")}
        tl.fromTo("#cierre-regla", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "expo.inOut" }, ${L(CTA_AT - 0.45)});
        tl.fromTo("#cta", { opacity: 0, scale: 0.82, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "back.out(1.8)" }, ${L(CTA_AT - 0.05)});
        tl.fromTo("#url", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, ${L(URL_AT)});
        tl.fromTo("#cta", { scale: 1 }, { scale: 1.05, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 3, immediateRender: false }, ${L(URL_AT + 1.0)});
        window.__timelines["cierre"] = tl;
      </script>
    </template>
  </body>
</html>
`;
fs.mkdirSync("compositions", { recursive: true });
fs.writeFileSync("compositions/cierre.html", cierre);
console.log("compositions/cierre.html", cierre.length, "bytes");
