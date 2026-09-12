// LMTM-OS: generación de video con Higgsfield.
//
// FLUJO: el equipo etiqueta una pieza de la lista "Redes Sociales" de ClickUp
// con "generar contenido" (una sola etiqueta para todo). QUÉ se genera lo
// decide el campo "Tipo de Contenido" de esa misma tarea: Reel/Video Largo →
// 3 clips pegados, Clip corto/Story → 1 clip de 8s, Post/Carrusel → placas
// (pendiente), Vivo → nada. El prompt sale de los campos que el equipo ya
// carga y el resultado vuelve como COMENTARIO en la tarea, con el link.
//
// NUNCA publica nada ni toca el calendario: deja el video para que una persona
// lo apruebe. La etiqueta es el pedido explícito — sin etiqueta no se gasta
// un solo crédito.
//
// AUTENTICACIÓN (15/8): se habla con platform.higgsfield.ai usando credenciales
// de servidor que NO vencen ni rotan — ver higgsfield-api.ts. Antes se usaba la
// CLI `hf`, cuyo token OAuth rotaba y obligaba a re-loguear a mano con un
// navegador cada vez que dos procesos coincidían.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname } from "node:path";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, clients } from "@paperclipai/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";
import { NON_LATIN_RE } from "./entrega-checks.js";
import { entregarVideo, type EntregaResultado } from "./video-entrega.js";
import { planDe } from "./contenido-tipos.js";
import { estado as estadoHiggsfield, generarVideo, SinCreditos } from "./higgsfield.js";
import { hayPlan, prepararCredenciales, MODELO_VIDEO_PLAN } from "./higgsfield-cli.js";
import { hayCredenciales as hayApi } from "./higgsfield-api.js";

/** Etiqueta con la que el equipo pide el contenido, y la que marca que ya salió.
 *  Es UNA sola para todo: lo que se genera lo decide el campo "Tipo de
 *  Contenido" de la tarea (decisión del usuario 14/8). */
export const TAG_PEDIDO = "generar contenido";
export const TAG_LISTO = "contenido generado";
/** Etiquetas viejas: las piezas que ya las tienen se siguen respetando para no
 *  regenerar (ni cobrar) lo que ya salió con el nombre anterior. */
export const TAGS_PEDIDO_LEGACY = ["generar video"];
export const TAGS_LISTO_LEGACY = ["video generado"];

/** Tope por barrido: evita que una etiquetada masiva vacíe la cuenta. */
const TOPE_POR_BARRIDO = 5;

/** `clients` no tiene company_id: el resto del código usa este id fijo
 *  (ver ads.ts:1512). LMTM es mono-empresa en la práctica. */
const COMPANY_ID = "00000000-0000-4000-8000-000000000001";

/** Solo para el concat de reels con ffmpeg. */
const run = promisify(execFile);

/**
 * ¿La cuenta puede generar? Reemplaza al viejo `hf account status`.
 *
 * La CLI salió del circuito (15/8): autenticaba con OAuth de navegador y su
 * token rotaba, lo que obligaba a re-loguear a mano cada vez que dos procesos
 * coincidían. Ahora se usa el API de plataforma con credenciales que no vencen
 * — ver higgsfield-api.ts.
 */
export async function estadoCuenta(db: Db): Promise<{ ok: boolean; motivo: string | null; via: string | null; creditosPlan: number | null }> {
  const e = await estadoHiggsfield(db);
  return { ok: e.ok, motivo: e.motivo, via: e.via, creditosPlan: e.creditosPlan };
}

// ── ClickUp ──────────────────────────────────────────────────────────────────

interface TareaPieza {
  id: string;
  name: string;
  url: string | null;
  tags: string[];
  copy: string | null;
  producto: string | null;
  objetivo: string | null;
  tipo: string | null;
  imagenUrl: string | null;
}

const cuToken = () => process.env.CLICKUP_API_TOKEN ?? "";

async function cu<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: cuToken() };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`https://api.clickup.com/api/v2${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`ClickUp ${path} → ${r.status}: ${text.slice(0, 250)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Los nombres de campo del equipo traen espacios y acentos inconsistentes
 *  ("Aprobación de cliente " con espacio final), así que se matchea por regex. */
function campo(t: any, re: RegExp): string | null {
  const f = (t.custom_fields ?? []).find((x: any) => re.test(x.name ?? ""));
  if (!f || f.value == null || f.value === "") return null;
  const opts = f.type_config?.options ?? [];
  const vals = Array.isArray(f.value) ? f.value : [f.value];
  const labels = vals
    .map((v: any) => opts.find((o: any) => o.id === v || o.orderindex === v)?.label ?? opts.find((o: any) => o.id === v || o.orderindex === v)?.name)
    .filter(Boolean);
  if (labels.length) return labels.join(", ");
  return typeof f.value === "string" || typeof f.value === "number" ? String(f.value) : null;
}

/** Descripción de la tarea en texto plano. ClickUp la devuelve en
 *  `text_content` (plano) o `description` (markdown) según el endpoint. */
function descripcionDe(t: any): string | null {
  const d = (t.text_content ?? t.description ?? "").toString().trim();
  return d.length > 20 ? d.slice(0, 3000) : null;
}

function aTarea(t: any): TareaPieza {
  const adj = (t.attachments ?? []).find((a: any) => /^image\//i.test(a.mimetype ?? "") || /\.(jpe?g|png|webp)$/i.test(a.title ?? ""));
  return {
    id: t.id,
    name: t.name ?? "",
    url: t.url ?? null,
    tags: (t.tags ?? []).map((x: any) => String(x.name ?? "").toLowerCase()),
    // El agente de ideas escribe TODO (IDEA, COPY DEL POSTEO, SLIDES, DISEÑO,
    // CTA) en la DESCRIPCIÓN de la tarea, no en el campo "Copy o/y Subtitulo"
    // — que en Super Redes suele estar vacío. Leer solo el campo hacía que el
    // prompt cayera al fallback del rubro y saliera un video que no tenía nada
    // que ver con la idea (14/8).
    copy: campo(t, /copy|subtitulo|subtítulo/i) ?? descripcionDe(t),
    producto: campo(t, /descripci[oó]n de producto/i),
    objetivo: campo(t, /objetivo de contenido/i),
    tipo: campo(t, /tipo de contenido/i),
    imagenUrl: adj?.url ?? null,
  };
}

/**
 * Lista "Super Redes Sociales" del cliente: es DONDE ETIQUETA EL EQUIPO
 * (corrección del usuario 14/8) — ahí viven las ideas y ahí se aprueban. No hay
 * columna dedicada, se resuelve buscándola en el folder del cliente y se cachea
 * en metadata para no pegarle a la API en cada barrido.
 */
async function listaSuperRedes(db: Db, clientId: string, folderId: string | null): Promise<string | null> {
  const [c] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId));
  const meta = (c?.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.superRedesListId === "string" && meta.superRedesListId) return meta.superRedesListId;
  if (!folderId) return null;
  try {
    const j = await cu<{ lists?: Array<{ id: string; name: string }> }>(`/folder/${encodeURIComponent(folderId)}/list?archived=false`);
    const l = (j.lists ?? []).find((x) => /super\s*redes/i.test(x.name));
    if (!l) return null;
    await db.update(clients).set({ metadata: { ...meta, superRedesListId: l.id } }).where(eq(clients.id, clientId));
    return l.id;
  } catch {
    return null;
  }
}

