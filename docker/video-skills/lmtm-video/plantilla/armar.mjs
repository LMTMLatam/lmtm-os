// Arma el reel ENTERO desde guion.json en un solo comando: planos, voces,
// tiempos de cada palabra, subtítulos, reel.json, plantilla y chequeo. Con
// --render, además: render, control técnico (vtool) y revisión frase por frase
// (¿lo que se ve muestra lo que se dice?).
//
//   node armar.mjs guion.json [--render] [--sin-revision]
//
// Por qué existe (30/10): armar un reel a mano le llevaba al agente ~80 turnos
// y cada turno reenvía todo el contexto (3,8 M de tokens el de RENO). Acá las
// decisiones (qué se dice y qué se ve) quedan en guion.json y lo mecánico lo
// hace este script. Lo que no cambió no se rehace: cada voz y cada plano guarda
// la huella de lo que lo generó, así un cambio en el guion no gasta voces de más.
//
// guion.json (ver guion.ejemplo.json):
//   estilo, voz        cómo suena la voz (el mismo en todas las frases)
//   lineas[]           { texto: "Diseñamos *placares* a medida.", planos: [{ fuente, desde, foco, lento, realce, muestra, drive }] }
//                      *palabra* = resaltada. Cada línea, sus planos (en orden).
//   gancho             texto corto arriba en los primeros 2 s (opcional, *palabra* resaltada)
//   cierre             { texto (lo que dice la voz), titulo, etiqueta, cta, url, corte, cola, plano }
//                      (va SOBRE la última toma o sobre cierre.plano: sin placa)
//   marca, musica      { archivo, volumen } o { prompt } para generarla con Magnific
//   movimiento         directo|pulso|relato|vitrina|ficha: ritmo, gancho, transiciones, subtítulos y cierre (obligatorio en un reel nuevo)
//   ganchoTipo, pilar  para la ficha de la pieza: de eso sale el control de variedad y la medición
//   ganchos[5]         se puntúan con hookscore: el mejor pasa a ser la primera frase y los 2 mejores van al entregable
//                      (ganchoElegido: "por qué" deja la primera frase como está)
//   youtube            { titulo, descripcion, consultas } solo si el cliente publica en YouTube
//   un plano puede ser { inserto: { tipo: numero|lista|pasos|chat|pantalla, … } } en vez de una toma (guion-motion.ejemplo.json)
//
// Con "tipo": "filmado" en el guion, el reel sale de filmado.mjs (material con voz
// propia, títulos y tarjetas): mismo comando, así retomar y pedir cambios son iguales.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chequear, duracion, esFoto, fichaYVariedad, herramienta, huella, norm, pistaDe, puntuarGanchos, r2, renderizarYRevisar, sellar, textoParaVoz, transcribir, vigente } from "./comun.mjs";
import { DUR_MINIMA, MOVIMIENTOS, SOLAPE, alinear, momentosDe, textoDeInserto, textosDeInserto, validarInserto } from "./motion.mjs";

