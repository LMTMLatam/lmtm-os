import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";
import { asString, parseObject } from "../utils.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);

  const apiKey = asString(config.apiKey, process.env.MINIMAX_API_KEY ?? "");
  const baseUrl = asString(config.baseUrl, process.env.MINIMAX_BASE_URL ?? "https://api.minimax.chat/v1");
  const model = asString(config.model, process.env.MINIMAX_MODEL ?? "MiniMax-Text-01");

  if (!apiKey) {
    checks.push({
      code: "minimax_api_key_missing",
      level: "error",
      message: "MINIMAX_API_KEY is not set and adapterConfig.apiKey is empty.",
      hint: "Set the MINIMAX_API_KEY environment variable or provide apiKey in agent adapterConfig.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "minimax_api_key_present",
    level: "info",
    message: "API key configured.",
  });

  checks.push({
    code: "minimax_base_url",
    level: "info",
    message: `Base URL: ${baseUrl}`,
  });

  checks.push({
    code: "minimax_model",
    level: "info",
    message: `Default model: ${model}`,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const probe = await fetch(`${baseUrl.replace(/\/$/, "")}/text/chatcompletion_v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    const data = (await probe.json().catch(() => ({}))) as {
      base_resp?: { status_code?: number; status_msg?: string };
    };
    const upstream = data.base_resp?.status_code;
    if (typeof upstream === "number" && upstream !== 0) {
      checks.push({
        code: `minimax_probe_${upstream}`,
        level: "error",
        message: `MiniMax rejected probe: ${data.base_resp?.status_msg ?? "unknown"}`,
      });
    } else if (!probe.ok) {
      checks.push({
        code: `minimax_probe_http_${probe.status}`,
        level: "error",
        message: `MiniMax probe returned HTTP ${probe.status}.`,
      });
    } else {
      checks.push({
        code: "minimax_probe_ok",
        level: "info",
        message: "MiniMax responded to credentials probe.",
      });
    }
  } catch (err) {
    checks.push({
      code: "minimax_probe_failed",
      level: "warn",
      message: err instanceof Error ? err.message : "Probe failed",
      hint: "Network restriction or invalid endpoint; verify reachability from this host.",
    });
  } finally {
    clearTimeout(timeout);
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
