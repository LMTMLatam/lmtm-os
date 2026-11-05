// LMTM-OS: Google MCP server (Sheets · Drive · Apps Script).
// Exposes the content-pipeline tools so agents can read/write the per-client
// planning Sheet, copy Sheet templates when onboarding a client, and
// create/update the bound Apps Script that feeds ClickUp.
//
// Auth: OAuth2 refresh token for grow@bylmtm.com (see api.ts). Run standalone:
//   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... \
//   GOOGLE_OAUTH_REFRESH_TOKEN=... npx lmtm-mcp-google

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AnyZodObject } from "zod";
import {
  driveCopy,
  driveCopySchema,
  driveCreateFolder,
  driveCreateFolderSchema,
  driveGet,
  driveGetSchema,
  driveList,
  driveListSchema,
  scriptCreate,
  scriptCreateSchema,
  scriptGetContent,
  scriptGetContentSchema,
  scriptProcesses,
  scriptProcessesSchema,
  scriptUpdateContent,
  scriptUpdateContentSchema,
  sheetsAppend,
  sheetsAppendSchema,
  sheetsCreate,
  sheetsCreateSchema,
  sheetsMetadata,
  sheetsMetadataSchema,
  sheetsRead,
  sheetsReadSchema,
  sheetsUpdate,
  sheetsUpdateSchema,
} from "./tools.js";

// Re-export the tool implementations so the LMTM-OS server can call them
// directly in-process (see server/src/services/agent-mcp-tools.ts).
export {
  driveCopy,
  driveCopySchema,
  driveCreateFolder,
  driveCreateFolderSchema,
  driveGet,
  driveGetSchema,
  driveList,
  driveListSchema,
  scriptCreate,
  scriptCreateSchema,
  scriptGetContent,
  scriptGetContentSchema,
  scriptUpdateContent,
  scriptUpdateContentSchema,
  sheetsAppend,
  sheetsAppendSchema,
  sheetsCreate,
  sheetsCreateSchema,
  sheetsMetadata,
  sheetsMetadataSchema,
  sheetsRead,
  sheetsReadSchema,
  sheetsUpdate,
  sheetsUpdateSchema,
};
export { driveMove, driveMoveSchema } from "./tools.js";
export { scriptProcesses, scriptProcessesSchema } from "./tools.js";

function asText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function wrap<T>(fn: (input: T) => Promise<unknown>) {
  return async (input: T) => {
    try {
      return asText(await fn(input));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text" as const, text: message }] };
    }
  };
}

/**
 * Las herramientas. El nombre es el mismo acá y en el servidor, que las corre
 * como `google.<nombre>` en /agent-tools/execute. Los frenos (planillas y Apps
 * Script) viven en tools.ts y valen en los dos caminos.
 */
type Herramienta = { descripcion: string; schema: AnyZodObject; correr: (input: never) => Promise<unknown> };

