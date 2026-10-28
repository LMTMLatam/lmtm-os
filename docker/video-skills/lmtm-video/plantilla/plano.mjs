// Prepara el material para la plantilla del reel, como en los reels aprobados.
//
//   node plano.mjs hoja <video> <salida.jpg>                 hoja de contacto con el segundo de cada cuadro
//   node plano.mjs corte <fuente> <salida> [--desde 3.2] [--dur 2.4] [--foco 0.5] [--lento 0.8]
//
// corte: recorta a 9:16 (si la fuente es horizontal, --foco elige la franja:
// 0 = izquierda, 0.5 = centro, 1 = derecha), escala a 1080x1920 con lanczos y
// enfoca. Video → .mp4 sin sonido; foto (jpg/png/webp) → .jpg fijo (la plantilla
// le pone el movimiento). --lento 0.8 = cámara lenta al 80 %.
// El centro casi nunca es el mejor recorte: mirá la hoja antes de elegir --foco.
import { execFileSync } from "node:child_process";
import path from "node:path";

const [modo, entrada, salida, ...resto] = process.argv.slice(2);
const opt = (n, def) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? Number(resto[i + 1]) : def; };
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const medir = (f) => {
  const s = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", f]).toString();
  const j = JSON.parse(s);
  return { w: j.streams[0].width, h: j.streams[0].height, dur: Number(j.format?.duration ?? 0) };
};

if (!modo || !entrada || !salida) {
  console.error("uso: node plano.mjs hoja <video> <salida.jpg> | node plano.mjs corte <fuente> <salida> [--desde s] [--dur s] [--foco 0..1] [--lento x]");
  process.exit(1);
}

if (modo === "hoja") {
  const { dur } = medir(entrada);
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
const recorte = `crop=${cw}:${ch}:${x}:${y},scale=1080:1920:flags=lanczos,unsharp=5:5:0.6`;

if (/\.(jpe?g|png|webp)$/i.test(entrada)) {
  ff(["-i", entrada, "-vf", recorte, "-q:v", "2", "-frames:v", "1", salida.replace(/\.\w+$/, ".jpg")]);
  console.log(`foto 9:16: ${salida.replace(/\.\w+$/, ".jpg")} (desde ${w}x${h}, foco ${foco})`);
} else {
  const desde = opt("desde", 0), durac = opt("dur", 2.5), lento = opt("lento", 1);
  const fuenteDur = durac * lento;
  ff(["-ss", String(desde), "-t", fuenteDur.toFixed(3), "-i", entrada, "-an",
    "-vf", `${recorte},setpts=PTS/${lento},fps=30`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", salida]);
  const real = medir(salida).dur;
  console.log(`plano: ${salida} (${real.toFixed(2)} s, de ${path.basename(entrada)} ${desde}s, foco ${foco}, lento ${lento})`);
}
