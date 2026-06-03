// LMTM-OS: n8n MCP plugin worker.
// Bridges the LMTM n8n instance's instance-level MCP server
// (HTTP transport, JSON-RPC 2.0) into the Paperclip plugin tool
// surface so any LMTM-OS agent can call n8n workflows.
//
// MCP protocol reference: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
// n8n instance-level MCP: https://docs.n8n.io/advanced-ai/mcp/mcp_tools_reference/
//
// Auth: Bearer access token in the `Authorization` header, resolved
// from a secret ref (default: N8N_MCP_TOKEN). The endpoint URL is also
// a secret ref (default: N8N_MCP_URL). The plugin reads both from
// process.env first (cheap, no UI) and falls back to ctx.secrets.resolve
// so operators can also wire them through the PluginManager UI.

import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./manifest.js";

type ToolResult = {
  content?: string;
  data?: unknown;
  error?: string;
};

type ResolvedConfig = {
  mcpUrl: string;
  token: string;
  defaultTimeoutMs: number;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

class N8nMcpError extends Error {
  constructor(
    public status: number | null,
    public code: string | null,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "N8nMcpError";
  }
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function ok(value: unknown): ToolResult {
  return {
    content: toText(value),
    data: (value && typeof value === "object" ? (value as Record<string, unknown>) : undefined),
  };
}

function err(message: string, extra?: { code?: string; data?: unknown; status?: number }): ToolResult {
  const lines = [`Error: ${message}`];
  if (extra?.status !== undefined) lines.push(`HTTP status: ${extra.status}`);
  if (extra?.code) lines.push(`Code: ${extra.code}`);
  if (extra?.data !== undefined) lines.push(`Data: ${toText(extra.data)}`);
  return { content: lines.join("\n"), error: message };
}

async function resolveConfig(ctx: {
  config: { get(): Promise<Record<string, unknown>> };
  secrets: { resolve(ref: string): Promise<string | null> };
}): Promise<ResolvedConfig> {
  const cfg = (await ctx.config.get()) as {
    mcpUrlSecretRef?: string;
    tokenSecretRef?: string;
    timeoutMs?: number;
  };
  const urlRef = cfg.mcpUrlSecretRef ?? "N8N_MCP_URL";
  const tokenRef = cfg.tokenSecretRef ?? "N8N_MCP_TOKEN";

  const mcpUrl =
    process.env[urlRef] ??
    (await ctx.secrets.resolve(urlRef)) ??
    "";
  const token =
    process.env[tokenRef] ??
    (await ctx.secrets.resolve(tokenRef)) ??
    "";

  if (!mcpUrl) {
    throw new Error(
      `n8n MCP URL not configured. Set env var "${urlRef}" or the secret ref "${urlRef}" in the plugin instance config.`,
    );
  }
  if (!token) {
    throw new Error(
      `n8n MCP access token not configured. Set env var "${tokenRef}" or the secret ref "${tokenRef}" in the plugin instance config.`,
    );
  }
  return {
    mcpUrl: mcpUrl.replace(/\/$/, ""),
    token,
    defaultTimeoutMs: typeof cfg.timeoutMs === "number" && cfg.timeoutMs > 0 ? cfg.timeoutMs : 30000,
  };
}

async function jsonRpc(
  cfg: ResolvedConfig,
  method: string,
  params?: Record<string, unknown>,
  timeoutMsOverride?: number,
): Promise<unknown> {
  const id = Math.floor(Math.random() * 1_000_000_000);
  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method,
    ...(params !== undefined ? { params } : {}),
  };
  const timeout = timeoutMsOverride ?? cfg.defaultTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let r: Response;
  try {
    r = await fetch(cfg.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new N8nMcpError(null, "timeout", `n8n MCP call timed out after ${timeout}ms`);
    }
    throw new N8nMcpError(
      null,
      "network_error",
      `Failed to reach n8n MCP server: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  clearTimeout(timer);
  const text = await r.text();
  let parsed: JsonRpcResponse | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as JsonRpcResponse;
    } catch {
      // Some servers (Streamable HTTP) wrap responses in SSE frames like
      // `event: message\ndata: {...}\n\n`. Try to extract the data line.
      const dataLine = text
        .split(/\r?\n/)
        .find((l) => l.startsWith("data: "));
      if (dataLine) {
        try {
          parsed = JSON.parse(dataLine.slice("data: ".length)) as JsonRpcResponse;
        } catch {
          parsed = null;
        }
      }
    }
  }
  if (!r.ok) {
    throw new N8nMcpError(
      r.status,
      `http_${r.status}`,
      text ? text.slice(0, 500) : `HTTP ${r.status}`,
    );
  }
  if (!parsed) {
    throw new N8nMcpError(r.status, "invalid_response", `Non-JSON response: ${text.slice(0, 200)}`);
  }
  if (parsed.error) {
    throw new N8nMcpError(
      r.status,
      parsed.error.code !== undefined ? String(parsed.error.code) : null,
      parsed.error.message,
      parsed.error.data,
    );
  }
  return parsed.result;
}

// ── Plugin ─────────────────────────────────────────────────────────────

type Ctx = {
  config: { get(): Promise<Record<string, unknown>> };
  secrets: { resolve(ref: string): Promise<string | null> };
  logger: { info(m: string, meta?: Record<string, unknown>): void; warn(m: string, meta?: Record<string, unknown>): void; error(m: string, meta?: Record<string, unknown>): void; debug(m: string, meta?: Record<string, unknown>): void };
  tools: {
    register(
      name: string,
      decl: { displayName: string; description: string; parametersSchema: Record<string, unknown> },
      fn: (params: unknown, run: { companyId: string; agentId: string; runId: string; projectId: string }) => Promise<ToolResult>,
    ): void;
  };
};

const plugin = definePlugin({
  async setup(ctx: Ctx) {
    let cached: ResolvedConfig | null = null;
    let toolListCache: { tools: Array<Record<string, unknown>>; fetchedAt: number } | null = null;
    const TOOL_LIST_TTL_MS = 60_000;

    const getCfg = async (): Promise<ResolvedConfig> => {
      if (!cached) cached = await resolveConfig(ctx);
      return cached;
    };

    const fetchToolList = async (): Promise<Array<Record<string, unknown>>> => {
      if (
        toolListCache &&
        Date.now() - toolListCache.fetchedAt < TOOL_LIST_TTL_MS
      ) {
        return toolListCache.tools;
      }
      const cfg = await getCfg();
      const result = await jsonRpc(cfg, "tools/list", {});
      const tools = Array.isArray((result as { tools?: unknown[] })?.tools)
        ? ((result as { tools: Array<Record<string, unknown>> }).tools)
        : [];
      toolListCache = { tools, fetchedAt: Date.now() };
      return tools;
    };

    ctx.logger.info(`${PLUGIN_ID} v0.1.0 starting`);

    // ── n8n-ping ───────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.ping,
      {
        displayName: "n8n MCP Ping",
        description: "Test connectivity to the configured n8n MCP server by performing the JSON-RPC initialize handshake. Returns the server's name and protocol version.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, _run) => {
        try {
          const cfg = await getCfg();
          const result = await jsonRpc(cfg, "initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
          });
          return ok({
            ok: true,
            endpoint: cfg.mcpUrl,
            server: result,
          });
        } catch (e) {
          if (e instanceof N8nMcpError) {
            return err(e.message, { code: e.code ?? undefined, status: e.status ?? undefined, data: e.data });
          }
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── n8n-list-tools ─────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listTools,
      {
        displayName: "n8n List Tools",
        description: "Discover the workflow tools the configured n8n instance currently exposes via instance-level MCP. Returns an array of {name, description, inputSchema} entries.",
        parametersSchema: {
          type: "object",
          properties: {
            refresh: {
              type: "boolean",
              default: false,
              description: "Bypass the in-memory cache and re-fetch the tool list.",
            },
          },
        },
      },
      async (params, _run) => {
        try {
          const p = (params ?? {}) as { refresh?: boolean };
          if (p.refresh) toolListCache = null;
          const tools = await fetchToolList();
          return ok({
            count: tools.length,
            cached: !!toolListCache && Date.now() - toolListCache.fetchedAt < TOOL_LIST_TTL_MS,
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description ?? null,
              inputSchema: t.inputSchema ?? null,
            })),
          });
        } catch (e) {
          if (e instanceof N8nMcpError) {
            return err(e.message, { code: e.code ?? undefined, status: e.status ?? undefined, data: e.data });
          }
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── n8n-call-tool ──────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.callTool,
      {
        displayName: "n8n Call Tool",
        description: "Invoke a named n8n workflow tool (returned by n8n_list_tools) with the given arguments. Use this for any workflow the operator enabled in n8n since the plugin was installed, or whose input schema is not known at plugin build time.",
        parametersSchema: {
          type: "object",
          properties: {
            toolName: {
              type: "string",
              description: "Exact n8n tool name from n8n_list_tools.",
            },
            arguments: {
              type: "object",
              additionalProperties: true,
              description: "JSON object with the arguments the workflow expects.",
            },
            timeoutMs: {
              type: "integer",
              description: "Per-call timeout in ms. Defaults to the instance config.",
            },
          },
          required: ["toolName"],
        },
      },
      async (params, run) => {
        try {
          const p = params as { toolName: string; arguments?: Record<string, unknown>; timeoutMs?: number };
          if (!p || typeof p.toolName !== "string" || p.toolName.length === 0) {
            return err("toolName is required and must be a non-empty string");
          }
          const cfg = await getCfg();
          const result = await jsonRpc(
            cfg,
            "tools/call",
            {
              name: p.toolName,
              arguments: p.arguments ?? {},
            },
            p.timeoutMs,
          );
          ctx.logger.info("n8n tool call succeeded", {
            tool: p.toolName,
            agentId: run.agentId,
            runId: run.runId,
          });
          return ok(result);
        } catch (e) {
          if (e instanceof N8nMcpError) {
            ctx.logger.warn("n8n tool call failed", {
              code: e.code ?? null,
              status: e.status ?? null,
              message: e.message,
            });
            return err(e.message, { code: e.code ?? undefined, status: e.status ?? undefined, data: e.data });
          }
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
// force-rebuild-marker: 2026-06-03T22:59:26.5241068Z
