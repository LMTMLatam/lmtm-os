import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, asNumber, parseObject } from "../utils.js";
import { DEFAULT_MODEL } from "./models.js";

type MiniMaxMessage = { role: "system" | "user" | "assistant"; content: string };

function resolveBaseUrl(config: Record<string, unknown>): string {
  return asString(config.baseUrl, process.env.MINIMAX_BASE_URL ?? "https://api.minimax.chat/v1");
}

function resolveApiKey(config: Record<string, unknown>): string {
  return asString(config.apiKey, process.env.MINIMAX_API_KEY ?? "");
}

function resolveModel(config: Record<string, unknown>): string {
  return asString(config.model, process.env.MINIMAX_MODEL ?? DEFAULT_MODEL);
}

function buildMessages(
  ctx: AdapterExecutionContext,
  config: Record<string, unknown>,
): MiniMaxMessage[] {
  const systemPrompt = asString(config.systemPrompt, "");
  const userPrompt = asString(
    config.userPrompt,
    asString(config.prompt, asString((ctx.context ?? {}) as never, "")),
  );

  const messages: MiniMaxMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (userPrompt) {
    messages.push({ role: "user", content: userPrompt });
  } else {
    messages.push({
      role: "user",
      content: `Run ${ctx.runId} for agent ${ctx.agent.id}. No prompt was provided.`,
    });
  }
  return messages;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = parseObject(ctx.config);
  const baseUrl = resolveBaseUrl(config).replace(/\/$/, "");
  const apiKey = resolveApiKey(config);
  const model = resolveModel(config);
  const temperature = asNumber(config.temperature, 0.7);
  const maxTokens = asNumber(config.maxTokens, 1024);
  const timeoutMs = asNumber(config.timeoutMs, 60_000);

  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "minimax_missing_api_key",
      errorMessage:
        "MiniMax adapter requires an API key (set MINIMAX_API_KEY or adapterConfig.apiKey).",
    };
  }

  const messages = buildMessages(ctx, config);
  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: `minimax_http_${response.status}`,
        errorMessage: `MiniMax HTTP ${response.status}: ${text.slice(0, 400)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown> & {
      base_resp?: { status_code?: number; status_msg?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    const upstreamStatus = data.base_resp?.status_code;
    if (typeof upstreamStatus === "number" && upstreamStatus !== 0) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorCode: `minimax_upstream_${upstreamStatus}`,
        errorMessage: `MiniMax rejected request: ${data.base_resp?.status_msg ?? "unknown"}`,
      };
    }

    const output = data.choices?.[0]?.message?.content ?? "";

    await ctx.onLog("stdout", output || "<empty MiniMax response>\n");

    if (ctx.onMeta) {
      await ctx.onMeta({
        adapterType: "minimax_cloud",
        command: `${baseUrl}/text/chatcompletion_v2`,
        commandNotes: [`model=${model}`, `upstream_status=${upstreamStatus ?? 0}`],
        prompt: messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      });
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: output ? output.slice(0, 200) : `MiniMax ${model} responded with no content`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorCode: "timeout",
        errorMessage: `MiniMax call timed out after ${timeoutMs}ms`,
      };
    }
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorCode: "minimax_request_failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