const P = path.dirname(fileURLToPath(import.meta.url));
const archivoGuion = path.resolve(process.argv[2] ?? "guion.json");
const flags = new Set(process.argv.slice(3));
const DIR = path.dirname(archivoGuion);
process.chdir(DIR);
const G = JSON.parse(fs.readFileSync(archivoGuion, "utf8"));
if (G.tipo === "filmado") {
  const r = spawnSync("node", [path.join(P, "filmado.mjs"), archivoGuion, ...flags], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const errores = [];
const avisos = [];
const exigir = (cond, msg) => { if (!cond) errores.push(msg); };
const frenar = (titulo) => {
  if (!errores.length) return;
  console.error(`${titulo}:\n- ${[...new Set(errores)].join("\n- ")}`);
  process.exit(1);
};
/** «Diseñamos *placares* a medida.» → [{ t: "Diseñamos" }, { t: "placares", clave: true }, …] */
const palabrasDe = (texto) => String(texto).split(/\s+/).filter(Boolean).map((w) => ({ t: w.replace(/\*/g, ""), clave: w.includes("*") }));
const limpio = (texto) => palabrasDe(texto).map((w) => w.t).join(" ");

// ── 1. El guion cumple antes de gastar nada ─────────────────────────────────
const LINEAS = Array.isArray(G.lineas) ? G.lineas : [];
const C = G.cierre ?? {};
const M = G.marca ?? {};
exigir(LINEAS.length >= 2, "lineas: al menos 2 frases antes del cierre");
exigir(typeof G.estilo === "string" && G.estilo.length >= 20, "estilo: cómo suena la voz (el mismo en todas las frases)");
exigir(typeof C.texto === "string" && C.texto.trim(), "cierre.texto: lo que dice la voz en el cierre");
exigir(typeof C.titulo === "string" && C.titulo.trim(), "cierre.titulo: el titular del cierre");
exigir(/^#[0-9a-f]{6}$/i.test(M.color ?? ""), "marca.color: #rrggbb de la paleta del cliente (de su guía)");
exigir(!!M.logo && fs.existsSync(M.logo), `marca.logo: no existe ${M.logo ?? "(falta)"}`);
if (M.fuenteArchivo) {
  exigir(fs.existsSync(M.fuenteArchivo) && !path.relative(DIR, path.resolve(M.fuenteArchivo)).startsWith(".."), `marca.fuenteArchivo: ${M.fuenteArchivo} tiene que estar dentro del proyecto (assets/marca/)`);
  exigir(!!M.fuente, "marca.fuente: el nombre de la tipografía que trae fuenteArchivo");
}
// Un reel que ya tiene voces hechas es de antes: sigue con su diseño, así pedir cambios no le cambia la cara.
const esNuevo = !fs.existsSync("assets/voice/l1.wav");
const MOV = G.movimiento ? MOVIMIENTOS[G.movimiento] : null;
exigir(!esNuevo || G.movimiento, `movimiento: elegí uno (${Object.keys(MOVIMIENTOS).join(", ")})`);
if (G.movimiento) {
  exigir(MOV, `movimiento: «${G.movimiento}» no existe (${Object.keys(MOVIMIENTOS).join(", ")})`);
  exigir(typeof G.ganchoTipo === "string" && G.ganchoTipo, "ganchoTipo: hora, pregunta, dato, mito, confesion, lista, contraste o historia");
  exigir(typeof G.pilar === "string" && G.pilar, "pilar: el ángulo de la pieza (vitrina, educativo, detras-de-escena, dolor…)");
}
const PLANOS = LINEAS.flatMap((l, i) => (Array.isArray(l.planos) ? l.planos : []).map((p) => ({ ...p, linea: i })));
for (const [i, l] of LINEAS.entries()) {
  exigir(typeof l.texto === "string" && l.texto.trim(), `lineas[${i}].texto: falta`);
  exigir(Array.isArray(l.planos) && l.planos.length > 0, `lineas[${i}]: cada frase muestra lo que dice, con al menos un plano`);
}
exigir(PLANOS.length >= 6, `planos: ${PLANOS.length}; el estándar es 8 a 14 distintos (6 como mínimo)`);
// Insertos: para lo que falta material o un dato que se cuenta mejor animado. El reel sigue siendo del material del cliente.
const INSERTOS = PLANOS.filter((p) => p.inserto);
const TOMAS = PLANOS.filter((p) => !p.inserto);
exigir(INSERTOS.length <= 3, `insertos: ${INSERTOS.length}; 3 como mucho`);
for (const [n, p] of INSERTOS.entries()) {
  for (const e of validarInserto(p.inserto, `lineas[${p.linea}] inserto ${n + 1}`, LINEAS[p.linea].texto)) errores.push(e);
  if (p.inserto.imagen) exigir(fs.existsSync(p.inserto.imagen) && !path.relative(DIR, path.resolve(p.inserto.imagen)).startsWith(".."), `inserto pantalla: ${p.inserto.imagen} no existe o está fuera del proyecto`);
}
// Sin repetir tomas: el reel v3 de RENO usó 4 videos en 8 cortes y "repitió muchas veces la misma toma".
const usos = new Map();
for (const p of TOMAS) usos.set(p.fuente, [...(usos.get(p.fuente) ?? []), p]);
for (const [f, ps] of usos) {
  const momentos = ps.map((p) => Number(p.desde) || 0).sort((a, b) => a - b);
  const separados = momentos.every((m, i) => i === 0 || m - momentos[i - 1] >= 3);
  exigir(ps.length === 1 || (!esFoto(f) && ps.length === 2 && separados), `${path.basename(String(f))}: usada ${ps.length} veces (una vez; un video, dos como mucho y en momentos distintos)`);
}
exigir(usos.size >= Math.ceil(TOMAS.length * 0.75), `solo ${usos.size} fuentes distintas para ${TOMAS.length} planos`);
// Fuentes que faltan: si el guion trae su id de Drive, se bajan solas (la del índice de drive_bajar también).
const indiceDrive = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, ".drive.json"), "utf8")); } catch { return {}; } };
for (const p of TOMAS) {
  p.drive ??= indiceDrive(path.dirname(String(p.fuente)))[path.basename(String(p.fuente))];
  if (!fs.existsSync(String(p.fuente)) && !p.drive) errores.push(`${p.fuente}: no existe y no tiene id de Drive para bajarla`);
}
const textoTodo = [...LINEAS.map((l) => l.texto), C.texto, C.titulo, C.etiqueta ?? "", ...INSERTOS.map((p) => textoDeInserto(p.inserto))].join(" ");
if (/\$|%|\bcuotas?\b|\bdescuento|\boff\b|\bgratis\b/i.test(textoTodo)) {
  avisos.push("el guion nombra un precio, promo o descuento: tiene que estar en la guía o en el pedido (si no, se pregunta)");
}
if (G.movimiento && esNuevo) exigir(Array.isArray(G.ganchos) && G.ganchos.length === 5, "ganchos: 5 opciones para la primera frase, con la voz del cliente");
if (G.youtube) exigir(String(G.youtube.titulo ?? "").length > 0 && String(G.youtube.titulo).length <= 60 && String(G.youtube.descripcion ?? "").length > 0, "youtube: titulo (hasta 60 letras) y descripcion");
frenar("guion.json no cumple");
if (G.ganchos?.length) {
  const puntuados = puntuarGanchos(G.ganchos);
  G.ganchosMejores = puntuados.slice(0, 2);
  // Antes de la primera voz: una vez hecha, cambiar el gancho la gastaría de nuevo.
  if (esNuevo && !G.ganchoElegido && limpio(LINEAS[0].texto) !== limpio(puntuados[0].texto)) {
    G.lineas[0].texto = puntuados[0].texto;
    LINEAS[0].texto = puntuados[0].texto;
  }
  fs.writeFileSync(archivoGuion, JSON.stringify(G, null, 1));
  console.log(`GANCHOS ${G.ganchosMejores.map((x) => `${x.puntaje} «${limpio(x.texto)}»`).join(" · ")}`);
}
await fichaYVariedad(G, archivoGuion, INSERTOS.map((p) => p.inserto.tipo), flags);

