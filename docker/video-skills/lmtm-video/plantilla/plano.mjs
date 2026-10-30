// Prepara el material para la plantilla del reel, como en los reels aprobados.
//
//   node plano.mjs hoja <video> <salida.jpg>                 hoja de contacto con el segundo de cada cuadro
//   node plano.mjs corte <fuente> <salida> [--desde 3.2] [--dur 2.4] [--foco 0.5] [--lento 0.8]
//
// corte: recorta a 9:16 (si la fuente es horizontal, --foco elige la franja:
// 0 = izquierda, 0.5 = centro, 1 = derecha), escala con lanczos y enfoca.
// Video → .mp4 sin sonido; foto (jpg/png/webp) → .jpg fijo (la plantilla le pone
// el movimiento). --lento 0.8 = cámara lenta al 80 %.
// El centro casi nunca es el mejor recorte: mirá la hoja antes de elegir --foco.
//
// El plano sale MÁS GRANDE que la pantalla (hasta 1350x2400 el video, 1620x2880
// la foto) porque la plantilla lo acerca hasta 1,07×: cortado justo a 1080x1920,
// Chrome lo agrandaba y quedaba blando (reel de RENO, 29/10).
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const [modo, entrada, salida, ...resto] = process.argv.slice(2);
const opt = (n, def) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? Number(resto[i + 1]) : def; };
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const duracion = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim()) || 0;
/** El tamaño del cuadro TAL COMO LO DECODIFICA ffmpeg. ffprobe da el guardado:
 *  los videos de celular vienen 3840x2160 con una marca de rotación de 90°, y
 *  con ese tamaño el recorte salía de la esquina de arriba, ampliado 1,78×. */
const medir = (f) => {
  const r = spawnSync("ffmpeg", ["-v", "info", "-i", f, "-frames:v", "1", "-vf", "showinfo", "-f", "null", "-"], { encoding: "utf8" });
  const m = /showinfo[^\n]*\ss:(\d+)x(\d+)/.exec(r.stderr ?? "");
  if (!m) throw new Error(`no pude medir ${f}: ${(r.stderr ?? "").slice(-300)}`);
  return { w: Number(m[1]), h: Number(m[2]) };
};

if (!modo || !entrada || !salida) {
  console.error("uso: node plano.mjs hoja <video> <salida.jpg> | node plano.mjs corte <fuente> <salida> [--desde s] [--dur s] [--foco 0..1] [--lento x]");
  process.exit(1);
}

if (modo === "hoja") {
  const dur = duracion(entrada);
  const cada = Math.max(0.5, dur / 24);
  ff(["-i", entrada, "-vf", `fps=1/${cada.toFixed(3)},scale=270:-2,drawtext=text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=6x4:padding=4:color=white`, "-frames:v", "1", salida]);
  console.log(`hoja: ${salida} (un cuadro cada ${cada.toFixed(1)} s de ${dur.toFixed(1)} s)`);
  process.exit(0);
}

const foco = Math.min(1, Math.max(0, opt("foco", 0.5)));
const { w, h } = medir(entrada);
// Franja 9:16 dentro de la fuente.
let cw = w, ch = h;
if (w / h > 9 / 16) cw = Math.round((h * 9) / 16 / 2) * 2;
else ch = Math.round((w * 16) / 9 / 2) * 2;
const x = Math.round((w - cw) * foco), y = Math.round((h - ch) * 0.5);
const esFoto = /\.(jpe?g|png|webp)$/i.test(entrada);
// Más grande que la pantalla, pero nunca más que la fuente (agrandar no suma nitidez).
const escala = Math.max(1, Math.min(esFoto ? 1.5 : 1.25, cw / 1080));
const [ow, oh] = [Math.round((1080 * escala) / 2) * 2, Math.round((1920 * escala) / 2) * 2];
// --realce: un poco más de contraste y color para tomas lavadas (fábrica en día
// nublado). Suave a propósito: más fuerte oscurecía el cuadro (30/10).
const realce = resto.includes("--realce") ? ",eq=contrast=1.1:saturation=1.2:brightness=0.02" : "";
const recorte = `crop=${cw}:${ch}:${x}:${y},scale=${ow}:${oh}:flags=lanczos,unsharp=5:5:0.4${realce}`;
const aviso = cw < 1080 ? ` · OJO: la fuente da ${cw}px de ancho, menos que la pantalla: se va a ver blando` : "";

if (esFoto) {
  ff(["-i", entrada, "-vf", recorte, "-q:v", "1", "-frames:v", "1", salida.replace(/\.\w+$/, ".jpg")]);
  console.log(`foto 9:16: ${salida.replace(/\.\w+$/, ".jpg")} (${ow}x${oh} desde ${w}x${h}, foco ${foco})${aviso}`);
} else {
  const desde = opt("desde", 0), durac = opt("dur", 2.5), lento = opt("lento", 1);
  const fuenteDur = durac * lento;
  ff(["-ss", String(desde), "-t", fuenteDur.toFixed(3), "-i", entrada, "-an",
    "-vf", `${recorte},setpts=PTS/${lento},fps=30`, "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", salida]);
  const real = duracion(salida);
  console.log(`plano: ${salida} (${real.toFixed(2)} s, ${ow}x${oh} desde ${w}x${h}, de ${path.basename(entrada)} ${desde}s, foco ${foco}, lento ${lento})${aviso}`);
}
