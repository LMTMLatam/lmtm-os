import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "lmtm-n8n";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listTools: "n8n-list-tools",
  callTool: "n8n-call-tool",
  ping: "n8n-ping",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "n8n MCP (LMTM)",
  description: "Bridge to the LMTM n8n instance's instance-level MCP server. Discovers the workflow tools the instance has enabled (Leads unificados, Main Dashboard Visualization, etc.) and lets LMTM-OS agents invoke them.",
  author: "LMTM",
  categories: ["connector", "automation"],
  capabilities: [
    "secrets.read-ref",
    "http.outbound",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      mcpUrlSecretRef: {
        type: "string",
        title: "n8n MCP URL (secret ref)",
        description: "Reference to the secret holding the n8n MCP HTTP endpoint. Defaults to N8N_MCP_URL.",
        default: "N8N_MCP_URL",
      },
      tokenSecretRef: {
        type: "string",
        title: "n8n MCP Access Token (secret ref)",
        description: "Reference to the secret holding the n8n MCP access token. Defaults to N8N_MCP_TOKEN.",
        default: "N8N_MCP_TOKEN",
      },
      timeoutMs: {
        type: "integer",
        title: "Request timeout (ms)",
        description: "Per-request timeout for the n8n MCP HTTP calls. Default 30000.",
        default: 30000,
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.ping,
      displayName: "n8n MCP Ping",
      description: "Test connectivity to the configured n8n MCP server. Performs the JSON-RPC 'initialize' handshake and returns the server's reported name and protocol version. Use this first to verify auth is valid.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.listTools,
      displayName: "n8n List Tools",
      description: "Discover all workflow tools the n8n instance has currently exposed via instance-level MCP. Each tool is a single n8n workflow. The exact tool names (slugified workflow names) come back here and are what you pass to n8n_call_tool.",
      parametersSchema: {
        type: "object",
        properties: {
          refresh: {
            type: "boolean",
            default: false,
            description: "Bypass the plugin's in-memory cache and re-fetch the tool list from the n8n MCP server.",
          },
        },
      },
    },
    {
      name: TOOL_NAMES.callTool,
      displayName: "n8n Call Tool",
      description: "Invoke a named n8n workflow tool (returned by n8n_list_tools) with the given arguments. Use this when the n8n workflow's input schema is not known at plugin build time, or to call any dynamic workflow the operator enabled in n8n since the plugin was installed.",
      parametersSchema: {
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description: "The exact n8n tool name (e.g. 'leads_unificados' or 'main_dashboard_visualization'). Get it from n8n_list_tools.",
          },
          arguments: {
            type: "object",
            additionalProperties: true,
            description: "The arguments the n8n workflow expects. Pass them as a JSON object. If you don't know the schema, call n8n_list_tools first — each tool entry has its inputSchema.",
          },
          timeoutMs: {
            type: "integer",
            description: "Override the per-call timeout in ms. Default uses the instance config timeout.",
            default: 30000,
          },
        },
        required: ["toolName"],
      },
    },
  ],
};

export default manifest;