for (const p of TOMAS.filter((p) => !fs.existsSync(String(p.fuente)))) {
  const r = await herramienta("drive_bajar", { link: p.drive, carpeta: path.resolve(path.dirname(String(p.fuente))) });
  if (!r.ok || !fs.existsSync(String(p.fuente))) errores.push(`${p.fuente}: no se pudo bajar de Drive (${String(r.content).slice(0, 160)})`);
}
frenar("material");
// Que el id de Drive quede en el guion: si mañana piden un cambio, la fuente se vuelve a bajar sola.
for (const [i, l] of LINEAS.entries()) {
  for (const [j, p] of (l.planos ?? []).entries()) {
    const d = PLANOS.find((x) => x.linea === i && x.fuente === p.fuente && x.desde === p.desde)?.drive;
    if (d && !p.drive) G.lineas[i].planos[j].drive = d;
  }
}
fs.writeFileSync(archivoGuion, JSON.stringify(G, null, 1));

// ── 2. Voces (una por frase + la del cierre), solo las que cambiaron ────────
fs.mkdirSync("assets/voice", { recursive: true });
const TEXTOS = [...LINEAS.map((l) => l.texto), C.texto];
const ARCH_VOZ = TEXTOS.map((_, i) => path.resolve(`assets/voice/l${i + 1}.wav`));
// Se pide solo la voz de la frase cuyo texto o estilo cambió. Los cuatro modelos
// de Gemini suenan igual (comparados por el usuario el 30/10): si uno se queda sin
// cupo a mitad del reel, las frases ya hechas NO se rehacen. Rehacerlas quemó el
// cupo del día en LMTM-6518 (31/10). video_voz además guarda cada voz en /data.
// Un reel no cambia de voz a mitad: el que ya tiene voces hechas sigue con Gemini; los nuevos, ElevenLabs.
if (!G.proveedorVoz) {
  G.proveedorVoz = ARCH_VOZ.some((a) => fs.existsSync(a)) ? "gemini" : "elevenlabs";
  fs.writeFileSync(archivoGuion, JSON.stringify(G, null, 1));
}
const textoVoz = (i) => textoParaVoz(limpio(TEXTOS[i]), G.pronunciacion);
const huellaVoz = (i) => huella(G.proveedorVoz === "gemini" ? [limpio(TEXTOS[i]), G.estilo, G.voz ?? "Sulafat"] : [textoVoz(i), G.voz ?? "", G.proveedorVoz]);
const huellaDe = (a) => (fs.existsSync(a) && fs.existsSync(`${a}.huella`) ? fs.readFileSync(`${a}.huella`, "utf8").split("|")[0] : "");
for (const [i, archivo] of ARCH_VOZ.entries()) {
  if (huellaDe(archivo) === huellaVoz(i)) continue;
  const r = await herramienta("video_voz", { texto: textoVoz(i), archivo, estilo: G.estilo, proveedor: G.proveedorVoz, ...(G.voz ? { voz: G.voz } : {}), ...(G.clientId ? { clientId: G.clientId } : {}), ...(G.pieza ? { pieza: G.pieza } : {}) });
  if (!r.ok) {
    console.error(`voz l${i + 1}: ${r.content}`);
    process.exit(/cupo/i.test(r.content) ? 3 : 1);
  }
  const modelo = /Gemini ([\w.-]+)/.exec(r.content)?.[1] ?? G.proveedorVoz;
  fs.writeFileSync(`${archivo}.huella`, `${huellaVoz(i)}|${modelo}`);
  console.log(`voz l${i + 1} (${modelo}${/caché/.test(r.content) ? ", de la caché" : ""}): ${limpio(TEXTOS[i])}`);
}