export const HERRAMIENTAS: Record<string, Herramienta> = {
  sheets_read: {
    descripcion: "Read a range of cells from a Google Sheet (planning sheets per client). Returns rows of values.",
    schema: sheetsReadSchema,
    correr: sheetsRead,
  },
  sheets_append: {
    descripcion: "Append rows to the end of a Google Sheet range. Use to add planned posts.",
    schema: sheetsAppendSchema,
    correr: sheetsAppend,
  },
  sheets_update: {
    descripcion: "Overwrite an exact range in a Google Sheet. Use to fix/transcribe a row that didn't flow to ClickUp.",
    schema: sheetsUpdateSchema,
    correr: sheetsUpdate,
  },
  sheets_metadata: {
    descripcion: "Get a spreadsheet's title and tab list (sheetId, title, dimensions). Use before reading to find the right tab.",
    schema: sheetsMetadataSchema,
    correr: sheetsMetadata,
  },
  sheets_create: {
    descripcion: "Create a new empty Google Spreadsheet. Prefer drive_copy from a template for client onboarding.",
    schema: sheetsCreateSchema,
    correr: sheetsCreate,
  },
  drive_list: {
    descripcion: "Search/list Drive files with an optional query (q). Use to find a client's folder, the Sheet template, or planning sheets.",
    schema: driveListSchema,
    correr: driveList,
  },
  drive_copy: {
    descripcion: "Copy a Drive file (e.g. duplicate the Sheet template) into a folder with a new name. Core of client onboarding.",
    schema: driveCopySchema,
    correr: driveCopy,
  },
  drive_get: {
    descripcion: "Get a Drive file's metadata (name, mimeType, parents, owner, link).",
    schema: driveGetSchema,
    correr: driveGet,
  },
  drive_create_folder: {
    descripcion: "Create a Drive folder (e.g. the per-client folder under AALMTMLATAM).",
    schema: driveCreateFolderSchema,
    correr: driveCreateFolder,
  },
  script_create: {
    descripcion: "Create a new Apps Script project, optionally bound to a Sheet (parentId). Use to provision the Sheet→ClickUp script for a new client.",
    schema: scriptCreateSchema,
    correr: scriptCreate,
  },
  script_get_content: {
    descripcion: "Get the files (code + manifest) of an Apps Script project. Use to inspect/repair the Sheet→ClickUp script.",
    schema: scriptGetContentSchema,
    correr: scriptGetContent,
  },
  script_processes: {
    descripcion: "List recent executions of an Apps Script project with their status (COMPLETED/FAILED/TIMED_OUT). Use to check whether a client's Sheet→ClickUp script is running and healthy.",
    schema: scriptProcessesSchema,
    correr: scriptProcesses,
  },
  script_update_content: {
    descripcion: "Replace ALL files of an Apps Script project (include the appsscript manifest). Use to fix or install the Sheet→ClickUp script.",
    schema: scriptUpdateContentSchema,
    correr: scriptUpdateContent,
  },
};

type Servidor = { apiUrl: string; apiKey: string; runId: string };

/**
 * Los agentes no reciben la credencial de Google (05/11): la leían del entorno
 * desde la terminal. Le piden cada acción al servidor, que es el único que la
 * guarda: con la API del servidor a mano va siempre por él. Sin ella (uso
 * suelto) llama directo con GOOGLE_OAUTH_*.
 * Gemelo de servidorDesdeEntorno en @paperclipai/mcp-clickup.
 */
export function servidorDesdeEntorno(env: NodeJS.ProcessEnv = process.env): Servidor | null {
  const apiUrl = env.PAPERCLIP_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = env.PAPERCLIP_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  return { apiUrl: apiUrl.endsWith("/api") ? apiUrl : `${apiUrl}/api`, apiKey, runId: env.PAPERCLIP_RUN_ID?.trim() ?? "" };
}

export async function pedirAlServidor(s: Servidor, nombre: string, input: unknown): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${s.apiKey}`, "Content-Type": "application/json" };
  if (s.runId) headers["X-Paperclip-Run-Id"] = s.runId;
  const r = await fetch(`${s.apiUrl}/agent-tools/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tool: `google.${nombre}`, parameters: input ?? {} }),
  });
  const texto = await r.text();
  let cuerpo: { ok?: boolean; content?: string } | null = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    // Un 502 de Railway viene en HTML: se informa el código, no la página.
  }
  if (!r.ok || !cuerpo) throw new Error(`El servidor no respondió (${r.status}): ${(cuerpo?.content ?? texto).slice(0, 200)}`);
  if (!cuerpo.ok) throw new Error(cuerpo.content ?? "Error del servidor sin detalle");
  return cuerpo.content ?? "";
}

export function createGoogleMcpServer(env: NodeJS.ProcessEnv = process.env) {
  const server = new McpServer({ name: "google", version: "0.1.0" });
  const servidor = servidorDesdeEntorno(env);
  for (const [nombre, h] of Object.entries(HERRAMIENTAS)) {
    const correr = servidor ? (input: unknown) => pedirAlServidor(servidor, nombre, input) : h.correr;
    server.tool(nombre, h.descripcion, h.schema.shape, wrap(correr as (input: unknown) => Promise<unknown>));
  }
  return server;
}

export async function runServer() {
  const server = createGoogleMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
