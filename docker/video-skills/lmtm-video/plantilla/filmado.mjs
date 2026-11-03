// Arma el reel FILMADO con motion gráficos desde guion.json, en un comando: base
// (reel de vtool o voces en off + tomas), música, zonas libres, títulos en la voz,
// tarjetas, insertos, cierre, chequeo y, con --render, render + control + revisión.
// Lo llama armar.mjs cuando el guion dice "tipo": "filmado".
//
//   node armar.mjs guion.json [--render] [--sin-revision]
//
// guion.json (ver guion-filmado.ejemplo.json):
//   tipo               "filmado"
//   base               el reel de `vtool reel`/`vtool jornada --sin-subtitulos` (con su .palabras.json al lado), o
//   tramos[]           { voz: "voz1.wav", planos: [{ fuente, desde, foco, lento }] }: voz en off grabada + tomas
//   claves[]           palabras que van GRANDES y en color (si no, la más larga de cada título)
//   correcciones       { "Tuplacar": "Tu placar" } lo que whisper escribe mal
//   tarjetas[]         { dice, dur, etiqueta, tachado, titulo, antes, valor, nota, imagen }
//   insertos[]         { dice, dur, tipo: numero|lista|pasos|chat|pantalla|antes-despues|grilla|media, … } (ver guion-filmado.ejemplo.json)
//   cierre             { titulo, cta, url, legal, dice, cola }
//   movimiento         directo|pulso|relato|vitrina|ficha: acá cambia el panel de los insertos (obligatorio en un reel nuevo)
//   ganchoTipo, pilar  para la ficha de la pieza: de eso sale el control de variedad y la medición
//   marca, musica      { color, acento, oscuro, logo, logoBlanco, fuente } · { archivo, volDb } o { prompt, volDb }
//
// `dice`: la frase tal como se escucha; ahí aparece el elemento. Nada se ubica a ojo:
// si la frase no se dice en el video, frena.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chequear, duracion, enWindows, esFoto, fichaYVariedad, huella, medirCaptura, norm, pistaDe, r2, renderizarYRevisar, sellar, transcribir, vigente } from "./comun.mjs";
import { DUR_MINIMA, MOVIMIENTOS, TIPOS_INSERTO, momentosDe, textoDeInserto, textosDeInserto, validarInserto } from "./motion.mjs";

const P = path.dirname(fileURLToPath(import.meta.url));
const archivoGuion = path.resolve(process.argv[2] ?? "guion.json");
const flags = new Set(process.argv.slice(3));
const DIR = path.dirname(archivoGuion);
process.chdir(DIR);
const G = JSON.parse(fs.readFileSync(archivoGuion, "utf8"));