// ── 3. Tiempos de cada palabra ──────────────────────────────────────────────
const DUR_VOZ = ARCH_VOZ.map(duracion);
const PAL = TEXTOS.map((txt, i) => alinear(palabrasDe(txt), transcribir(ARCH_VOZ[i])));

// ── 4. Línea de tiempo: voces encadenadas, planos repartidos en cada frase ──
const AIRE = Number(G.aire ?? 0.25);
const INI = [];
let t = 0.15;
for (let i = 0; i < TEXTOS.length; i++) {
  INI[i] = r2(t);
  t += DUR_VOZ[i] + Number(LINEAS[i]?.pausa ?? AIRE);
}
const ultimo = TEXTOS.length - 1;
const CIERRE = r2(INI[ultimo] - 0.15);
const FIN = r2(INI[ultimo] + DUR_VOZ[ultimo] + Number(C.cola ?? 2.4));
exigir(FIN >= 8 && FIN <= 60, `dura ${FIN} s: entre 8 y 60 (el estándar es 20 a 35)`);
if (FIN > 36) avisos.push(`dura ${FIN} s: el estándar es 20 a 35 (acortá frases)`);
const abs = (i) => PAL[i].map((w) => ({ ...w, ini: r2(w.ini + INI[i]) }));

const planos = [];
for (const [i, l] of LINEAS.entries()) {
  const segIni = i === 0 ? 0 : INI[i];
  const segFin = i === LINEAS.length - 1 ? CIERRE : INI[i + 1];
  const n = l.planos.length;
  const inicios = abs(i).map((w) => w.ini);
  const cortes = [segIni];
  for (let k = 1; k < n; k++) {
    const ideal = segIni + ((segFin - segIni) * k) / n;
    // El cambio de plano cae en una palabra (se ve buscado), si hay una cerca y
    // los dos planos siguen durando 1 s o más.
    const cerca = inicios
      .filter((x) => Math.abs(x - ideal) <= 0.35 && x - cortes[k - 1] >= 1 && segFin - x >= (n - k) * 1)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    cortes.push(r2(cerca ?? ideal));
  }
  cortes.push(segFin);
  for (let k = 0; k < n; k++) {
    const dur = r2(cortes[k + 1] - cortes[k]);
    exigir(dur >= 0.9, `frase ${i + 1} («${limpio(l.texto).slice(0, 40)}»): dura ${r2(segFin - segIni)} s y tiene ${n} planos; entran ${Math.max(1, Math.floor((segFin - segIni) / 0.9))} (o sumale "pausa" a la frase)`);
    const ins = l.planos[k].inserto;
    if (ins) exigir(dur >= (DUR_MINIMA[ins.tipo] ?? 0), `frase ${i + 1}: el inserto ${ins.tipo} tiene ${dur} s y necesita ${DUR_MINIMA[ins.tipo]} (dejalo solo en una frase más larga o sumale "pausa")`);
    planos.push({ ...l.planos[k], linea: i, en: r2(cortes[k]), dur });
  }
}
// El cierre va SOBRE video (los reels virales no terminan en una placa): su propia
// toma (cierre.plano) o la última del reel, estirada hasta el final.
if (C.plano) planos.push({ ...C.plano, linea: LINEAS.length - 1, en: CIERRE, dur: r2(FIN - CIERRE) });
else planos.at(-1).dur = r2(FIN - planos.at(-1).en);
frenar("tiempos");

