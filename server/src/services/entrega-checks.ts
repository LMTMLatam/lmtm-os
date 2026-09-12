// LMTM-OS: checks deterministas + gates binarios para entregables (curso
// "reliable agents" 26/7 — patrón "import check": un test barato por modo de
// falla dominante, y el error se devuelve al agente para que se autocorrija).
//
// Checks deterministas (verificarEntrega): URLs muertas, caracteres no-latinos
// (regla español-only de la flota) y mención de OTRO cliente (contaminación
// cruzada de cuentas, el riesgo más caro en una agencia).
//
// Gate binario (gateBinario): juez LLM barato con respuesta sí/no — nunca
// escalas 1-5 (regla explícita del curso: menos varianza, comparable en el
// tiempo).

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { llmExtract } from "./client-tasks.js";

export const NON_LATIN_RE = /[Ѐ-ӿ　-ヿ一-鿿가-힯]/;

const URL_RE = /https?:\/\/[^\s)\]"'<>]+/g;

async function urlViva(url: string): Promise<boolean> {
  const probe = async (method: "HEAD" | "GET") => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(url, { method, redirect: "follow", signal: ctl.signal });
      return r.status < 400 || r.status === 403 || r.status === 429; // bloqueos anti-bot no son "link roto"
    } finally {
      clearTimeout(t);
    }
  };
  try {
    if (await probe("HEAD")) return true;
    return await probe("GET");
  } catch {
    try {
      return await probe("GET");
    } catch {
      return false;
    }
  }
}

/** Nombres de clientes "chequeables" (largos o de 2+ palabras; los cortos dan falsos positivos). */
async function nombresClientes(db: Db): Promise<Array<{ id: string; name: string }>> {
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active")).limit(200);
  return rows.filter((r) => r.name.length >= 6 || r.name.trim().includes(" "));
}

export interface ResultadoChecks {
  ok: boolean;
  problemas: string[];
}

/**
 * Checks deterministas sobre un texto que va a un entregable/cliente.
 * Devuelve la lista de problemas para que el AGENTE los corrija (no los
 * corrige solo — el patrón del curso es realimentar el error).
 */
export async function verificarEntrega(
  db: Db,
  texto: string,
  opts: { clientId?: string | null } = {},
): Promise<ResultadoChecks> {
  const problemas: string[] = [];

  if (NON_LATIN_RE.test(texto)) {
    const muestra = texto.match(new RegExp(`.{0,15}${NON_LATIN_RE.source}+.{0,15}`))?.[0] ?? "";
    problemas.push(`Contiene caracteres no latinos (chino/cirílico/etc.): "…${muestra}…". Reescribí esas palabras en español.`);
  }

  const urls = [...new Set(texto.match(URL_RE) ?? [])].slice(0, 6);
  for (const url of urls) {
    const clean = url.replace(/[.,;:!?]+$/, "");
    if (!(await urlViva(clean))) problemas.push(`El link ${clean} no responde (roto o inexistente). Verificalo o sacalo.`);
  }

  if (opts.clientId) {
    const nombres = await nombresClientes(db).catch(() => []);
    const lower = texto.toLowerCase();
    for (const n of nombres) {
      if (n.id === opts.clientId) continue;
      const needle = n.name.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;
      const before = idx === 0 ? " " : lower[idx - 1];
      const after = lower[idx + needle.length] ?? " ";
      if (/[a-z0-9á-ú]/.test(before) || /[a-z0-9á-ú]/.test(after)) continue; // parte de otra palabra
      problemas.push(`Menciona a OTRO cliente de la agencia ("${n.name}") — verificá que no estés mezclando cuentas.`);
      break;
    }
  }

  return { ok: problemas.length === 0, problemas };
}

/** Quita caracteres no latinos y links muertos de un texto de pipeline (donde no hay agente al que devolverle el error). */
export async function sanearTextoPipeline(texto: string): Promise<string> {
  let out = texto.replace(new RegExp(NON_LATIN_RE.source, "g"), "");
  const urls = [...new Set(out.match(URL_RE) ?? [])].slice(0, 6);
  for (const url of urls) {
    const clean = url.replace(/[.,;:!?]+$/, "");
    if (!(await urlViva(clean))) out = out.split(url).join("(link removido: no responde)");
  }
  return out;
}

export interface Veredicto {
  ok: boolean;
  motivo: string;
}

/**
 * Gate binario post-generación: un juez LLM chico responde sí/no a UN criterio.
 * `contexto` son los datos fuente contra los que se juzga (para grounding).
 */
export async function gateBinario(args: { criterio: string; contenido: string; contexto?: string }): Promise<Veredicto> {
  const system =
    "Sos un verificador estricto de una agencia de marketing. Evaluás UN criterio sobre un contenido y respondés " +
    'ÚNICAMENTE con JSON: {"ok": true|false, "motivo": "1 frase concreta si ok=false, vacío si ok=true"}. ' +
    "Sin escalas ni matices: sí o no. Si dudás, ok=false con el motivo.";
  const user = [
    `CRITERIO: ${args.criterio}`,
    args.contexto ? `\nDATOS FUENTE:\n${args.contexto.slice(0, 6000)}` : "",
    `\nCONTENIDO A EVALUAR:\n${args.contenido.slice(0, 6000)}`,
  ].join("\n");
  const raw = await llmExtract(system, user);
  if (!raw) return { ok: true, motivo: "" }; // sin juez disponible, no bloquear
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: true, motivo: "" };
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as { ok?: unknown; motivo?: unknown };
    return { ok: o.ok !== false, motivo: typeof o.motivo === "string" ? o.motivo.slice(0, 300) : "" };
  } catch {
    return { ok: true, motivo: "" };
  }
}