const errores = [];
const avisos = [];
const exigir = (cond, msg) => { if (!cond) errores.push(msg); };
const frenar = (titulo) => {
  if (!errores.length) return;
  console.error(`${titulo}:\n- ${[...new Set(errores)].join("\n- ")}`);
  process.exit(1);
};
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const vtool = (...args) => {
  const r = spawnSync("vtool", args, { encoding: "utf8", ...enWindows });
  if (r.status !== 0) { console.error(`vtool ${args[0]}: ${(r.stderr || r.stdout || r.error?.message || "").slice(-400)}`); process.exit(1); }
  return r.stdout;
};
const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c ?? "");
/** Luminancia relativa (0 negro, 1 blanco). */
const luz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// ── 1. El guion cumple antes de gastar nada ─────────────────────────────────
const M = G.marca ?? {};
const C = G.cierre ?? null;
const TARJETAS = G.tarjetas ?? [];
const INSERTOS = G.insertos ?? [];
exigir(hexOk(M.color), "marca.color: #rrggbb de la paleta del cliente (de su guía)");
exigir(!M.acento || hexOk(M.acento), "marca.acento: #rrggbb de la paleta del cliente");
exigir(!!M.logo && fs.existsSync(M.logo), `marca.logo: no existe ${M.logo ?? "(falta)"}`);
// Lo que usa la página tiene que viajar con el proyecto al render.
const adentro = (a, q) => exigir(!path.relative(DIR, path.resolve(a)).startsWith(".."), `${q}: ${a} está fuera del proyecto (copialo a assets/marca/)`);
if (M.logo) adentro(M.logo, "marca.logo");
if (M.fuenteArchivo) {
  exigir(fs.existsSync(M.fuenteArchivo), `marca.fuenteArchivo: no existe ${M.fuenteArchivo}`);
  adentro(M.fuenteArchivo, "marca.fuenteArchivo");
  exigir(!!M.fuente, "marca.fuente: el nombre de la tipografía que trae fuenteArchivo");
}
exigir(!!G.base !== !!G.tramos, "base o tramos: uno de los dos (base = reel de vtool; tramos = voz en off grabada + tomas)");
const palabrasBase = G.base ? String(G.base).replace(/\.\w+$/, ".palabras.json") : null;
if (G.base) {
  exigir(fs.existsSync(G.base), `base: no existe ${G.base}`);
  exigir(fs.existsSync(palabrasBase), `base: falta ${palabrasBase} (lo escribe vtool reel/jornada; armá la base con --sin-subtitulos)`);
}
for (const [i, t] of (G.tramos ?? []).entries()) {
  exigir(fs.existsSync(t.voz ?? ""), `tramos[${i}].voz: no existe ${t.voz}`);
  exigir(Array.isArray(t.planos) && t.planos.length > 0, `tramos[${i}]: cada voz muestra lo que dice, con al menos un plano`);
  for (const p of t.planos ?? []) exigir(fs.existsSync(p.fuente ?? ""), `tramos[${i}]: no existe ${p.fuente}`);
}
// Un medio es una ruta o { fuente, desde } (el segundo del que arranca un video).
const rutaDe = (m) => (typeof m === "string" ? m : m?.fuente);
const faltaMedio = (m, q) => exigir(!!rutaDe(m) && fs.existsSync(rutaDe(m)), `${q}: no existe ${rutaDe(m) ?? "(falta)"}`);
for (const [i, K] of TARJETAS.entries()) {
  exigir(typeof K.dice === "string" && K.dice.trim(), `tarjetas[${i}].dice: la frase que la dispara`);
  exigir(typeof K.titulo === "string" && K.titulo.trim(), `tarjetas[${i}].titulo: falta`);
  if (K.imagen) { faltaMedio(K.imagen, `tarjetas[${i}].imagen`); adentro(K.imagen, `tarjetas[${i}].imagen`); }
}
for (const [i, I] of INSERTOS.entries()) {
  exigir(typeof I.dice === "string" && I.dice.trim(), `insertos[${i}].dice: la frase que lo dispara`);
  if (TIPOS_INSERTO.includes(I.tipo)) {
    for (const e of validarInserto(I, `insertos[${i}]`)) errores.push(e);
    if (I.imagen) {
      adentro(I.imagen, `insertos[${i}].imagen`);
      const mal = fs.existsSync(I.imagen) ? medirCaptura(I, `insertos[${i}]`) : null;
      if (mal) errores.push(mal);
    }
  } else if (I.tipo === "media") faltaMedio(I.archivo, `insertos[${i}].archivo`);
  else if (I.tipo === "antes-despues") { faltaMedio(I.antes, `insertos[${i}].antes`); faltaMedio(I.despues, `insertos[${i}].despues`); }
  else if (I.tipo === "grilla") {
    exigir(Array.isArray(I.medios) && I.medios.length >= 3 && I.medios.length <= 9 && I.medios.length % 3 === 0, `insertos[${i}].medios: 3, 6 o 9`);
    for (const m of I.medios ?? []) faltaMedio(m, `insertos[${i}].medios`);
  } else errores.push(`insertos[${i}].tipo: ${[...TIPOS_INSERTO, "antes-despues", "grilla", "media"].join(", ")}`);
}
const textoTodo = JSON.stringify([TARJETAS, INSERTOS.map((I) => [textoDeInserto(I), I.barras, I.pie]), C?.titulo]);
if (/\$|%|USD|ARS|\bcuotas?\b|\bdescuento|\boff\b|\bgratis\b/i.test(textoTodo) || TARJETAS.some((K) => K.valor || K.tachado) || INSERTOS.some((I) => I.tipo === "numero")) {
  avisos.push("hay precios o números en pantalla: tienen que estar en la guía o en el pedido (si no, se pregunta)");
}
exigir(fs.existsSync("assets/base/origen.mp4") || G.movimiento, `movimiento: elegí uno (${Object.keys(MOVIMIENTOS).join(", ")})`);
if (G.movimiento) {
  exigir(MOVIMIENTOS[G.movimiento], `movimiento: «${G.movimiento}» no existe (${Object.keys(MOVIMIENTOS).join(", ")})`);
  exigir(typeof G.ganchoTipo === "string" && G.ganchoTipo, "ganchoTipo: hora, pregunta, dato, mito, confesion, lista, contraste o historia");
  exigir(typeof G.pilar === "string" && G.pilar, "pilar: el ángulo de la pieza (vitrina, educativo, detras-de-escena, dolor…)");
}
frenar("guion.json no cumple");
await fichaYVariedad(G, archivoGuion, INSERTOS.map((I) => I.tipo), flags);

