import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PaperclipApiClient } from "./client.js";
import { readConfigFromEnv, type PaperclipMcpConfig } from "./config.js";
import { createToolDefinitions } from "./tools.js";

/**
 * Lo que Claude lee al conectarse (21/10): el atajo para pedir contenido sin
 * gastar tokens en buscar al cliente, su memoria y su material por separado.
 */
export const INSTRUCCIONES =
  "LMTM-OS: datos y herramientas de la agencia LMTM (clientes, pauta, contenido). " +
  "Para cualquier pieza de contenido de un cliente («quiero un video / reel / placa de X para tal cliente»), " +
  "llamá PRIMERO a lmtmGuiaContenido con el cliente y el producto: en una sola llamada trae la marca, la memoria, " +
  "lo que se sabe del producto, el material real de Drive con links de descarga, la web y la receta para producirla. " +
  "Seguí sus reglas: nada inventado, la voz del cliente, y confirmar con la persona antes de gastar créditos o publicar.";

export function createPaperclipMcpServer(
  config: PaperclipMcpConfig = readConfigFromEnv(),
  // El runner propio (varios roles en un mismo proceso) pasa la lista de cada rol.
  allowlist?: string[],
) {
  const server = new McpServer({
    name: "paperclip",
    version: "0.1.0",
  }, { instructions: INSTRUCCIONES });

  const client = new PaperclipApiClient(config);
  const allTools = createToolDefinitions(client);
  // Optional allowlist (PAPERCLIP_MCP_TOOLS=comma,separated,names). When set,
  // only those tools are registered. Agents that need a small, cheap tool
  // surface (the schemas are re-sent every turn) use this to cut token cost;
  // paperclipApiRequest stays as the escape hatch for anything left out.
  const allow = allowlist ?? (process.env.PAPERCLIP_MCP_TOOLS ?? "")
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