// ── 5. Planos 9:16 (solo los que cambiaron) ─────────────────────────────────
fs.mkdirSync("assets/planos", { recursive: true });
const reelPlanos = [];
for (const [k, p] of planos.entries()) {
  if (p.inserto) {
    // Cada ítem entra cuando la voz lo nombra.
    const delTramo = abs(p.linea).filter((w) => w.ini >= p.en - 0.05 && w.ini < p.en + p.dur);
    const textos = textosDeInserto(p.inserto);
    reelPlanos.push({ inserto: { ...p.inserto, ...(textos.length ? { momentos: momentosDe(textos, delTramo, p.en + 0.1, p.dur - 0.2) } : {}) }, desde: p.en, dur: p.dur });
    continue;
  }
  const base = `assets/planos/p${String(k + 1).padStart(2, "0")}`;
  const foto = esFoto(String(p.fuente));
  const salida = `${base}.${foto ? "jpg" : "mp4"}`;
  // Con transición, la toma sigue andando debajo de la que entra.
  const extra = MOV?.transiciones?.length ? SOLAPE : 0;
  const params = { fuente: p.fuente, tam: fs.statSync(String(p.fuente)).size, desde: Number(p.desde ?? 0), foco: p.foco ?? 0.5, lento: p.lento ?? 1, realce: !!p.realce, dur: foto ? 0 : r2(p.dur + 0.15 + extra) };
  if (!vigente(salida, huella(params))) {
    for (const viejo of [`${base}.jpg`, `${base}.mp4`]) fs.rmSync(viejo, { force: true });
    const args = [path.join(P, "plano.mjs"), "corte", String(p.fuente), salida, "--foco", String(params.foco)];
    if (!foto) args.push("--desde", String(params.desde), "--dur", String(params.dur), "--lento", String(params.lento));
    if (params.realce) args.push("--realce");
    const r = spawnSync("node", args, { encoding: "utf8" });
    if (r.status !== 0) { errores.push(`${salida} desde ${p.fuente}: ${(r.stderr || r.stdout).slice(-200)}`); continue; }
    if (/OJO/.test(r.stdout)) avisos.push(`${path.basename(String(p.fuente))}: ${r.stdout.split("OJO:")[1].trim()}`);
    sellar(salida, huella(params));
  }
  if (!foto) {
    const real = duracion(salida);
    exigir(real >= p.dur + extra - 0.05, `${path.basename(String(p.fuente))} desde ${params.desde} s: la toma dura ${r2(real)} s y hacen falta ${r2(p.dur + extra)} (elegí otro momento)`);
  }
  reelPlanos.push({ archivo: salida, desde: p.en, dur: p.dur });
}
frenar("planos");

