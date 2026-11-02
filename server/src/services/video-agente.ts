// LMTM-OS: herramientas del agente "Productor de contenido" (28/10): reels, carruseles y placas.
//
// Pedido: replicar en un agente el entorno con el que se armaron a mano los
// reels de Ferrol y El Hiper de la Pelu (HyperFrames + ffmpeg + Chrome), con
// Magnific en lugar de Higgsfield y GPT en lugar de kimi.
//
// El agente escribe la composición con su Bash y sus skills; acá vive lo que
// necesita una clave o un servicio aparte, para que las claves no lleguen a su
// entorno: voz y transcripción (OpenAI), planos y música (Magnific), render (el
// servicio de render), revisión de cuadros (GPT) y entrega en Drive.
//
// Todo archivo que entra o sale tiene que estar bajo RAIZ: un agente no lee ni
// escribe en otro lado por acá.
//
// Las tareas largas (render, planos, música) corren en segundo plano y se
// consultan con video_estado: una espera de más de 5 min corta el fetch del MCP.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, clients, contenidoGastos, heartbeatRuns, issues } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";

const run = promisify(execFile);

export const RAIZ = path.resolve(process.env.LMTM_VIDEO_RAIZ ?? "/tmp/videos");
const NODE22 = "/opt/node22/bin";
const OPENAI = "https://api.openai.com/v1";
const MODELO_VOZ = "gpt-4o-mini-tts";
const MODELO_REVISION = process.env.LMTM_VIDEO_MODELO_REVISION ?? "gpt-6.1-terra";
/** Generaciones de Magnific por mes que puede pedir el agente (planos + música). */
const TOPE_MAGNIFIC_MES = Number(process.env.LMTM_VIDEO_TOPE_MAGNIFIC_MES) || 40;
const VOCES = ["marin", "cedar", "coral", "sage", "ash", "ballad", "verse", "alloy", "echo", "fable", "nova", "onyx", "shimmer"] as const;
/** En orden. En el plan gratis cada modelo tiene su cupo diario (10 voces en
 *  3.8 Flash); el usuario escuchó los cuatro con Sulafat y suenan igual (30/10). */
const VOCES_CACHE = process.env.LMTM_VOZ_CACHE ?? "/data/videos/voces";
const MODELOS_VOZ_GEMINI = (process.env.LMTM_VOZ_GEMINI_MODELOS ??"gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** Una frase con un modelo de Gemini. Los 3.8 aceptan el estilo como anotación
 *  (interactions); los 3.1 y 2.5 no, y van por generateContent con el estilo en el
 *  pedido (devuelve PCM 24 kHz, se pasa a wav). */
/**
 * El plan gratis de Gemini da 429 por DOS cosas: el cupo del día (cambiar de
 * modelo) y el tope por minuto (esperar y reintentar con el MISMO). Antes todo
 * 429 cambiaba de modelo: pedir 5 voces seguidas saltaba 3 modelos, mezclaba
 * voces y quemaba el cupo de todos (LMTM-6518, 31/10).
 */
async function vozGemini(clave: string, modelo: string, texto: string, estilo: string, voz: string): Promise<{ audio?: Buffer; sinCupo?: boolean; error?: string }> {
  for (let intento = 0; ; intento++) {
    const r = await vozGeminiUnaVez(clave, modelo, texto, estilo, voz);
    const espera = r.esperar;
    if (espera == null) return r;
    if (intento >= 3) return { sinCupo: true };
    await new Promise((ok) => setTimeout(ok, Math.min(65, espera + 2) * 1000));
  }
}

async function vozGeminiUnaVez(clave: string, modelo: string, texto: string, estilo: string, voz: string): Promise<{ audio?: Buffer; sinCupo?: boolean; esperar?: number; error?: string }> {
  const h = { "content-type": "application/json", "x-goog-api-key": clave };
  const cupo = async (r: Response) => {
    const t = await r.text();
    if (/per ?day|daily/i.test(t)) return { sinCupo: true };
    const s = Number(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(t)?.[1]);
    return { esperar: Number.isFinite(s) ? s : 30 };
  };
  const limpio = async (r: Response) => (await r.text()).split(clave).join("[clave]").slice(0, 300);
  if (modelo.startsWith("gemini-3.8")) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", headers: h, signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: modelo,
        input: [{ type: "user_input", content: [{ type: "text", text: texto, annotations: [{ type: "speech_metadata", style: estilo }] }] }],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice: voz }] },
        store: false,
      }),
    });
    if (r.status === 429) return cupo(r);
    if (!r.ok) return { error: `${r.status}: ${await limpio(r)}` };
    const j = (await r.json()) as { status?: string; steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }> };
    const a = (j.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).find((c) => c.type === "audio" && c.data);
    return a?.data ? { audio: Buffer.from(a.data, "base64") } : { error: "no devolvió audio; probá de nuevo" };
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: h, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${estilo}\nDecí: ${texto}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } } },
    }),
  });
  if (r.status === 429) return cupo(r);
  if (!r.ok) return { error: `${r.status}: ${await limpio(r)}` };
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> };
  const d = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data)?.inlineData;
  if (!d?.data) return { error: "no devolvió audio; probá de nuevo" };
  const tasa = Number(/rate=(\d+)/.exec(d.mimeType ?? "")?.[1]) || 24000;
  return { audio: pcmAWav(Buffer.from(d.data, "base64"), tasa) };
}

/** PCM 16 bits mono → WAV (cabecera de 44 bytes). */
export function pcmAWav(pcm: Buffer, tasa: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(tasa, 24); h.writeUInt32LE(tasa * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** El estilo del reel aprobado de El Hiper (23/10). El agente lo adapta al cliente con `estilo`. */
const ESTILO_GEMINI =
  "Mujer argentina con acento rioplatense natural. Voz cálida, segura y con energía, como alguien que le recomienda algo a una amiga. " +
  "Ritmo ágil pero claro, con una sonrisa en la voz, sin tono de locutora de radio ni exageración.";
const ACENTO =
  "Hablá en español rioplatense de Argentina: voseo, acento de Buenos Aires o Rosario, cálido, cercano y natural, " +
  "como un aviso para redes. Ritmo ágil sin apurarte; pronunciá bien las marcas.";

type Resultado = { ok: boolean; content: string };
const ok = (content: string): Resultado => ({ ok: true, content });
const mal = (content: string): Resultado => ({ ok: false, content });

/** Ruta absoluta bajo RAIZ, o null si se sale (`..`, otra raíz, vacía). */
export function rutaSegura(p: unknown): string | null {
  if (typeof p !== "string" || !p.trim()) return null;
  const abs = path.resolve(RAIZ, p.trim());
  return abs.startsWith(RAIZ + path.sep) ? abs : null;
}

/** El id de un link de Drive (carpeta, archivo o ?id=), o el id suelto. */
export function idDeDrive(link: string): string | null {
  const s = link.trim();
  return /\/folders\/([\w-]{10,})/.exec(s)?.[1] ?? /\/d\/([\w-]{10,})/.exec(s)?.[1] ?? /[?&]id=([\w-]{10,})/.exec(s)?.[1] ?? (/^[\w-]{10,}$/.test(s) ? s : null);
}

async function duracion(archivo: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
  } catch {
    return null;
  }
}

function claveOpenAI(): string {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) throw new Error("falta OPENAI_API_KEY en el servidor");
  return k;
}

