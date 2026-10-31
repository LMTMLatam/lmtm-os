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
//   cierre             { texto (lo que dice la voz), titulo, etiqueta, cta, url, fantasma, corte, cola }
//   marca, musica      { archivo, volumen } o { prompt } para generarla con Magnific
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const huella = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 16);
const vigente = (archivo, h) => fs.existsSync(archivo) && fs.existsSync(`${archivo}.huella`) && fs.readFileSync(`${archivo}.huella`, "utf8") === h;
const sellar = (archivo, h) => fs.writeFileSync(`${archivo}.huella`, h);
const r2 = (n) => Math.round(n * 100) / 100;
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const esFoto = (f) => /\.(jpe?g|png|webp)$/i.test(f);
const duracion = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim()) || 0;
const HF = spawnSync("hyperframes", ["--version"]).status === 0 ? ["hyperframes"] : ["npx", "-y", "hyperframes@0.8.212"];
const enWindows = { shell: process.platform === "win32" }; // npx es un .cmd en Windows (solo para probar en una PC)

/** Herramientas del servidor (voz, música, render, revisión) con la clave del agente. */
async function herramienta(tool, parameters) {
  const url = process.env.PAPERCLIP_API_URL?.replace(/\/+$/, "");
  const key = process.env.PAPERCLIP_API_KEY;
  if (!url || !key) throw new Error(`${tool}: falta PAPERCLIP_API_URL/KEY (este script corre dentro de la corrida del agente)`);
  const base = url.endsWith("/api") ? url : `${url}/api`;
  const r = await fetch(`${base}/agent-tools/execute`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ tool, parameters }),
  });
  return r.json().catch(() => ({ ok: false, content: `HTTP ${r.status}` }));
}
async function esperar(id) {
  for (let i = 0; i < 20; i++) {
    const e = await herramienta("video_estado", { id });
    if (!e.ok) throw new Error(e.content);
    if (!/sigue en curso/.test(e.content)) return e.content;
  }
  throw new Error(`${id}: no terminó en 30 min`);
}

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
const PLANOS = LINEAS.flatMap((l, i) => (Array.isArray(l.planos) ? l.planos : []).map((p) => ({ ...p, linea: i })));
for (const [i, l] of LINEAS.entries()) {
  exigir(typeof l.texto === "string" && l.texto.trim(), `lineas[${i}].texto: falta`);
  exigir(Array.isArray(l.planos) && l.planos.length > 0, `lineas[${i}]: cada frase muestra lo que dice, con al menos un plano`);
}
exigir(PLANOS.length >= 6, `planos: ${PLANOS.length}; el estándar es 8 a 14 distintos (6 como mínimo)`);
// Sin repetir tomas: el reel v3 de RENO usó 4 videos en 8 cortes y "repitió muchas veces la misma toma".
const usos = new Map();
for (const p of PLANOS) usos.set(p.fuente, [...(usos.get(p.fuente) ?? []), p]);
for (const [f, ps] of usos) {
  const momentos = ps.map((p) => Number(p.desde) || 0).sort((a, b) => a - b);
  const separados = momentos.every((m, i) => i === 0 || m - momentos[i - 1] >= 3);
  exigir(ps.length === 1 || (!esFoto(f) && ps.length === 2 && separados), `${path.basename(String(f))}: usada ${ps.length} veces (una vez; un video, dos como mucho y en momentos distintos)`);
}
exigir(usos.size >= Math.ceil(PLANOS.length * 0.75), `solo ${usos.size} fuentes distintas para ${PLANOS.length} planos`);
// Fuentes que faltan: si el guion trae su id de Drive, se bajan solas (la del índice de drive_bajar también).
const indiceDrive = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, ".drive.json"), "utf8")); } catch { return {}; } };
for (const p of PLANOS) {
  p.drive ??= indiceDrive(path.dirname(String(p.fuente)))[path.basename(String(p.fuente))];
  if (!fs.existsSync(String(p.fuente)) && !p.drive) errores.push(`${p.fuente}: no existe y no tiene id de Drive para bajarla`);
}
const textoTodo = [...LINEAS.map((l) => l.texto), C.texto, C.titulo, C.etiqueta ?? ""].join(" ");
if (/\$|%|\bcuotas?\b|\bdescuento|\boff\b|\bgratis\b/i.test(textoTodo)) {
  avisos.push("el guion nombra un precio, promo o descuento: tiene que estar en la guía o en el pedido (si no, se pregunta)");
}
frenar("guion.json no cumple");

