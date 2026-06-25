// LMTM-OS: ClickUp MCP server.
// Exposes 10 tools over the Model Context Protocol so any MCP client
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
import {
  addComment,
  addCommentSchema,
  createTask,
  createTaskSchema,
  getTask,
  getTaskSchema,
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

export function createClickUpMcpServer() {
  const server = new McpServer({
    name: "clickup",
    version: "0.1.0",
  });

  // Read: discovery
  server.tool(
    "list_workspaces",
    "List ClickUp workspaces (called 'Teams' in the API) visible to the current API token. Use this first to discover workspaceIds.",
    listWorkspacesSchema.shape,
    wrap(listWorkspaces),
  );
  server.tool(
    "list_spaces",
    "List spaces within a workspace. Each space is typically a client or a department.",
    listSpacesSchema.shape,
    wrap(listSpaces),
  );
  server.tool(
    "list_folders",
    "List folders within a space. Folders group related lists (e.g. per quarter or per project).",
    listFoldersSchema.shape,
    wrap(listFolders),
  );
  server.tool(
    "list_folderless_lists",
    "List lists in a space that are NOT inside a folder. Use this for spaces that organize their lists at the space level.",
    listFolderlessListsSchema.shape,
    wrap(listFolderlessLists),
  );
  server.tool(
    "list_lists",
    "List ClickUp lists inside a folder. Each list typically represents a project or recurring workstream.",
    listListsSchema.shape,
    wrap(listLists),
  );

  // Read: tasks
  server.tool(
    "list_tasks",
    "List tasks in a list with optional filters (status, assignees, pagination, sort). Returns at most 100 per page.",
    listTasksSchema.shape,
    wrap(listTasks),
  );
  server.tool(
    "get_task",
    "Fetch full details for a single task (id, name, status, priority, assignees, dates, description, tags, parent location).",
    getTaskSchema.shape,
    wrap(getTask),
  );
  server.tool(
    "search_tasks",
    "Free-text search across task names + descriptions in a workspace. Returns matching tasks with their list/folder/space path.",
    searchTasksSchema.shape,
    wrap(searchTasks),
  );

  // Write
  server.tool(
    "create_task",
    "Create a new task in a list. Returns the created task with its id and URL.",
    createTaskSchema.shape,
    wrap(createTask),
  );
  server.tool(
    "update_task",
    "Update one or more fields on an existing task (name, description, status, priority, dates, assignees). Only include fields you want to change.",
    updateTaskSchema.shape,
    wrap(updateTask),
  );
  server.tool(
    "add_comment",
    "Add a comment to a task. Use this for status updates, blockers, or handoff notes.",
    addCommentSchema.shape,
    wrap(addComment),
  );

  return server;
}

export async function runServer() {
  const server = createClickUpMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