async function bajar(url: string, destino: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo bajar el resultado (${r.status})`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

// ── tareas en segundo plano ──────────────────────────────────────────────────

type Tarea = { tipo: string; estado: "en_curso" | "lista" | "fallo"; resultado?: string; error?: string; promesa: Promise<void>; creada: number };
const tareas = new Map<string, Tarea>();

function lanzar(tipo: string, fn: () => Promise<string>): string {
  const id = `${tipo}-${randomUUID().slice(0, 8)}`;
  const t: Tarea = { tipo, estado: "en_curso", creada: Date.now(), promesa: Promise.resolve() };
  t.promesa = fn().then(
    (r) => { t.estado = "lista"; t.resultado = r; },
    (e) => { t.estado = "fallo"; t.error = e instanceof Error ? e.message : String(e); },
  );
  tareas.set(id, t);
  // Las viejas se olvidan a las 6 h: es un mapa en memoria, no un registro.
  for (const [k, v] of tareas) if (Date.now() - v.creada > 6 * 3600_000) tareas.delete(k);
  return id;
}

async function estadoDe(id: string): Promise<Resultado> {
  const t = tareas.get(id);
  if (!t) return mal(`No conozco la tarea ${id}. Si el servidor se reinició, se perdió: volvé a pedirla.`);
  if (t.estado === "en_curso") await Promise.race([t.promesa, new Promise((r) => setTimeout(r, 90_000))]);
  if (t.estado === "en_curso") return ok(`${id}: sigue en curso (${Math.round((Date.now() - t.creada) / 1000)} s). Volvé a consultar con video_estado.`);
  return t.estado === "lista" ? ok(`${id}: lista. ${t.resultado}`) : mal(`${id}: falló. ${t.error}`);
}

// ── Magnific ─────────────────────────────────────────────────────────────────

async function cupoMagnific(db: Db): Promise<number> {
  const inicio = new Date();
  inicio.setUTCDate(1);
  inicio.setUTCHours(0, 0, 0, 0);
  const [f] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contenidoGastos)
    .where(and(eq(contenidoGastos.origen, "agente"), eq(contenidoGastos.herramienta, "magnific"), gte(contenidoGastos.createdAt, inicio)));
  return TOPE_MAGNIFIC_MES - Number(f?.n ?? 0);
}

async function esperarMagnific(ruta: string, taskId: string, maxMs: number): Promise<string> {
  const { pedir } = await import("./magnific.js");
  const limite = Date.now() + maxMs;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 8_000));
    const e = await pedir<{ data?: { status?: string; generated?: string[] } }>(`${ruta}/${encodeURIComponent(taskId)}`);
    const s = (e.data?.status ?? "").toUpperCase();
    if (s === "COMPLETED") {
      const url = e.data?.generated?.[0];
      if (!url) throw new Error("Magnific terminó sin archivo");
      return url;
    }
    if (s === "FAILED") throw new Error("Magnific falló al generar (probá otro prompt o sin imagen de base)");
  }
  throw new Error(`Magnific no terminó en ${Math.round(maxMs / 60_000)} min`);
}

// ── ElevenLabs ───────────────────────────────────────────────────────────────

const ELEVENLABS = "https://api.elevenlabs.io/v1";
const VOZ_ELEVENLABS = "Agustina"; // la elegida por el usuario el 01/11
const USD_POR_MINUTO_MUSICA_ELEVENLABS = 0.3; // elevenlabs.io/pricing/api, 01/11
const claveElevenLabs = () => process.env.ELEVENLABS_API_KEY?.trim() ?? "";

/** POST a ElevenLabs que devuelve audio. Los errores llegan sin la clave. */
async function audioElevenLabs(ruta: string, cuerpo: unknown): Promise<Buffer> {
  const clave = claveElevenLabs();
  const r = await fetch(`${ELEVENLABS}${ruta}`, {
    method: "POST", headers: { "xi-api-key": clave, "content-type": "application/json" },
    body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).split(clave).join("[clave]").slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * La voz por su id o por su nombre («RENO»). La cuenta tiene voces clonadas de clientes y voces argentinas: sin una
 * voz que exista, la respuesta las lista para elegir, sin gastar nada.
 */
export function elegirVozElevenLabs(voces: Array<{ voice_id: string; name: string; category?: string; labels?: { accent?: string } }>, pedida: string): { id: string } | { opciones: string } {
  const n = pedida.trim().toLowerCase();
  const hallada = n && voces.find((v) => v.voice_id === pedida.trim() || v.name.trim().toLowerCase() === n || v.name.trim().toLowerCase().split(" - ")[0] === n);
  if (hallada) return { id: hallada.voice_id };
  const propias = voces.filter((v) => v.category === "cloned" || /argentin/i.test(v.labels?.accent ?? ""));
  return { opciones: propias.map((v) => `${v.name} (${v.category === "cloned" ? "clonada" : "argentina"})`).join("; ") };
}

/**
 * Créditos de una generación según la tarifa de Magnific (simulate_cost del conector, 01/11; misma unidad que el
 * saldo). La API no devuelve el costo de cada pedido ni tiene un endpoint de saldo: es una estimación y el panel lo
 * dice. Sin tarifa, null: nunca un número inventado.
 */
export function creditosMagnific(modelo: string, segundos = 0): number | null {
  if (modelo.startsWith("mystic-")) return 50;
  if (modelo === "lyria-3-clip") return 80;
  const porSegundo = { "seedance-2.5-pro-1080p": 790, "seedance-2.5-pro-720p": 440 }[modelo];
  return porSegundo && segundos > 0 ? porSegundo * segundos : null;
}

async function anotarGasto(db: Db, g: { clientId: string | null; pieza: string | null; modelo: string; tipo: string; url: string; jobId?: string; segundos?: number; herramienta?: string; creditos?: number; usd?: number }) {
  await db.insert(contenidoGastos).values({
    clientId: g.clientId, pieza: g.pieza, origen: "agente", herramienta: g.herramienta ?? "magnific", modelo: g.modelo,
    tipo: g.tipo, creditos: g.creditos ?? creditosMagnific(g.modelo, g.segundos), usd: g.usd ?? null, url: g.url, jobId: g.jobId ?? null,
  }).catch((e) => console.warn("[video-agente] no se pudo anotar el gasto:", e instanceof Error ? e.message : e));
}

/** La tarea y el cliente de la corrida: el gasto y la entrega quedan atados aunque el agente no los pase. */
async function tareaDeCorrida(db: Db, runId: string | undefined): Promise<{ pieza: string | null; clientId: string | null }> {
  if (!runId) return { pieza: null, clientId: null };
  const [f] = await db.select({ identifier: issues.identifier, clientId: issues.clientId })
    .from(heartbeatRuns)
    .innerJoin(issues, sql`${issues.id}::text = ${heartbeatRuns.contextSnapshot}->>'issueId'`)
    .where(eq(heartbeatRuns.id, runId))
    .limit(1);
  return { pieza: f?.identifier ?? null, clientId: f?.clientId ?? null };
}

// ── render ───────────────────────────────────────────────────────────────────

async function renderizar(proyecto: string, calidad: string): Promise<string> {
  if (!fs.existsSync(path.join(proyecto, "index.html"))) throw new Error("el proyecto no tiene index.html");
  const salida = path.join(proyecto, "renders", `render-${Date.now()}.mp4`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const url = process.env.LMTM_RENDER_URL?.trim();
  if (url) {
    const tar = path.join(path.dirname(proyecto), `.${path.basename(proyecto)}-${Date.now()}.tar.gz`);
    try {
      // Sin los originales (assets/fuente: videos 4K de cientos de MB): el render usa los planos ya cortados.
      await run("tar", ["-czf", tar, "--exclude=./node_modules", "--exclude=./renders", "--exclude=./.hyperframes", "--exclude=./assets/fuente", "--exclude=./assets/base/origen.mp4", "--exclude=./capture", "-C", proyecto, "."], { maxBuffer: 1 << 24 });
      const mb = fs.statSync(tar).size / 1e6;
      let r: Response;
      try {
        r = await fetch(`${url.replace(/\/$/, "")}/render?calidad=${calidad}`, {
          method: "POST",
          headers: { "x-render-token": process.env.LMTM_RENDER_TOKEN ?? "", "content-type": "application/gzip" },
          body: fs.readFileSync(tar),
          signal: AbortSignal.timeout(25 * 60_000),
        });
      } catch (e) {
        const causa = (e as { cause?: { code?: string; message?: string } })?.cause;
        const detalle = `${e instanceof Error ? e.message : String(e)}${causa ? ` (${causa.code ?? ""} ${causa.message ?? ""})` : ""}`;
        console.warn(`[video-agente] servicio de render inalcanzable (${mb.toFixed(1)} MB): ${detalle}`);
        throw new Error(`no se pudo llegar al servicio de render: ${detalle}`);
      }
      if (!r.ok) throw new Error(`servicio de render ${r.status}: ${(await r.text()).slice(0, 3000)}`);
      fs.writeFileSync(salida, Buffer.from(await r.arrayBuffer()));
    } finally {
      fs.rmSync(tar, { force: true });
    }
  } else {
    // Sin servicio de render configurado se renderiza acá (más lento y comparte memoria).
    // Workers fijos y taskset: HyperFrames y ffmpeg dimensionan con los CPU de la
    // máquina, no los del contenedor, y fallaban con «Resource temporarily unavailable».
    const cpus = Math.max(1, Number(process.env.LMTM_RENDER_CPUS) || 2);
    await run("taskset", ["-c", `0-${cpus - 1}`, "hyperframes", "render", "--quality", calidad, "--workers", process.env.LMTM_RENDER_WORKERS || "2", "--output", salida], {
      cwd: proyecto, timeout: 25 * 60_000, maxBuffer: 1 << 24,
      env: { ...process.env, PATH: `${NODE22}:${process.env.PATH}`, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" },
    });
  }
  const d = await duracion(salida);
  if (!d) throw new Error("el render no dejó un video válido");
  try { guardarProyecto(salida, true); } catch (e) { console.warn("[video] no se pudo guardar el borrador:", e instanceof Error ? e.message : e); }
  return `Video: ${salida} (${d} s, ${(fs.statSync(salida).size / 1e6).toFixed(1)} MB). Revisalo con video_revisar antes de entregar.`;
}

// ── definiciones ─────────────────────────────────────────────────────────────

type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
const def = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
const ARCHIVO = { type: "string", description: `Ruta bajo ${RAIZ}/` };

export const VIDEO_TOOLS: ToolDef[] = [
  def("video_voz", "VOZ EN OFF en español rioplatense con ElevenLabs (voz Agustina por defecto; gasta un crédito por carácter). Gemini solo para los proyectos que ya la usan. Una frase por llamada; guarda un .wav y devuelve su duración. La misma frase con el mismo estilo sale de la caché (no gasta cupo). Si un modelo se queda sin cupo sigue con otro (suenan igual: no rehagas las frases anteriores). Si dice que no hay cupo, frená y avisá: no uses otra voz.", {
    texto: { type: "string" }, archivo: ARCHIVO,
    estilo: { type: "string", description: "Gemini: cómo suena, adaptado al cliente («mujer argentina, cálida, como una asesora que recomienda a una amiga…»). Mismo estilo en todas las frases del video." },
    voz: { type: "string", description: "Gemini: Sulafat por defecto. OpenAI: marin (femenina) o cedar (masculina). ElevenLabs: el nombre («RENO») o el id; si no existe, devuelve las disponibles sin gastar." },
    proveedor: { type: "string", enum: ["gemini", "openai", "elevenlabs"], description: "Por defecto elevenlabs. gemini: solo para un proyecto que ya tiene sus voces con Gemini." },
    instrucciones: { type: "string", description: "OpenAI: tono extra." },
  }, ["texto", "archivo"]),
  def("video_transcribir", "TIEMPOS de cada palabra de un audio o video (Whisper). Guarda <archivo>.words.json (formato OpenAI, el que leen las skills de subtítulos) y devuelve las palabras con sus segundos. El texto puede salir mal escrito: usá los tiempos y escribí los subtítulos del guion.", {
    archivo: ARCHIVO, idioma: { type: "string", description: "ISO, por defecto es." },
  }, ["archivo"]),
  def("video_plano", "GENERA un plano de video con Magnific (Seedance 2.5 Pro, vertical 9:16). GASTA CRÉDITOS: solo para lo que el material del cliente no tiene, y nunca para mostrar su producto, local o gente como si fueran reales. Corre en segundo plano: devuelve un id para video_estado.", {
    prompt: { type: "string", description: "En inglés: sujeto, lugar, luz, movimiento de cámara, estilo. Sin texto ni logos." },
    archivo: ARCHIVO, duracion: { type: "number", description: "4 a 15 s (por defecto 5)." },
    imagen: { type: "string", description: "Primer cuadro opcional: ruta bajo la raíz o URL pública." },
    resolucion: { type: "string", enum: ["720p", "1080p"], description: "Por defecto 1080p." },
    clientId: { type: "string" }, pieza: { type: "string", description: "Id de la tarea de ClickUp o del issue." },
  }, ["prompt", "archivo"]),
  def("video_musica", "GENERA música de fondo con Magnific (Lyria 3) o ElevenLabs. GASTA CRÉDITOS. Corre en segundo plano: devuelve un id para video_estado.", {
    prompt: { type: "string", description: "Género, ánimo, instrumentos y tempo, sin voces." }, archivo: ARCHIVO,
    proveedor: { type: "string", enum: ["magnific", "elevenlabs"], description: "Por defecto Magnific." },
    duracion: { type: "number", description: "ElevenLabs: segundos (por defecto 30)." },
    clientId: { type: "string" }, pieza: { type: "string" },
  }, ["prompt", "archivo"]),
  def("video_renderizar", "RENDERIZA un proyecto de HyperFrames (el directorio con index.html) a .mp4 en el servicio de render. Corre en segundo plano: devuelve un id para video_estado. Antes: `npx hyperframes check --json` sin errores.", {
    proyecto: ARCHIVO, calidad: { type: "string", enum: ["draft", "looks", "delivery"], description: "delivery para entregar (por defecto); draft para probar." },
  }, ["proyecto"]),
  def("video_estado", "ESTADO de una tarea en segundo plano (render, plano, música). Espera hasta 90 s; si sigue en curso, volvé a consultar.", {
    id: { type: "string" },
  }, ["id"]),
  def("video_revisar", "CONTROL DE CALIDAD con GPT contra el brief: de un video (saca cuadros) o de las placas de un carrusel/post (imagenes). Revisa texto legible, zona segura, texto que tapa caras o producto, logo, ortografía y que no diga nada que el brief no permite. Devuelve apto o la lista de problemas.", {
    archivo: { type: "string", description: `Un .mp4 bajo ${RAIZ}/ (para video).` },
    imagenes: { type: "array", items: { type: "string" }, description: `PNG o JPG bajo ${RAIZ}/ (para placas y carruseles, en orden).` },
    brief: { type: "string", description: "Qué tiene que decir y mostrar la pieza y qué no." },
    cuadros: { type: "number", description: "Video: cuántos cuadros mirar (4 a 12, por defecto 8)." },
    momentos: { type: "array", items: { type: "object", properties: { segundo: { type: "number" }, dice: { type: "string" } } }, description: "Video: un cuadro por frase ({segundo, dice}); revisa que lo que se ve muestre lo que dice la voz. armar.mjs --render lo manda solo." },
    hoja: { type: "string", description: "Hoja de cuadros del render entero (armar.mjs --render la manda sola)." },
    formato: { type: "string", enum: ["filmado"], description: "Video: «filmado» = reel filmado con títulos sincronizados, tarjetas e insertos (armar.mjs lo manda solo)." },
  }, ["brief"]),
  def("video_describir", "DESCRIBE el material bajado (videos y fotos de una carpeta): GPT mira una hoja de cada video y devuelve sus MOMENTOS con el segundo (qué se ve, si alguien habla a cámara, si sirve), y una línea por foto. Es TEXTO: no mires las hojas vos. Lo ya descripto queda en caché. Con eso elegís fuente y `desde` de cada plano del guion.", {
    carpeta: { type: "string", description: `Carpeta del material bajo ${RAIZ}/ (assets/fuente del proyecto).` },
    para: { type: "string", description: "De qué es el video (producto y qué tiene que verse), para describir lo que importa." },
  }, ["carpeta"]),
  def("video_retomar", "RETOMA un video ya entregado para hacerle CAMBIOS sin rehacerlo: restaura su proyecto (guion.json, voces, planos, material descripto) en /tmp/videos y devuelve el guion. Cambiás solo lo pedido en guion.json y corrés armar.mjs --render: lo que no cambió no se rehace. Con `proyecto` (sin deliverableId) recupera el último render de un trabajo a medias que se perdió de /tmp por un deploy.", {
    deliverableId: { type: "string", description: "Id del video entregado (viene en el pedido de cambios)." },
    proyecto: { type: "string", description: "Nombre de la carpeta del proyecto (reno-placares) para recuperar un trabajo sin entregar." },
  }, []),
  def("buscar_material", "BUSCA en el Drive del cliente las fotos y videos que MUESTRAN un producto o escena (GPT mira las miniaturas; sirve aunque el archivo se llame DJI_….jpg). Devuelve los mejores con qué se ve en cada uno y el link de descarga. Lo ya mirado queda guardado: la segunda vez es instantáneo.", {
    cliente: { type: "string", description: "Nombre (aunque sea parcial) o id." },
    producto: { type: "string", description: "Qué tiene que verse: «placard blanco», «llantas de BMW», «frascos de OPI»." },
    tipo: { type: "string", enum: ["foto", "video", "todo"], description: "Por defecto todo." },
    cantidad: { type: "number", description: "Cuántos devolver (3 a 30, por defecto 12)." },
  }, ["cliente", "producto"]),
  def("contenido_imagen","GENERA una imagen con Magnific (Mystic) para fondo o ilustración de una placa o carrusel. GASTA CRÉDITOS. Nunca con texto ni logos (el texto va en HTML) y nunca haciéndola pasar por el producto o local real del cliente. Tarda hasta 2 min.", {
    prompt: { type: "string", description: "En inglés: sujeto, lugar, luz, estilo. Sin texto ni logos." },
    archivo: { type: "string", description: `Ruta .jpg o .png bajo ${RAIZ}/` },
    formato: { type: "string", enum: ["retrato", "vertical", "cuadrado"], description: "retrato 2:3 (se recorta a 4:5 para feed, por defecto), vertical 9:16 (historia), cuadrado 1:1." },
    clientId: { type: "string" }, pieza: { type: "string" },
  }, ["prompt", "archivo"]),
  def("contenido_entregar_imagenes", "ENTREGA una placa o un carrusel (PNG en orden): los sube a la carpeta PLACAS del cliente en Drive, deja la portada en la tarea de ClickUp si viene de una y lo registra. No publica.", {
    archivos: { type: "array", items: { type: "string" }, description: `Los PNG en el orden del carrusel, bajo ${RAIZ}/` },
    clientId: { type: "string" }, titulo: { type: "string" },
    textos: { type: "string", description: "El texto de cada slide y el copy sugerido para el posteo." },
    issueId: { type: "string" }, clickupTaskId: { type: "string" },
  }, ["archivos", "clientId", "titulo"]),
  def("video_variedad", "CONTROL DE VARIEDAD de una pieza contra lo reciente de su cliente y de su rubro, antes de gastar. armar.mjs lo llama solo.", {
    idPieza: { type: "string" }, movimiento: { type: "string" }, ganchoTipo: { type: "string" }, pilar: { type: "string" },
    insertos: { type: "array", items: { type: "string" } }, clientId: { type: "string" },
  }, ["idPieza", "movimiento", "ganchoTipo", "pilar"]),
  def("video_entregar", "ENTREGA el video: lo sube a la carpeta VIDEOS del cliente en Drive y lo registra. No publica ni toca el calendario. Devuelve el link para dejar en la tarea.", {
    archivo: ARCHIVO, clientId: { type: "string" }, titulo: { type: "string" },
    guion: { type: "string", description: "El guion y de dónde salió cada plano (cliente o generado)." },
    issueId: { type: "string" },
    clickupTaskId: { type: "string", description: "Si el pedido vino de una tarea de ClickUp: ahí queda el link y la etiqueta «contenido generado»." },
    reemplaza: { type: "string", description: "Si es la versión corregida de un video entregado: su deliverableId (el del pedido de cambios)." },
  }, ["archivo", "clientId", "titulo"]),
  def("drive_bajar", "BAJA fotos y videos de una carpeta (o un archivo) de Drive que te pasaron por link, aunque no esté en el índice del cliente. Solo ve lo compartido con grow@bylmtm.com. Devuelve las rutas locales.", {
    link: { type: "string", description: "Link de Drive (carpeta o archivo) o su id." },
    carpeta: { type: "string", description: `Carpeta de destino bajo ${RAIZ}/` },
    tipo: { type: "string", enum: ["foto", "video", "todo"] },
    cantidad: { type: "number", description: "Máximo de archivos (por defecto 30)." },
  }, ["link", "carpeta"]),
  def("encargar_al_productor", "PASALE al Productor de contenido un pedido de PRODUCCIÓN: editar fotos (ponerles el logo, recortarlas), placas, carruseles, reels. Crea la tarea, lo despierta y devuelve el número. Usala en vez de intentarlo: vos no tenés terminal ni editor de imágenes.", {
    cliente: { type: "string", description: "Nombre (aunque sea parcial) o id." },
    pedido: { type: "string", description: "Lo que pidió la persona, completo, con los links que pasó." },
  }, ["cliente", "pedido"]),
];

export const NOMBRES_VIDEO = new Set(VIDEO_TOOLS.map((t) => t.function.name));

// ── pedidos ──────────────────────────────────────────────────────────────────

export const AGENTE_PRODUCTOR = "Productor de contenido";
const TAG_LISTO = "contenido generado";

/** Comenta en una tarea de ClickUp (y opcionalmente le pone «contenido generado»). Nunca rompe. */
async function avisarEnClickUp(taskId: string, texto: string, listo = false): Promise<void> {
  const token = process.env.CLICKUP_API_TOKEN ?? "";
  if (!token) return;
  const h = { Authorization: token, "content-type": "application/json" };
  const base = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`;
  await fetch(`${base}/comment`, { method: "POST", headers: h, body: JSON.stringify({ comment_text: texto, notify_all: false }) }).catch(() => {});
  if (listo) await fetch(`${base}/tag/${encodeURIComponent(TAG_LISTO)}`, { method: "POST", headers: h }).catch(() => {});
}