for (const p of PLANOS.filter((p) => !fs.existsSync(String(p.fuente)))) {
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
const huellaVoz = (i) => huella([limpio(TEXTOS[i]), G.estilo, G.voz ?? "Sulafat"]);
for (let vuelta = 0; vuelta < 2; vuelta++) {
  let rehacerTodas = false;
  for (const [i, archivo] of ARCH_VOZ.entries()) {
    if (vigente(archivo, huellaVoz(i))) continue;
    const r = await herramienta("video_voz", { texto: limpio(TEXTOS[i]), archivo, estilo: G.estilo, ...(G.voz ? { voz: G.voz } : {}) });
    if (!r.ok) {
      console.error(`voz l${i + 1}: ${r.content}`);
      process.exit(/cupo/i.test(r.content) ? 3 : 1);
    }
    sellar(archivo, huellaVoz(i));
    console.log(`voz l${i + 1}: ${limpio(TEXTOS[i])}`);
    if (/Regenerá TAMBIÉN/i.test(r.content)) rehacerTodas = true;
  }
  if (!rehacerTodas) break;
  // Cambió el modelo de voz: todas con el mismo, o el reel suena a dos personas.
  for (const a of ARCH_VOZ) fs.rmSync(`${a}.huella`, { force: true });
}

// ── 3. Tiempos de cada palabra (whisper local de hyperframes, sin OpenAI) ───
function transcribir(wav) {
  const json = wav.replace(/\.wav$/, ".palabras.json");
  const h = huella([fs.statSync(wav).size, fs.readFileSync(`${wav}.huella`, "utf8")]);
  if (vigente(json, h)) return JSON.parse(fs.readFileSync(json, "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "armar-"));
  const r = spawnSync(HF[0], [...HF.slice(1), "transcribe", wav, "--model", "small", "--language", "es", "--dir", tmp], { encoding: "utf8", env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" }, ...enWindows });
  const t = path.join(tmp, "transcript.json");
  if (r.status !== 0 || !fs.existsSync(t)) throw new Error(`transcribir ${wav}: ${(r.stderr || r.stdout || "").slice(-300)}`);
  const palabras = JSON.parse(fs.readFileSync(t, "utf8")).map((w) => ({ text: w.text, start: w.start, end: w.end }));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(json, JSON.stringify(palabras));
  sellar(json, h);
  return palabras;
}
/** El texto es el del GUION (whisper escribe mal las marcas: «Tuplacar»); de whisper salen solo los tiempos. */
function alinear(guion, rec) {
  const a = guion.map((w) => norm(w.t));
  const b = rec.map((w) => norm(w.text));
  const igual = (x, y) => x && y && (x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))));
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = igual(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const t = new Array(a.length).fill(null);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (igual(a[i], b[j])) { t[i] = rec[j].start; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  // Las que whisper no reconoció, repartidas entre sus vecinas.
  const fin = rec.length ? rec[rec.length - 1].end : 1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] != null) continue;
    let k = i;
    while (k < t.length && t[k] == null) k++;
    const desde = i > 0 ? t[i - 1] : (rec[0]?.start ?? 0);
    const hasta = k < t.length ? t[k] : fin;
    for (let x = i; x < k; x++) t[x] = desde + ((hasta - desde) * (x - i + (i > 0 ? 1 : 0))) / (k - i + 1);
    i = k - 1;
  }
  return guion.map((w, i) => ({ ...w, ini: Math.max(0, t[i]) }));
}

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
    planos.push({ ...l.planos[k], linea: i, en: r2(cortes[k]), dur });
  }
}
frenar("tiempos");

