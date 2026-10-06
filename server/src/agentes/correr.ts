// LMTM-OS: corre un trabajo de la cola con el harness de Claude Code como
// librería (Claude Agent SDK), apuntado a MiniMax por ANTHROPIC_BASE_URL.
// Sin API key de Anthropic.
//
// Qué controla el runner y no el prompt:
//  · herramientas: solo las del archivo del rol, y ninguna de las de Claude Code
//    (sin Bash, sin leer archivos, sin web);
//  · identidad: las herramientas actúan como el agente del rol, con su JWT;
//  · topes: turnos y minutos del rol;
//  · registro: cada herramienta usada queda como un paso (qué pidió, qué volvió).

import { existsSync } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { createPaperclipMcpServer } from "@paperclipai/mcp-server";
import { eq } from "drizzle-orm";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { terminar, type Trabajo } from "./cola.js";
import { cargarRol } from "./roles.js";

const SERVIDOR_MCP = "lmtm";

/** Lo que se le pide al modelo que devuelva al final. Igual para todos los roles. */
export const ESQUEMA_RESULTADO = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "Una o dos frases para la persona que decide." },
    causa: { type: "string" },
    verificado: { type: "array", items: { type: "string" }, description: "Hechos con su número, su campaña y su período." },
    supuestos: { type: "array", items: { type: "string" } },
    siguientePaso: {
      type: "object",
      properties: { quien: { type: "string", enum: ["cliente", "equipo", "agente"] }, que: { type: "string" } },
      required: ["quien", "que"],
    },
  },
  required: ["resumen", "verificado", "supuestos"],
} as const;

export interface Paso {
  herramienta: string;
  entrada: unknown;
  salida: string;
  error?: boolean;
}

export interface Corrida {
  pasos: Paso[];
  resultado: Record<string, unknown> | null;
  error: string | null;
  turnos: number | null;
  tokensEntrada: number | null;
  tokensSalida: number | null;
}

const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function textoDe(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (Array.isArray(contenido)) {
    return contenido.map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text) : "")).join("\n");
  }
  return contenido == null ? "" : JSON.stringify(contenido);
}

function parsearJson(s: string): Record<string, unknown> | null {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Puro: de los mensajes del SDK saca los pasos (herramienta por herramienta), el
 * resultado y los consumos. La herramienta interna del resultado estructurado
 * no es un paso.
 */
export function resumirCorrida(mensajes: ReadonlyArray<Record<string, any>>): Corrida {
  const usos = new Map<string, { herramienta: string; entrada: unknown }>();
  const pasos: Paso[] = [];
  let resultado: Record<string, unknown> | null = null;
  let error: string | null = null;
  let turnos: number | null = null;
  let tokensEntrada: number | null = null;
  let tokensSalida: number | null = null;

  for (const m of mensajes) {
    const bloques: any[] = Array.isArray(m.message?.content) ? m.message.content : [];
    if (m.type === "assistant") {
      for (const b of bloques) {
        if (b?.type === "tool_use" && b.name !== "StructuredOutput") {
          usos.set(b.id, { herramienta: String(b.name).replace(`mcp__${SERVIDOR_MCP}__`, ""), entrada: b.input });
        }
      }
    } else if (m.type === "user") {
      for (const b of bloques) {
        const uso = b?.type === "tool_result" ? usos.get(b.tool_use_id) : undefined;
        if (!uso) continue;
        pasos.push({ ...uso, salida: recortar(textoDe(b.content), 2_000), ...(b.is_error ? { error: true } : {}) });
      }
    } else if (m.type === "result") {
      turnos = typeof m.num_turns === "number" ? m.num_turns : null;
      tokensEntrada = m.usage
        ? (m.usage.input_tokens ?? 0) + (m.usage.cache_read_input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0)
        : null;
      tokensSalida = m.usage?.output_tokens ?? null;
      if (m.subtype === "success") {
        const so = m.structured_output;
        resultado = so && typeof so === "object" ? (so as Record<string, unknown>) : parsearJson(String(m.result ?? ""));
        if (!resultado && m.result) resultado = { resumen: recortar(String(m.result), 1_000), verificado: [], supuestos: [] };
      } else {
        error = [m.subtype, ...(Array.isArray(m.errors) ? m.errors : [])].join(": ");
      }
    }
  }
  if (!resultado && !error) error = "El agente terminó sin devolver un resultado.";
  return { pasos, resultado, error, turnos, tokensEntrada, tokensSalida };
}

/**
 * Puro: la compuerta de cada herramienta. Solo las del rol, y escalón N0 aplicado
 * acá y no en el prompt: se le saca `approved` a toda llamada, así una acción de
 * pauta siempre queda como propuesta para una persona, diga lo que diga el
 * modelo. Subir de escalón (N1: ejecutar lo reversible) es cambiar esto, por
 * cliente, con el historial del evaluador en la mano.
 */
export function compuerta(
  rol: string,
  permitidas: ReadonlySet<string>,
  nombre: string,
  input: Record<string, unknown>,
): { behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string } {
  if (nombre === "StructuredOutput") return { behavior: "allow", updatedInput: input };
  if (!permitidas.has(nombre)) return { behavior: "deny", message: `El rol ${rol} no puede usar ${nombre}.` };
  const { approved: _sacado, ...sinAprobar } = input;
  return { behavior: "allow", updatedInput: sinAprobar };
}

/** Puro: el pedido que lee el modelo, armado de la entrada del trabajo. */
export function armarPedido(t: Pick<Trabajo, "entrada">): string {
  const e = t.entrada as {
    procedimiento?: string;
    cliente?: { id: string; nombre: string };
    decision?: { que: string; porque?: { resumen?: string; datos?: Array<{ etiqueta: string; valor: unknown; unidad?: string }> } };
    pedido?: string;
  };
  const lineas: string[] = [];
  if (e.procedimiento) lineas.push(`Procedimiento: ${e.procedimiento}`);
  if (e.cliente) lineas.push(`Cliente: ${e.cliente.nombre} (clientId: ${e.cliente.id})`);
  if (e.decision) {
    lineas.push(`Decisión: ${e.decision.que}`);
    if (e.decision.porque?.resumen) lineas.push(`Contexto: ${e.decision.porque.resumen}`);
    for (const d of e.decision.porque?.datos ?? []) lineas.push(`- ${d.etiqueta}: ${d.valor ?? "sin dato"}${d.unidad ? ` (${d.unidad})` : ""}`);
  }
  if (e.pedido) lineas.push(`Pedido: ${e.pedido}`);
  lineas.push("", "Seguí el procedimiento de tu rol y terminá con el resultado estructurado.");
  return lineas.join("\n");
}

/**
 * El CLI de Claude Code que corre el ciclo. El SDK trae un binario por
 * plataforma, pero en la imagen de Docker no se instala (falló el 06/10:
 * "native binary not found"); la imagen ya tiene el CLI global que usan los
 * agentes de paperclip. En local (sin ese archivo) usa el del SDK.
 */
function binarioClaude(): string | undefined {
  const propio = process.env.LMTM_CLAUDE_BIN?.trim();
  if (propio) return propio;
  return existsSync("/usr/local/bin/claude") ? "/usr/local/bin/claude" : undefined;
}

/** El agente con el que firma el rol. Si no existe, se crea sin reloj (nunca lo despierta paperclip). */
async function agenteDelRol(db: Db, nombre: string): Promise<{ id: string; companyId: string }> {
  const [a] = await db.select({ id: agents.id, companyId: agents.companyId }).from(agents).where(eq(agents.name, nombre)).limit(1);
  if (a) return a;
  const [empresa] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!empresa) throw new Error("no hay empresa");
  const [nuevo] = await db
    .insert(agents)
    .values({
      companyId: empresa.id,
      name: nombre,
      title: "Rol del runner propio",
      adapterType: "process",
      runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: false } },
    })
    .returning({ id: agents.id, companyId: agents.companyId });
  return nuevo;
}

