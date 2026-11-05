// LMTM-OS: ClickUp MCP server.
// Exposes 12 tools over the Model Context Protocol so any MCP client
// (Claude Desktop, Cursor, Cline, or our own adapters) can read and
// write ClickUp tasks on behalf of the user.
//
// Auth: ClickUp personal API token, set as env var CLICKUP_API_TOKEN.
// Create one at https://app.clickup.com/settings/apps -> API Token.
// The token works across the entire workspace unless it's user-scoped.
//
// Run standalone:
//   CLICKUP_API_TOKEN=pk_... npx lmtm-mcp-clickup

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AnyZodObject } from "zod";
import {
  addComment,
  addCommentSchema,
  createTask,
  createTaskSchema,
  getTask,
  getTaskSchema,
  getTaskComments,
  getTaskCommentsSchema,
  listFolderlessLists,
  listFolderlessListsSchema,
  listFolders,
  listFoldersSchema,
  listLists,
  listListsSchema,
  listSpaces,
  listSpacesSchema,
  listTasks,
  listTasksSchema,
  listWorkspaces,
  listWorkspacesSchema,
  searchTasks,
  searchTasksSchema,
  updateTask,
  updateTaskSchema,
} from "./tools.js";

// Re-export the tool implementations so the LMTM-OS server can call them
// directly in-process (see server/src/services/agent-mcp-tools.ts). The MCP
// stdio entry point still works unchanged.
export {
  addComment,
  addCommentSchema,
  createTask,
  createTaskSchema,
  getTask,
  getTaskSchema,
  getTaskComments,
  getTaskCommentsSchema,
  listFolderlessLists,
  listFolderlessListsSchema,
  listFolders,
  listFoldersSchema,
  listLists,
  listListsSchema,
  listSpaces,
  listSpacesSchema,
  listTasks,
  listTasksSchema,
  listWorkspaces,
  listWorkspacesSchema,
  searchTasks,
  searchTasksSchema,
  updateTask,
  updateTaskSchema,
};

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
      const out = await fn(input);
      return asText(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
      };
    }
  };
}

/**
 * Las herramientas. El nombre es el mismo acá y en el servidor, que las corre
 * como `clickup.<nombre>` en /agent-tools/execute: una sola lista para los dos
 * caminos, así una herramienta nueva no queda sin los frenos del servidor.
 */
type Herramienta = { descripcion: string; schema: AnyZodObject; correr: (input: never) => Promise<unknown> };

export const HERRAMIENTAS: Record<string, Herramienta> = {
  // Read: discovery
  list_workspaces: {
    descripcion: "List ClickUp workspaces (called 'Teams' in the API) visible to the current API token. Use this first to discover workspaceIds.",
    schema: listWorkspacesSchema,
    correr: listWorkspaces,
  },
  list_spaces: {
    descripcion: "List spaces within a workspace. Each space is typically a client or a department.",
    schema: listSpacesSchema,
    correr: listSpaces,
  },
  list_folders: {
    descripcion: "List folders within a space. Folders group related lists (e.g. per quarter or per project).",
    schema: listFoldersSchema,
    correr: listFolders,
  },
  list_folderless_lists: {
    descripcion: "List lists in a space that are NOT inside a folder. Use this for spaces that organize their lists at the space level.",
    schema: listFolderlessListsSchema,
    correr: listFolderlessLists,
  },
  list_lists: {
    descripcion: "List ClickUp lists inside a folder. Each list typically represents a project or recurring workstream.",
    schema: listListsSchema,
    correr: listLists,
  },
  // Read: tasks
  list_tasks: {
    descripcion: "List tasks in a list with optional filters (status, assignees, pagination, sort). Returns at most 100 per page.",
    schema: listTasksSchema,
    correr: listTasks,
  },
  get_task: {
    descripcion: "Fetch full details for a single task (id, name, status, priority, assignees, dates, description, tags, parent location).",
    schema: getTaskSchema,
    correr: getTask,
  },
  search_tasks: {
    descripcion: "Free-text search across task names + descriptions in a workspace. Returns matching tasks with their list/folder/space path.",
    schema: searchTasksSchema,
    correr: searchTasks,
  },
  get_task_comments: {
    descripcion: "Read the comments of a task, newest first. On a social post task this is where Make reports a network that failed (\"Facebook Post was not successfull\") while the run shows as successful: read it before saying a post went out.",
    schema: getTaskCommentsSchema,
    correr: getTaskComments,
  },
  // Write
  create_task: {
    descripcion: "Create a new task in a list. Returns the created task with its id and URL.",
    schema: createTaskSchema,
    correr: createTask,
  },
  update_task: {
    descripcion: "Update one or more fields on an existing task (name, description, status, priority, dates, assignees). Only include fields you want to change.",
    schema: updateTaskSchema,
    correr: updateTask,
  },
  add_comment: {
    descripcion: "Add a comment to a task. Use this for status updates, blockers, or handoff notes.",
    schema: addCommentSchema,
    correr: addComment,
  },
};

type Servidor = { apiUrl: string; apiKey: string; runId: string };

/**
 * Los agentes no tienen el token de ClickUp (05/11): era el mismo de los 129
 * Apps Scripts y lo podían leer desde la terminal. Le piden cada acción al
 * servidor, que es el único que lo guarda: con la API del servidor a mano va
 * siempre por él, aunque haya un token en el entorno. Sin ella (uso suelto)
 * llama directo a ClickUp con CLICKUP_API_TOKEN.
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
    body: JSON.stringify({ tool: `clickup.${nombre}`, parameters: input ?? {} }),
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

export function createClickUpMcpServer(env: NodeJS.ProcessEnv = process.env) {
  const server = new McpServer({
    name: "clickup",
    version: "0.1.0",
  });
  const servidor = servidorDesdeEntorno(env);
  for (const [nombre, h] of Object.entries(HERRAMIENTAS)) {
    const correr = servidor ? (input: unknown) => pedirAlServidor(servidor, nombre, input) : h.correr;
    server.tool(nombre, h.descripcion, h.schema.shape, wrap(correr as (input: unknown) => Promise<unknown>));
  }
  return server;
}

export async function runServer() {
  const server = createClickUpMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
