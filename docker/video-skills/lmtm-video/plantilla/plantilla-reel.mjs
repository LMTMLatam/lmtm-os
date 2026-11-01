// Plantilla del reel aprobado (El Hiper de la Pelu / OPI, 23/10; mismo esqueleto que Ferrol).
//
// El diseño está acá y no se toca: planos a pantalla completa con empuje suave,
// velo inferior para leer, logo fijo arriba, subtítulos grandes palabra por
// palabra con marcador del color de la marca, y cierre con logo, titular, botón,
// web, una palabra fantasma gigante y una mancha de color. El agente solo carga
// los datos en reel.json (ver reel.ejemplo.json).
//
// Uso (desde la raíz del proyecto):  node <ruta>/plantilla-reel.mjs reel.json
// Escribe index.html y compositions/cierre.html. Después: npx hyperframes check.
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync(process.argv[2] || "reel.json", "utf8"));
const errores = [];
const exigir = (cond, msg) => { if (!cond) errores.push(msg); };

const FIN = Number(spec.duracion);
exigir(FIN >= 8 && FIN <= 60, "duracion: entre 8 y 60 s");
const VOZ = spec.voz ?? [];
const PLANOS = spec.planos ?? [];
const FRASES = spec.frases ?? [];
const M = spec.marca ?? {};
const C = spec.cierre ?? {};
const MUS = spec.musica ?? null;

