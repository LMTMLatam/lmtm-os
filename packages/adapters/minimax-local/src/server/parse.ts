// LMTM-OS: minimax_local output parsing.
// MiniMax's chat-completion v2 endpoint returns choices[0].message with
// optional `content`, `reasoning_content`, and `tool_calls`. The parse
// helpers here normalize those into the shapes Paperclip's transcript
// engine expects.

export interface ParsedMinimaxMessage {
  role: "assistant";
  content: string;
  reasoningContent?: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  finishReason?: string;
}

export interface ParsedMinimaxCompletion {
  message: ParsedMinimaxMessage;
  raw: Record<string, unknown>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asToolCalls(value: unknown): ParsedMinimaxMessage["toolCalls"] {
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<ParsedMinimaxMessage["toolCalls"]> = [];
  for (const call of value) {
    if (typeof call !== "object" || call === null) continue;
    const c = call as Record<string, unknown>;
    const fn = c.function;
    if (typeof fn !== "object" || fn === null) continue;
    const f = fn as Record<string, unknown>;
    const name = asString(f.name);
    if (!name) continue;
    out.push({
      id: asString(c.id) ?? `call_${out.length}`,
      type: "function",
      function: {
        name,
        arguments: asString(f.arguments) ?? "{}",
      },
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Saca el bloque `<think>` del content y lo devuelve aparte.
 *
 * POR QUE EXISTE
 * La API tiene un campo propio para el razonamiento (`reasoning_content`), pero
 * MiniMax-M3 lo escribe ADEMAS dentro de `content`, en ingles, en 3 de 3 casos
 * medidos el 5/10/26. Sin esto, el monologo interno del modelo viaja al
 * transcript y de ahi a lo que el agente entrega: un copy de Instagram salia
 * precedido de "The user is asking me to write Instagram post copy for a tire
 * shop (gomeria) in Cordoba...".
 *
 * Se trata como el sanitizador de argumentos de tool que ya vive en execute.ts:
 * el modelo manda algo mal formado y el adapter lo normaliza una sola vez, en
 * el borde, para los 14 agentes y para cualquier modelo de la familia.
 */
export function splitThinkBlock(content: string): { content: string; think?: string } {
  if (!content.includes("<think")) return { content };

  const pensado: string[] = [];
  // Cierre opcional a proposito: si la respuesta se corta por max_tokens, el
  // `</think>` nunca llega y el content queda siendo PURO razonamiento. Dejarlo
  // pasar en ese caso es el peor de los dos errores.
  let limpio = content.replace(/<think>([\s\S]*?)(?:<\/think>|$)/gi, (_m, dentro: string) => {
    pensado.push(String(dentro).trim());
    return "";
  });
  limpio = limpio.replace(/^\s*<\/think>/i, "").trim();

  const think = pensado.filter(Boolean).join("\n\n");
  return think ? { content: limpio, think } : { content: limpio };
}

export function parseMinimaxCompletion(raw: unknown): ParsedMinimaxCompletion {
  const data = (raw ?? {}) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (firstChoice.message ?? {}) as Record<string, unknown>;
  // El `<think>` embebido se saca del content ANTES de armar el mensaje, y se
  // junta con el reasoning que el modelo manda por su canal propio.
  const { content, think } = splitThinkBlock(asString(message.content) ?? "");
  const reasoning = [asString(message.reasoning_content), think].filter(Boolean).join("\n\n") || undefined;
  const toolCalls = asToolCalls(message.tool_calls);
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  return {
    message: {
      role: "assistant",
      content,
      ...(reasoning ? { reasoningContent: reasoning } : {}),
      ...(toolCalls ? { toolCalls } : {}),
      finishReason: asString(firstChoice.finish_reason) ?? undefined,
    },
    raw: data,
    usage: {
      promptTokens: asNumber(usage.prompt_tokens),
      completionTokens: asNumber(usage.completion_tokens),
      totalTokens: asNumber(usage.total_tokens),
    },
  };
}

export function describeMinimaxFailure(raw: unknown): string {
  const data = (raw ?? {}) as Record<string, unknown>;
  const baseResp = (data.base_resp ?? {}) as Record<string, unknown>;
  const statusCode = asNumber(baseResp.status_code);
  const statusMsg = asString(baseResp.status_msg) ?? "unknown";
  if (statusCode !== 0) {
    return `MiniMax rejected request (status_code=${statusCode}): ${statusMsg}`;
  }
  const error = (data.error ?? {}) as Record<string, unknown>;
  const errorMsg = asString(error.message) ?? asString(error.code) ?? "unknown";
  return `MiniMax error: ${errorMsg}`;
}
