// LMTM-OS: minimax_local execute.
// The core: one HTTP call to MiniMax per agent run. The conversation
// history is re-sent on every call (stateless resume), with the
// PAPERCLIP_API_KEY bearer injected so the agent can call back into
// Paperclip's REST API for tool calls.

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  readPaperclipRuntimeSkillEntries,
  resolvePaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";
import { parseMinimaxCompletion, describeMinimaxFailure } from "./parse.js";
import { resolveApiKey, resolveBaseUrl, resolveModel } from "./models.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

type MiniMaxChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: unknown }
  | { role: "tool"; content: string; tool_call_id: string };

interface SessionShape {
  sessionId: string;
  messages?: MiniMaxChatMessage[];
  summary?: string;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function readSession(ctx: AdapterExecutionContext): SessionShape {
  const params = (ctx.runtime?.sessionParams ?? {}) as Record<string, unknown>;
  const existing = (params.messages ?? []) as MiniMaxChatMessage[];
  const sessionId =
    asString(params.sessionId) ??
    asString(params.session_id) ??
    ctx.runtime?.sessionId ??
    randomUUID();
  return { sessionId, messages: existing };
}

function readTools(ctx: AdapterExecutionContext): unknown[] {
  const ctxAny = ctx.context as Record<string, unknown> | undefined;
  if (!ctxAny) return [];
  const tools = ctxAny.tools;
  if (Array.isArray(tools)) return normalizeTools(tools);
  const toolDefs = ctxAny.toolDefs;
  if (Array.isArray(toolDefs)) return normalizeTools(toolDefs);
  return [];
}

// MiniMax requires every tool to be shaped exactly as
//   { type: "function", function: { name, description, parameters } }
// and rejects the WHOLE request with status_code 2013 ("invalid tool type:")
// if the top-level `type` is missing/empty. The Paperclip runtime hands us
// tools without that wrapper (and sometimes flattened as {name, parameters}),
// so normalize defensively before sending. Without this, every agent run with
// tools fails at the first turn.
function normalizeTools(tools: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const t of tools) {
    if (!t || typeof t !== "object") continue;
    const tool = t as Record<string, unknown>;
    const nested =
      tool.function && typeof tool.function === "object"
        ? (tool.function as Record<string, unknown>)
        : null;
    const name = typeof nested?.name === "string" ? nested.name : typeof tool.name === "string" ? tool.name : null;
    if (!name) continue;
    const src = nested ?? tool;
    const rawParams = src.parameters ?? src.parametersSchema ?? src.inputSchema;
    out.push({
      type: "function",
      function: {
        name,
        description: typeof src.description === "string" ? src.description : "",
        parameters:
          rawParams && typeof rawParams === "object"
            ? rawParams
            : { type: "object", properties: {} },
      },
    });
  }
  return out;
}

function buildUserPrompt(ctx: AdapterExecutionContext, config: Record<string, unknown>): string {
  const override = asString(config.userPrompt) ?? asString(config.prompt);
  if (override) return override;
  // Fall back to the wake payload. The heartbeat service always populates
  // context.paperclipWake with the issue body + comments + plan.
  const ctxAny = ctx.context as Record<string, unknown> | undefined;
  if (!ctxAny) return "Hello.";
  const wake = ctxAny.paperclipWake;
  if (typeof wake === "string") return wake;
  if (wake && typeof wake === "object") {
    return JSON.stringify(wake, null, 2);
  }
  return JSON.stringify(ctx.context ?? {}, null, 2);
}

async function loadDesiredSkillBlocks(config: Record<string, unknown>): Promise<string[]> {
  // Skill discovery: read everything under the adapter's bundled `skills/`
  // tree. Each skill is a directory with a SKILL.md frontmatter file. The
  // Paperclip runtime decides which skills apply to this agent by setting
  // `config.paperclipSkillSync.desiredSkills = ["skill-key-1", ...]`.
  let available;
  try {
    available = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  } catch {
    return [];
  }
  const desired = resolvePaperclipDesiredSkillNames(config, available);
  if (desired.length === 0) return [];

  const wantedByKey = new Map(available.map((entry) => [entry.key, entry]));
  const blocks: string[] = [];
  for (const key of desired) {
    const entry = wantedByKey.get(key);
    if (!entry) continue;
    const file = path.join(entry.source, "SKILL.md");
    const content = await fs.readFile(file, "utf8").catch(() => null);
    if (!content) continue;
    blocks.push(`## Skill: ${entry.runtimeName ?? entry.key}\n\n${content.trim()}`);
  }
  return blocks;
}