// ── Check visual: mirar la placa antes de que salga ────────────────────────
//
// Todo lo de arriba lee TEXTO. La pieza que ve el cliente es una imagen, y
// hasta ahora nadie la miraba: una placa con el logo de otro cliente, con el
// texto cortado o con un render fallado pasaba todos los checks. Es el mismo
// riesgo de contaminación entre cuentas que ya cubre el check de texto — el más
// caro de una agencia — pero en el soporte donde de verdad se ve.
//
// kimi-k3 es lo único de la flota que puede mirar una imagen.

export interface ChecksImagen extends ResultadoChecks {
  /** true = no se pudo mirar la imagen. NO es lo mismo que "está bien": si el
   *  modelo no contestó, decir que no hay problemas es mentir en verde. */
  sinVerificar: boolean;
  /** Lo que el modelo dijo que ve, para que quede en el issue. */
  descripcion?: string;
}

/**
 * Mira una placa/creatividad antes de entregarla.
 *
 * `nombreCliente` y `otrosClientes` se pasan explícitos para que el modelo pueda
 * detectar la marca equivocada: sin la lista, "veo un logo" no dice nada.
 */
export async function verificarImagen(
  imagenUrl: string,
  opts: {
    nombreCliente?: string;
    otrosClientes?: string[];
    /** Las placas del pipeline salen SIN texto A PROPÓSITO: los modelos
     *  escriben con faltas y el texto lo monta diseño después. Sin avisarle,
     *  el verificador marca "no tiene texto ni logo" como problema en TODAS —
     *  medido el 11/9/26 en la primera prueba contra una placa real. */
    sinTextoEsperado?: boolean;
  } = {},
): Promise<ChecksImagen> {
  const { verImagen, nvidiaConfigurado } = await import("./nvidia-modelos.js");
  if (!nvidiaConfigurado()) {
    return { ok: true, problemas: [], sinVerificar: true };
  }

  const otros = (opts.otrosClientes ?? []).filter((n) => n && n !== opts.nombreCliente).slice(0, 40);
  const instruccion = [
    "Sos el control de calidad de una agencia de marketing. Mirá la imagen y respondé ÚNICAMENTE con JSON:",
    '{"descripcion":"qué se ve, 1 frase","legible":true|false,"marcaAjena":null|"nombre","idiomaTextoOk":true|false,"problemas":["..."]}',
    "",
    `La pieza es del cliente: ${opts.nombreCliente ?? "(sin especificar)"}.`,
    otros.length ? `Otros clientes de la agencia, NO deben aparecer: ${otros.join(", ")}.` : "",
    opts.sinTextoEsperado
      ? "IMPORTANTE: esta pieza va SIN texto y SIN logo a propósito — el texto lo monta diseño después. Que no tenga texto ni marca NO es un problema y no lo reportes. Evaluá solo la imagen."
      : "",
    "",
    opts.sinTextoEsperado
      ? "legible=false SOLO si el render falló: manos o cuerpos deformes, objetos derretidos, artefactos, imagen rota."
      : "legible=false si el texto está cortado, encimado, ilegible o el render falló.",
    "marcaAjena = el nombre si ves el logo o el nombre de otro cliente de la lista; null si no.",
    opts.sinTextoEsperado
      ? "idiomaTextoOk=true siempre (no se espera texto)."
      : "idiomaTextoOk=false si el texto visible NO está en español.",
    "problemas = una frase por cada cosa concreta a corregir. Vacío si está todo bien.",
  ].filter(Boolean).join("\n");

  const r = await verImagen(instruccion, imagenUrl);
  if (!r.texto) {
    console.warn(`[entrega-checks] no se pudo mirar la imagen (${r.motivo}): ${r.detalle ?? ""}`);
    return { ok: true, problemas: [], sinVerificar: true };
  }

  const parsed = parsearJson(r.texto);
  if (!parsed) return { ok: true, problemas: [], sinVerificar: true, descripcion: r.texto.slice(0, 200) };

  const problemas: string[] = [];
  if (parsed.legible === false) problemas.push("La imagen tiene texto cortado, encimado o ilegible: revisá el render antes de entregarla.");
  if (typeof parsed.marcaAjena === "string" && parsed.marcaAjena.trim()) {
    problemas.push(`La imagen muestra la marca de OTRO cliente ("${parsed.marcaAjena.trim()}"). No se entrega así.`);
  }
  if (parsed.idiomaTextoOk === false) problemas.push("El texto de la imagen no está en español.");
  for (const p of Array.isArray(parsed.problemas) ? parsed.problemas : []) {
    if (typeof p === "string" && p.trim()) problemas.push(p.trim().slice(0, 300));
  }

  return {
    ok: problemas.length === 0,
    problemas: [...new Set(problemas)].slice(0, 8),
    sinVerificar: false,
    descripcion: typeof parsed.descripcion === "string" ? parsed.descripcion.slice(0, 300) : undefined,
  };
}

/** El modelo suele envolver el JSON en prosa o en un bloque de código. */
function parsearJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