/**
 * Le pide una pieza al Productor: issue asignado + despertar. Lo usa el barrido de
 * la etiqueta «generar contenido» de ClickUp desde que no hay Higgsfield (28/10).
 * No se repite: si ya hay un pedido para esa tarea de ClickUp, devuelve ese.
 */
export async function pedirPiezaAlProductor(
  db: Db,
  p: {
    companyId: string; clientId: string; clienteNombre: string; clickupTaskId: string; clickupUrl: string | null;
    nombre: string; tipo: string | null; copy: string | null; producto: string | null; objetivo: string | null;
    formato: "reel" | "clip" | "carrusel" | "placa"; piezas: number;
  },
): Promise<{ ok: boolean; mensaje: string }> {
  const esVideo = p.formato === "reel" || p.formato === "clip";
  const que = esVideo
    ? `el video con la skill **lmtm-video** (${p.formato === "clip" ? "clip o historia de 8 a 15 s" : "reel vertical de 15 a 35 s"})`
    : `${p.formato === "carrusel" ? `el carrusel (${p.piezas} placas)` : "la placa"} con la skill **lmtm-placas**`;
  const entrega = esVideo ? "lmtmVideoEntregar" : "lmtmContenidoEntregarImagenes";
  const r = await crearTareaProductor(db, {
    companyId: p.companyId,
    clientId: p.clientId,
    marca: `clickup:${p.clickupTaskId}`,
    titulo: `[${p.clienteNombre.toUpperCase()}] ${p.tipo ?? (esVideo ? "Reel" : "Placa")}: ${p.nombre}`,
    descripcion: [
      `Pedido del equipo desde ClickUp (etiqueta «generar contenido»). Armá ${que}.`,
      "",
      `- Cliente: ${p.clienteNombre} (clientId \`${p.clientId}\`)`,
      `- Tipo de contenido: ${p.tipo ?? "(sin especificar)"}`,
      p.producto ? `- Producto o servicio: ${p.producto}` : null,
      p.objetivo ? `- Objetivo: ${p.objetivo}` : null,
      p.copy ? `- Copy de la pieza (la idea aprobada; el texto sale de acá):\n\n${p.copy}` : null,
      p.clickupUrl ? `- Tarea: ${p.clickupUrl}` : null,
      "",
      `Al entregar: ${entrega} con clickupTaskId \`${p.clickupTaskId}\` (deja el link en la tarea y la marca «contenido generado»).`,
    ].filter((l) => l !== null).join("\n"),
  });
  if (!r.ok) return { ok: false, mensaje: r.mensaje };
  if (r.ya) return { ok: true, mensaje: `ya pedido al Productor (${r.identifier})` };
  await avisarEnClickUp(p.clickupTaskId, `${esVideo ? "🎬" : "🖼️"} Pedido al Productor de contenido (${r.identifier}). Cuando esté listo, el link queda en esta tarea.`);
  return { ok: true, mensaje: `pedido al Productor de contenido (${r.identifier})` };
}

