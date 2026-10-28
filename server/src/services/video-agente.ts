// LMTM-OS: herramientas del agente "Productor de video" (28/10).
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
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, clients, contenidoGastos } from "@paperclipai/db";
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

async function anotarGasto(db: Db, g: { clientId: string | null; pieza: string | null; modelo: string; tipo: string; url: string; jobId?: string }) {
  await db.insert(contenidoGastos).values({
    clientId: g.clientId, pieza: g.pieza, origen: "agente", herramienta: "magnific", modelo: g.modelo,
    // Magnific no informa el costo por pedido: null, se cuentan generaciones.
    tipo: g.tipo, creditos: null, usd: null, url: g.url, jobId: g.jobId ?? null,
  }).catch((e) => console.warn("[video-agente] no se pudo anotar el gasto:", e instanceof Error ? e.message : e));
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
      await run("tar", ["-czf", tar, "--exclude=./node_modules", "--exclude=./renders", "--exclude=./.hyperframes", "-C", proyecto, "."], { maxBuffer: 1 << 24 });
      const r = await fetch(`${url.replace(/\/$/, "")}/render?calidad=${calidad}`, {
        method: "POST",
        headers: { "x-render-token": process.env.LMTM_RENDER_TOKEN ?? "", "content-type": "application/gzip" },
        body: fs.readFileSync(tar),
        signal: AbortSignal.timeout(25 * 60_000),
      });
      if (!r.ok) throw new Error(`servicio de render ${r.status}: ${(await r.text()).slice(0, 3000)}`);
      fs.writeFileSync(salida, Buffer.from(await r.arrayBuffer()));
    } finally {
      fs.rmSync(tar, { force: true });
    }
  } else {
    // Sin servicio de render configurado se renderiza acá (más lento y comparte memoria).
    await run("hyperframes", ["render", "--quality", calidad, "--output", salida], {
      cwd: proyecto, timeout: 25 * 60_000, maxBuffer: 1 << 24,
      env: { ...process.env, PATH: `${NODE22}:${process.env.PATH}`, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" },
    });
  }
  const d = await duracion(salida);
  if (!d) throw new Error("el render no dejó un video válido");
  return `Video: ${salida} (${d} s, ${(fs.statSync(salida).size / 1e6).toFixed(1)} MB). Revisalo con video_revisar antes de entregar.`;
}

// ── definiciones ─────────────────────────────────────────────────────────────

type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
const def = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
const ARCHIVO = { type: "string", description: `Ruta bajo ${RAIZ}/` };