// ── 2. La base: reel filmado, o voces en off + tomas ────────────────────────
fs.mkdirSync("assets/base", { recursive: true });
const BASE = "assets/base/base.mp4";
const BASE_PAL = "assets/base/base.palabras.json";
let datos;
if (G.base) {
  const st = fs.statSync(G.base);
  const h = huella([st.size, st.mtimeMs]);
  if (!vigente("assets/base/origen.mp4", h)) {
    fs.copyFileSync(G.base, "assets/base/origen.mp4");
    sellar("assets/base/origen.mp4", h);
  }
  // Una vez copiada, la base no depende del crudo: un pedido de cambios no necesita volver a bajarlo.
  fs.copyFileSync(palabrasBase, BASE_PAL);
  datos = JSON.parse(fs.readFileSync(BASE_PAL, "utf8"));
} else {
  const h = huella(G.tramos);
  if (!vigente("assets/base/origen.mp4", h)) {
    fs.mkdirSync("assets/planos", { recursive: true });
    const palabras = [], cortes = [], clips = [], voces = [];
    let t = 0;
    for (const [i, tr] of G.tramos.entries()) {
      const dur = duracion(tr.voz);
      const durPlano = dur / tr.planos.length;
      exigir(durPlano >= 0.9, `tramos[${i}]: ${r2(dur)} s con ${tr.planos.length} planos (entran ${Math.max(1, Math.floor(dur / 0.9))})`);
      for (const [k, p] of tr.planos.entries()) {
        const salida = `assets/planos/t${i}-${k}.mp4`;
        const foto = esFoto(p.fuente);
        const args = [path.join(P, "plano.mjs"), "corte", p.fuente, salida, "--foco", String(p.foco ?? 0.5)];
        if (!foto) args.push("--desde", String(p.desde ?? 0), "--dur", String(durPlano + 0.1), "--lento", String(p.lento ?? 1));
        const r = spawnSync("node", args, { encoding: "utf8" });
        if (r.status !== 0) { errores.push(`${p.fuente}: ${(r.stderr || r.stdout).slice(-200)}`); continue; }
        if (/OJO/.test(r.stdout)) avisos.push(`${path.basename(p.fuente)}: ${r.stdout.split("OJO:")[1].trim()}`);
        clips.push({ archivo: foto ? salida.replace(/\.mp4$/, ".jpg") : salida, foto, dur: durPlano });
        cortes.push(r2(t + durPlano * (k + 1)));
      }
      for (const w of transcribir(tr.voz)) palabras.push({ word: w.text, start: r2(w.start + t), end: r2(w.end + t) });
      voces.push(tr.voz);
      t += dur;
    }
    frenar("tramos");
    const entradas = clips.flatMap((c) => (c.foto ? ["-loop", "1", "-framerate", "30", "-t", c.dur.toFixed(3), "-i", c.archivo] : ["-i", c.archivo]));
    const filtroV = clips.map((c, i) => `[${i}:v]trim=0:${c.dur.toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[v${i}];`).join("");
    const uneV = `${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v];`;
    const vocesEnt = voces.flatMap((v) => ["-i", v]);
    const filtroA = `${voces.map((_, i) => `[${clips.length + i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}];`).join("")}${voces.map((_, i) => `[a${i}]`).join("")}concat=n=${voces.length}:v=0:a=1,highpass=f=80,afftdn=nr=14:nf=-38:tn=1[a]`;
    ff(...entradas, ...vocesEnt, "-filter_complex", filtroV + uneV + filtroA, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "assets/base/origen.mp4");
    fs.writeFileSync(BASE_PAL, JSON.stringify({ words: palabras, cortes: cortes.slice(0, -1), duracion: r2(t) }));
    sellar("assets/base/origen.mp4", h);
  }
  datos = JSON.parse(fs.readFileSync(BASE_PAL, "utf8"));
}