// ── 5. Planos 9:16 (solo los que cambiaron) ─────────────────────────────────
fs.mkdirSync("assets/planos", { recursive: true });
const reelPlanos = [];
for (const [k, p] of planos.entries()) {
  const base = `assets/planos/p${String(k + 1).padStart(2, "0")}`;
  const foto = esFoto(String(p.fuente));
  const salida = `${base}.${foto ? "jpg" : "mp4"}`;
  const params = { fuente: p.fuente, tam: fs.statSync(String(p.fuente)).size, desde: Number(p.desde ?? 0), foco: p.foco ?? 0.5, lento: p.lento ?? 1, realce: !!p.realce, dur: foto ? 0 : r2(p.dur + 0.15) };
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
    exigir(real >= p.dur - 0.05, `${path.basename(String(p.fuente))} desde ${params.desde} s: la toma dura ${r2(real)} s y hacen falta ${p.dur} (elegí otro momento)`);
  }
  reelPlanos.push({ archivo: salida, desde: p.en, dur: p.dur });
}
frenar("planos");

// ── 6. Música ───────────────────────────────────────────────────────────────
let musica = null;
const MU = G.musica ?? {};
if (MU.archivo && fs.existsSync(MU.archivo)) musica = { archivo: MU.archivo, volumen: MU.volumen ?? 0.25 };
else if (MU.prompt) {
  const archivo = path.resolve("assets/audio/cama.mp3");
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  if (!vigente(archivo, huella([MU.prompt]))) {
    const r = await herramienta("video_musica", { prompt: MU.prompt, archivo, ...(G.clientId ? { clientId: G.clientId } : {}), ...(G.pieza ? { pieza: G.pieza } : {}) });
    const id = /id=([\w-]+)/.exec(r.content ?? "")?.[1];
    if (!r.ok || !id) { console.error(`música: ${r.content}`); process.exit(1); }
    await esperar(id);
    sellar(archivo, huella([MU.prompt]));
  }
  musica = { archivo: path.relative(DIR, archivo).replace(/\\/g, "/"), volumen: MU.volumen ?? 0.25 };
} else avisos.push("sin música: el estándar lleva siempre (musica.archivo o musica.prompt)");

// ── 7. Subtítulos: el texto del guion, de a 4 o 5 palabras, con su segundo ──
function trozos(ws) {
  const res = [];
  let cur = [];
  for (const w of ws) {
    cur.push(w);
    const largo = cur.map((x) => x.t).join(" ").length;
    // En la puntuación se corta con 3 palabras o más: «¿Tu placard,» sola duraba 0,6 s en pantalla.
    if ((/[.,;:!?]$/.test(w.t) && cur.length >= 3) || cur.length >= 5 || largo >= 30) { res.push(cur); cur = []; }
  }
  if (cur.length) { if (cur.length === 1 && res.length) res[res.length - 1].push(...cur); else res.push(cur); }
  return res;
}
const frases = [];
for (const [i] of LINEAS.entries()) {
  const finVoz = INI[i] + DUR_VOZ[i];
  const tope = i === LINEAS.length - 1 ? CIERRE : INI[i + 1] - 0.05;
  const ts = trozos(abs(i));
  for (const [k, tr] of ts.entries()) {
    const desde = r2(Math.max(frases.at(-1)?.hasta ?? 0, tr[0].ini - 0.1));
    const hasta = r2(Math.min(tope, k + 1 < ts.length ? ts[k + 1][0].ini - 0.1 : finVoz + 0.15));
    frases.push({ desde, hasta, palabras: tr.map((w) => (w.clave ? [w.t, r2(w.ini), 1] : [w.t, r2(w.ini)])) });
  }
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
  marca: M,
  cierre: {
    desde: CIERRE, etiqueta: C.etiqueta ?? "", titulo: titPal, ...(C.corte ? { corte: C.corte } : {}),
    cta: C.cta ?? "", ctaDesde: r2(Math.min(FIN - 1.2, ultimaTit + 0.6)), url: C.url ?? "", urlDesde: r2(Math.min(FIN - 0.8, ultimaTit + 1.1)),
    ...(C.fantasma ? { fantasma: C.fantasma } : {}),
  },
  ...(musica ? { musica } : {}),
};
fs.writeFileSync("reel.json", JSON.stringify(reel, null, 1));

