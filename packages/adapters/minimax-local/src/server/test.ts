// LMTM-OS: minimax_local environment test.
// Probes the MiniMax API with a tiny request to validate the key + reachability.

import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { resolveApiKey, resolveBaseUrl, resolveModel } from "./models.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = (ctx.config ?? {}) as Record<string, unknown>;
  const apiKey = resolveApiKey(typeof config.apiKey === "string" ? config.apiKey : null);
  const baseUrl = resolveBaseUrl(typeof config.baseUrl === "string" ? config.baseUrl : null);
  const model = resolveModel(typeof config.model === "string" ? config.model : null);

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

  checks.push({ code: "minimax_api_key_present", level: "info", message: "API key configured." });
  checks.push({ code: "minimax_base_url", level: "info", message: `Base URL: ${baseUrl}` });
  checks.push({ code: "minimax_model", level: "info", message: `Default model: ${model}` });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const probe = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
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
      const code = upstream === 1002 || upstream === 1004 || upstream === 1008 ? "warn" : "error";
      checks.push({
        code: `minimax_probe_${upstream}`,
        level: code as "warn" | "error",
        message: `MiniMax rejected probe: ${data.base_resp?.status_msg ?? "unknown"}`,
        hint: code === "warn" ? "Reachable but the probe message was filtered. The agent itself should still work." : "Verify the API key has access to the configured model.",
      });
    } else if (!probe.ok) {
      checks.push({
        code: `minimax_probe_http_${probe.status}`,
        level: "error",
        message: `MiniMax probe returned HTTP ${probe.status}.`,
        hint: "Check that the baseUrl is correct and reachable from this host.",
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
    clearTimeout(timer);
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
