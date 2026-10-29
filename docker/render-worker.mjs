// LMTM-OS: servicio de render de HyperFrames (28/10).
//
// Corre en un servicio aparte de Railway (misma imagen, LMTM_RENDER_WORKER=1)
// para que un render —Chrome varios minutos— no le saque memoria al servidor
// ni a los agentes. Recibe el proyecto como .tar.gz, corre
// `hyperframes render` y devuelve el .mp4. Uno por vez: dos renders juntos
// en el mismo contenedor se pisan la memoria.
//
// POST /render?calidad=draft|looks|delivery   (x-render-token, cuerpo .tar.gz)
// GET  /salud

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const PUERTO = Number(process.env.PORT || 8080);
const TOKEN = process.env.LMTM_RENDER_TOKEN || "";
const NODE22 = "/opt/node22/bin";
const ESPERA_MAX_MS = 20 * 60_000;
const CALIDADES = new Set(["draft", "looks", "delivery"]);
// HyperFrames calcula los Chrome y ffmpeg en paralelo con os.cpus(), que en
// Railway da los CPU de la máquina, no los del servicio: abría decenas a la vez
// y el render moría con «Resource temporarily unavailable» (29/10).
const WORKERS = process.env.LMTM_RENDER_WORKERS || "2";

let ocupado = Promise.resolve();

function correr(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PATH: `${NODE22}:${process.env.PATH}`, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" },
    });
    let salida = "";
    const anotar = (d) => { salida = (salida + d).slice(-20_000); };
    p.stdout.on("data", anotar);
    p.stderr.on("data", anotar);
    const corte = setTimeout(() => p.kill("SIGKILL"), ESPERA_MAX_MS);
    p.on("close", (code) => { clearTimeout(corte); resolve({ code, salida }); });
  });
}

async function renderizar(req, calidad) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-"));
  try {
    const tar = path.join(dir, "proyecto.tar.gz");
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tar);
      req.pipe(out);
      out.on("finish", resolve);
      req.on("error", reject);
    });
    const proyecto = path.join(dir, "p");
    fs.mkdirSync(proyecto);
    const x = await correr("tar", ["-xzf", tar, "-C", proyecto], dir);
    if (x.code !== 0) return { ok: false, error: `no se pudo abrir el proyecto: ${x.salida.slice(-500)}` };
    const salida = path.join(dir, `${randomUUID()}.mp4`);
    const r = await correr("hyperframes", ["render", "--quality", calidad, "--workers", WORKERS, "--output", salida], proyecto);
    if (r.code !== 0 || !fs.existsSync(salida) || fs.statSync(salida).size === 0) {
      return { ok: false, error: `el render falló:\n${r.salida.slice(-3000)}` };
    }
    return { ok: true, archivo: salida, dir, resumen: r.salida.slice(-1500) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (req.method === "GET" && url.pathname === "/salud") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method !== "POST" || url.pathname !== "/render") {
    res.writeHead(404);
    return res.end();
  }
  if (!TOKEN || req.headers["x-render-token"] !== TOKEN) {
    res.writeHead(401);
    return res.end("sin permiso");
  }
  const calidad = url.searchParams.get("calidad") || "delivery";
  if (!CALIDADES.has(calidad)) {
    res.writeHead(400);
    return res.end("calidad: draft, looks o delivery");
  }
  const t0 = Date.now();
  console.log(`[render] pedido (${calidad}, ${req.headers["content-length"] ?? "?"} bytes)`);
  const turno = ocupado.then(() => renderizar(req, calidad));
  ocupado = turno.then(() => undefined, () => undefined);
  turno.then((r) => {
    console.log(`[render] ${r.ok ? "listo" : "falló"} en ${Math.round((Date.now() - t0) / 1000)} s${r.ok ? "" : `: ${String(r.error).slice(0, 300)}`}`);
    if (!r.ok) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: r.error }));
    }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": fs.statSync(r.archivo).size, "x-render-resumen": encodeURIComponent(r.resumen.slice(-400)) });
    const s = fs.createReadStream(r.archivo);
    s.pipe(res);
    s.on("close", () => fs.rmSync(r.dir, { recursive: true, force: true }));
  });
  // "::" para la red privada de Railway (IPv6), que también acepta IPv4.
}).listen(PUERTO, "::", () => console.log(`[render] escuchando en [::]:${PUERTO}`));