// Cola: la última imagen se sostiene para que el cierre se lea. Música: por debajo de la voz (vtool).
const COLA = Number(C?.cola ?? (C ? 2.2 : 0));
const pista = await pistaDe(G, DIR);
if (!pista) avisos.push("sin música: el estándar lleva siempre (musica.archivo o musica.prompt)");
const volMusica = Number(G.musica?.volDb ?? -18);
const stOrigen = fs.statSync("assets/base/origen.mp4");
const hBase = huella([stOrigen.size, COLA, pista ? [path.basename(pista), fs.statSync(pista).size] : null, volMusica]);
if (!vigente(BASE, hBase)) {
  const colaMp4 = "assets/base/con-cola.mp4";
  if (COLA > 0) {
    ff("-i", "assets/base/origen.mp4", "-vf", `tpad=stop_mode=clone:stop_duration=${COLA}`, "-af", `apad=pad_dur=${COLA}`, "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", colaMp4);
  } else fs.copyFileSync("assets/base/origen.mp4", colaMp4);
  if (pista) {
    vtool("musica", colaMp4, pista, "--vol-musica", String(volMusica));
    fs.renameSync("assets/base/con-cola__musica.mp4", BASE);
    fs.rmSync(colaMp4, { force: true });
  } else fs.renameSync(colaMp4, BASE);
  ff("-i", BASE, "-vn", "-c:a", "copy", "assets/base/audio.m4a");
  vtool("zonas", BASE);
  sellar(BASE, hBase);
}
const FIN = r2(duracion(BASE));
const ZONAS_T = JSON.parse(fs.readFileSync("assets/base/base.zonas.json", "utf8"));

// ── 3. Palabras (con lo que whisper escribe mal corregido) y anclas ─────────
const correcciones = Object.fromEntries(Object.entries(G.correcciones ?? {}).map(([k, v]) => [norm(k), v]));
const PAL = (datos.words ?? []).filter((w) => String(w.word).trim()).map((w) => {
  const orig = String(w.word).trim();
  const fija = correcciones[norm(orig)];
  return { w: fija ? orig.replace(/^(.*?)([.,;:!?¿¡]*)$/, (_, __, punt) => fija + punt) : orig, ini: Number(w.start), fin: Number(w.end) };
});
exigir(PAL.length > 0, "no hay palabras: esta base no tiene voz (para material sin voz, la plantilla de voz en off)");
frenar("palabras");
const CLAVES = new Set((G.claves ?? []).map(norm));