exigir(PLANOS.length >= 6, "planos: 6 como mínimo (el estándar es 8 o más)");
exigir(new Set(PLANOS.map((p) => p.archivo)).size === PLANOS.length, "planos: hay archivos repetidos");
exigir(FRASES.length > 0, "frases: faltan los subtítulos");
exigir(VOZ.length > 0, "voz: faltan los archivos de voz");
exigir(!!M.logo, "marca.logo: falta el logo");
exigir(/^#[0-9a-f]{6}$/i.test(M.color ?? ""), "marca.color: un color #rrggbb de la paleta del cliente");
exigir(Number(C.desde) > 0 && Number(C.desde) < FIN, "cierre.desde: tiene que caer antes del final");
exigir(Array.isArray(C.titulo) && C.titulo.length > 0, "cierre.titulo: las palabras del titular con su segundo");
for (const [i, fr] of FRASES.entries()) exigir(Number(fr.hasta) <= Number(C.desde) + 0.01, `frases[${i}]: termina después de que empieza el cierre`);
const tapados = PLANOS.reduce((fin, p) => Math.max(fin, Number(p.desde) + Number(p.dur)), 0);
// El cierre va sobre la última toma: los planos cubren hasta el final.
exigir(tapados >= FIN - 0.05, `planos: terminan en ${tapados.toFixed(2)} s y el reel dura ${FIN} s (queda un hueco negro)`);
if (errores.length) {
  console.error("reel.json no cumple el estándar:\n- " + errores.join("\n- "));
  process.exit(1);
}

const f = (n) => Number(Number(n).toFixed(3));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const color = M.color;
const oscuro = M.oscuro ?? "#1f1f1f";
const fuente = M.fuente ?? "Montserrat";
// La tipografía del cliente (marca.fuenteArchivo, un .woff2 dentro del proyecto). Con un solo peso, el rango evita la
// negrita falsa del navegador: pedido de RENO, LMTM-6543.
const caraFuente = (url) => (M.fuenteArchivo ? `@font-face { font-family: "${fuente}"; src: url("${esc(url)}"); font-weight: 100 900; font-display: block; }` : "");
/** Luminancia relativa (0 negro, 1 blanco). */
const luz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// Formato de los reels virales (31/10, pedido del usuario: «los subtítulos en el
// medio y los carteles no me gustan»): subtítulos grandes de 1 a 3 palabras,
// blancos con borde, abajo, y la palabra clave en el color de la marca. Sin
// recuadros ni rótulos. Si el color de la marca no se lee sobre video (casi negro
// o casi blanco, como RENO), marca.acento; si no hay, la clave va un poco más grande.
const marcaOscura = luz(color) < 0.05;
const acento = M.acento ?? (luz(color) > 0.04 && luz(color) < 0.8 ? color : null);
// Logo oscuro de una sola tinta sobre tomas oscuras no se ve: marca.logoBlanco lo
// pasa a blanco (como la versión «fondo negro» que tienen las marcas), arriba y en el cierre.
const filtroLogo = M.logoBlanco ? "brightness(0) invert(1) " : "";
const esImagen = (a) => /\.(jpe?g|png|webp)$/i.test(a);
const BORDE = [[0, 5], [0, -5], [5, 0], [-5, 0], [4, 4], [-4, 4], [4, -4], [-4, -4]].map(([x, y]) => `${x}px ${y}px 0 #000`).join(", ");
const G_ = spec.gancho && spec.gancho.texto ? spec.gancho : null;
const CIERRE_DESDE = f(C.desde);

const tomasHtml = PLANOS.map((p, i) => {
  const id = `p${i + 1}`;
  const media = esImagen(p.archivo)
    ? `<img id="v-${id}" class="clip" src="${esc(p.archivo)}" alt="" data-start="${f(p.desde)}" data-duration="${f(p.dur)}" data-track-index="0" />`
    : `<video id="v-${id}" class="clip" src="${esc(p.archivo)}" muted playsinline data-start="${f(p.desde)}" data-duration="${f(p.dur)}" data-media-start="${f(p.desdeEnArchivo ?? 0)}" data-track-index="0"></video>`;
  return `
      <div class="toma" id="toma-${id}">
        ${media}
      </div>`;
}).join("");

const palabra = (id, w, dest) => `<span class="w${dest ? " dest" : ""}" id="${id}">${esc(w)}</span>`;

const frasesHtml = FRASES.map((fr, i) => `
      <p class="frase clip" id="frase-${i + 1}" data-start="${f(fr.desde)}" data-duration="${f(fr.hasta - fr.desde)}" data-track-index="3">${fr.palabras
        .map(([w, , dest], j) => palabra(`f${i + 1}w${j + 1}`, w, dest))
        .join(" ")}</p>`).join("");

const voces = VOZ.map((v, i) => {
  const hasta = VOZ[i + 1]?.desde ?? FIN;
  const dur = f(Math.min(Number(v.dur ?? hasta - v.desde), hasta - v.desde));
  return `
    <audio id="voz-${i + 1}" src="${esc(v.archivo)}" data-start="${f(v.desde)}" data-duration="${dur}" data-track-index="5" data-volume="1"></audio>`;
}).join("");

const musica = MUS?.archivo ? `
    <audio id="cama" src="${esc(MUS.archivo)}" data-start="0" data-duration="${FIN}" data-track-index="6" data-volume="${Number(MUS.volumen ?? 0.25)}"
      data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.5,"v":1},{"t":${f(FIN - 1.4)},"v":1},{"t":${FIN},"v":0}]}]}'></audio>` : "";

// Titular del cierre en dos líneas (o donde diga cierre.corte).
const corte = Number.isInteger(C.corte) ? C.corte : Math.ceil(C.titulo.length / 2);
const titulo = [[0, corte], [corte, C.titulo.length]].filter(([a, b]) => b > a)
  .map(([a, b]) => `<span class="linea">${C.titulo.slice(a, b).map(([w, , dest], k) => `<span class="w${dest ? " dest" : ""}" id="tw${a + k + 1}">${esc(w)}</span>`).join(" ")}</span>`).join("");

const tomas = PLANOS.map((p, i) => {
  const [a, b] = i % 2 === 0 ? [1.0, 1.07] : [1.07, 1.0];
  const dx = i % 2 ? -16 : 16;
  return `tl.fromTo("#toma-p${i + 1}", { scale: ${a}, x: 0 }, { scale: ${b}, x: ${dx}, duration: ${f(p.dur)}, ease: "none" }, ${f(p.desde)});`;
});
const textos = [];
FRASES.forEach((fr, i) => {
  fr.palabras.forEach(([, t, dest], j) => {
    const id = `#f${i + 1}w${j + 1}`;
    const at = f(Math.max(fr.desde, t - 0.06));
    textos.push(`tl.fromTo("${id}", { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "back.out(2)" }, ${at});`);
  });
  textos.push(`tl.fromTo("#frase-${i + 1}", { opacity: 1, y: 0 }, { opacity: 0, y: -16, duration: 0.2, ease: "power2.in", immediateRender: false }, ${f(fr.hasta - 0.22)});`);
});

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(spec.titulo ?? "Reel")}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${caraFuente(M.fuenteArchivo)}
      :root { --marca: ${color}; --sombra: ${oscuro}; --blanco: #ffffff; }
      html, body { margin: 0; background: var(--sombra); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--sombra); font-family: ${fuente}, sans-serif; }
      .toma { position: absolute; inset: 0; transform-origin: 50% 45%; }
      .toma video, .toma img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #velo { position: absolute; inset: 0; pointer-events: none;
        background:
          linear-gradient(to top, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.22) 26%, rgba(0,0,0,0) 46%),
          radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.34) 100%); }
      /* Arriba, fuera de la interfaz de Reels (269 px). Chico, como una firma. */
      #marca { position: absolute; left: 76px; top: 280px; width: ${Number(M.anchoLogo ?? 150)}px; }
      #marca img { display: block; width: 100%; height: auto; filter: ${filtroLogo}drop-shadow(0 1px 3px rgba(0,0,0,0.5)) drop-shadow(0 6px 18px rgba(0,0,0,0.35)); }
      /* Subtítulo de reel viral: abajo (el borde de abajo a 440 px, encima del texto
         y los botones de Reels), centrado y angosto para no chocar con la columna
         de botones de la derecha, blanco con borde negro. */
      .frase, #gancho { position: absolute; left: 150px; right: 150px; margin: 0; text-align: center;
        font-weight: 900; line-height: 1.04; letter-spacing: -0.02em; color: var(--blanco); text-wrap: balance;
        text-shadow: ${BORDE}, 0 8px 24px rgba(0,0,0,0.45); }
      .frase { bottom: 440px; font-size: ${Number(spec.tamanoSubtitulo ?? 96)}px; }
      #gancho { top: 420px; font-size: ${Number(spec.tamanoGancho ?? 84)}px; }
      .frase .w, #gancho .w { display: inline-block; }
      .dest { ${acento ? `color: ${acento};` : "font-size: 1.12em;"} }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${FIN}">${tomasHtml}

      <div id="velo"></div>
      <div id="marca"><img src="${esc(M.logo)}" alt="" /></div>