/**
 * Piezas etiquetadas y todavía sin generar, en toda la cartera.
 *
 * Se recorren DOS listas por cliente: "Super Redes Sociales" (la principal, es
 * donde el equipo aprueba las ideas) y "Redes Sociales" (el calendario). La
 * diferencia práctica es el Cronopost: las piezas del calendario se llaman
 * "Posteo N" y sí tienen fila ahí, las de Super Redes son títulos de idea y no
 * la tienen — en ese caso el link queda solo en Drive y el comentario lo avisa.
 */
let colaCache: { hasta: number; valor: Array<{ clientId: string; clientName: string; tarea: TareaPieza }> } | null = null;
const CACHE_COLA_MS = 3 * 60_000;

export async function piezasPendientes(db: Db, forzar = false): Promise<Array<{ clientId: string; clientName: string; tarea: TareaPieza }>> {
  if (!cuToken()) return [];
  // Recorrer las dos listas de los 58 clientes son ~60s de llamadas a ClickUp, y
  // el panel pide el estado cada 60 segundos: con la pantalla abierta se le
  // pegaba a la API sin parar. El barrido pasa `forzar` para ver lo de recién.
  if (!forzar && colaCache && Date.now() < colaCache.hasta) return colaCache.valor;
  const cs = await db.select({
    id: clients.id, name: clients.name,
    lista: clients.clickupListRedesId, folder: clients.clickupFolderId,
  })
    .from(clients)
    .where(eq(clients.status, "active"));
  const out: Array<{ clientId: string; clientName: string; tarea: TareaPieza }> = [];
  const vistas = new Set<string>();
  for (const c of cs) {
    const listas = [await listaSuperRedes(db, c.id, c.folder), c.lista].filter((x): x is string => !!x);
    for (const lista of listas) {
      try {
        const j = await cu<{ tasks: any[] }>(`/list/${encodeURIComponent(lista)}/task?subtasks=false&include_closed=true`);
        for (const raw of j.tasks ?? []) {
          const t = aTarea(raw);
          const pedida = t.tags.includes(TAG_PEDIDO) || TAGS_PEDIDO_LEGACY.some((x) => t.tags.includes(x));
          const yaHecha = t.tags.includes(TAG_LISTO) || TAGS_LISTO_LEGACY.some((x) => t.tags.includes(x));
          if (!pedida || yaHecha || vistas.has(t.id)) continue;
          vistas.add(t.id);
          out.push({ clientId: c.id, clientName: c.name, tarea: t });
        }
      } catch (e) {
        console.warn(`[higgsfield] no se pudo leer una lista de ${c.name}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  colaCache = { hasta: Date.now() + CACHE_COLA_MS, valor: out };
  return out;
}

// ── prompt ───────────────────────────────────────────────────────────────────

/**
 * Los modelos de video rinden bastante mejor en inglés, pero el equipo carga
 * todo en español. Se traduce y se convierte en dirección de cámara concreta;
 * si el LLM no responde, se cae a un prompt armado con los mismos campos —
 * peor, pero nunca deja al equipo sin nada.
 */
export async function armarPrompt(t: TareaPieza, clienteNombre: string, rubro: string | null): Promise<string> {
  const contexto = [
    `Cliente: ${clienteNombre}${rubro ? ` (rubro: ${rubro})` : ""}`,
    `Pieza: ${t.name}`,
    t.copy ? `Copy: ${t.copy}` : "",
    t.producto ? `Producto: ${t.producto}` : "",
    t.objetivo ? `Objetivo: ${t.objetivo}` : "",
    t.tipo ? `Formato: ${t.tipo}` : "",
  ].filter(Boolean).join("\n");

  // Reglas de la guía oficial de Higgsfield (skill higgsfield-generate,
  // references/prompt-engineering.md):
  //  · sujeto + escenario + estilo, con cámara y luz concretas
  //  · con --start-image el prompt describe MOVIMIENTO, no re-describe el frame
  //  · frases POSITIVAS: "tack sharp", no "no blur" — casi ningún modelo tiene
  //    negative_prompt y el "no X" mete X en la escena
  //  · nada de marcas ni figuras públicas: el modelo corta con ip_detected
  const conFrame = !!t.imagenUrl;
  const sistema = conFrame
    ? [
        "El modelo YA tiene el primer cuadro del video (la pieza de diseño del cliente).",
        "Escribí en INGLÉS SOLO el MOVIMIENTO de esos 8 segundos: movimiento de cámara y movimiento del sujeto.",
        "NO describas lo que ya se ve en la imagen — el modelo la tiene y redescribirla la degrada.",
        "Usá verbos de cámara concretos: slow push in, dolly left, sweeping pan, gentle orbit, subtle parallax.",
        "Máximo 35 palabras. Respondé SOLO el prompt, sin comillas ni explicación.",
      ].join(" ")
    : [
        "Convertís un brief de contenido en UN prompt para un modelo de video generativo.",
        "Escribí en INGLÉS: una sola toma continua de 8 segundos, vertical 9:16.",
        "Estructura: sujeto + escenario + luz + movimiento de cámara + estilo.",
        "Usá frases POSITIVAS y concretas ('tack sharp', 'clean uncluttered background'); nunca 'no X' ni 'sin X'.",
        "NO nombres marcas, logos, texto en pantalla ni personas reales: el modelo rechaza el pedido.",
        "NO inventes datos del producto que no estén en el brief.",
        "Máximo 60 palabras. Respondé SOLO el prompt, sin comillas ni explicación.",
      ].join(" ");

  const usable = (s: string | null) => {
    const limpio = limpiarPrompt(s ?? "");
    if (limpio.length <= 25 || NON_LATIN_RE.test(limpio)) return null;
    if (!esIngles(limpio)) return { texto: null, porQue: "vino en español" };
    const marca = marcaEnPrompt(limpio, clienteNombre);
    if (marca) return { texto: null, porQue: `nombra la marca "${marca}"` };
    const neg = fraseNegativa(limpio);
    if (neg) return { texto: null, porQue: `usa una frase negativa ("${neg}…"), que el modelo lee como parte de la escena` };
    return { texto: recortar(limpio, 600), porQue: "" };
  };

  const primero = usable(await aiNarrative(sistema, contexto));
  if (primero?.texto) return primero.texto;
  // Un reintento con la regla que se incumplió en la cara. Mismo patrón que usa
  // aiNarrative con el chino: el modelo suele cumplir a la segunda, y un
  // reintento sale mucho más barato que un video generado con un prompt malo.
  const segundo = usable(await aiNarrative(
    `${sistema}\n\nTu respuesta anterior no sirvió porque ${primero?.porQue ?? "no era usable"}. Reescribila entera respetando TODAS las reglas.`,
    contexto,
  ));
  if (segundo?.texto) return segundo.texto;

  // Fallback determinista. OJO: no lleva el nombre del cliente (una marca en el
  // prompt dispara ip_detected) ni frases negativas ("no text or logos" metía
  // justamente texto y logos en la escena).
  if (conFrame) return "slow cinematic push in, subtle parallax, steady smooth motion";
  // NO se pega el copy: está en español y el resultado era un híbrido cortado a
  // la mitad — "Cinematic vertical shot showing Reel educativo-preventivo con
  // gancho estacional. Se muestran 5 señales (arranque ," (17/8). Un prompt en
  // inglés coherente sobre el rubro rinde mucho mejor que uno bilingüe roto.
  console.warn(`[higgsfield] prompt de video por fallback (el LLM no devolvió inglés en 2 intentos) — pieza "${t.name}"`);
  const base = esIngles(t.producto ?? "") ? (t.producto ?? "").trim() : escenaDeRubro(rubro);
  return `Cinematic vertical shot showing ${base}, slow camera push-in, warm natural light, shallow depth of field, clean uncluttered background, tack sharp, premium commercial style`;
}

/**
 * Frase negativa en el prompt, o null.
 *
 * Casi ningún modelo de imagen/video tiene negative_prompt: el "no X" se lee
 * como parte de la escena y METE X. Es la regla más citada de la guía de
 * Higgsfield ("no blur" → "tack sharp"). Se instruía y no se validaba, y salió
 * igual "professional B2B industrial aesthetic without staged poses" (18/8).
 *
 * "not" y "no" sueltos solo cuentan seguidos de palabra, para no saltar con
 * "notice", "nose" o "nordic".
 */
export function fraseNegativa(texto: string): string | null {
  const m = texto.match(/\b(?:without|avoid(?:ing)?|free of|devoid of|no|not)\s+[a-z]/i);
  return m ? m[0].trim() : null;
}

/**
 * Marca nombrada en el prompt, o null.
 *
 * Higgsfield corta con `ip_detected` cuando el prompt nombra una marca, y ese
 * rechazo llega DESPUÉS de encolar el trabajo. Decírselo en el sistema no
 * alcanza: pidió "close-up of mechanic's hand holding smartphone displaying
 * WhatsApp icon" igual (17/8). Se valida, como con el inglés.
 *
 * La lista son las que se filtran de verdad — apps y marcas que el modelo mete
 * como decorado — más el nombre del propio cliente, que es el caso más probable
 * porque está en el contexto que se le pasa.
 */
export function marcaEnPrompt(texto: string, clienteNombre: string): string | null {
  const MARCAS = /\b(whatsapp|instagram|facebook|tiktok|youtube|twitter|iphone|android|apple|samsung|google|coca[\s-]?cola|pepsi|nike|adidas|mercado\s?libre|netflix|spotify|uber|amazon)\b/i;
  const m = texto.match(MARCAS);
  if (m) return m[1];
  // El nombre del cliente: solo la primera palabra y si es larga, para no
  // saltar con "Grupo" o "MA" y descartar prompts buenos.
  const propia = clienteNombre.trim().split(/\s+/).find((p) => p.length >= 5);
  if (propia && new RegExp(`\\b${propia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(texto)) return propia;
  return null;
}

/**
 * Saca el envoltorio de chat que el modelo agrega aunque se le pida el prompt
 * pelado: encabezados markdown, comillas, viñetas, "Here's the prompt:".
 *
 * Se le pide "Respondé SOLO el prompt" y devolvió igual "**Prompt:**\nA close-up
 * sequence…" (18/8). Eso viajaba tal cual al modelo de video, que lo lee como
 * parte de la escena. El validador de inglés no lo ve porque el resto del texto
 * sí está en inglés.
 */
export function limpiarPrompt(texto: string): string {
  return texto
    .replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "")
    .replace(/^\s*(?:\*\*|__|#+\s*)?\s*(?:prompt|video prompt|final prompt|escena|scene)\s*(?:\*\*|__)?\s*:?\s*/i, "")
    .replace(/^\s*(?:here(?:'s| is)|aquí (?:está|va)|este es)\b[^:\n]{0,40}:\s*/i, "")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

/** Corta sin partir una palabra al medio: el slice pelado dejaba prompts que
 *  terminaban en "urgency meets professionalism, tog" o "working with tools,
 *  th" (17/8). Lo usan también las placas. */
export function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const ultimo = Math.max(corte.lastIndexOf(" "), corte.lastIndexOf(","), corte.lastIndexOf("."));
  return (ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte).replace(/[\s,]+$/, "");
}

/**
 * Escena genérica pero CONCRETA por rubro, para el fallback.
 *
 * El slug pelado ("automotor-autopartes") no es una escena y el modelo devolvía
 * cualquier cosa. Esto al menos le da un sujeto que existe.
 */
export function escenaDeRubro(rubro: string | null): string {
  const r = (rubro ?? "").toLowerCase();
  if (/automotor|autoparte|taller/.test(r)) return "a clean auto service workshop counter with tools in soft focus";
  if (/inmobiliaria|construc/.test(r)) return "a bright modern apartment interior with large windows";
  if (/gastronom|restaur|aliment/.test(r)) return "a freshly plated dish on a wooden table";
  if (/salud|medic|estetic/.test(r)) return "a calm modern clinic room with soft daylight";
  if (/indumentaria|moda|textil/.test(r)) return "folded garments on a minimal retail display";
  if (/entretenimiento|evento/.test(r)) return "a festive outdoor event setup at golden hour";
  return "a clean minimal product display on a neutral surface";
}

/**
 * El prompt DEBE salir en inglés: los modelos de video rinden mucho peor con
 * español y peor todavía con spanglish. MiniMax ignoró la instrucción en una de
 * dos corridas de prueba y devolvió "cabinets de mangera lisa" (12/8), así que
 * se valida en vez de confiar. Acentos/ñ o stopwords españolas → se descarta.
 */
export function esIngles(texto: string): boolean {
  if (/[áéíóúñ¿¡]/i.test(texto)) return false;
  const palabras = texto.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (palabras.length < 5) return false;
  // Palabras que en un prompt en inglés no aparecen nunca. Ojo: no van acá las
  // que existen en los dos idiomas ("a", "no", "van", "son", "me").
  const es = new Set(["de", "la", "el", "los", "las", "una", "unos", "unas", "con", "por", "para", "que",
    "del", "al", "los", "sus", "esta", "este", "hacia", "muestra", "sobre", "entre", "desde", "hasta",
    "camara", "lenta", "luz", "natural", "fondo", "plano", "toma", "primer", "donde", "cuando"]);
  const en = new Set(["the", "of", "with", "and", "shot", "camera", "light", "slow", "in", "on", "to",
    "vertical", "cinematic", "lens", "angle", "background", "soft", "warm", "close", "wide"]);
  let ne = 0, ni = 0;
  for (const p of palabras) { if (es.has(p)) ne++; if (en.has(p)) ni++; }
  // Con DOS palabras funcionales españolas ya es spanglish, aunque el andamiaje
  // en inglés sea mayoría: "Cinematic shot of cabinets de mangera lisa con luz
  // natural" tenía 3 en inglés contra 2 en español y pasaba el filtro — que es
  // exactamente el texto que este validador existía para frenar (12/8).
  if (ne >= 2) return false;
  return ni > ne;
}

// ── generación ───────────────────────────────────────────────────────────────

/**
 * Un reel son varias tomas distintas del mismo tema, no la misma repetida. Se
 * le pide al modelo N variantes de cámara/encuadre sobre el prompt base; si el
 * LLM no responde se usan variantes fijas, que igual dan corte y ritmo.
 */
/**
 * Las N tomas del reel, como MOMENTOS distintos de una misma historia.
 *
 * Antes se pegaba una variante de cámara al mismo prompt base y los 3 clips
 * eran la misma escena de tres ángulos: se ve como un error de edición, no como
 * un reel. Un reel real tiene gancho → desarrollo → cierre, y cada corte muestra
 * algo NUEVO. Esto es lo que armaría a mano antes de mandar a generar.
 *
 * Si el modelo no responde, el llamador cae a las variantes de cámara.
 */
export async function tomasDelReel(t: TareaPieza, promptBase: string, cuantos: number): Promise<string[]> {
  const sistema = [
    `Sos director de un reel vertical de ${cuantos} tomas de 8 segundos cada una, que se pegan en ese orden.`,
    "Te dan el prompt de la escena base. Devolvé SOLO un JSON array de exactamente " + cuantos + " strings, uno por toma.",
    "Cada string es un prompt COMPLETO y autónomo en INGLÉS para un modelo de video: sujeto + escenario + luz + movimiento de cámara + estilo.",
    "Las tomas cuentan una progresión: la 1 es el gancho que frena el scroll, las del medio desarrollan, la última cierra.",
    "Cada toma muestra algo DISTINTO — otro momento, otro sujeto o encuadre nuevo. No repitas la misma escena con otro ángulo.",
    "Mantené el mismo lugar, la misma luz y la misma paleta en las tres: tienen que parecer el mismo rodaje.",
    "Máximo 55 palabras por toma. Frases positivas. Sin marcas, logos, texto en pantalla ni personas reales.",
  ].join(" ");
  const salida = await aiNarrative(sistema, `Escena base:\n${promptBase}\n\nPieza: ${t.name}`);
  if (!salida) return [];
  try {
    const limpio = salida.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const arr = JSON.parse(limpio.slice(limpio.indexOf("["), limpio.lastIndexOf("]") + 1)) as unknown[];
    if (!Array.isArray(arr) || arr.length !== cuantos) return [];
    const tomas = arr.map((x) => limpiarPrompt(String(x ?? "")));
    // Si UNA sola toma no pasa los filtros se descarta el set entero: mezclar
    // tomas buenas con el fallback da un reel que salta de estilo a mitad.
    if (tomas.some((p) => p.length < 25 || NON_LATIN_RE.test(p) || !esIngles(p) || marcaEnPrompt(p, "") || fraseNegativa(p))) return [];
    return tomas;
  } catch {
    return [];
  }
}

async function generarClips(
  db: Db,
  t: TareaPieza,
  promptBase: string,
  cuantos: number,
): Promise<Array<{ url: string; jobId?: string }>> {
  // Fallback: encuadres distintos del mismo plano. Da corte y ritmo, pero es lo
  // peor que puede pasar — un reel de verdad son tres MOMENTOS, no tres ángulos.
  const VARIANTES = [
    "wide establishing shot, slow push in",
    "medium shot, gentle tracking move to the right",
    "tight detail shot, shallow depth of field, slow rack focus",
    "low angle shot, slow rise",
  ];
  const tomas = await tomasDelReel(t, promptBase, cuantos);
  // Clips ya pagados de un intento anterior. Un reel son 24 créditos y cuando
  // fallaba el pegado se tiraban los tres y el reintento los volvía a pagar:
  // así se fueron ~444 créditos entre el 14 y el 15/8 sin una sola pieza
  // entregada. Ahora se recuperan.
  const out = await clipsGuardados(db, t.id, MODELO_VIDEO_PLAN);
  if (out.length >= cuantos) {
    console.log(`[higgsfield] reuso ${out.length} clips ya pagados de "${t.name.slice(0, 40)}"`);
    return out.slice(0, cuantos);
  }
  for (let i = out.length; i < cuantos; i++) {
    const prompt = recortar(tomas[i] ?? `${promptBase}. ${VARIANTES[i % VARIANTES.length]}`, 700);
    try {
      // Solo el PRIMER clip arranca del diseño: si todos parten del mismo
      // cuadro, el reel son tres versiones de la misma toma.
      const r = await generarVideo(db, prompt, { imagenUrl: i === 0 ? t.imagenUrl : null });
      out.push({ url: r.url, jobId: r.jobId });
      // Se guarda DESPUÉS DE CADA UNO, no al final: si el proceso muere en el
      // clip 3, los dos primeros ya están pagos y quedan recuperables.
      await guardarClips(db, t, out, MODELO_VIDEO_PLAN).catch(() => { /* el guardado es de más */ });
    } catch (e) {
      if (e instanceof SinCreditos) throw e; // sin saldo no tiene sentido seguir
      console.warn(`[higgsfield] clip ${i + 1}/${cuantos} falló:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** Cuánto vale la pena reusar un clip antes de que Higgsfield le venza la URL. */
const CLIPS_VIGENCIA_MS = 24 * 60 * 60_000;

async function clipsGuardados(db: Db, taskId: string, modelo: string): Promise<Array<{ url: string; jobId?: string }>> {
  try {
    const [fila] = await db.select({ metadata: agentDeliverables.metadata, createdAt: agentDeliverables.createdAt })
      .from(agentDeliverables)
      .where(and(eq(agentDeliverables.kind, "video-clips"), sql`${agentDeliverables.metadata}->>'taskId' = ${taskId}`))
      .orderBy(desc(agentDeliverables.createdAt))
      .limit(1);
    if (!fila?.createdAt || Date.now() - new Date(fila.createdAt).getTime() > CLIPS_VIGENCIA_MS) return [];
    const meta = fila.metadata as { clips?: Array<{ url: string; jobId?: string }>; modelo?: string };
    // Solo se reusan clips del MISMO modelo. Mezclar un clip mudo de
    // veo3_1_lite con dos de Seedance 2.5 que traen audio deja al concat con
    // pistas desparejas: o pierde el audio o falla (18/8).
    if (meta?.modelo !== modelo) return [];
    const clips = meta?.clips;
    return Array.isArray(clips) ? clips.filter((c) => typeof c?.url === "string") : [];
  } catch {
    return [];
  }
}

async function guardarClips(db: Db, t: TareaPieza, clips: Array<{ url: string; jobId?: string }>, modelo: string): Promise<void> {
  if (clips.length === 0) return;
  await db.delete(agentDeliverables)
    .where(and(eq(agentDeliverables.kind, "video-clips"), sql`${agentDeliverables.metadata}->>'taskId' = ${t.id}`));
  await db.insert(agentDeliverables).values({
    companyId: COMPANY_ID,
    kind: "video-clips",
    title: `Clips pagados: ${t.name.slice(0, 120)}`,
    content: clips.map((c) => c.url).join("\n"),
    metadata: { taskId: t.id, clips, modelo },
  });
}

/** Pega los clips con ffmpeg y sube el resultado a un temporal servible.
 *  Devuelve una ruta file:// local que después sube a Drive video-entrega. */
/** Falla si ffmpeg no está, antes de gastar un crédito. Se cachea el resultado
 *  bueno: el binario no aparece ni desaparece mientras vive el contenedor. */
let ffmpegOk = false;
async function verificarFfmpeg(): Promise<void> {
  if (ffmpegOk) return;
  await new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", ["-version"], (e) => {
      if (e) reject(new Error("falta ffmpeg en el contenedor: sin él no se puede pegar el reel. Se cancela antes de gastar créditos."));
      else { ffmpegOk = true; resolve(); }
    });
  });
}

async function pegarClips(urls: string[]): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "lmtm-reel-"));
  const locales: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await fetch(urls[i]);
    if (!r.ok) throw new Error(`no se pudo bajar el clip ${i + 1}`);
    const ruta = join(dir, `clip${i}.mp4`);
    writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
    locales.push(ruta);
  }
  const lista = join(dir, "lista.txt");
  writeFileSync(lista, locales.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const salida = join(dir, "reel.mp4");
  // -c copy no sirve: los clips pueden venir con timestamps distintos y el
  // resultado se corta. Re-encodear 3 clips de 8s es barato.
  //
  // El audio se encodea EXPLÍCITO a AAC. Con veo3_1_lite los clips venían mudos
  // y no importaba; Seedance 2.5 genera audio (18/8), y sin -c:a el demuxer de
  // concat resuelve el códec solo y puede quedarse sin pista de audio o fallar
  // si un clip no la trae.
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", lista,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", salida], { timeout: 10 * 60_000 });
  return pathToFileURL(salida).href;
}

/**
 * Sube las placas a <cliente>/PLACAS, deja el link de la PRIMERA en la columna
 * "Imagen o Video" del Cronopost y comenta las demás en ClickUp con el texto
 * que va sobre cada una (el modelo no escribe el texto: lo pone diseño).
 */
async function entregarPlacas(
  db: Db,
  input: {
    cliente: { id: string; name: string };
    tarea: TareaPieza;
    taskId: string;
    placas: Array<{ url: string; slide: number; prompt: string; texto: string }>;
    plan: { formato: string; piezas: number };
    forzar?: boolean;
  },
): Promise<ResultadoVideo> {
  const { cliente, tarea, taskId, placas, plan, forzar } = input;
  const { subirDesdeUrl } = await import("./contenido-drive.js");
  const { escribirEnlacePublicacion } = await import("./video-entrega.js");

  const limpio = tarea.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 70);
  const sello = new Date().toISOString().slice(0, 10);
  const subidas: Array<{ link: string; slide: number; texto: string }> = [];
  for (const p of placas) {
    try {
      const nombre = placas.length > 1
        ? `${limpio} — slide ${p.slide} — ${sello}.png`
        : `${limpio} — ${sello}.png`;
      const r = await subirDesdeUrl(db, {
        clientId: cliente.id, clienteNombre: cliente.name,
        url: p.url, nombreArchivo: nombre, destino: "placas",
      });
      subidas.push({ link: r.link, slide: p.slide, texto: p.texto });
    } catch (e) {
      console.warn(`[higgsfield] no se pudo subir la placa ${p.slide}:`, e instanceof Error ? e.message : e);
    }
  }

  // El link de la PRIMERA placa va al campo "Enlace de publicacion" de la tarea
  // (antes iba al Cronopost). En un carrusel las demás quedan en el comentario:
  // el campo es de una sola línea y el equipo necesita la portada, que es la que
  // define si la pieza va o no.
  const primera = subidas[0]?.link ?? placas[0].url;
  const enlace = await escribirEnlacePublicacion(taskId, primera, { pisar: !!forzar });
  const sheetMsg = enlace.ok
    ? `🔗 Cargado en el campo "Enlace de publicacion" de esta tarea — solo falta ponerle la fecha.`
    : `⚠️ No se cargó el "Enlace de publicacion": ${enlace.motivo ?? "motivo desconocido"}. Hay que pegarlo a mano.`;

  await db.insert(agentDeliverables).values({
    companyId: COMPANY_ID,
    clientId: cliente.id,
    kind: "placa",
    title: `${plan.formato === "carrusel" ? "Carrusel" : "Placa"}: ${tarea.name}`.slice(0, 200),
    content: placas.map((p) => `SLIDE ${p.slide}: ${p.texto || "(sin texto)"}\n${p.prompt}`).join("\n\n"),
    url: primera,
    metadata: {
      taskId, formato: plan.formato, piezas: placas.length,
      links: subidas.map((s) => s.link), taskUrl: tarea.url,
    },
  });

  // Mirar la pieza antes de que la aprueben. Hasta acá nadie la veía: el
  // pipeline valida el TEXTO del entregable y la pieza es una imagen, así que
  // un render deforme o —lo caro— una referencia de marca de OTRO cliente
  // llegaba al equipo sin una sola señal. No bloquea la entrega: el comentario
  // aparece justo donde se decide si la pieza va, que es el momento útil.
  const revision = await revisarPlacas(db, cliente, placas);

  const lineas = [
    plan.formato === "carrusel"
      ? `🎨 Carrusel generado — ${subidas.length} placa(s) en la carpeta PLACAS del cliente`
      : `🎨 Placa generada — en la carpeta PLACAS del cliente`,
    "",
    ...revision,
    ...subidas.map((s) => `• Slide ${s.slide}: ${s.link}${s.texto ? `\n   Texto que va encima: "${s.texto}"` : ""}`),
    "",
    sheetMsg,
    "",
    "Las imágenes salen SIN texto a propósito: los modelos escriben con faltas. El texto de cada placa está acá arriba para que diseño lo monte.",
    `Si no sirven, borrá la etiqueta "${TAG_LISTO}" y volvé a poner "${TAG_PEDIDO}".`,
  ];
  try {
    await cu(`/task/${encodeURIComponent(taskId)}/comment`, {
      method: "POST", body: { comment_text: lineas.join("\n"), notify_all: false },
    });
  } catch (e) {
    console.warn("[higgsfield] no se pudo comentar las placas:", e instanceof Error ? e.message : e);
  }

  return { ok: true, taskId, url: primera, prompt: placas[0].prompt };
}

export interface ResultadoVideo {
  ok: boolean;
  taskId: string;
  url?: string;
  jobId?: string;
  prompt?: string;
  error?: string;
}

/** Genera el video de UNA pieza y deja el link como comentario en ClickUp. */
/**
 * Qué se le pediría a Higgsfield para esta pieza, SIN generar ni pagar.
 *
 * Es la única forma de revisar la calidad de los prompts sin quemar créditos:
 * cada prueba real cuesta 8 créditos el clip y 24 el reel.
 */
export async function previsualizarPieza(
  db: Db,
  input: { clientId: string; taskId: string },
): Promise<{
  taskId: string; titulo: string; tipo: string | null; formato: string; piezas: number;
  copy: string | null; producto: string | null; conImagenBase: boolean;
  prompt?: string; tomas?: string[]; modelo?: string; slides?: Array<{ slide: number; texto: string; prompt: string; modelo: string }>;
  referencias?: number; error?: string;
}> {
  const { clientId, taskId } = input;
  const [cliente] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!cliente) return { taskId, titulo: "", tipo: null, formato: "?", piezas: 0, copy: null, producto: null, conImagenBase: false, error: "cliente no encontrado" };

  const tarea = aTarea(await cu<any>(`/task/${encodeURIComponent(taskId)}`));
  const plan = planDe(tarea.tipo, `${tarea.name} ${tarea.copy ?? ""}`);
  const base = {
    taskId, titulo: tarea.name, tipo: tarea.tipo, formato: plan.formato, piezas: plan.piezas,
    copy: tarea.copy, producto: tarea.producto, conImagenBase: !!tarea.imagenUrl,
  };
  if (plan.formato === "ninguno") return { ...base, error: "ese Tipo de Contenido no genera nada" };

  if (plan.formato === "placa" || plan.formato === "carrusel") {
    const { previsualizarPlacas } = await import("./contenido-imagenes.js");
    const p = await previsualizarPlacas(db, {
      clientId, clienteNombre: cliente.name, rubro: cliente.industry ?? null,
      tituloPieza: tarea.name, copy: tarea.copy, producto: tarea.producto, cantidad: plan.piezas,
    });
    return { ...base, piezas: p.slides.length, slides: p.slides, referencias: p.referencias };
  }
  const prompt = await armarPrompt(tarea, cliente.name, cliente.industry ?? null);
  // Un reel se genera como N tomas distintas, no como un prompt: sin esto la
  // previsualización mostraba solo la escena base y las tomas reales —lo que se
  // paga— quedaban sin poder revisarse antes de gastar.
  const tomas = plan.formato === "reel" ? await tomasDelReel(tarea, prompt, plan.piezas) : [];
  return { ...base, prompt, tomas: tomas.length ? tomas : undefined, modelo: MODELO_VIDEO_PLAN };
}

export async function generarVideoDePieza(
  db: Db,
  input: { clientId: string; taskId: string; forzar?: boolean },
): Promise<ResultadoVideo> {
  const { clientId, taskId } = input;
  const [cliente] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!cliente) return { ok: false, taskId, error: "cliente no encontrado" };

  // Dedupe: si ya se generó para esta tarea, no se vuelve a pagar.
  if (!input.forzar) {
    const [ya] = await db.select({ id: agentDeliverables.id, url: agentDeliverables.url })
      .from(agentDeliverables)
      .where(and(eq(agentDeliverables.kind, "video"), sql`${agentDeliverables.metadata}->>'taskId' = ${taskId}`))
      .limit(1);
    if (ya) return { ok: true, taskId, url: ya.url ?? undefined, error: "ya existía (no se regeneró)" };
  }

  const cuenta = await estadoCuenta(db);
  if (!cuenta.ok) return { ok: false, taskId, error: `Higgsfield no puede generar: ${cuenta.motivo}` };

  const raw = await cu<any>(`/task/${encodeURIComponent(taskId)}`);
  const tarea = aTarea(raw);
  if (!input.forzar && (tarea.tags.includes(TAG_LISTO) || TAGS_LISTO_LEGACY.some((x) => tarea.tags.includes(x)))) {
    return { ok: true, taskId, error: "ya tenía contenido generado (no se regeneró)" };
  }

  // RESERVA antes de gastar: el barrido corre cada 10 min y el botón del panel
  // puede caer justo encima. En la prueba del 12/8 los dos arrancaron a la vez
  // y pagamos el mismo video dos veces — el dedupe por deliverable no alcanza
  // porque ninguno insertó todavía. La etiqueta se pone PRIMERO y se saca si
  // la generación falla.
  let reservada = false;
  try {
    await cu(`/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(TAG_LISTO)}`, { method: "POST" });
    reservada = true;
  } catch { /* si el space no deja crear la etiqueta seguimos: el riesgo es solo el doble gasto */ }
  const soltarReserva = async () => {
    if (!reservada) return;
    try { await cu(`/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(TAG_LISTO)}`, { method: "DELETE" }); } catch { /* nada */ }
  };

  // QUÉ generar lo decide el campo "Tipo de Contenido" (decisión del usuario
  // 14/8), no la etiqueta. Así el equipo pone una sola etiqueta y el sistema
  // no genera un video para un "Post" ni una placa para un "Reel".
  const plan = planDe(tarea.tipo, `${tarea.name} ${tarea.copy ?? ""}`);
  if (plan.formato === "ninguno") {
    await soltarReserva();
    return { ok: false, taskId, error: `Tipo de Contenido "${tarea.tipo}" no genera nada (es un vivo). Sacale la etiqueta.` };
  }
  if (plan.formato === "placa" || plan.formato === "carrusel") {
    const { generarPlacas } = await import("./contenido-imagenes.js");
    let placas: Array<{ url: string; slide: number; prompt: string; texto: string }> = [];
    try {
      placas = await generarPlacas(db, {
        clientId, clienteNombre: cliente.name, rubro: cliente.industry ?? null,
        tituloPieza: tarea.name, copy: tarea.copy, producto: tarea.producto,
        cantidad: plan.piezas,
      });
    } catch (e) {
      await soltarReserva();
      return { ok: false, taskId, error: `las placas fallaron: ${(e instanceof Error ? e.message : String(e)).slice(0, 250)}` };
    }
    if (placas.length === 0) {
      await soltarReserva();
      return { ok: false, taskId, error: "ninguna placa salió bien" };
    }
    return entregarPlacas(db, { cliente, tarea, taskId, placas, plan, forzar: !!input.forzar });
  }

  const prompt = await armarPrompt(tarea, cliente.name, cliente.industry ?? null);

  let url: string | undefined;
  let jobId: string | undefined;
  /** De qué bolsa salieron los créditos: "plan" o "api". */
  let via: string | undefined;
  try {
    if (plan.formato === "reel") {
      // Higgsfield no arma reels: shorts_studio solo reestiliza un video que ya
      // existe. Un reel son N clips generados por separado y pegados con ffmpeg.
      //
      // Se chequea ffmpeg ANTES de generar. Cuando faltó (se me cayó del
      // Dockerfile el 15/8) cada intento pagaba 3 clips y recién ahí moría en el
      // concat: 8 créditos por clip que no se recuperan y un reintento que
      // vuelve a pagarlos. Así falla en 20ms y con 0 créditos gastados.
      if (plan.piezas > 1) await verificarFfmpeg();
      const clips = await generarClips(db, tarea, prompt, plan.piezas);
      if (clips.length === 0) throw new Error("ningún clip salió bien");
      jobId = clips[0].jobId;
      url = clips.length === 1 ? clips[0].url : await pegarClips(clips.map((c) => c.url));
    } else {
      // Si el diseño ya subió la pieza, se usa como primer cuadro: el video
      // sale con la identidad real de la marca y no una escena inventada.
      const r = await generarVideo(db, prompt, { imagenUrl: tarea.imagenUrl });
      url = r.url;
      jobId = r.jobId;
      via = r.via;
    }
  } catch (e) {
    await soltarReserva();
    return { ok: false, taskId, error: `Higgsfield falló: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` };
  }

  // Entrega: el archivo a <cliente>/VIDEOS en Drive y el link a la columna
  // "Imagen o Video" del Cronopost. Best-effort: si falla, el video igual
  // existe y el comentario de ClickUp lo dice.
  const entrega = await entregarVideo(db, {
    clientId, clienteNombre: cliente.name, nombrePieza: tarea.name, videoUrl: url,
    taskId, copy: tarea.copy, tipo: tarea.tipo, pisar: !!input.forzar,
  }).catch((e) => ({ driveError: (e instanceof Error ? e.message : String(e)).slice(0, 200) } as EntregaResultado));

  // El reel salió: los clips guardados dejan de ser un rescate y pasarían a ser
  // un estorbo — si mañana el equipo pide regenerar porque no gustó, tiene que
  // generar tomas nuevas, no devolver las mismas.
  await db.delete(agentDeliverables)
    .where(and(eq(agentDeliverables.kind, "video-clips"), sql`${agentDeliverables.metadata}->>'taskId' = ${taskId}`))
    .catch(() => { /* limpieza best-effort */ });

  await db.insert(agentDeliverables).values({
    companyId: COMPANY_ID,
    clientId,
    kind: "video",
    title: `Video: ${tarea.name}`.slice(0, 200),
    content: prompt,
    url: entrega.driveLink ?? url,
    metadata: {
      taskId, jobId, via, conImagenBase: !!tarea.imagenUrl, taskUrl: tarea.url,
      higgsfieldUrl: url, driveLink: entrega.driveLink ?? null,
      enlacePublicacion: entrega.enlace?.ok ? entrega.enlace.valor : null,
      entregaErrores: [entrega.driveError, entrega.enlace?.ok ? null : entrega.enlace?.motivo].filter(Boolean),
    },
  });

  // El equipo vive en ClickUp: el link va a la tarea, no al panel.
  const lineas = [`🎬 Video generado con Higgsfield`];
  if (entrega.driveLink) lineas.push(`📁 En Drive (carpeta VIDEOS del cliente): ${entrega.driveLink}`);
  else lineas.push(`⚠️ No se pudo subir a Drive (${entrega.driveError ?? "motivo desconocido"}). Link directo: ${url}`);
  if (entrega.enlace?.ok) lineas.push(`🔗 Cargado en el campo "Enlace de publicacion" de esta tarea — solo falta ponerle la fecha.`);
  else lineas.push(`⚠️ No se cargó el "Enlace de publicacion": ${entrega.enlace?.motivo ?? "motivo desconocido"}. Hay que pegarlo a mano.`);
  lineas.push("", `Prompt usado: ${prompt}`, "",
    `Revisalo antes de publicar. Si no sirve, borrá la etiqueta "${TAG_LISTO}" y volvé a poner "${TAG_PEDIDO}" para regenerarlo.`);
  try {
    await cu(`/task/${encodeURIComponent(taskId)}/comment`, {
      method: "POST",
      body: { comment_text: lineas.join("\n"), notify_all: false },
    });
  } catch (e) {
    console.warn("[higgsfield] no se pudo comentar en ClickUp:", e instanceof Error ? e.message : e);
  }

  return { ok: true, taskId, url: entrega.driveLink ?? url, jobId, prompt };
}

/** Barrido: procesa las piezas etiquetadas, hasta el tope por corrida. */
export async function barrerPendientes(db: Db): Promise<{ vistas: number; generadas: number; errores: string[] }> {
  const errores: string[] = [];
  const pend = await piezasPendientes(db, true);
  if (pend.length === 0) return { vistas: 0, generadas: 0, errores };

  const cuenta = await estadoCuenta(db);
  if (!cuenta.ok) {
    // Si no se corta acá, cada pieza de la cola falla una por una y nadie se
    // entera de la causa real.
    console.error(`[higgsfield] ${pend.length} pieza(s) esperando pero no se puede generar: ${cuenta.motivo}`);
    return { vistas: pend.length, generadas: 0, errores: [cuenta.motivo ?? "no se puede generar"] };
  }

  let generadas = 0;
  for (const p of pend.slice(0, TOPE_POR_BARRIDO)) {
    const r = await generarVideoDePieza(db, { clientId: p.clientId, taskId: p.tarea.id });
    if (r.ok && r.url) generadas++;
    else if (r.error) errores.push(`${p.clientName} — ${p.tarea.name}: ${r.error}`);
  }
  if (pend.length > TOPE_POR_BARRIDO) {
    console.log(`[higgsfield] quedan ${pend.length - TOPE_POR_BARRIDO} piezas para la próxima corrida (tope ${TOPE_POR_BARRIDO}).`);
  }
  return { vistas: pend.length, generadas, errores };
}

/** Barrido cada 10 minutos. No arranca si no hay credenciales cargadas. */
export function initVideoHiggsfield(db: Db): void {
  // El plan necesita sus credenciales materializadas en el volumen; el API no
  // necesita nada más que las variables.
  const conPlan = hayPlan() && prepararCredenciales();
  if (!conPlan && !hayApi()) {
    console.log("[higgsfield] sin plan ni credenciales de API — generación de contenido deshabilitada.");
    return;
  }
  console.log(`[higgsfield] vías disponibles: ${[conPlan && "plan", hayApi() && "API"].filter(Boolean).join(" + ")}`);
  const tick = async () => {
    try {
      const r = await barrerPendientes(db);
      if (r.generadas > 0 || r.errores.length > 0) {
        console.log(`[higgsfield] barrido: ${r.generadas}/${r.vistas} generadas${r.errores.length ? ` · errores: ${r.errores.join(" | ").slice(0, 400)}` : ""}`);
      }
    } catch (e) {
      console.warn("[higgsfield] barrido falló:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, 90_000).unref?.();
  setInterval(tick, 10 * 60_000).unref?.();
  console.log(`[higgsfield] generación de contenido activa (etiqueta ClickUp: "${TAG_PEDIDO}").`);
}

/** Cuántas placas de un carrusel se miran. Un carrusel puede tener 10 y cada
 *  mirada es una llamada al modelo de visión: con las 4 primeras ya se detecta
 *  un problema de estilo o una marca ajena, que es lo que se busca acá. */
export const MAX_PLACAS_A_MIRAR = 4;

/**
 * Pasa las placas por el verificador visual y devuelve las líneas para el
 * comentario de ClickUp. Devuelve [] cuando no hay nada que decir: un
 * comentario que dice "revisado, todo bien" en cada pieza se vuelve ruido y a
 * la semana nadie lo lee.
 */
async function revisarPlacas(
  db: Db,
  cliente: { id: string; name: string },
  placas: Array<{ url: string; slide: number }>,
): Promise<string[]> {
  try {
    const { verificarImagen } = await import("./entrega-checks.js");
    const otros = (await db.select({ name: clients.name }).from(clients).where(eq(clients.status, "active")))
      .map((c) => c.name)
      .filter((n) => n !== cliente.name);

    const hallazgos: string[] = [];
    let sinVerificar = 0;
    for (const p of placas.slice(0, MAX_PLACAS_A_MIRAR)) {
      const r = await verificarImagen(p.url, {
        nombreCliente: cliente.name,
        otrosClientes: otros,
        // Las placas salen sin texto a propósito; sin esto el verificador
        // reporta "no tiene texto ni logo" en todas.
        sinTextoEsperado: true,
      });
      if (r.sinVerificar) { sinVerificar += 1; continue; }
      for (const problema of r.problemas) hallazgos.push(`• Slide ${p.slide}: ${problema}`);
    }

    if (hallazgos.length > 0) {
      return ["⚠️ *Revisión visual — mirar antes de aprobar:*", ...hallazgos, ""];
    }
    // Que no se haya podido mirar SÍ se dice. Callarlo deja al equipo creyendo
    // que la pieza pasó un control que nunca corrió.
    if (sinVerificar > 0) {
      return [`_(No se pudo revisar visualmente ${sinVerificar} placa(s): el modelo de visión no respondió.)_`, ""];
    }
    return [];
  } catch (e) {
    console.warn("[higgsfield] revisión visual falló:", e instanceof Error ? e.message : e);
    return [];
  }
}
