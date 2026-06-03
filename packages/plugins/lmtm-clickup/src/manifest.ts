import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "lmtm-clickup";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listWorkspaces: "clickup-list-workspaces",
  listSpaces: "clickup-list-spaces",
  listFolders: "clickup-list-folders",
  listFolderlessLists: "clickup-list-folderless-lists",
  listLists: "clickup-list-lists",
  listTasks: "clickup-list-tasks",
  getTask: "clickup-get-task",
  searchTasks: "clickup-search-tasks",
  createTask: "clickup-create-task",
  updateTask: "clickup-update-task",
  addComment: "clickup-add-comment",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "ClickUp (LMTM)",
  description: "Read and write ClickUp tasks, lists, and comments for the LMTM agency workspace. The bridge between the 14 LMTM-OS agents and the agency's ClickUp PM/CRM.",
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
      apiTokenSecretRef: {
        type: "string",
        title: "ClickUp API Token (secret ref)",
        description: "Reference to the secret holding the ClickUp personal API token (e.g. 'CLICKUP_API_TOKEN').",
        default: "CLICKUP_API_TOKEN",
      },
      apiBase: {
        type: "string",
        title: "ClickUp API base URL",
        description: "Override only for ClickUp on-prem / private cloud. Defaults to https://api.clickup.com/api/v2.",
        default: "https://api.clickup.com/api/v2",
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.listWorkspaces,
      displayName: "ClickUp List Workspaces",
      description: "Discover the ClickUp workspaces ('Teams' in the API) the current API token can see. Call this first to get a workspaceId for the other tools.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.listSpaces,
      displayName: "ClickUp List Spaces",
      description: "List spaces within a workspace. Each space typically maps to one LMTM client (e.g. 'Cliente A — Acme SA').",
      parametersSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string", description: "ClickUp workspace id (from list_workspaces)" },
          archived: { type: "boolean", description: "Include archived spaces", default: false },
        },
        required: ["workspaceId"],
      },
    },
    {
      name: TOOL_NAMES.listFolders,
      displayName: "ClickUp List Folders",
      description: "List folders in a space. Folders typically group work by month (e.g. '2026-06').",
      parametersSchema: {
        type: "object",
        properties: {
          spaceId: { type: "string" },
          archived: { type: "boolean", default: false },
        },
        required: ["spaceId"],
      },
    },
    {
      name: TOOL_NAMES.listFolderlessLists,
      displayName: "ClickUp Folderless Lists",
      description: "List lists that live directly under a space (not in any folder).",
      parametersSchema: {
        type: "object",
        properties: {
          spaceId: { type: "string" },
          archived: { type: "boolean", default: false },
        },
        required: ["spaceId"],
      },
    },
    {
      name: TOOL_NAMES.listLists,
      displayName: "ClickUp Lists in Folder",
      description: "List ClickUp lists inside a folder.",
      parametersSchema: {
        type: "object",
        properties: {
          folderId: { type: "string" },
          archived: { type: "boolean", default: false },
        },
        required: ["folderId"],
      },
    },
    {
      name: TOOL_NAMES.listTasks,
      displayName: "ClickUp List Tasks",
      description: "List tasks in a list with optional status / assignee / pagination filters. Returns at most 100 per page.",
      parametersSchema: {
        type: "object",
        properties: {
          listId: { type: "string" },
          archived: { type: "boolean", default: false },
          status: {
            type: "array",
            items: { type: "string" },
            description: "Filter by status name (e.g. ['to do', 'in progress'])",
          },
          assignees: {
            type: "array",
            items: { type: "number" },
            description: "Filter by assignee user id",
          },
          includeClosed: { type: "boolean", default: false },
          page: { type: "number", minimum: 0, default: 0 },
          pageSize: { type: "number", minimum: 1, maximum: 100, default: 50 },
          orderBy: { type: "string", enum: ["id", "created", "updated", "due_date"], default: "updated" },
          reverse: { type: "boolean", default: true },
        },
        required: ["listId"],
      },
    },
    {
      name: TOOL_NAMES.getTask,
      displayName: "ClickUp Get Task",
      description: "Fetch full detail of a single task: id, name, status, priority, assignees, dates, description, tags, location (list/folder/space).",
      parametersSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          includeSubtasks: { type: "boolean", default: false },
        },
        required: ["taskId"],
      },
    },
    {
      name: TOOL_NAMES.searchTasks,
      displayName: "ClickUp Search Tasks",
      description: "Free-text search across task names + descriptions in a workspace. Useful when you don't know the list id but have a keyword.",
      parametersSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          query: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 50, default: 20 },
          statuses: {
            type: "array",
            items: { type: "string" },
            description: "Restrict to these status names",
          },
        },
        required: ["workspaceId", "query"],
      },
    },
    {
      name: TOOL_NAMES.createTask,
      displayName: "ClickUp Create Task",
      description: "Create a new task in a list. Returns the created task with its id and URL. Status must match an existing status in the list (use list_tasks first to discover them).",
      parametersSchema: {
        type: "object",
        properties: {
          listId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          assignees: { type: "array", items: { type: "number" } },
          status: { type: "string" },
          priority: { type: "integer", minimum: 1, maximum: 4, description: "1=urgent, 2=high, 3=normal, 4=low" },
          dueDate: { type: "number", description: "Unix ms" },
          startDate: { type: "number", description: "Unix ms" },
          tags: { type: "array", items: { type: "string" }, description: "Tag names; must already exist in the space" },
        },
        required: ["listId", "name"],
      },
    },
    {
      name: TOOL_NAMES.updateTask,
      displayName: "ClickUp Update Task",
      description: "Patch one or more fields on an existing task. Only include fields you want to change. Pass null for dueDate/startDate to clear them.",
      parametersSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string" },
          priority: { type: "integer", minimum: 1, maximum: 4 },
          dueDate: { type: "number" },
          startDate: { type: "number" },
          assigneesAdd: { type: "array", items: { type: "number" } },
          assigneesRemove: { type: "array", items: { type: "number" } },
        },
        required: ["taskId"],
      },
    },
    {
      name: TOOL_NAMES.addComment,
      displayName: "ClickUp Add Comment",
      description: "Append a comment to a task. Use for status updates, blockers, handoff notes.",
      parametersSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          commentText: { type: "string" },
          notifyAll: { type: "boolean", default: false, description: "Notify all task assignees (default: only mentioned users)" },
        },
        required: ["taskId", "commentText"],
      },
    },
  ],
};

export default manifest;