// ── 6. Música ───────────────────────────────────────────────────────────────
let musica = null;
const pista = await pistaDe(G, DIR);
if (pista) musica = { archivo: path.isAbsolute(pista) ? path.relative(DIR, pista).replace(/\\/g, "/") : pista, volumen: G.musica?.volumen ?? 0.25 };
else avisos.push("sin música: el estándar lleva siempre (musica.archivo o musica.prompt)");

// ── 7. Subtítulos: el texto del guion, de a 4 o 5 palabras, con su segundo ──
function trozos(ws) {
  const res = [];
  let cur = [];
  for (const w of ws) {
    cur.push(w);
    const largo = cur.map((x) => x.t).join(" ").length;
    // Formato viral (31/10): de 1 a 3 palabras por vez, cortando en la puntuación.
    if ((/[.,;:!?]$/.test(w.t) && cur.length >= 2) || cur.length >= 3 || largo >= 16) { res.push(cur); cur = []; }
  }
  if (cur.length) { if (cur.length === 1 && res.length) res[res.length - 1].push(...cur); else res.push(cur); }
  return res;
}
// Con gancho por palabra, la primera frase se ve GRANDE arriba mientras la voz la dice: lo que se lee es lo que se dice.
const ganchoVoz = MOV?.gancho ? { modo: MOV.gancho, hasta: r2(Math.max(INI[1] - 0.05, 1.2)), palabras: abs(0).map((w) => (w.clave ? [w.t, r2(w.ini), 1] : [w.t, r2(w.ini)])) } : null;
const frases = [];
// Para la revisión, un segundo por frase con su subtítulo ENTERO en pantalla: un
// cuadro en plena animación de entrada se veía «tenue» y frenaba la entrega (31/10).
const momentoDe = [];
for (const [i] of LINEAS.entries()) {
  const finVoz = INI[i] + DUR_VOZ[i];
  const tope = i === LINEAS.length - 1 ? CIERRE : INI[i + 1] - 0.05;
  const ts = ganchoVoz && i === 0 ? [] : trozos(abs(i));
  let mejor = { ancho: -1, s: r2(INI[i] + DUR_VOZ[i] * 0.8) };
  for (const [k, tr] of ts.entries()) {
    const desde = r2(Math.max(frases.at(-1)?.hasta ?? 0, tr[0].ini - 0.1));
    const hasta = r2(Math.min(tope, k + 1 < ts.length ? ts[k + 1][0].ini - 0.1 : finVoz + 0.15));
    frases.push({ desde, hasta, palabras: tr.map((w) => (w.clave ? [w.t, r2(w.ini), 1] : [w.t, r2(w.ini)])) });
    const [a, b] = [tr.at(-1).ini + 0.4, hasta - 0.3];
    if (b - a > mejor.ancho) mejor = { ancho: b - a, s: r2(b - a > 0 ? (a + b) / 2 : a) };
  }
  momentoDe[i] = mejor.s;
}