const pl = spawnSync("node", [path.join(P, "plantilla-reel.mjs"), "reel.json"], { encoding: "utf8" });
if (pl.status !== 0) { console.error(pl.stderr || pl.stdout); process.exit(1); }
const ch = spawnSync(HF[0], [...HF.slice(1), "check", "--json"], { encoding: "utf8", env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" }, ...enWindows });
let erroresCheck = ch.status === 0 ? 0 : null;
try { const j2 = JSON.parse(ch.stdout); erroresCheck = j2.errors?.length ?? j2.summary?.errors ?? erroresCheck; } catch { /* salida no JSON */ }
if (erroresCheck !== 0) { console.error(`hyperframes check: ${(ch.stdout || ch.stderr).slice(-800)}`); process.exit(1); }

// ── 9. Lo que se dice → lo que se ve (para leer de un vistazo) ──────────────
console.log(`\nREEL ${FIN} s · ${reelPlanos.length} planos de ${usos.size} fuentes · ${ARCH_VOZ.length} voces · check sin errores`);
for (const [i, l] of LINEAS.entries()) {
  const ps = planos.filter((p) => p.linea === i).map((p) => `${path.basename(String(p.fuente))}${esFoto(String(p.fuente)) ? "" : `@${p.desde ?? 0}s`}${p.muestra ? ` (${p.muestra})` : ""}`);
  console.log(`${INI[i].toFixed(2)}-${(INI[i] + DUR_VOZ[i]).toFixed(2)} «${limpio(l.texto)}» → ${ps.join(" + ")}`);
}
console.log(`${CIERRE.toFixed(2)}-${FIN} cierre «${limpio(C.texto)}» · ${limpio(C.titulo)} · ${C.cta ?? ""} ${C.url ?? ""}`);
for (const a of avisos) console.log(`AVISO ${a}`);
if (!flags.has("--render")) {
  console.log(`\nSiguiente: node ${path.join(P, "armar.mjs")} ${path.basename(archivoGuion)} --render`);
  process.exit(0);
}

// ── 10. Render + control técnico + revisión frase por frase ─────────────────
const rr = await herramienta("video_renderizar", { proyecto: DIR, calidad: "delivery" });
const id = /id=([\w-]+)/.exec(rr.content ?? "")?.[1];
if (!rr.ok || !id) { console.error(`render: ${rr.content}`); process.exit(1); }
const listo = await esperar(id);
let mp4 = /Video: (\S+\.mp4)/.exec(listo)?.[1];
if (!mp4) { console.error(`render: ${listo}`); process.exit(1); }
const vtool = (args) => spawnSync("vtool", args, { encoding: "utf8" });
let qc = vtool(["revisar", mp4]).stdout ?? "";
if (/volumen .* LUFS|picos de/.test(qc)) {
  const n = vtool(["normalizar", mp4]);
  const nuevo = /OK -> (\S+)/.exec(n.stdout ?? "")?.[1];
  if (nuevo) { mp4 = path.join(path.dirname(mp4), nuevo); qc = vtool(["revisar", mp4]).stdout ?? ""; }
}
console.log(`\nFINAL ${mp4}`);
console.log(qc.split("\n").filter((x) => /REVISION|ALERTA|sin alertas/.test(x)).join("\n"));
// Una foto por frase, en la mitad de lo que dice: la hoja para mirar UNA vez.
const momentos = [...LINEAS.map((_, i) => r2(INI[i] + DUR_VOZ[i] / 2)), r2(Math.min(FIN - 0.3, ultimaTit + 1.2))];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sincro-"));
momentos.forEach((s, i) => execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(s), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-2", path.join(tmp, `f${String(i).padStart(2, "0")}.jpg`)]));
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "f%02d.jpg"), "-vf", `tile=${Math.min(6, momentos.length)}x${Math.ceil(momentos.length / 6)}:padding=6:color=white`, "-frames:v", "1", "hoja-sincro.jpg"]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`HOJA ${path.join(DIR, "hoja-sincro.jpg")} (una foto por frase, en orden, y el cierre)`);
if (!flags.has("--sin-revision")) {
  const rev = await herramienta("video_revisar", {
    archivo: mp4,
    brief: G.brief ?? `Reel de ${G.cliente ?? "un cliente"}. Que cada cuadro muestre lo que dice la voz en ese momento.`,
    momentos: LINEAS.map((l, i) => ({ segundo: momentos[i], dice: limpio(l.texto) })),
  });
  console.log(`REVISION GPT: ${String(rev.content).slice(0, 1500)}`);
}