/** Un pedido libre de producción (del panel de Agentes, por ejemplo «ponele el
 *  logo a estas 5 fotos»). El rol que lo recibe no tiene terminal: se lo pasa
 *  al Productor en vez de explorar y contestar que no puede. */
export async function encargarAlProductor(
  db: Db,
  p: { companyId: string; clientId: string; clienteNombre: string; pedido: string },
): Promise<{ ok: boolean; mensaje: string }> {
  const { createHash } = await import("node:crypto");
  const huella = createHash("sha1").update(`${p.clientId}|${p.pedido.replace(/\s+/g, " ").trim().toLowerCase()}`).digest("hex").slice(0, 12);
  const r = await crearTareaProductor(db, {
    companyId: p.companyId,
    clientId: p.clientId,
    marca: `pedido:${huella}`,
    titulo: `[${p.clienteNombre.toUpperCase()}] Pedido: ${p.pedido.replace(/\s+/g, " ").slice(0, 120)}`,
    descripcion: [
      "Pedido de producción del equipo (llegó a otro agente, que te lo pasa).",
      "",
      `- Cliente: ${p.clienteNombre} (clientId \`${p.clientId}\`)`,
      "- Pedido, tal cual:",
      "",
      p.pedido,
      "",
      "Cómo:",
      "- Si trae un link de Drive, bajá el material con lmtmDriveBajar. Si dice que no tiene acceso, contalo acá: la carpeta tiene que estar compartida con grow@bylmtm.com.",
      "- Fotos o placas: skill **lmtm-placas** (también la receta para ponerle el logo a fotos). Video: skill **lmtm-video**.",
      "- Entregá con lmtmContenidoEntregarImagenes o lmtmVideoEntregar y dejá acá los links. No se publica nada.",
    ].join("\n"),
  });
  if (!r.ok) return { ok: false, mensaje: r.mensaje };
  return { ok: true, mensaje: r.ya ? `Ese mismo pedido ya lo tiene el Productor de contenido (${r.identifier}).` : `Se lo pasé al Productor de contenido: ${r.identifier}. Cuando esté, los links quedan en esa tarea.` };
}

/** Crea la tarea del Productor y lo despierta. Con la misma marca no crea otra. */
async function crearTareaProductor(
  db: Db,
  p: { companyId: string; clientId: string; marca: string; titulo: string; descripcion: string },
): Promise<{ ok: true; ya: boolean; identifier: string } | { ok: false; mensaje: string }> {
  const { agents, issues } = await import("@paperclipai/db");
  const [agente] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.companyId, p.companyId), eq(agents.name, AGENTE_PRODUCTOR))).limit(1);
  if (!agente) return { ok: false, mensaje: `no existe el agente «${AGENTE_PRODUCTOR}»` };
  const [ya] = await db.select({ identifier: issues.identifier }).from(issues)
    .where(and(eq(issues.assigneeAgentId, agente.id), sql`${issues.status} <> 'cancelled'`, sql`${issues.description} like ${"%" + p.marca + "%"}`)).limit(1);
  if (ya) return { ok: true, ya: true, identifier: ya.identifier ?? "s/n" };

  const { issueService } = await import("./issues.js");
  const creado = await issueService(db).create(p.companyId, {
    title: p.titulo.slice(0, 200),
    description: `${p.descripcion}\n<!-- ${p.marca} -->`,
    status: "todo",
    priority: "medium",
    clientId: p.clientId,
    originKind: "manual",
    createdByAgentId: null,
    assigneeAgentId: agente.id,
  } as never);
  const issueId = String((creado as { id?: string }).id ?? "");
  const identifier = String((creado as { identifier?: string }).identifier ?? issueId);
  const { heartbeatService } = await import("./heartbeat.js");
  await heartbeatService(db).wakeup(agente.id, { source: "assignment", triggerDetail: "system", reason: "pedido_contenido", payload: { issueId } }).catch(() => {});
  return { ok: true, ya: false, identifier };
}

// ── material descripto (video_describir) ─────────────────────────────────────

type Descripcion = { tam: number; linea: string };

/** Ancho, alto (como se VE, con la rotación) y duración. */
async function medidasDe(archivo: string): Promise<{ w: number; h: number; dur: number }> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", archivo], { maxBuffer: 8 << 20 });
  const j = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number; side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } }>; format?: { duration?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video") ?? {};
  const rot = Math.abs(Number(v.side_data_list?.find((s) => s.rotation != null)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const [w, h] = rot === 90 ? [v.height ?? 0, v.width ?? 0] : [v.width ?? 0, v.height ?? 0];
  return { w, h, dur: Number(j.format?.duration) || 0 };
}

async function mirarConGPT(pedido: string, jpg: Buffer, detalle: "low" | "high"): Promise<Record<string, unknown>> {
  const r = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${claveOpenAI()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO_REVISION,
      messages: [{ role: "user", content: [{ type: "text", text: pedido }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: detalle } }] }],
      response_format: { type: "json_object" },
      max_completion_tokens: 3000,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
}

/**
 * Una línea de texto por archivo con lo que se ve (en los videos, por momento y
 * con su segundo). El agente elige las tomas leyendo esto en vez de mirar hojas
 * de contacto: cada imagen que mira se reenvía en todos los turnos que siguen.
 * Lo ya descripto queda en <carpeta>/.material.json (también en el proyecto
 * guardado, para los cambios).
 */
export async function describirMaterial(carpeta: string, para: string): Promise<string> {
  const archivoCache = path.join(carpeta, ".material.json");
  const cache: Record<string, Descripcion> = fs.existsSync(archivoCache) ? JSON.parse(fs.readFileSync(archivoCache, "utf8")) : {};
  const archivos = fs.readdirSync(carpeta).filter((f) => /\.(mp4|mov|m4v|jpe?g|png|webp)$/i.test(f) && !f.includes("__")).sort();
  const nuevos = archivos.filter((f) => cache[f]?.tam !== fs.statSync(path.join(carpeta, f)).size).slice(0, 40);
  const foco = para ? `Es material para un reel sobre: ${para}. ` : "";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "describir-"));
  const fallas: string[] = [];
  const describir = async (f: string) => {
    const ruta = path.join(carpeta, f);
    const { w, h, dur } = await medidasDe(ruta);
    const esVideo = !/\.(jpe?g|png|webp)$/i.test(f);
    // Recorte 9:16: una fuente horizontal de 1920x1080 deja 607 px de ancho y se ve blanda.
    const anchoUtil = w / h > 9 / 16 ? Math.round((h * 9) / 16) : w;
    const datos = `${esVideo ? `video ${dur.toFixed(1)} s` : "foto"} ${h >= w ? "vertical" : "horizontal"} ${w}x${h}${anchoUtil < 1080 ? ` (9:16 queda de ${anchoUtil} px: blanda)` : ""}`;
    const jpg = path.join(tmp, `${f}.jpg`);
    let linea: string;
    if (esVideo) {
      const cada = Math.max(0.25, dur / 12);
      await run("ffmpeg", ["-v", "error", "-y", "-i", ruta, "-vf", `fps=1/${cada.toFixed(3)},scale=320:-2,drawtext=text='%{pts\\:hms}':x=8:y=8:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6,tile=4x3:padding=4:color=white`, "-frames:v", "1", "-q:v", "4", jpg]);
      const j = await mirarConGPT(
        `Hoja de 12 cuadros de un video de ${dur.toFixed(1)} s, en orden, con su segundo arriba a la izquierda. ${foco}` +
          "Describí en español qué se ve, concreto (producto, lugar, personas, acción), sin adornos. Juntá los cuadros parecidos en un momento. " +
          "sirve=false si está movido, oscuro, tapado o no muestra nada útil. foco: dónde está lo importante en horizontal (0 izquierda, 0.5 centro, 1 derecha). " +
          'Respondé SOLO JSON: {"momentos":[{"desde":s,"hasta":s,"muestra":"máx 12 palabras","foco":0.5,"sirve":true}],"habla_a_camara":false,"texto_encima":false}',
        fs.readFileSync(jpg), "high",
      );
      const ms = (Array.isArray(j.momentos) ? j.momentos : []) as Array<{ desde?: number; hasta?: number; muestra?: string; foco?: number; sirve?: boolean }>;
      const conFoco = (f?: number) => (h < w && typeof f === "number" ? ` [foco ${f}]` : "");
      linea = ms.map((m) => `${Number(m.desde ?? 0).toFixed(1)}-${Number(m.hasta ?? dur).toFixed(1)} ${m.muestra ?? ""}${conFoco(m.foco)}${m.sirve === false ? " (no sirve)" : ""}`).join("; ")
        + (j.habla_a_camara ? " · ALGUIEN HABLA A CÁMARA (material filmado: skill video-local)" : "") + (j.texto_encima ? " · tiene texto encima" : "");
    } else {
      await run("ffmpeg", ["-v", "error", "-y", "-i", ruta, "-vf", "scale=768:-2", "-frames:v", "1", "-q:v", "4", jpg]);
      const j = await mirarConGPT(
        `Foto del material de un cliente. ${foco}Qué se ve, concreto, en español y en 15 palabras como mucho. ` +
          "foco: dónde está lo importante en horizontal (0 izquierda, 0.5 centro, 1 derecha). " +
          'Respondé SOLO JSON: {"muestra":"...","foco":0.5,"texto_encima":false,"sirve":true}',
        fs.readFileSync(jpg), "low",
      );
      linea = `${j.muestra ?? ""}${h < w && typeof j.foco === "number" ? ` [foco ${j.foco}]` : ""}${j.texto_encima ? " · tiene texto encima" : ""}${j.sirve === false ? " (no sirve)" : ""}`;
    }
    cache[f] = { tam: fs.statSync(ruta).size, linea: `${datos} · ${linea}` };
  };
  try {
    // De a 4 en paralelo: 15 videos tardan ~1 min, debajo de los 5 min del MCP.
    for (let i = 0; i < nuevos.length; i += 4) {
      await Promise.all(nuevos.slice(i, i + 4).map((f) => describir(f).catch((e) => { fallas.push(`${f}: ${e instanceof Error ? e.message : String(e)}`); })));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.writeFileSync(archivoCache, JSON.stringify(cache));
  }
  const ids = fs.existsSync(path.join(carpeta, ".drive.json")) ? (JSON.parse(fs.readFileSync(path.join(carpeta, ".drive.json"), "utf8")) as Record<string, string>) : {};
  const todos = [...new Set([...archivos, ...Object.keys(cache)])].sort();
  const lineas = todos.map((f) => `${path.join(carpeta, f)} · ${cache[f]?.linea ?? "(sin describir)"}${archivos.includes(f) ? "" : ids[f] ? " · no está bajado: armar.mjs lo baja solo" : " · no está bajado"}`);
  return `${todos.length} archivos en ${carpeta}${nuevos.length ? ` (${nuevos.length} descriptos ahora)` : ""}:\n${lineas.join("\n")}`
    + (fallas.length ? `\nNo se pudieron describir: ${fallas.join("; ")}` : "")
    + "\nEn guion.json: fuente = la ruta, desde = el segundo del momento elegido, muestra = qué se ve (para la revisión frase por frase).";
}

