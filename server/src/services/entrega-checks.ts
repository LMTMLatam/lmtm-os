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
