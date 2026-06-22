import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PaperclipApiClient } from "./client.js";
import { readConfigFromEnv, type PaperclipMcpConfig } from "./config.js";
import { createToolDefinitions } from "./tools.js";

export function createPaperclipMcpServer(config: PaperclipMcpConfig = readConfigFromEnv()) {
  const server = new McpServer({
    name: "paperclip",
    version: "0.1.0",
  });

  const client = new PaperclipApiClient(config);
  const allTools = createToolDefinitions(client);
  // Optional allowlist (PAPERCLIP_MCP_TOOLS=comma,separated,names). When set,
  // only those tools are registered. Agents that need a small, cheap tool
  // surface (the schemas are re-sent every turn) use this to cut token cost;
  // paperclipApiRequest stays as the escape hatch for anything left out.
  const allow = (process.env.PAPERCLIP_MCP_TOOLS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const tools = allow.length > 0 ? allTools.filter((tool) => allow.includes(tool.name)) : allTools;
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema.shape, tool.execute);
  }

  return {
    server,
    tools,
    client,
  };
}

export async function runServer(config: PaperclipMcpConfig = readConfigFromEnv()) {
  const { server } = createPaperclipMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