// ── proyecto guardado (cambios a un video entregado) ─────────────────────────

const PROYECTOS = process.env.LMTM_VIDEO_PROYECTOS ?? "/data/videos/proyectos";
const PROYECTOS_A_GUARDAR = 25;

/**
 * Guarda el proyecto LIVIANO de un video armado con armar.mjs (guion, voces,
 * planos, música, material descripto; sin las fuentes pesadas) en el volumen,
 * para que un pedido de cambios no rehaga el video entero. Sin volumen o sin
 * guion.json no guarda nada (null).
 */
/** Lo que armar.mjs anotó de la pieza (movimiento, gancho, pilar, insertos): de ahí sale la variedad y la medición. */
export function fichaDeProyecto(archivo: string): Record<string, unknown> {
  const nombre = path.relative(RAIZ, archivo).split(path.sep)[0];
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, nombre ?? "", "pieza.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function guardarProyecto(archivo: string, borrador = false): string | null {
  const nombre = path.relative(RAIZ, archivo).split(path.sep)[0];
  const dir = path.join(RAIZ, nombre ?? "");
  if (!nombre || !fs.existsSync(path.join(dir, "guion.json")) || !fs.existsSync(path.dirname(path.dirname(PROYECTOS)))) return null;
  // Borrador: el último render de un proyecto, para que un deploy (borra /tmp) no
  // tire un trabajo a medias o frenado. Se pisa en cada render.
  const destino = borrador
    ? path.join(PROYECTOS, `borrador-${nombre}`)
    : path.join(PROYECTOS, `${new Date().toISOString().slice(0, 10)}-${nombre}-${randomUUID().slice(0, 6)}`);
  if (borrador) fs.rmSync(destino, { recursive: true, force: true });
  fs.cpSync(dir, destino, {
    recursive: true,
    filter: (src) => {
      const r = path.relative(dir, src).split(path.sep).join("/");
      if (r === "" || r === "assets" || r === "assets/fuente") return true;
      if (r.startsWith("assets/fuente/")) return /\/\.(drive|material)\.json$/.test(r);
      return !/^(capture|renders|node_modules|\.hyperframes)(\/|$)/.test(r) && !r.includes(".revision-") && !(/\.mp4$/i.test(r) && !r.includes("/"));
    },
  });
  // Los más viejos se van: el volumen es chico (~50 MB por proyecto). Borradores, a la semana.
  const todos = fs.readdirSync(PROYECTOS);
  const entregados = todos.filter((n) => !n.startsWith("borrador-")).sort();
  for (const viejo of entregados.slice(0, Math.max(0, entregados.length - PROYECTOS_A_GUARDAR))) fs.rmSync(path.join(PROYECTOS, viejo), { recursive: true, force: true });
  for (const b of todos.filter((n) => n.startsWith("borrador-"))) {
    if (Date.now() - fs.statSync(path.join(PROYECTOS, b)).mtimeMs > 7 * 86_400_000) fs.rmSync(path.join(PROYECTOS, b), { recursive: true, force: true });
  }
  return destino;
}

/** Pedido de cambios del panel sobre un video entregado: tarea para el Productor con cómo retomarlo. */
export async function pedirCambiosDeVideo(
  db: Db,
  p: { deliverableId: string; cambios: string },
): Promise<{ ok: boolean; mensaje: string }> {
  const [d] = await db.select({ id: agentDeliverables.id, companyId: agentDeliverables.companyId, clientId: agentDeliverables.clientId, title: agentDeliverables.title, url: agentDeliverables.url, kind: agentDeliverables.kind, metadata: agentDeliverables.metadata })
    .from(agentDeliverables).where(eq(agentDeliverables.id, p.deliverableId)).limit(1);
  if (!d || d.kind !== "video" || !d.clientId) return { ok: false, mensaje: "no encuentro ese video" };
  const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, d.clientId)).limit(1);
  const conProyecto = !!(d.metadata as Record<string, unknown> | null)?.proyecto;
  const { createHash } = await import("node:crypto");
  const huella = createHash("sha1").update(`${d.id}|${p.cambios.replace(/\s+/g, " ").trim().toLowerCase()}`).digest("hex").slice(0, 12);
  const titulo = d.title.replace(/^Video: /, "");
  const r = await crearTareaProductor(db, {
    companyId: d.companyId,
    clientId: d.clientId,
    marca: `cambios:${huella}`,
    titulo: `[${(c?.name ?? "").toUpperCase()}] Cambios: ${titulo}`,
    descripcion: [
      "CAMBIOS a un video ya entregado, pedidos desde el panel. NO lo rehagas de cero.",
      "",
      `- Video: ${titulo} (${d.url})`,
      `- deliverableId: \`${d.id}\``,
      "- Cambios pedidos, tal cual:",
      "",
      p.cambios,
      "",
      conProyecto
        ? `Cómo: lmtmVideoRetomar con deliverableId=${d.id} (restaura el proyecto y te da el guion), cambiá solo eso en guion.json, armar.mjs --render y lmtmVideoEntregar con reemplaza=${d.id}. Lo que no cambió no se rehace (ni voces ni planos).`
        : "Este video es anterior al proyecto guardado: rehacelo con la skill lmtm-video aplicando los cambios, y entregalo con reemplaza=" + d.id + ".",
    ].join("\n"),
  });
  if (!r.ok) return { ok: false, mensaje: r.mensaje };
  return { ok: true, mensaje: r.ya ? `Ese mismo pedido ya lo tiene el Productor (${r.identifier}).` : `Pedido de cambios enviado al Productor: ${r.identifier}.` };
}

/** Lo que el Productor tiene entre manos (o terminó en los últimos 3 días), para el panel. */
export async function pedidosDelProductor(db: Db): Promise<Array<{ id: string; identifier: string | null; titulo: string; estado: string; creado: Date; actualizado: Date }>> {
  const { agents, issues } = await import("@paperclipai/db");
  const [a] = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, AGENTE_PRODUCTOR)).limit(1);
  if (!a) return [];
  return db.select({ id: issues.id, identifier: issues.identifier, titulo: issues.title, estado: issues.status, creado: issues.createdAt, actualizado: issues.updatedAt })
    .from(issues)
    .where(and(eq(issues.assigneeAgentId, a.id), sql`(${issues.status} not in ('done','cancelled') or ${issues.updatedAt} > now() - interval '3 days')`))
    .orderBy(sql`${issues.createdAt} desc`).limit(30);
}

// ── skills ───────────────────────────────────────────────────────────────────

/** Las skills de video viajan en la imagen (/app/video-skills). Se registran
 *  como skills locales de cada compañía: así las carga solo el agente que las
 *  pide en su lista, no las 14 del resto de la flota (las "bundled" van a todos). */
export async function registrarSkillsDeVideo(db: Db): Promise<void> {
  const dir = process.env.LMTM_VIDEO_SKILLS_DIR ?? "/app/video-skills";
  if (!fs.existsSync(dir)) return;
  const { companies } = await import("@paperclipai/db");
  const { companySkillService } = await import("./company-skills.js");
  const svc = companySkillService(db);
  for (const c of await db.select({ id: companies.id }).from(companies)) {
    const r = await svc.importFromSource(c.id, dir);
    console.log(`[video-agente] skills de video registradas (${c.id}): ${r.imported.length}${r.warnings.length ? `, avisos: ${r.warnings.join("; ")}` : ""}`);
  }
}

// ── ejecución ────────────────────────────────────────────────────────────────

