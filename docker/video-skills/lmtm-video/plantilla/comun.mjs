// Lo que comparten los dos armadores (armar.mjs para voz generada + planos,
// filmado.mjs para lo filmado): herramientas del servidor, caché por huella,
// transcripción local, música y el cierre (render + control + revisión).
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const huella = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 16);
export const vigente = (archivo, h) => fs.existsSync(archivo) && fs.existsSync(`${archivo}.huella`) && fs.readFileSync(`${archivo}.huella`, "utf8") === h;
export const sellar = (archivo, h) => fs.writeFileSync(`${archivo}.huella`, h);
export const r2 = (n) => Math.round(n * 100) / 100;
export const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
export const esFoto = (f) => /\.(jpe?g|png|webp)$/i.test(f);
export const duracion = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim()) || 0;
export const HF = spawnSync("hyperframes", ["--version"]).status === 0 ? ["hyperframes"] : ["npx", "-y", "hyperframes@0.8.212"];
export const enWindows = { shell: process.platform === "win32" }; // npx es un .cmd en Windows (solo para probar en una PC)
const envHF = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" };

/** Herramientas del servidor (voz, música, render, revisión) con la clave del agente. */
export async function herramienta(tool, parameters) {
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
export async function esperar(id) {
  for (let i = 0; i < 20; i++) {
    const e = await herramienta("video_estado", { id });
    if (!e.ok) throw new Error(e.content);
    if (!/sigue en curso/.test(e.content)) return e.content;
  }
  throw new Error(`${id}: no terminó en 30 min`);
}

/** Tiempos de cada palabra (whisper local de hyperframes, sin OpenAI). Queda al lado del audio. */
export function transcribir(wav) {
  const json = wav.replace(/\.\w+$/, ".palabras.json");
  const st = fs.statSync(wav);
  const h = huella([st.size, st.mtimeMs]);
  if (vigente(json, h)) return JSON.parse(fs.readFileSync(json, "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "armar-"));
  const r = spawnSync(HF[0], [...HF.slice(1), "transcribe", wav, "--model", "small", "--language", "es", "--dir", tmp], { encoding: "utf8", env: envHF, ...enWindows });
  const t = path.join(tmp, "transcript.json");
  if (r.status !== 0 || !fs.existsSync(t)) throw new Error(`transcribir ${wav}: ${(r.stderr || r.stdout || "").slice(-300)}`);
  const palabras = JSON.parse(fs.readFileSync(t, "utf8")).map((w) => ({ text: w.text, start: w.start, end: w.end }));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(json, JSON.stringify(palabras));
  sellar(json, h);
  return palabras;
}

/** La pista del guion: la que ya hay o la generada con Magnific (gasta créditos; no se repite si el prompt es el mismo). */
export async function pistaDe(G, dir) {
  const MU = G.musica ?? {};
  if (MU.archivo && fs.existsSync(MU.archivo)) return MU.archivo;
  if (!MU.prompt) return null;
  const archivo = path.resolve(dir, "assets/audio/cama.mp3");
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const h = huella(MU.proveedor ? [MU.prompt, MU.proveedor, MU.duracion] : [MU.prompt]);
  if (!vigente(archivo, h)) {
    const r = await herramienta("video_musica", { prompt: MU.prompt, archivo, ...(MU.proveedor ? { proveedor: MU.proveedor } : {}), ...(MU.duracion ? { duracion: MU.duracion } : {}), ...(G.clientId ? { clientId: G.clientId } : {}), ...(G.pieza ? { pieza: G.pieza } : {}) });
    const id = /id=([\w-]+)/.exec(r.content ?? "")?.[1];
    if (!r.ok || !id) { console.error(`música: ${r.content}`); process.exit(1); }
    await esperar(id);
    sellar(archivo, h);
  }
  return archivo;
}

export function chequear() {
  const ch = spawnSync(HF[0], [...HF.slice(1), "check", "--json"], { encoding: "utf8", env: envHF, ...enWindows });
  if (ch.status === 0) return;
  let detalle = (ch.stdout || ch.stderr || "").slice(-800);
  try {
    const hallados = Object.values(JSON.parse(ch.stdout)).flatMap((v) => (Array.isArray(v?.findings) ? v.findings : [])).filter((x) => x.severity === "error");
    if (hallados.length) detalle = hallados.slice(0, 8).map((x) => `${x.selector ?? ""}: ${x.message}`).join("\n");
  } catch { /* salida no JSON */ }
  console.error(`hyperframes check:\n${detalle}`);
  process.exit(1);
}

/** Render + control técnico + hoja (una foto por momento) + revisión. `momentos`: [{ segundo, dice }]; `fotos`: los segundos de la hoja. */
export async function renderizarYRevisar({ dir, brief, fotos, momentos, formato, sinRevision }) {
  const rr = await herramienta("video_renderizar", { proyecto: dir, calidad: "delivery" });
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
  hojaDeMomentos(mp4, fotos, path.join(dir, "hoja-sincro.jpg"));
  console.log(`HOJA ${path.join(dir, "hoja-sincro.jpg")} (una foto por momento, en orden)`);
  if (!sinRevision) {
    const rev = await herramienta("video_revisar", { archivo: mp4, brief, momentos, ...(formato ? { formato } : {}) });
    console.log(`REVISION GPT: ${String(rev.content).slice(0, 1500)}`);
  }
  return mp4;
}

export function hojaDeMomentos(mp4, fotos, salida) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sincro-"));
  fotos.forEach((s, i) => execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(s), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-2", path.join(tmp, `f${String(i).padStart(2, "0")}.jpg`)]));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "f%02d.jpg"), "-vf", `tile=${Math.min(6, fotos.length)}x${Math.ceil(fotos.length / 6)}:padding=6:color=white`, "-frames:v", "1", salida]);
  fs.rmSync(tmp, { recursive: true, force: true });
}