/** Segundo en que se empieza a decir la frase, o null. */
function anclaDe(frase) {
  const buscada = String(frase).split(/\s+/).map(norm).filter(Boolean);
  const dichas = PAL.map((p) => norm(p.w));
  for (let i = 0; i + buscada.length <= dichas.length; i++) {
    if (buscada.every((b, k) => dichas[i + k] === b)) return PAL[i].ini;
  }
  return null;
}
function ubicar(el, nombre, durPorDefecto) {
  const ini = anclaDe(el.dice);
  if (ini == null) { errores.push(`${nombre}.dice: «${el.dice}» no se dice en el video. Se dice: «${PAL.map((p) => p.w).join(" ").slice(0, 400)}»`); return null; }
  const desde = r2(Math.max(0, ini - 0.08));
  return { ...el, desde, hasta: r2(Math.min(FIN, desde + Number(el.dur ?? durPorDefecto))) };
}
const tarjetas = TARJETAS.map((K, i) => ubicar(K, `tarjetas[${i}]`, 3.2)).filter(Boolean);
const insertos = INSERTOS.map((I, i) => ubicar(I, `insertos[${i}]`, 3)).filter(Boolean);
// Sin `dice`, el cierre entra cuando termina de hablar: no le saca los títulos a las últimas palabras.
const cierre = C ? { ...C, desde: r2(C.dice ? (anclaDe(C.dice) ?? FIN - 3.2) : Math.max(0, PAL.at(-1).fin - 0.1)) } : null;
if (C?.dice && anclaDe(C.dice) == null) errores.push(`cierre.dice: «${C.dice}» no se dice en el video`);
frenar("anclas");
const seCruzan = (a, b) => a.desde < b.hasta && b.desde < a.hasta;
const tapan = insertos.filter((I) => I.tipo !== "media");
for (const [i, I] of insertos.entries()) {
  const minimo = DUR_MINIMA[I.tipo] ?? 1.5;
  exigir(I.hasta - I.desde >= minimo, `insertos[${i}]: dura ${r2(I.hasta - I.desde)} s (${minimo} s como mínimo para que se lea)`);
  for (const [j, K] of tarjetas.entries()) exigir(!seCruzan(I, K), `insertos[${i}] y tarjetas[${j}] se pisan`);
  for (const [j, O] of insertos.entries()) exigir(j <= i || !seCruzan(I, O), `insertos[${i}] e insertos[${j}] se pisan`);
  if (cierre) exigir(I.hasta <= cierre.desde, `insertos[${i}] se pisa con el cierre`);
}
for (const [i, K] of tarjetas.entries()) {
  for (const [j, O] of tarjetas.entries()) exigir(j <= i || !seCruzan(K, O), `tarjetas[${i}] y tarjetas[${j}] se pisan`);
  if (cierre && K.hasta > cierre.desde) K.hasta = cierre.desde;
}
frenar("línea de tiempo");