export async function ejecutarHerramientaVideo(
  db: Db,
  ctx: { agentId: string; companyId: string; runId?: string },
  tool: string,
  p: Record<string, unknown>,
): Promise<Resultado | null> {
  if (!NOMBRES_VIDEO.has(tool)) return null;
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  try {
    if (tool === "video_estado") return await estadoDe(txt(p.id));

    if (tool === "buscar_material") {
      const { buscarMaterial } = await import("./material-visual.js");
      const tipo = ["foto", "video", "todo"].includes(txt(p.tipo)) ? (txt(p.tipo) as "foto" | "video" | "todo") : "todo";
      return ok(await buscarMaterial(db, { cliente: txt(p.cliente), producto: txt(p.producto), tipo, cantidad: Number(p.cantidad) || undefined }));
    }

    if (tool === "encargar_al_productor") {
      const { resolverCliente } = await import("./guia-contenido.js");
      const c = await resolverCliente(db, txt(p.cliente));
      if ("error" in c) return mal(c.error);
      if (!txt(p.pedido)) return mal("falta el pedido");
      const r = await encargarAlProductor(db, { companyId: ctx.companyId, clientId: c.id, clienteNombre: c.name, pedido: txt(p.pedido).slice(0, 4000) });
      return r.ok ? ok(r.mensaje) : mal(r.mensaje);
    }

    if (tool === "drive_bajar") {
      const destino = rutaSegura(p.carpeta);
      if (!destino) return mal(`carpeta tiene que estar bajo ${RAIZ}/`);
      const link = txt(p.link);
      const id = idDeDrive(link);
      if (!id) return mal("no reconozco ese link de Drive");
      const clave = /[?&]resourcekey=([\w-]+)/.exec(link)?.[1];
      const { token } = await import("./contenido-drive.js");
      const h = { Authorization: `Bearer ${await token()}`, ...(clave ? { "X-Goog-Drive-Resource-Keys": `${id}/${clave}` } : {}) };
      const api = (q: string) => fetch(`https://www.googleapis.com/drive/v3/${q}`, { headers: h });
      type F = { id: string; name: string; mimeType: string; size?: string };
      const meta = await api(`files/${id}?fields=id,name,mimeType,size&supportsAllDrives=true`);
      if (meta.status === 404) {
        return mal("grow@bylmtm.com no tiene acceso a ese link (Drive dice que no existe). Hay que compartir la carpeta con grow@bylmtm.com, o subir el material a super redes/<cliente>/PRODUCTOS.");
      }
      if (!meta.ok) return mal(`Drive ${meta.status} al abrir el link`);
      const m = (await meta.json()) as F;
      const tipo = txt(p.tipo) || "todo";
      const sirve = (mime: string) => (tipo !== "video" && mime.startsWith("image/")) || (tipo !== "foto" && mime.startsWith("video/"));
      let archivos: F[] = [];
      if (m.mimeType === "application/vnd.google-apps.folder") {
        const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
        const l = await api(`files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=200&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`);
        if (!l.ok) return mal(`Drive ${l.status} al listar la carpeta`);
        archivos = (((await l.json()) as { files?: F[] }).files ?? []).filter((f) => sirve(f.mimeType));
      } else if (sirve(m.mimeType)) archivos = [m];
      archivos = archivos.slice(0, Math.min(Math.max(1, Number(p.cantidad) || 30), 60));
      if (archivos.length === 0) return mal(`«${m.name}»: no hay ${tipo === "todo" ? "fotos ni videos" : `${tipo}s`} ahí`);
      fs.mkdirSync(destino, { recursive: true });
      const { Readable } = await import("node:stream");
      const { pipeline } = await import("node:stream/promises");
      const bajados: string[] = [];
      const salteados: string[] = [];
      // ponytail: bajada en serie dentro del mismo pedido; muchos videos pesados pueden pasar los 5 min del MCP.
      // Un archivo suelto puede ser un crudo 4K de cámara (1-2 GB); de una carpeta, solo hasta 500 MB cada uno.
      const tope = archivos.length === 1 && m.mimeType !== "application/vnd.google-apps.folder" ? 3e9 : 500e6;
      // Índice nombre → id de Drive: armar.mjs vuelve a bajar una fuente que falta (un cambio después de un deploy).
      const indice = path.join(destino, ".drive.json");
      const ids: Record<string, string> = fs.existsSync(indice) ? JSON.parse(fs.readFileSync(indice, "utf8")) : {};
      for (const f of archivos) {
        if (Number(f.size ?? 0) > tope) { salteados.push(`${f.name} (más de ${tope / 1e6} MB)`); continue; }
        const r = await api(`files/${f.id}?alt=media&supportsAllDrives=true`);
        if (!r.ok || !r.body) { salteados.push(`${f.name} (Drive ${r.status})`); continue; }
        let ruta = path.join(destino, f.name.replace(/[\\/:*?"<>|]/g, "-"));
        if (fs.existsSync(ruta) && ids[path.basename(ruta)] !== f.id) ruta = path.join(destino, `${f.id.slice(0, 6)}-${path.basename(ruta)}`);
        await pipeline(Readable.fromWeb(r.body as never), fs.createWriteStream(ruta));
        ids[path.basename(ruta)] = f.id;
        bajados.push(ruta);
      }
      fs.writeFileSync(indice, JSON.stringify(ids));
      return ok(
        `Bajados ${bajados.length} de «${m.name}» a ${destino}:\n${bajados.join("\n")}` +
          (salteados.length ? `\nSin bajar: ${salteados.join("; ")}` : ""),
      );
    }

    if (tool === "video_voz") {
      const archivo = rutaSegura(p.archivo);
      if (!archivo || !/\.wav$/i.test(archivo)) return mal(`archivo tiene que ser un .wav bajo ${RAIZ}/`);
      if (!txt(p.texto)) return mal("falta el texto");
      // 01/11, pedido del usuario: ElevenLabs es la voz por defecto. Gemini queda para los proyectos que ya la usan.
      if (txt(p.proveedor) === "elevenlabs" || (!txt(p.proveedor) && claveElevenLabs())) {
        if (!claveElevenLabs()) return mal("ElevenLabs no está configurado en el servidor (ELEVENLABS_API_KEY).");
        const lista = await fetch(`${ELEVENLABS}/voices`, { headers: { "xi-api-key": claveElevenLabs() }, signal: AbortSignal.timeout(30_000) });
        if (!lista.ok) return mal(`ElevenLabs voces ${lista.status}: ${(await lista.text()).slice(0, 200)}`);
        const elegida = elegirVozElevenLabs(((await lista.json()) as { voces?: never; voices: Parameters<typeof elegirVozElevenLabs>[0] }).voices ?? [], (/^sulafat$/i.test(txt(p.voz)) ? "" : txt(p.voz)) || process.env.ELEVENLABS_VOZ?.trim() || VOZ_ELEVENLABS);
        if ("opciones" in elegida) return mal(`Voz de ElevenLabs no encontrada: «${txt(p.voz)}». No se gastó nada. Disponibles: ${elegida.opciones}.`);
        const voz = elegida.id;
        const { createHash } = await import("node:crypto");
        const enCache = path.join(VOCES_CACHE, `el-${createHash("sha1").update(`${txt(p.texto)}|${voz}`).digest("hex").slice(0, 24)}.wav`);
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        if (fs.existsSync(enCache)) {
          fs.copyFileSync(enCache, archivo);
          return ok(`Voz (ElevenLabs, de la caché: no gastó créditos) guardada en ${archivo} (${await duracion(archivo)} s).`);
        }
        const pcm = await audioElevenLabs(`/text-to-speech/${encodeURIComponent(voz)}?output_format=pcm_24000`, { text: txt(p.texto), model_id: "eleven_multilingual_v2" });
        fs.writeFileSync(archivo, pcmAWav(pcm, 24000));
        fs.mkdirSync(VOCES_CACHE, { recursive: true });
        fs.copyFileSync(archivo, enCache);
        // Un crédito por carácter (elevenlabs.io/pricing/api).
        const corrida = await tareaDeCorrida(db, ctx.runId);
        await anotarGasto(db, { clientId: txt(p.clientId) || corrida.clientId, pieza: txt(p.pieza) || corrida.pieza, herramienta: "elevenlabs", modelo: "eleven_multilingual_v2", tipo: "audio", url: archivo, creditos: txt(p.texto).length });
        return ok(`Voz (ElevenLabs ${voz}) guardada en ${archivo} (${await duracion(archivo)} s).`);
      }
      // 28/10: la voz de OpenAI sonó «rara» al equipo. La de los reels aprobados
      // es Gemini (gemini-3.8-flash-tts, voz Sulafat, con estilo por cliente).
      const gemini = process.env.GEMINI_API_KEY?.trim();
      if (gemini && txt(p.proveedor) !== "openai") {
        const voz = txt(p.voz) && !(VOCES as readonly string[]).includes(txt(p.voz)) ? txt(p.voz) : "Sulafat";
        const estilo = txt(p.estilo) || ESTILO_GEMINI;
        // Caché en el volumen (31/10): la misma frase con el mismo estilo no se vuelve
        // a pedir nunca, ni en un reintento ni después de un deploy (borra /tmp). El
        // cupo gratis es de 10 voces por día y por modelo.
        const { createHash } = await import("node:crypto");
        const enCache = path.join(VOCES_CACHE, createHash("sha1").update(`${txt(p.texto)}|${estilo}|${voz}`).digest("hex").slice(0, 24));
        if (fs.existsSync(`${enCache}.wav`)) {
          fs.mkdirSync(path.dirname(archivo), { recursive: true });
          fs.copyFileSync(`${enCache}.wav`, archivo);
          const modelo = fs.existsSync(`${enCache}.modelo`) ? fs.readFileSync(`${enCache}.modelo`, "utf8") : "?";
          return ok(`Voz (Gemini ${modelo}, ${voz}, de la caché: no gastó cupo) guardada en ${archivo} (${await duracion(archivo)} s).`);
        }
        // Se arranca por el último modelo que anduvo en este proyecto (<proyecto>/.voz-modelo).
        const partes = path.relative(RAIZ, archivo).split(path.sep);
        const proyecto = partes.length > 1 ? path.join(RAIZ, partes[0]) : RAIZ;
        const marcaModelo = path.join(proyecto, ".voz-modelo");
        const elegido = fs.existsSync(marcaModelo) ? fs.readFileSync(marcaModelo, "utf8").trim() : "";
        const orden = elegido && MODELOS_VOZ_GEMINI.includes(elegido)
          ? MODELOS_VOZ_GEMINI.slice(MODELOS_VOZ_GEMINI.indexOf(elegido))
          : MODELOS_VOZ_GEMINI;
        for (const modelo of orden) {
          const r = await vozGemini(gemini, modelo, txt(p.texto), estilo, voz);
          if (r.sinCupo) continue;
          if (!r.audio) return mal(`Gemini voz (${modelo}): ${r.error}`);
          fs.mkdirSync(path.dirname(archivo), { recursive: true });
          fs.writeFileSync(archivo, r.audio);
          fs.writeFileSync(marcaModelo, modelo);
          try {
            fs.mkdirSync(VOCES_CACHE, { recursive: true });
            fs.writeFileSync(`${enCache}.wav`, r.audio);
            fs.writeFileSync(`${enCache}.modelo`, modelo);
          } catch { /* sin volumen: sigue sin caché */ }
          // Los cuatro modelos suenan igual (el usuario los comparó el 30/10): no se
          // rehacen las frases anteriores cuando uno se queda sin cupo.
          const cambio = elegido && elegido !== modelo ? ` (${elegido} se quedó sin cupo; suenan igual, no hace falta rehacer las otras frases)` : "";
          return ok(`Voz (Gemini ${modelo}, ${voz}) guardada en ${archivo} (${await duracion(archivo)} s).${cambio} Sacale los tiempos con video_transcribir.`);
        }
        // Sin cupo en ningún modelo: no se cambia a OpenAI (al equipo no le gustó esa voz).
        return mal("Sin cupo de voz de Gemini por hoy en ningún modelo. NO uses otra voz: dejá el pedido en espera, contalo en el issue («sin cupo de voz, se retoma mañana») y cerrá la corrida.");
      }
      const voz = (VOCES as readonly string[]).includes(txt(p.voz)) ? txt(p.voz) : "marin";
      const r = await fetch(`${OPENAI}/audio/speech`, {
        method: "POST",
        headers: { authorization: `Bearer ${claveOpenAI()}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODELO_VOZ, voice: voz, input: txt(p.texto), instructions: [ACENTO, txt(p.instrucciones)].filter(Boolean).join(" "), response_format: "wav" }),
      });
      if (!r.ok) return mal(`OpenAI voz ${r.status}: ${(await r.text()).slice(0, 300)}`);
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
      return ok(`Voz guardada en ${archivo} (${await duracion(archivo)} s, voz ${voz}). Sacale los tiempos con video_transcribir.`);
    }

    if (tool === "video_transcribir") {
      const archivo = rutaSegura(p.archivo);
      if (!archivo || !fs.existsSync(archivo)) return mal(`no existe el archivo bajo ${RAIZ}/`);
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(archivo)]), path.basename(archivo));
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("language", txt(p.idioma) || "es");
      const r = await fetch(`${OPENAI}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${claveOpenAI()}` }, body: form });
      if (!r.ok) return mal(`OpenAI transcripción ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = (await r.json()) as { text?: string; words?: Array<{ word: string; start: number; end: number }> };
      fs.writeFileSync(`${archivo}.words.json`, JSON.stringify(j, null, 2));
      const palabras = (j.words ?? []).map((w) => `${w.word}(${w.start.toFixed(2)}-${w.end.toFixed(2)})`).join(" ");
      return ok(`Guardado ${archivo}.words.json. Texto: «${j.text ?? ""}». Palabras: ${palabras || "(sin palabras: puede ser música sin voz)"}`);
    }

    if (tool === "video_plano" || tool === "video_musica" || tool === "contenido_imagen") {
      const archivo = rutaSegura(p.archivo);
      const ext = tool === "video_plano" ? /\.mp4$/i : tool === "video_musica" ? /\.(mp3|wav)$/i : /\.(png|jpe?g)$/i;
      if (!archivo || !ext.test(archivo)) return mal(`archivo tiene que ser ${tool === "video_plano" ? ".mp4" : tool === "video_musica" ? ".mp3 o .wav" : ".png o .jpg"} bajo ${RAIZ}/`);
      if (txt(p.prompt).length < 10) return mal("el prompt es muy corto");
      if (tool === "video_musica" && txt(p.proveedor) === "elevenlabs") {
        if (!claveElevenLabs()) return mal("ElevenLabs no está configurado en el servidor (ELEVENLABS_API_KEY).");
        const segundos = Math.min(300, Math.max(3, Math.round(Number(p.duracion) || 30)));
        const corrida = await tareaDeCorrida(db, ctx.runId);
        const id = lanzar("musica", async () => {
          const audio = await audioElevenLabs("/music", { prompt: txt(p.prompt), music_length_ms: segundos * 1000, force_instrumental: true });
          await anotarGasto(db, { clientId: txt(p.clientId) || corrida.clientId, pieza: txt(p.pieza) || corrida.pieza, herramienta: "elevenlabs", modelo: "music", tipo: "audio", url: archivo, usd: Number(((USD_POR_MINUTO_MUSICA_ELEVENLABS * segundos) / 60).toFixed(4)) });
          fs.mkdirSync(path.dirname(archivo), { recursive: true });
          fs.writeFileSync(archivo, audio);
          return `Música (ElevenLabs) en ${archivo} (${await duracion(archivo)} s).`;
        });
        return ok(`Música pedida a ElevenLabs (${segundos} s). Consultá con video_estado id=${id}.`);
      }
      const { hayMagnific, pedir } = await import("./magnific.js");
      if (!hayMagnific()) return mal("Magnific no está configurado en el servidor (MAGNIFIC_API_KEY).");
      const quedan = await cupoMagnific(db);
      if (quedan <= 0) return mal(`Se llegó al tope de ${TOPE_MAGNIFIC_MES} generaciones de Magnific de este mes. Usá material del cliente o pedí que lo suban.`);
      const corrida = await tareaDeCorrida(db, ctx.runId);
      const clientId = txt(p.clientId) || corrida.clientId;
      const pieza = txt(p.pieza) || corrida.pieza;

      if (tool === "contenido_imagen") {
        // Mystic no tiene 4:5: retrato 2:3 y la composición lo recorta con cover.
        const aspecto = { retrato: "portrait_2_3", vertical: "social_story_9_16", cuadrado: "square_1_1" }[txt(p.formato)] ?? "portrait_2_3";
        const { MODELO_MAGNIFIC } = await import("./magnific.js");
        const creado = await pedir<{ data?: { task_id?: string } }>("/mystic", { method: "POST", body: { prompt: txt(p.prompt), aspect_ratio: aspecto, model: MODELO_MAGNIFIC } });
        const taskId = creado.data?.task_id;
        if (!taskId) return mal("Magnific no devolvió task_id");
        const url = await esperarMagnific("/mystic", taskId, 4 * 60_000);
        await anotarGasto(db, { clientId, pieza, modelo: `mystic-${MODELO_MAGNIFIC}`, tipo: "imagen", url, jobId: taskId });
        await bajar(url, archivo);
        return ok(`Imagen en ${archivo} (${aspecto}). Es GENERADA: decilo en la entrega. Quedan ${quedan - 1} generaciones este mes.`);
      }

      if (tool === "video_plano") {
        const res = txt(p.resolucion) === "720p" ? "720p" : "1080p";
        const ruta = `/video/seedance-2-5-pro-${res}`;
        const dur = Math.min(15, Math.max(4, Math.round(Number(p.duracion) || 5)));
        let imagen: string | undefined;
        if (txt(p.imagen)) {
          if (/^https:\/\//i.test(txt(p.imagen))) imagen = txt(p.imagen);
          else {
            const local = rutaSegura(p.imagen);
            if (!local || !fs.existsSync(local)) return mal(`imagen tiene que ser una URL https o un archivo bajo ${RAIZ}/`);
            imagen = fs.readFileSync(local).toString("base64");
          }
        }
        const creado = await pedir<{ data?: { task_id?: string } }>(ruta, {
          method: "POST",
          body: { prompt: txt(p.prompt), duration: dur, aspect_ratio: "social_story_9_16", no_music: true, ...(imagen ? { image: imagen } : {}) },
        });
        const taskId = creado.data?.task_id;
        if (!taskId) return mal("Magnific no devolvió task_id");
        const id = lanzar("plano", async () => {
          const url = await esperarMagnific(ruta, taskId, 15 * 60_000);
          await anotarGasto(db, { clientId, pieza, modelo: `seedance-2.5-pro-${res}`, tipo: "video", url, jobId: taskId, segundos: dur });
          await bajar(url, archivo);
          return `Plano en ${archivo} (${await duracion(archivo)} s). Es GENERADO: decilo en la entrega.`;
        });
        return ok(`Plano pedido a Magnific (${dur} s, ${res}). Consultá con video_estado id=${id}. Quedan ${quedan - 1} generaciones este mes.`);
      }

      const ruta = "/music-generation/lyria-3";
      const creado = await pedir<{ data?: { task_id?: string } }>(ruta, { method: "POST", body: { prompt: txt(p.prompt), model: "clip" } });
      const taskId = creado.data?.task_id;
      if (!taskId) return mal("Magnific no devolvió task_id");
      const id = lanzar("musica", async () => {
        const url = await esperarMagnific(ruta, taskId, 10 * 60_000);
        await anotarGasto(db, { clientId, pieza, modelo: "lyria-3-clip", tipo: "audio", url, jobId: taskId });
        await bajar(url, archivo);
        return `Música en ${archivo} (${await duracion(archivo)} s).`;
      });
      return ok(`Música pedida a Magnific. Consultá con video_estado id=${id}. Quedan ${quedan - 1} generaciones este mes.`);
    }

    if (tool === "video_renderizar") {
      const proyecto = rutaSegura(p.proyecto);
      if (!proyecto || !fs.existsSync(proyecto)) return mal(`el proyecto tiene que ser un directorio bajo ${RAIZ}/`);
      const calidad = ["draft", "looks", "delivery"].includes(txt(p.calidad)) ? txt(p.calidad) : "delivery";
      const id = lanzar("render", () => renderizar(proyecto, calidad));
      return ok(`Render en curso (${calidad}). Consultá con video_estado id=${id}; un reel de 30 s tarda unos minutos.`);
    }

    if (tool === "video_describir") {
      const carpeta = rutaSegura(p.carpeta);
      if (!carpeta || !fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) return mal(`carpeta tiene que ser un directorio bajo ${RAIZ}/`);
      return ok(await describirMaterial(carpeta, txt(p.para)));
    }

    if (tool === "video_retomar" && txt(p.proyecto) && !txt(p.deliverableId)) {
      // Un trabajo a medias o frenado que se perdió de /tmp con un deploy: vuelve su último render.
      const nombre = path.basename(txt(p.proyecto));
      const guardado = path.join(PROYECTOS, `borrador-${nombre}`);
      if (!fs.existsSync(path.join(guardado, "guion.json"))) return mal(`No hay borrador guardado de «${nombre}» (se guarda en cada render de armar.mjs, una semana).`);
      const destino = path.join(RAIZ, nombre);
      fs.cpSync(guardado, destino, { recursive: true });
      return ok(`Borrador restaurado en ${destino} (su último render). guion.json:\n${fs.readFileSync(path.join(destino, "guion.json"), "utf8").slice(0, 8000)}\n\nSeguí desde ahí: node /app/video-skills/lmtm-video/plantilla/armar.mjs ${destino}/guion.json --render (no rehace voces ni planos que no cambiaron).`);
    }

    if (tool === "video_retomar") {
      const [d] = await db.select({ id: agentDeliverables.id, url: agentDeliverables.url, metadata: agentDeliverables.metadata })
        .from(agentDeliverables).where(eq(agentDeliverables.id, txt(p.deliverableId))).limit(1);
      if (!d) return mal("no encuentro ese video entregado");
      const guardado = String((d.metadata as Record<string, unknown> | null)?.proyecto ?? "");
      if (!guardado || !fs.existsSync(path.join(guardado, "guion.json"))) {
        return mal("Ese video no tiene el proyecto guardado (se entregó antes del 30/10 o ya se borró por antiguo): hay que rehacerlo desde el pedido original con la skill lmtm-video.");
      }
      const destino = path.join(RAIZ, path.basename(guardado).replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-[0-9a-f]{6}$/, ""));
      fs.cpSync(guardado, destino, { recursive: true });
      const guion = fs.readFileSync(path.join(destino, "guion.json"), "utf8");
      return ok([
        `Proyecto restaurado en ${destino} (video entregado: ${d.url}).`,
        `guion.json:\n${guion.slice(0, 8000)}`,
        "",
        `1. Cambiá SOLO lo pedido en ${destino}/guion.json (el resto queda igual: sus voces y planos ya están hechos y no se rehacen).`,
        `2. Si hace falta otra toma: lmtmVideoDescribir con carpeta=${destino}/assets/fuente tiene las descripciones del material (las fuentes que no están se bajan solas por su id de Drive).`,
        `3. node /app/video-skills/lmtm-video/plantilla/armar.mjs ${destino}/guion.json --render`,
        `4. lmtmVideoEntregar con reemplaza=${d.id}.`,
      ].join("\n"));
    }

    if (tool === "video_revisar") {
      const sueltas = Array.isArray(p.imagenes) ? (p.imagenes as unknown[]).slice(0, 12).map(rutaSegura) : [];
      const esVideo = sueltas.length === 0;
      const archivo = esVideo ? rutaSegura(p.archivo) : sueltas[0];
      if (!archivo || !fs.existsSync(archivo)) return mal(`no existe ${esVideo ? "el video" : "la imagen"} bajo ${RAIZ}/`);
      if (!esVideo && sueltas.some((s) => !s || !fs.existsSync(s))) return mal(`todas las imágenes tienen que existir bajo ${RAIZ}/`);
      const d = esVideo ? await duracion(archivo) : 0;
      if (esVideo && !d) return mal("no es un video que se pueda leer");
      // Frase por frase (armar.mjs): un cuadro en la mitad de cada frase y lo que la voz dice ahí.
      const dichos = esVideo && Array.isArray(p.momentos)
        ? (p.momentos as Array<{ segundo?: unknown; dice?: unknown }>)
            .map((m) => ({ s: Number(m?.segundo), dice: txt(m?.dice) }))
            .filter((m) => Number.isFinite(m.s) && m.s >= 0 && m.s < d! && m.dice)
            .slice(0, 12)
        : [];
      const n = dichos.length ? dichos.length : esVideo ? Math.min(12, Math.max(4, Math.round(Number(p.cuadros) || 8))) : sueltas.length;
      const dir = fs.mkdtempSync(path.join(path.dirname(archivo), ".revision-"));
      try {
        const momentos = dichos.length ? dichos.map((m) => Number(m.s.toFixed(2)))
          : esVideo ? Array.from({ length: n }, (_, i) => Number(((d! * (i + 0.5)) / n).toFixed(2))) : [];
        const imagenes: string[] = [];
        for (let i = 0; i < n; i++) {
          const jpg = path.join(dir, `c${i}.jpg`);
          const entrada = esVideo ? ["-ss", String(momentos[i]), "-i", archivo] : ["-i", sueltas[i]!];
          await run("ffmpeg", ["-v", "error", "-y", ...entrada, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", jpg]);
          imagenes.push(fs.readFileSync(jpg).toString("base64"));
        }
        const hoja = esVideo && txt(p.hoja) ? rutaSegura(p.hoja) : null;
        if (hoja && fs.existsSync(hoja)) imagenes.push(fs.readFileSync(hoja).toString("base64"));
        const filmado = esVideo && p.formato === "filmado";
        const comun =
          "logo deformado o pixelado, faltas de ortografía, y que no se diga ni muestre nada que el brief no permite. No inventes problemas: si está bien, decilo. ";
        const pedido = (esVideo
          ? "Sos el control de calidad de reels verticales 1080x1920 de una agencia. Te paso cuadros del video terminado en orden " +
            `(en los segundos ${momentos.join(", ")}) y el brief. Para cada cuadro revisá: subtítulos legibles (tamaño y contraste con lo de atrás), ` +
            "texto o logo cortado o dentro de los 269 px de arriba / 400 px de abajo (interfaz de Reels), texto que tapa caras, logos, carteles o precios " +
            "(el subtítulo va SIEMPRE encima del video, como en los reels virales: que quede sobre una parte de una toma a pantalla completa —estantes, paredes, piso— NO es un problema; " +
            "sí lo es si tapa justo el detalle que nombra la frase), " +
            (filmado
              ? "Este reel usa títulos grandes en jerarquía (chica + GRANDE + media), arriba o abajo según dónde esté la cara, tarjetas con datos e insertos a pantalla completa: son parte del formato, no son un problema, y en un inserto la persona no se ve aunque siga hablando. Sí es un problema una tarjeta o título que tape una cara o el producto. Si alguien habla a cámara, eso ya muestra lo que dice. Un cuadro con un título que todavía se está armando, palabra por palabra, está bien. "
              : "rótulos o carteles en recuadros sobre el video (el formato es subtítulo + gancho; un rótulo en caja es un problema), ") +
            "subtítulos con poco contraste (una palabra que está entrando con su animación no cuenta), " + comun +
            (dichos.length
              ? "Y lo más importante: en cada cuadro la voz está diciendo una frase; ¿lo que se ve MUESTRA lo que dice? " +
                `(si dice «los fabricamos» y se ve una mujer en un local, es un problema). Lo que dice la voz en cada cuadro: ${dichos.map((m, i) => `cuadro ${i + 1} (${m.s.toFixed(1)} s): «${m.dice}»`).join("; ")}. `
              : "") +
            (hoja ? "La ÚLTIMA imagen es la hoja del reel entero, 2 cuadros por segundo, de izquierda a derecha y de arriba abajo: miralo como movimiento. Marcá texto cortado, un cuadro en negro o un fogonazo, un panel vacío más de 2 s, o la misma toma demasiado tiempo. Una palabra a medio entrar no es un problema. " : "") +
            'Respondé SOLO JSON: {"apto": true|false, "problemas": [{"segundo": n, "que": "...", "como_arreglarlo": "..."}]}'
          : `Sos el control de calidad de placas de Instagram de una agencia. Te paso ${n === 1 ? "una placa" : `las ${n} placas de un carrusel, en orden`} y el brief. ` +
            "Revisá: texto legible en el celular (tamaño y contraste), texto cortado o pegado al borde, jerarquía clara (se entiende en 2 segundos), " +
            "que el carrusel tenga gancho en la portada y llamado al final, coherencia visual entre placas, texto que tapa caras o el producto, " + comun +
            'Respondé SOLO JSON: {"apto": true|false, "problemas": [{"placa": n, "que": "...", "como_arreglarlo": "..."}]}') +
          "\n\nBRIEF:\n" + txt(p.brief);
        const r = await fetch(`${OPENAI}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${claveOpenAI()}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: MODELO_REVISION,
            messages: [{ role: "user", content: [{ type: "text", text: pedido }, ...imagenes.map((b) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b}`, detail: "high" } }))] }],
            response_format: { type: "json_object" },
            max_completion_tokens: 6000,
          }),
        });
        if (!r.ok) return mal(`OpenAI revisión ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return ok(`Revisión de ${n} ${esVideo ? "cuadros" : "placas"} (${MODELO_REVISION}): ${j.choices?.[0]?.message?.content ?? "(sin respuesta)"}. ` +
          "Esto complementa a `hyperframes check` (contraste y diseño medidos), no lo reemplaza.");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    if (tool === "contenido_entregar_imagenes") {
      const lista = Array.isArray(p.archivos) ? (p.archivos as unknown[]).slice(0, 20).map(rutaSegura) : [];
      if (lista.length === 0 || lista.some((a) => !a || !fs.existsSync(a) || !/\.(png|jpe?g)$/i.test(a))) {
        return mal(`archivos tiene que ser una lista de PNG o JPG que existan bajo ${RAIZ}/`);
      }
      const [c] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, txt(p.clientId))).limit(1);
      if (!c) return mal("no encuentro ese clientId");
      const titulo = (txt(p.titulo) || "Placa").replace(/[\\/:*?"<>|]/g, "-").slice(0, 70);
      const sello = new Date().toISOString().slice(0, 10);
      const { subirDesdeUrl } = await import("./contenido-drive.js");
      const links: string[] = [];
      for (const [i, a] of (lista as string[]).entries()) {
        const nombre = lista.length > 1 ? `${titulo} — slide ${i + 1} — ${sello}${path.extname(a)}` : `${titulo} — ${sello}${path.extname(a)}`;
        const r = await subirDesdeUrl(db, { clientId: c.id, clienteNombre: c.name, url: pathToFileURL(a).href, nombreArchivo: nombre, destino: "placas" });
        links.push(r.link);
      }
      const clickupTaskId = txt(p.clickupTaskId) || undefined;
      let enlace = "";
      if (clickupTaskId) {
        // Como el resto de las placas: la portada va al "Enlace de publicación"; las demás, al comentario.
        const { escribirEnlacePublicacion } = await import("./video-entrega.js");
        const e = await escribirEnlacePublicacion(clickupTaskId, links[0]);
        enlace = e.ok ? " La portada quedó en «Enlace de publicación» de la tarea." : ` No se pudo cargar en la tarea: ${e.motivo}.`;
        await avisarEnClickUp(clickupTaskId, `🖼️ ${lista.length > 1 ? `Carrusel de ${lista.length} placas` : "Placa"} lista (Productor de contenido):\n${links.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\n${txt(p.textos).slice(0, 1500)}`, true);
      }
      await db.insert(agentDeliverables).values({
        companyId: ctx.companyId, clientId: c.id, agentId: ctx.agentId || null, kind: "placa",
        title: `${lista.length > 1 ? "Carrusel" : "Placa"}: ${titulo}`.slice(0, 200), content: txt(p.textos) || titulo, url: links[0],
        metadata: { via: "productor-contenido", piezas: lista.length, links, issueRef: txt(p.issueId) || null, taskId: clickupTaskId ?? null },
      });
      return ok(`Entregado en Drive (Super Redes/${c.name}/PLACAS): ${links.join(" ")}.${enlace} Dejá los links y los textos en el issue. No se publicó nada.`);
    }

    if (tool === "video_variedad") {
      const clientId = txt(p.clientId) || (await tareaDeCorrida(db, ctx.runId)).clientId;
      if (!clientId) return mal("no sé de qué cliente es: pasá clientId en guion.json");
      const { variedadDeCliente } = await import("./video-variedad.js");
      const v = await variedadDeCliente(db, clientId, { idPieza: txt(p.idPieza), movimiento: txt(p.movimiento), ganchoTipo: txt(p.ganchoTipo), pilar: txt(p.pilar), insertos: Array.isArray(p.insertos) ? p.insertos.map(String) : [] });
      if (v.problemas.length) return mal(v.problemas.map((x) => `- ${x}`).join("\n"));
      return ok(v.avisos.length ? v.avisos.join(" · ") : "");
    }

    if (tool === "video_entregar") {
      const archivo = rutaSegura(p.archivo);
      if (!archivo || !fs.existsSync(archivo) || !/\.mp4$/i.test(archivo)) return mal(`archivo tiene que ser un .mp4 bajo ${RAIZ}/`);
      const [c] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, txt(p.clientId))).limit(1);
      if (!c) return mal("no encuentro ese clientId");
      const titulo = txt(p.titulo).slice(0, 120) || "Video";
      const clickupTaskId = txt(p.clickupTaskId) || undefined;
      // La misma entrega que el resto del contenido: Super Redes/<cliente>/VIDEOS
      // y, si viene de una tarea de ClickUp, el link en su "Enlace de publicación".
      const { entregarVideo } = await import("./video-entrega.js");
      const e = await entregarVideo(db, { clientId: c.id, clienteNombre: c.name, nombrePieza: titulo, videoUrl: pathToFileURL(archivo).href, taskId: clickupTaskId });
      if (!e.driveLink) return mal(`no se pudo subir a Drive (${e.driveError ?? "sin detalle"}): el video quedó en ${archivo}.`);
      // El proyecto queda guardado para que un pedido de cambios no rehaga todo (30/10).
      let proyecto: string | null = null;
      try { proyecto = guardarProyecto(archivo); } catch (err) { console.warn("[video] no se pudo guardar el proyecto:", err instanceof Error ? err.message : err); }
      const { pieza: piezaCorrida } = await tareaDeCorrida(db, ctx.runId);
      await db.insert(agentDeliverables).values({
        companyId: ctx.companyId, clientId: c.id, agentId: ctx.agentId || null, kind: "video",
        title: `Video: ${titulo}`.slice(0, 200), content: txt(p.guion) || titulo, url: e.driveLink,
        metadata: { via: "productor-video", archivo, duracion: await duracion(archivo), issueRef: txt(p.issueId) || null, taskId: clickupTaskId ?? null, pieza: piezaCorrida, proyecto, reemplaza: txt(p.reemplaza) || null, ...fichaDeProyecto(archivo) },
      });
      if (clickupTaskId) await avisarEnClickUp(clickupTaskId, `🎬 Video listo (Productor de contenido): ${e.driveLink}\n\n${txt(p.guion).slice(0, 1500)}`, true);
      const enlace = e.enlace ? (e.enlace.ok ? " Quedó en «Enlace de publicación» de la tarea." : ` No se pudo cargar en la tarea: ${e.enlace.motivo}.`) : "";
      return ok(`Entregado en Drive (Super Redes/${c.name}/VIDEOS): ${e.driveLink}.${enlace} Dejá el link y el guion en el issue. No se publicó nada.`);
    }
  } catch (e) {
    return mal(`${tool} falló: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}