export async function correrTrabajo(db: Db, t: Trabajo, opts: { serverPort: number }): Promise<void> {
  let corrida: Corrida;
  try {
    const rol = cargarRol(t.rol);
    const clave = process.env.MINIMAX_API_KEY?.trim();
    if (!clave) throw new Error("Falta MINIMAX_API_KEY.");
    const agente = await agenteDelRol(db, rol.agente);
    const jwt = createLocalAgentJwt(agente.id, agente.companyId, "lmtm_runner", "");
    if (!jwt) throw new Error("Falta el secreto para firmar la identidad del agente.");

    const { server } = createPaperclipMcpServer(
      { apiUrl: `http://127.0.0.1:${opts.serverPort}/api`, apiKey: jwt, companyId: agente.companyId, agentId: agente.id, runId: null },
      rol.herramientas,
    );
    const permitidas = new Set(rol.herramientas.map((h) => `mcp__${SERVIDOR_MCP}__${h}`));
    const modelo = process.env.LMTM_RUNNER_MODELO?.trim() || "MiniMax-M3";
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), rol.minutos * 60_000);
    const mensajes: Array<Record<string, any>> = [];
    try {
      for await (const m of query({
        prompt: armarPedido(t),
        options: {
          systemPrompt: rol.texto,
          model: modelo,
          tools: [],
          mcpServers: { [SERVIDOR_MCP]: { type: "sdk", name: SERVIDOR_MCP, instance: server } },
          // Sin allowedTools a propósito: así TODA herramienta pasa por la compuerta.
          canUseTool: async (nombre, input) => compuerta(rol.nombre, permitidas, nombre, input),
          maxTurns: rol.turnos,
          outputFormat: { type: "json_schema", schema: ESQUEMA_RESULTADO as unknown as Record<string, unknown> },
          abortController: corte,
          persistSession: false,
          settingSources: [],
          pathToClaudeCodeExecutable: binarioClaude(),
          // Solo lo que el proceso necesita: ni la base ni otras claves del servidor.
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR,
            ANTHROPIC_BASE_URL: process.env.LMTM_RUNNER_BASE_URL?.trim() || "https://api.minimax.io/anthropic",
            ANTHROPIC_AUTH_TOKEN: clave,
            ANTHROPIC_API_KEY: clave,
            ANTHROPIC_MODEL: modelo,
            DISABLE_TELEMETRY: "1",
            DISABLE_AUTOUPDATER: "1",
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
            CLAUDE_AGENT_SDK_CLIENT_APP: "lmtm-runner/1",
          },
        },
      })) {
        mensajes.push(m as Record<string, any>);
      }
    } finally {
      clearTimeout(reloj);
    }
    corrida = resumirCorrida(mensajes);
    if (corte.signal.aborted && !corrida.resultado) corrida.error = `Pasó el tope de ${rol.minutos} minutos.`;
  } catch (e) {
    corrida = { pasos: [], resultado: null, error: e instanceof Error ? e.message : String(e), turnos: null, tokensEntrada: null, tokensSalida: null };
  }
  await terminar(db, t.id, {
    estado: corrida.resultado ? "hecho" : "fallo",
    resultado: corrida.resultado,
    pasos: corrida.pasos as unknown as Array<Record<string, unknown>>,
    error: corrida.error ? corrida.error.slice(0, 2_000) : null,
    turnos: corrida.turnos,
    tokensEntrada: corrida.tokensEntrada,
    tokensSalida: corrida.tokensSalida,
  });
}