// ── 4. Medios de los insertos: cortados y livianos ──────────────────────────
fs.mkdirSync("assets/insertos", { recursive: true });
const cortar = (m, dur, nombre) => {
  const fuente = rutaDe(m);
  const desde = Number(m?.desde ?? 0);
  const foto = esFoto(fuente);
  const salida = `assets/insertos/${nombre}.${foto ? "jpg" : "mp4"}`;
  const h = huella([fuente, fs.statSync(fuente).size, foto ? 0 : r2(dur), desde, m?.foco ?? 0.5]);
  if (!vigente(salida, h)) {
    const args = [path.join(P, "plano.mjs"), "corte", fuente, salida, "--foco", String(m?.foco ?? 0.5)];
    if (!foto) args.push("--desde", String(desde), "--dur", String(r2(dur + 0.2)));
    const r = spawnSync("node", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${fuente}: ${(r.stderr || r.stdout).slice(-200)}`);
    sellar(salida, h);
  }
  return salida;
};
const insertosListos = insertos.map((I, i) => {
  const d = I.hasta - I.desde;
  if (I.tipo === "media") return { ...I, archivo: cortar(I.archivo, d, `i${i}`) };
  if (I.tipo === "antes-despues") return { ...I, antes: cortar(I.antes, d, `i${i}-a`), despues: cortar(I.despues, d, `i${i}-d`) };
  if (I.tipo === "grilla") return { ...I, medios: I.medios.map((m, k) => cortar(m, d, `i${i}-g${k}`)) };
  const textos = TIPOS_INSERTO.includes(I.tipo) ? textosDeInserto(I) : [];
  if (textos.length) {
    const voz = PAL.filter((p) => p.ini >= I.desde - 0.05 && p.ini < I.hasta).map((p) => ({ t: p.w, ini: p.ini }));
    return { ...I, momentos: momentosDe(textos, voz, I.desde + 0.1, d - 0.2) };
  }
  return I;
});

// ── 5. Títulos: de a pocas palabras, con la voz, donde no tapan a nadie ─────
const NO_CLAVE = new Set("de del la las el los un una unos unas y o a en con por para que se su sus tu tus mi mis es son al lo le les nos como pero mas muy ya este esta esto estos estas ese esa eso aca alla hay".split(" "));
const fuera = (p) => tapan.some((I) => p.ini >= I.desde && p.ini < I.hasta) || (cierre && p.ini >= cierre.desde);
const trozos = [];
let cur = [];
for (const [i, p] of PAL.entries()) {
  if (fuera(p)) { if (cur.length) { trozos.push(cur); cur = []; } continue; }
  cur.push(p);
  const sig = PAL[i + 1];
  const largo = cur.map((x) => x.w).join(" ").length;
  if (!sig || (/[.,;:!?]$/.test(p.w) && cur.length >= 2) || sig.ini - p.fin > 0.45 || cur.length >= 5 || largo >= 24) { trozos.push(cur); cur = []; }
}
if (cur.length) trozos.push(cur);
// Una palabra sola queda con la de al lado si están pegadas.
const grupos = [];
for (const t of trozos) {
  const prev = grupos.at(-1);
  if (t.length === 1 && prev && t[0].ini - prev.at(-1).fin < 0.45 && prev.length < 5) prev.push(t[0]);
  else grupos.push(t);
}
const muestra = (desde, hasta) => {
  const filas = ZONAS_T.filter((z) => z.t >= Math.floor(desde) && z.t <= Math.ceil(hasta));
  return filas.length ? filas : ZONAS_T.slice(-1);
};
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const acentoCrudo = M.acento ?? M.color;
// El color de la marca sirve de acento si no es casi negro ni casi blanco.
const hayAcento = luz(acentoCrudo) > 0.04 && luz(acentoCrudo) < 0.8;
const fondoInserto = hexOk(M.oscuro) && luz(M.oscuro) < 0.08 ? M.oscuro : (luz(M.color) < 0.08 ? M.color : "#0d1220");
const titulos = grupos.map((g) => {
  const desde = r2(Math.max(0, g[0].ini - 0.1));
  const sig = grupos[grupos.indexOf(g) + 1];
  const tope = Math.min(sig ? sig[0].ini - 0.04 : FIN, cierre?.desde ?? FIN, ...tapan.filter((I) => I.desde >= g[0].ini).map((I) => I.desde));
  const hasta = r2(Math.min(tope, g.at(-1).fin + 0.45));
  const filas = muestra(desde, hasta);
  const caraArriba = filas.filter((z) => z.arriba.cara).length;
  const caraAbajo = filas.filter((z) => z.abajo.cara).length;
  const zona = caraArriba > caraAbajo ? "abajo" : "arriba";
  if (caraArriba && caraAbajo) avisos.push(`título «${g.map((p) => p.w).join(" ")}» (${desde} s): hay una cara en las dos zonas; mirá que no la tape`);
  const sobreMedia = insertos.some((I) => I.tipo === "media" && seCruzan(I, { desde, hasta }));
  const L = promedio(filas.map((z) => z[zona].luz));
  const D = promedio(filas.map((z) => z[zona].dispersion));
  // Pared clara → tinta oscura; oscura → blanca; toma cargada o una foto encima → blanca con velo.
  const claro = !sobreMedia && L > 0.62 && D < 0.2;
  const oscuro = !sobreMedia && L < 0.36 && D < 0.22;
  const velo = !claro && !oscuro;
  const tinta = claro ? "#111111" : "#ffffff";
  const fondoLum = claro ? L ** 2.2 : velo ? 0.04 : L ** 2.2;
  const colorClave = hayAcento && contraste(luz(acentoCrudo), fondoLum) >= 3 ? acentoCrudo : null;
  // Jerarquía: lo de antes de la clave chico, la clave GRANDE, lo de después mediano.
  const normales = g.map((p) => norm(p.w));
  let k = normales.findIndex((n) => CLAVES.has(n));
  if (k < 0) k = normales.reduce((mejor, n, i) => (!NO_CLAVE.has(n) && n.length >= 4 && n.length >= (mejor < 0 ? 0 : normales[mejor].length) ? i : mejor), -1);
  if (k < 0) k = normales.length - 1;
  const sinPunt = (w) => w.replace(/[.,;:]+$/, "");
  const lineas = [];
  const pal = (p) => [sinPunt(p.w), r2(p.ini)];
  if (k > 0) lineas.push({ clase: "chica", palabras: g.slice(0, k).map(pal) });
  const largoClave = sinPunt(g[k].w).length;
  lineas.push({ clase: "grande", palabras: [pal(g[k])], tam: Math.min(128, Math.floor(860 / (largoClave * 0.74))) });
  if (k < g.length - 1) lineas.push({ clase: "media", palabras: g.slice(k + 1).map(pal) });
  const conTarjeta = tarjetas.find((K) => seCruzan(K, { desde, hasta }));
  return { desde, hasta, zona, tinta, velo, colorClave, lineas, ...(zona === "abajo" && conTarjeta ? { bottom: 780 } : {}) };
}).filter((T) => T.hasta - T.desde >= 0.25);

// ── 6. Spec, plantilla y chequeo ────────────────────────────────────────────
const tintaCta = hayAcento && luz(acentoCrudo) < 0.5 ? "#ffffff" : "#111111";
const spec = {
  titulo: G.titulo ?? PAL.slice(0, 6).map((p) => p.w).join(" "), duracion: FIN, video: BASE, audio: "assets/base/audio.m4a",
  cortes: (datos.cortes ?? []).filter((c) => c > 0.5 && c < FIN), marca: M,
  acento: hayAcento ? acentoCrudo : (M.claro && hexOk(M.claro) ? M.claro : "#ffffff"), acentoLegible: hayAcento, tintaCta, fondo: fondoInserto,
  titulos, tarjetas, insertos: insertosListos, cierre, panel: MOVIMIENTOS[G.movimiento]?.panel,
};
fs.writeFileSync("filmado.json", JSON.stringify(spec, null, 1));
const pl = spawnSync("node", [path.join(P, "plantilla-filmado.mjs"), "filmado.json"], { encoding: "utf8" });
if (pl.status !== 0) { console.error(pl.stderr || pl.stdout); process.exit(1); }
chequear();

// ── 7. Lo que se dice → lo que aparece (para leer de un vistazo) ────────────
console.log(`\nREEL FILMADO ${FIN} s · ${titulos.length} títulos · ${tarjetas.length} tarjetas · ${insertos.length} insertos · ${pista ? "con música" : "SIN música"} · check sin errores`);
for (const T of titulos) console.log(`${T.desde.toFixed(2)}-${T.hasta.toFixed(2)} ${T.zona} ${T.tinta === "#111111" ? "tinta oscura" : "blanco"}${T.velo ? "+velo" : ""}: ${T.lineas.map((l) => l.palabras.map((p) => p[0]).join(" ")).join(" / ")}`);
for (const K of tarjetas) console.log(`${K.desde.toFixed(2)}-${K.hasta.toFixed(2)} TARJETA «${K.dice}» → ${K.titulo} ${K.valor ?? ""}`);
for (const I of insertos) console.log(`${I.desde.toFixed(2)}-${I.hasta.toFixed(2)} INSERTO ${I.tipo} «${I.dice}»`);
if (cierre) console.log(`${cierre.desde.toFixed(2)}-${FIN} cierre · ${cierre.titulo} · ${cierre.cta ?? ""} ${cierre.url ?? ""}`);
for (const a of [...new Set(avisos)]) console.log(`AVISO ${a}`);
if (!flags.has("--render")) {
  console.log(`\nSiguiente: node ${path.join(P, "armar.mjs")} ${path.basename(archivoGuion)} --render`);
  process.exit(0);
}

// ── 8. Render + control técnico + revisión ──────────────────────────────────
// Un cuadro por elemento, con el texto entero en pantalla; 12 como mucho (lo que acepta la revisión).
const momentos = [
  ...titulos.map((T) => ({ segundo: r2(Math.min(T.hasta - 0.2, Math.max(...T.lineas.flatMap((l) => l.palabras.map((p) => p[1]))) + 0.4)), dice: T.lineas.map((l) => l.palabras.map((p) => p[0]).join(" ")).join(" ") })),
  ...tarjetas.map((K) => ({ segundo: r2((K.desde + K.hasta) / 2), dice: K.dice })),
  ...insertos.map((I) => ({ segundo: r2(I.desde + (I.hasta - I.desde) * 0.8), dice: I.dice })),
].sort((a, b) => a.segundo - b.segundo);
const paso = Math.max(1, momentos.length / 12);
const elegidos = Array.from({ length: Math.min(12, momentos.length) }, (_, i) => momentos[Math.floor(i * paso)]);
await renderizarYRevisar({
  dir: DIR,
  brief: G.brief ?? `Reel filmado de ${G.cliente ?? "un cliente"}: una persona o tomas a pantalla completa con títulos sincronizados, tarjetas e insertos.`,
  fotos: [...elegidos.map((m) => m.segundo), ...(cierre ? [r2(FIN - 0.3)] : [])],
  momentos: elegidos,
  formato: "filmado",
  sinRevision: flags.has("--sin-revision"),
});