// ── 8. Cierre: el titular aparece cuando la voz lo dice ─────────────────────
const vozCierre = abs(ultimo);
const titulo = palabrasDe(C.titulo);
let j = vozCierre.length - 1;
const enVoz = [];
for (let k = titulo.length - 1; k >= 0; k--) {
  while (j >= 0 && norm(vozCierre[j].t) !== norm(titulo[k].t)) j--;
  enVoz[k] = j >= 0 ? vozCierre[j--].ini : null;
}
const titPal = titulo.map((w, k) => {
  const ini = enVoz.every((x) => x != null) ? enVoz[k] : r2(CIERRE + 0.6 + k * 0.3);
  return w.clave ? [w.t, ini, 1] : [w.t, ini];
});
const ultimaTit = titPal.at(-1)[1];
const reel = {
  titulo: G.titulo ?? limpio(LINEAS[0].texto),
  duracion: FIN,
  voz: ARCH_VOZ.map((a, i) => ({ archivo: path.relative(DIR, a).replace(/\\/g, "/"), desde: INI[i], dur: r2(DUR_VOZ[i]) })),
  planos: reelPlanos,
  frases,
  ...(G.gancho && !ganchoVoz ? { gancho: { texto: G.gancho, hasta: r2(Math.min(2.6, INI[1] ?? 2.6)) } } : {}),
  ...(ganchoVoz ? { ganchoVoz } : {}),
  ...(MOV ? { movimiento: MOV } : {}),
  marca: M,
  cierre: {
    desde: CIERRE, etiqueta: C.etiqueta ?? "", titulo: titPal, ...(C.corte ? { corte: C.corte } : {}),
    cta: C.cta ?? "", ctaDesde: r2(Math.min(FIN - 1.2, ultimaTit + 0.6)), url: C.url ?? "", urlDesde: r2(Math.min(FIN - 0.8, ultimaTit + 1.1)),
  },
  ...(musica ? { musica } : {}),
};
fs.writeFileSync("reel.json", JSON.stringify(reel, null, 1));

const pl = spawnSync("node", [path.join(P, "plantilla-reel.mjs"), "reel.json"], { encoding: "utf8" });
if (pl.status !== 0) { console.error(pl.stderr || pl.stdout); process.exit(1); }
chequear();

// ── 9. Lo que se dice → lo que se ve (para leer de un vistazo) ──────────────
console.log(`\nREEL ${FIN} s · ${reelPlanos.length} planos de ${usos.size} fuentes${INSERTOS.length ? ` · insertos: ${INSERTOS.map((p) => p.inserto.tipo).join(", ")}` : ""} · ${ARCH_VOZ.length} voces · check sin errores`);
for (const [i, l] of LINEAS.entries()) {
  const ps = planos.filter((p) => p.linea === i).map((p) => (p.inserto ? `INSERTO ${p.inserto.tipo}${p.inserto.origen ? ` (dato: ${p.inserto.origen})` : ""}` : `${path.basename(String(p.fuente))}${esFoto(String(p.fuente)) ? "" : `@${p.desde ?? 0}s`}${p.muestra ? ` (${p.muestra})` : ""}`));
  console.log(`${INI[i].toFixed(2)}-${(INI[i] + DUR_VOZ[i]).toFixed(2)} «${limpio(l.texto)}» → ${ps.join(" + ")}`);
}
console.log(`${CIERRE.toFixed(2)}-${FIN} cierre «${limpio(C.texto)}» · ${limpio(C.titulo)} · ${C.cta ?? ""} ${C.url ?? ""}`);
for (const a of avisos) console.log(`AVISO ${a}`);
if (!flags.has("--render")) {
  console.log(`\nSiguiente: node ${path.join(P, "armar.mjs")} ${path.basename(archivoGuion)} --render`);
  process.exit(0);
}

// ── 10. Render + control técnico + revisión frase por frase ─────────────────
// Una foto por frase, en la mitad de lo que dice: la hoja para mirar UNA vez.
const momentos = [...momentoDe, r2(Math.min(FIN - 0.3, ultimaTit + 1.2))];
await renderizarYRevisar({
  dir: DIR,
  brief: `${G.brief ?? `Reel de ${G.cliente ?? "un cliente"}. Que cada cuadro muestre lo que dice la voz en ese momento.`}${INSERTOS.length ? " Los paneles animados (número, lista, pasos, chat de EJEMPLO, captura de la web) son gráficos pedidos: valen si cuentan lo que dice la voz." : ""}`,
  fotos: momentos,
  momentos: LINEAS.map((l, i) => ({ segundo: momentos[i], dice: limpio(l.texto) })),
  sinRevision: flags.has("--sin-revision"),
});