${G_ ? `      <p id="gancho" class="clip" data-start="0" data-duration="${f(G_.hasta ?? 2.4)}" data-track-index="2">${String(G_.texto).split(/\s+/).map((w) => `<span class="w${/\*/.test(w) ? " dest" : ""}">${esc(w.replace(/\*/g, ""))}</span>`).join(" ")}</p>\n` : ""}${frasesHtml}

      <div id="cierre" data-composition-id="cierre" data-composition-src="compositions/cierre.html"
        data-start="${CIERRE_DESDE}" data-duration="${f(FIN - CIERRE_DESDE)}" data-track-index="4" data-width="1080" data-height="1920"></div>
${voces}${musica}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${tomas.join("\n      ")}
      ${G_ ? `tl.fromTo("#gancho", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, 0.05);` : ""}
      tl.fromTo("#marca", { opacity: 0, y: -18, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, 0.15);
      tl.fromTo("#marca", { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power2.in", immediateRender: false }, ${CIERRE_DESDE});
      ${textos.join("\n      ")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync("index.html", html);

const L = (t) => f(t - CIERRE_DESDE);
const ctaAt = Number(C.ctaDesde ?? CIERRE_DESDE + 2.2);
const urlAt = Number(C.urlDesde ?? ctaAt + 0.8);
const cierre = `<!doctype html>
<html lang="es">
  <head><meta charset="UTF-8" /><title>Cierre</title></head>
  <body>
    <template>
      <style>
        ${caraFuente(`../${M.fuenteArchivo}`)}
        #root { position: absolute; inset: 0; overflow: hidden; font-family: ${fuente}, sans-serif; }
        /* El cierre va SOBRE la última toma, como en los reels virales: una placa
           estática al final corta la retención y el loop. */
        #cierre-fondo { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0) 85%); }
        #cierre-contenido { position: absolute; left: 110px; right: 110px; bottom: 480px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        #cierre-logo { width: ${Number(C.anchoLogo ?? 300)}px; height: auto; display: block; filter: ${M.logoBlanco ? "brightness(0) invert(1) " : ""}drop-shadow(0 2px 6px rgba(0,0,0,0.5)); }
        #cierre-etiqueta { margin-top: 28px; font-size: 28px; font-weight: 700; letter-spacing: 0.22em; color: rgba(255,255,255,0.85); }
        #cierre-titulo { margin: 22px 0 0; font-weight: 900; font-size: ${Number(C.tamanoTitulo ?? 120)}px; line-height: 1.0; letter-spacing: -0.03em; color: #fff; text-wrap: balance; text-shadow: ${BORDE}; }
        #cierre-titulo .linea { display: block; }
        #cierre-titulo .w { display: inline-block; }
        #cierre-titulo .dest { ${acento ? `color: ${acento};` : ""} }
        #cta { margin-top: 40px; display: inline-block; padding: 26px 64px; border-radius: 999px; background: ${acento ?? "#ffffff"}; color: ${acento && !marcaOscura && luz(acento) < 0.5 ? "#ffffff" : "#111111"}; font-size: 44px; font-weight: 800; }
        #url { margin-top: 26px; font-size: 44px; font-weight: 800; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.6); }
      </style>
      <div id="root" data-composition-id="cierre" data-width="1080" data-height="1920">
        <div id="cierre-fondo"></div>
        <div id="cierre-contenido">
          <img id="cierre-logo" src="${esc(C.logo ?? M.logo)}" alt="" />
          ${C.etiqueta ? `<div id="cierre-etiqueta">${esc(C.etiqueta)}</div>` : ""}
          <h1 id="cierre-titulo">${titulo}</h1>
          ${C.cta ? `<div id="cta">${esc(C.cta)}</div>` : ""}
          ${C.url ? `<div id="url">${esc(C.url)}</div>` : ""}
        </div>
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        tl.fromTo("#cierre-fondo", { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.inOut" }, 0);
        tl.fromTo("#cierre-logo", { opacity: 0, scale: 0.7, rotation: -12 }, { opacity: 1, scale: 1, rotation: 0, duration: 0.7, ease: "back.out(1.7)" }, 0.3);
        ${C.etiqueta ? `tl.fromTo("#cierre-etiqueta", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.55);` : ""}
        ${C.titulo.map(([, t], j) => `tl.fromTo("#tw${j + 1}", { opacity: 0, y: 46, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: "back.out(2)" }, ${L(Math.max(t - 0.06, CIERRE_DESDE + 0.2))});`).join("\n        ")}
        ${C.cta ? `tl.fromTo("#cta", { opacity: 0, scale: 0.82, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "back.out(1.8)" }, ${L(ctaAt - 0.05)});` : ""}
        ${C.url ? `tl.fromTo("#url", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, ${L(urlAt)});` : ""}
        ${C.cta && urlAt + 1.0 < FIN ? `tl.fromTo("#cta", { scale: 1 }, { scale: 1.05, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 3, immediateRender: false }, ${L(urlAt + 1.0)});` : ""}
        window.__timelines["cierre"] = tl;
      </script>
    </template>
  </body>
</html>
`;
fs.mkdirSync("compositions", { recursive: true });
fs.writeFileSync("compositions/cierre.html", cierre);
console.log(`listo: index.html (${PLANOS.length} planos, ${FRASES.length} frases) y compositions/cierre.html. Ahora: npx hyperframes check --json`);
