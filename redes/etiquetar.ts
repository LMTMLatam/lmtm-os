// Etiquetas del MODELO para el estudio base, con las MISMAS funciones que virales_fichar en el servidor (pedido, limpieza,
// comparación) y la misma hoja (gancho 3x3 + video 4x4, 1280 de alto). Desde la raíz del repo, con OPENAI_API_KEY:
//   pnpm --dir server exec tsx ../redes/etiquetar.ts examen      → los del set validado (oro.jsonl): % de coincidencia
//   pnpm --dir server exec tsx ../redes/etiquetar.ts ids.txt     → esos ids (python -I mirar.py pendientes > ids.txt)
// Lo etiquetado queda en ESTUDIO/etiquetas.jsonl; si se corta, se retoma sin volver a pagar lo hecho.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { coincidencia, limpiarFicha, pedidoFicha, PREGUNTAS_FICHA } from "../server/src/services/virales-ficha.js";

const ESTUDIO = process.env.ESTUDIO ?? path.join(os.homedir(), "Documents", "estudio-video");
const MODELO = process.env.LMTM_VIDEO_MODELO_REVISION ?? "gpt-6.1-terra"; // el mismo default que video-agente.ts
// Los tipos con su descripción, como los da tiposActivos() en el servidor (sin «otro»: es el respaldo si no elige uno).
// shortcut: lee la semilla de la migración, igual a producción el 18/11; si el equipo carga tipos propios, leerlos de la base.
const SEMILLA = fs.readFileSync(path.join(import.meta.dirname, "..", "packages", "db", "src", "migrations", "0161_video_tipos.sql"), "utf8");
const TIPOS_CON_DESC = [...SEMILLA.matchAll(/\('([a-z-]+)', '[^']*', '([^']*)', \d+\)/g)].map((m) => ({ slug: m[1], descripcion: m[2] }));
const TIPOS = TIPOS_CON_DESC.map((t) => t.slug);
type Fila = Record<string, any>;
const leer = (n: string): Fila[] => fs.existsSync(path.join(ESTUDIO, n))
  ? fs.readFileSync(path.join(ESTUDIO, n), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];

async function etiquetar(f: Fila): Promise<Fila> {
  const hoja = path.join(os.tmpdir(), `etiq-${f.id}.jpg`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", f.hoja_gancho, "-i", f.hoja, "-filter_complex",
    "[0]scale=-2:1280[a];[1]scale=-2:1280[b];[a][b]hstack", "-q:v", "4", hoja]);
  try {
    const pedido = pedidoFicha(TIPOS_CON_DESC, { texto: f.transcripcion ?? "", gancho: f.gancho_dicho ?? "" });
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO, response_format: { type: "json_object" }, max_completion_tokens: 3000,
        messages: [{ role: "user", content: [{ type: "text", text: pedido },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(hoja).toString("base64")}`, detail: "high" } }] }],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const l = limpiarFicha(JSON.parse(j.choices?.[0]?.message?.content ?? "{}"), TIPOS);
    if (l.faltan.length) throw new Error(`sin respuesta: ${l.faltan.join(", ")}`);
    return { id: f.id, tipo: l.tipo ?? "otro", gancho: l.gancho, respuestas: l.respuestas, modelo: MODELO };
  } finally {
    fs.rmSync(hoja, { force: true });
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("falta OPENAI_API_KEY");
  const modo = process.argv[2];
  if (!modo) throw new Error("uso: etiquetar.ts examen | <archivo con ids>");
  const oro = new Map(leer("oro.jsonl").map((o) => [o.id, o]));
  const fichas = new Map(leer("fichas.jsonl").filter((f) => !f.error).map((f) => [f.id, f]));
  const hechas = new Map(leer("etiquetas.jsonl").map((o) => [o.id, o]));
  const ids = modo === "examen" ? [...oro.keys()] : fs.readFileSync(modo, "utf8").split(/\s+/).filter(Boolean);
  const faltan = ids.filter((id) => !hechas.has(id) && fichas.has(id));
  console.log(`${ids.length} pedidos · ${ids.length - faltan.length} ya hechos o sin ficha · etiquetando ${faltan.length} con ${MODELO}`);
  const salida = fs.createWriteStream(path.join(ESTUDIO, "etiquetas.jsonl"), { flags: "a" });
  let errores = 0;
  const cola = [...faltan];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let id = cola.shift(); id; id = cola.shift()) {
      try {
        const e = await etiquetar(fichas.get(id)!);
        hechas.set(id, e);
        salida.write(JSON.stringify(e) + "\n");
      } catch (err) {
        errores++;
        console.log(`  ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }));
  salida.end();
  console.log(`listo · ${errores} con error (se reintentan corriendo de nuevo)`);
  if (modo !== "examen") return;
  // Examen (fase 6): promedio de coincidencia, la pregunta más floja y el tipo.
  const porClave: Record<string, [number, number]> = Object.fromEntries(Object.keys(PREGUNTAS_FICHA).map((k) => [k, [0, 0]]));
  const pct: number[] = [];
  let tipoIgual = 0;
  for (const [id, o] of oro) {
    const e = hechas.get(id);
    if (!e) continue;
    const c = coincidencia(e.respuestas, o.respuestas);
    if (c.porcentaje !== null) pct.push(c.porcentaje);
    tipoIgual += e.tipo === o.tipo ? 1 : 0;
    for (const k of Object.keys(porClave)) if (typeof o.respuestas[k] === "boolean" && typeof e.respuestas[k] === "boolean") {
      porClave[k][1]++;
      porClave[k][0] += o.respuestas[k] === e.respuestas[k] ? 1 : 0;
    }
  }
  const prom = pct.reduce((a, b) => a + b, 0) / (pct.length || 1);
  console.log(`\nEXAMEN: ${prom.toFixed(1)} % de coincidencia promedio en ${pct.length} videos (aprueba con 85) · tipo igual ${tipoIgual}/${pct.length}`);
  for (const [k, [i, t]] of Object.entries(porClave).sort((a, b) => a[1][0] / (a[1][1] || 1) - b[1][0] / (b[1][1] || 1))) {
    console.log(`  ${k.padEnd(24)} ${t ? Math.round((i / t) * 100) : "-"} %`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
