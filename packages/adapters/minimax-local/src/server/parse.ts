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

export function parseMinimaxCompletion(raw: unknown): ParsedMinimaxCompletion {
  const data = (raw ?? {}) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (firstChoice.message ?? {}) as Record<string, unknown>;
  const content = asString(message.content) ?? "";
  const reasoning = asString(message.reasoning_content) ?? undefined;
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