function truncateMessages(
  messages: MiniMaxChatMessage[],
  max: number,
): MiniMaxChatMessage[] {
  if (messages.length <= max) return messages;
  // Keep the first system message + the most recent (max-1) messages.
  const sysMsg = messages.find((m) => m.role === "system");
  const tail = messages.slice(-(max - (sysMsg ? 1 : 0)));
  return sysMsg ? [sysMsg, ...tail] : tail;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = (ctx.config ?? {}) as Record<string, unknown>;
  const baseUrl = resolveBaseUrl(asString(config.baseUrl));
  const apiKey = resolveApiKey(asString(config.apiKey));
  const model = resolveModel(asString(config.model));
  const temperature = asNumber(config.temperature, 0.7);
  const maxTokens = asNumber(config.maxTokens, 4096);
  const topP = asNumber(config.topP, 0.95);
  const timeoutMs = asNumber(config.timeoutMs, 90_000);
  const maxMessages = asNumber(config.maxConversationMessages, 50);

  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "minimax_missing_api_key",
      errorMessage:
        "minimax_local requires an API key (set MINIMAX_API_KEY or adapterConfig.apiKey).",
    };
  }

  const session = readSession(ctx);
  const baseSystemPrompt =
    asString(config.systemPrompt) ??
    "Sos un agente de LMTM-OS (Paperclip). Respondé en español rioplatense cuando sea posible.";

  // Load and inject the agent's desired skills. Skills live as SKILL.md
  // files under the adapter's bundled `skills/` directory; the agent's
  // `adapterConfig.paperclipSkillSync.desiredSkills` selects which ones
  // to include on this run. The skill markdown becomes part of the
  // system prompt so the model has the business context.
  const skillBlocks = await loadDesiredSkillBlocks(config);
  const systemPrompt =
    skillBlocks.length > 0
      ? `${baseSystemPrompt}\n\n# Skills (injected by LMTM-OS)\n\n${skillBlocks.join("\n\n---\n\n")}\n`
      : baseSystemPrompt;

  const userPrompt = buildUserPrompt(ctx, config);
  const tools = readTools(ctx);

  const messages: MiniMaxChatMessage[] = truncateMessages(
    [
      ...(session.messages ?? []),
      { role: "user" as const, content: userPrompt },
    ],
    maxMessages,
  );
  if (!messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: systemPrompt });
  }

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  };
  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: `minimax_http_${response.status}`,
        errorMessage: describeMinimaxFailure(raw) || `HTTP ${response.status}`,
        sessionParams: { ...session, messages },
      };
    }
    const baseResp = (raw.base_resp ?? {}) as { status_code?: number; status_msg?: string };
    if (typeof baseResp.status_code === "number" && baseResp.status_code !== 0) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: `minimax_upstream_${baseResp.status_code}`,
        errorMessage: describeMinimaxFailure(raw),
        sessionParams: { ...session, messages },
      };
    }

    const parsed = parseMinimaxCompletion(raw);
    const assistantText = parsed.message.content || "<empty MiniMax response>";
    const reasoningText = parsed.message.reasoningContent ?? "";

    // Update session with the new messages for the next resume.
    const nextMessages: MiniMaxChatMessage[] = [
      ...messages,
      {
        role: "assistant",
        content: parsed.message.content,
        tool_calls: parsed.message.toolCalls,
      },
    ];
    const summaryText = parsed.message.content.slice(0, 200) || `MiniMax ${model} responded with no content`;

    await ctx.onLog(
      "stdout",
      reasoningText
        ? `${reasoningText}\n---\n${assistantText}\n`
        : `${assistantText}\n`,
    );

    if (ctx.onMeta) {
      await ctx.onMeta({
        adapterType: "minimax_local",
        command: `${baseUrl}/text/chatcompletion_v2`,
        commandNotes: [
          `model=${model}`,
          `prompt_tokens=${parsed.usage.promptTokens}`,
          `completion_tokens=${parsed.usage.completionTokens}`,
        ],
        prompt: messages.map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`).join("\n"),
      });
    }

    if (parsed.message.toolCalls && parsed.message.toolCalls.length > 0) {
      // The agent emitted tool calls. The Paperclip runtime is responsible
      // for executing them and resuming this adapter in a follow-up call
      // with tool results appended. We surface this as a structured log
      // entry so the UI can render it; the session is preserved.
      await ctx.onLog(
        "stdout",
        `\n[minimax_local] ${parsed.message.toolCalls.length} tool call(s) requested. The Paperclip runtime will execute them and resume this session.\n`,
      );
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: summaryText,
      sessionParams: {
        sessionId: session.sessionId,
        messages: nextMessages,
        summary: summaryText,
      },
      resultJson: {
        usage: parsed.usage,
        finishReason: parsed.message.finishReason,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorCode: "timeout",
        errorMessage: `MiniMax call timed out after ${timeoutMs}ms`,
        sessionParams: { ...session, messages },
      };
    }
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "minimax_request_failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      sessionParams: { ...session, messages },
    };
  } finally {
    clearTimeout(timer);
  }
}