export const VIDEO_TOOLS: ToolDef[] = [
  def("video_voz", "VOZ EN OFF en español rioplatense (OpenAI). Una frase por llamada; guarda un .wav en la ruta pedida y devuelve su duración.", {
    texto: { type: "string" }, archivo: ARCHIVO, voz: { type: "string", enum: [...VOCES], description: "Por defecto marin (femenina, cálida). cedar = masculina." },
    instrucciones: { type: "string", description: "Tono extra (por ejemplo: entusiasta, susurrado, pausado)." },
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
  def("video_musica", "GENERA música de fondo con Magnific (Lyria 3). GASTA CRÉDITOS. Corre en segundo plano: devuelve un id para video_estado.", {
    prompt: { type: "string", description: "Género, ánimo, instrumentos y tempo, sin voces." }, archivo: ARCHIVO,
    clientId: { type: "string" }, pieza: { type: "string" },
  }, ["prompt", "archivo"]),
  def("video_renderizar", "RENDERIZA un proyecto de HyperFrames (el directorio con index.html) a .mp4 en el servicio de render. Corre en segundo plano: devuelve un id para video_estado. Antes: `npx hyperframes check --json` sin errores.", {
    proyecto: ARCHIVO, calidad: { type: "string", enum: ["draft", "looks", "delivery"], description: "delivery para entregar (por defecto); draft para probar." },
  }, ["proyecto"]),
  def("video_estado", "ESTADO de una tarea en segundo plano (render, plano, música). Espera hasta 90 s; si sigue en curso, volvé a consultar.", {
    id: { type: "string" },
  }, ["id"]),
  def("video_revisar", "CONTROL DE CALIDAD de un video renderizado: saca cuadros y GPT los revisa contra el brief (subtítulos legibles, zona segura, texto que tapa caras o producto, logo, ortografía, que no diga nada que el brief no permite). Devuelve apto o la lista de problemas.", {
    archivo: ARCHIVO, brief: { type: "string", description: "Qué tiene que decir y mostrar el video y qué no." },
    cuadros: { type: "number", description: "Cuántos cuadros mirar (4 a 12, por defecto 8)." },
  }, ["archivo", "brief"]),
  def("video_entregar", "ENTREGA el video: lo sube a la carpeta VIDEOS del cliente en Drive y lo registra. No publica ni toca el calendario. Devuelve el link para dejar en la tarea.", {
    archivo: ARCHIVO, clientId: { type: "string" }, titulo: { type: "string" },
    guion: { type: "string", description: "El guion y de dónde salió cada plano (cliente o generado)." },
    issueId: { type: "string" },
    clickupTaskId: { type: "string", description: "Si el pedido vino de una tarea de ClickUp: ahí queda el link y la etiqueta «contenido generado»." },
  }, ["archivo", "clientId", "titulo"]),
];

export const NOMBRES_VIDEO = new Set(VIDEO_TOOLS.map((t) => t.function.name));

// ── pedidos ──────────────────────────────────────────────────────────────────

const AGENTE = "Productor de video";
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
 * Le pide un video al Productor: issue asignado + despertar. Lo usa el barrido de
 * la etiqueta «generar contenido» de ClickUp desde que no hay Higgsfield (28/10).
 * No se repite: si ya hay un pedido para esa tarea de ClickUp, devuelve ese.
 */
export async function pedirVideoAlProductor(
  db: Db,
  p: { companyId: string; clientId: string; clienteNombre: string; clickupTaskId: string; clickupUrl: string | null; nombre: string; tipo: string | null; copy: string | null; producto: string | null; objetivo: string | null },
): Promise<{ ok: boolean; mensaje: string }> {
  const { agents, issues } = await import("@paperclipai/db");
  const [agente] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.companyId, p.companyId), eq(agents.name, AGENTE))).limit(1);
  if (!agente) return { ok: false, mensaje: `no existe el agente «${AGENTE}»` };
  const marca = `clickup:${p.clickupTaskId}`;
  const [ya] = await db.select({ identifier: issues.identifier }).from(issues)
    .where(and(eq(issues.assigneeAgentId, agente.id), sql`${issues.status} <> 'cancelled'`, sql`${issues.description} like ${"%" + marca + "%"}`)).limit(1);
  if (ya) return { ok: true, mensaje: `ya pedido al Productor (${ya.identifier ?? "s/n"})` };

  const { issueService } = await import("./issues.js");
  const creado = await issueService(db).create(p.companyId, {
    title: `[${p.clienteNombre.toUpperCase()}] ${p.tipo ?? "Video"}: ${p.nombre}`.slice(0, 200),
    description: [
      `Pedido del equipo desde ClickUp (etiqueta «generar contenido»). Armá el video con la skill **lmtm-video**.`,
      "",
      `- Cliente: ${p.clienteNombre} (clientId \`${p.clientId}\`)`,
      `- Tipo de contenido: ${p.tipo ?? "(sin especificar: reel vertical de 15 a 30 s)"}`,
      p.producto ? `- Producto o servicio: ${p.producto}` : null,
      p.objetivo ? `- Objetivo: ${p.objetivo}` : null,
      p.copy ? `- Copy de la pieza (la idea aprobada; el guion sale de acá):\n\n${p.copy}` : null,
      p.clickupUrl ? `- Tarea: ${p.clickupUrl}` : null,
      "",
      `Al entregar: lmtmVideoEntregar con clickupTaskId \`${p.clickupTaskId}\` (deja el link en la tarea y la marca «contenido generado»).`,
      `<!-- ${marca} -->`,
    ].filter((l) => l !== null).join("\n"),
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
  await heartbeatService(db).wakeup(agente.id, { source: "assignment", triggerDetail: "system", reason: "pedido_video", payload: { issueId } }).catch(() => {});
  await avisarEnClickUp(p.clickupTaskId, `🎬 Pedido al Productor de video (${identifier}). Cuando esté listo, el link queda en esta tarea.`);
  return { ok: true, mensaje: `pedido al Productor de video (${identifier})` };
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
  ctx: { agentId: string; companyId: string },
  tool: string,
  p: Record<string, unknown>,
): Promise<Resultado | null> {
  if (!NOMBRES_VIDEO.has(tool)) return null;
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  try {
    if (tool === "video_estado") return await estadoDe(txt(p.id));

    if (tool === "video_voz") {
      const archivo = rutaSegura(p.archivo);
      if (!archivo || !/\.wav$/i.test(archivo)) return mal(`archivo tiene que ser un .wav bajo ${RAIZ}/`);
      if (!txt(p.texto)) return mal("falta el texto");
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

    if (tool === "video_plano" || tool === "video_musica") {
      const archivo = rutaSegura(p.archivo);
      const ext = tool === "video_plano" ? /\.mp4$/i : /\.(mp3|wav)$/i;
      if (!archivo || !ext.test(archivo)) return mal(`archivo tiene que ser ${tool === "video_plano" ? ".mp4" : ".mp3 o .wav"} bajo ${RAIZ}/`);
      if (txt(p.prompt).length < 10) return mal("el prompt es muy corto");
      const { hayMagnific, pedir } = await import("./magnific.js");
      if (!hayMagnific()) return mal("Magnific no está configurado en el servidor (MAGNIFIC_API_KEY).");
      const quedan = await cupoMagnific(db);
      if (quedan <= 0) return mal(`Se llegó al tope de ${TOPE_MAGNIFIC_MES} generaciones de Magnific de este mes. Usá material del cliente o pedí que lo suban.`);
      const clientId = txt(p.clientId) || null;
      const pieza = txt(p.pieza) || null;

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
          await bajar(url, archivo);
          await anotarGasto(db, { clientId, pieza, modelo: `seedance-2.5-pro-${res}`, tipo: "video", url, jobId: taskId });
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
        await bajar(url, archivo);
        await anotarGasto(db, { clientId, pieza, modelo: "lyria-3-clip", tipo: "audio", url, jobId: taskId });
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

    if (tool === "video_revisar") {
      const archivo = rutaSegura(p.archivo);
      if (!archivo || !fs.existsSync(archivo)) return mal(`no existe el video bajo ${RAIZ}/`);
      const d = await duracion(archivo);
      if (!d) return mal("no es un video que se pueda leer");
      const n = Math.min(12, Math.max(4, Math.round(Number(p.cuadros) || 8)));
      const dir = fs.mkdtempSync(path.join(path.dirname(archivo), ".revision-"));
      try {
        const momentos = Array.from({ length: n }, (_, i) => Number(((d * (i + 0.5)) / n).toFixed(2)));
        const imagenes: string[] = [];
        for (const [i, t] of momentos.entries()) {
          const png = path.join(dir, `c${i}.jpg`);
          await run("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", archivo, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", png]);
          imagenes.push(fs.readFileSync(png).toString("base64"));
        }
        const pedido =
          "Sos el control de calidad de reels verticales 1080x1920 de una agencia. Te paso cuadros del video terminado en orden " +
          `(en los segundos ${momentos.join(", ")}) y el brief. Para cada cuadro revisá: subtítulos legibles (tamaño y contraste con lo de atrás), ` +
          "texto cortado o en los 250 px de arriba / 420 px de abajo, texto que tapa caras, carteles o el producto, logo deformado o pixelado, " +
          "faltas de ortografía, y que no se diga ni muestre nada que el brief no permite. No inventes problemas: si está bien, decilo. " +
          'Respondé SOLO JSON: {"apto": true|false, "problemas": [{"segundo": n, "que": "...", "como_arreglarlo": "..."}]}\n\nBRIEF:\n' + txt(p.brief);
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
        return ok(`Revisión de ${n} cuadros (${MODELO_REVISION}): ${j.choices?.[0]?.message?.content ?? "(sin respuesta)"}. ` +
          "Esto complementa a `hyperframes check` (contraste y diseño medidos), no lo reemplaza.");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
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
      await db.insert(agentDeliverables).values({
        companyId: ctx.companyId, clientId: c.id, agentId: ctx.agentId || null, kind: "video",
        title: `Video: ${titulo}`.slice(0, 200), content: txt(p.guion) || titulo, url: e.driveLink,
        metadata: { via: "productor-video", archivo, duracion: await duracion(archivo), issueRef: txt(p.issueId) || null, taskId: clickupTaskId ?? null },
      });
      if (clickupTaskId) await avisarEnClickUp(clickupTaskId, `🎬 Video listo (Productor de video): ${e.driveLink}\n\n${txt(p.guion).slice(0, 1500)}`, true);
      const enlace = e.enlace ? (e.enlace.ok ? " Quedó en «Enlace de publicación» de la tarea." : ` No se pudo cargar en la tarea: ${e.enlace.motivo}.`) : "";
      return ok(`Entregado en Drive (Super Redes/${c.name}/VIDEOS): ${e.driveLink}.${enlace} Dejá el link y el guion en el issue. No se publicó nada.`);
    }
  } catch (e) {
    return mal(`${tool} falló: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}
