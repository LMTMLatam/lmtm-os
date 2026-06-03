// LMTM-OS: ClickUp plugin worker.
// Registers 10 tools that wrap the ClickUp v2 REST API. Each handler
// reads the resolved API token from secrets (referenced by the
// instance config `apiTokenSecretRef`), builds the request, and
// returns a ToolResult that the Paperclip runtime will surface back
// to the model.
//
// Reference: https://clickup.com/api

import { definePlugin } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, TOOL_NAMES } from "./manifest.js";

const DEFAULT_API_BASE = "https://api.clickup.com/api/v2";

type RunContextLike = {
  companyId: string;
  runId?: string;
  actorId?: string;
};

type ToolResult = {
  content: string;
  data?: Record<string, unknown>;
  error?: string;
};

class ClickUpApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ClickUpApiError";
  }
}

type ResolvedConfig = {
  apiBase: string;
  apiToken: string;
};

async function resolveConfig(ctx: {
  config: { get(): Promise<Record<string, unknown>> };
  secrets: { resolve(ref: string): Promise<string | null> };
}): Promise<ResolvedConfig> {
  const cfg = (await ctx.config.get()) as { apiTokenSecretRef?: string; apiBase?: string };
  const ref = cfg.apiTokenSecretRef ?? "CLICKUP_API_TOKEN";
  const apiToken = (await ctx.secrets.resolve(ref)) ?? "";
  if (!apiToken) {
    throw new Error(
      `ClickUp API token not configured. Set secret ref "${ref}" in the plugin instance config.`,
    );
  }
  return {
    apiBase: (cfg.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, ""),
    apiToken,
  };
}

async function cuFetch<T = unknown>(
  cfg: ResolvedConfig,
  path: string,
  init?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, string | number | boolean | undefined | null | Array<string | number>>;
    jsonBody?: Record<string, unknown> | Array<unknown>;
  },
): Promise<T> {
  const url = new URL(`${cfg.apiBase}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        // ClickUp expects some query params as JSON-encoded arrays (e.g. statuses=[]).
        url.searchParams.set(k, JSON.stringify(v));
      } else if (v === "") {
        continue;
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const headers: Record<string, string> = {
    Authorization: cfg.apiToken, // bare token, NOT "Bearer ..."
    "Content-Type": "application/json",
  };
  const fetchInit: RequestInit = {
    method: init?.method ?? "GET",
    headers,
  };
  if (init?.jsonBody !== undefined) {
    fetchInit.body = JSON.stringify(init.jsonBody);
  }
  const r = await fetch(url.toString(), fetchInit);
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!r.ok) {
    const body = parsed as { err?: string; ECODE?: string; errors?: Array<{ field?: string; message?: string }> } | null;
    const msg =
      body?.err ??
      (Array.isArray(body?.errors) && body!.errors!.length > 0
        ? body!.errors!.map((e) => `${e.field ?? "?"}: ${e.message ?? "?"}`).join("; ")
        : text.slice(0, 200) || `HTTP ${r.status}`);
    throw new ClickUpApiError(r.status, body?.ECODE ?? null, msg);
  }
  return parsed as T;
}

// ── Helpers ────────────────────────────────────────────────────────────

function taskSummary(t: {
  id: string;
  name: string;
  status?: { status: string; color?: string; orderindex?: number } | null;
  assignees?: Array<{ id: number; username: string; email: string }>;
  priority?: { id: string; priority: string; color?: string } | null;
  due_date?: string | null;
  start_date?: string | null;
  date_created?: string;
  date_updated?: string;
  url?: string;
  list?: { id: string; name: string } | null;
  folder?: { id: string; name: string } | null;
  space?: { id: string; name: string } | null;
  tags?: Array<{ name: string }>;
  description?: string | null;
}) {
  return {
    id: t.id,
    name: t.name,
    status: t.status?.status ?? null,
    assignees: (t.assignees ?? []).map((a) => ({ id: a.id, username: a.username, email: a.email })),
    priority: t.priority?.priority ?? null,
    dueDate: t.due_date ? Number(t.due_date) : null,
    startDate: t.start_date ? Number(t.start_date) : null,
    createdAt: t.date_created ? Number(t.date_created) : null,
    updatedAt: t.date_updated ? Number(t.date_updated) : null,
    url: t.url ?? null,
    location: {
      list: t.list ? { id: t.list.id, name: t.list.name } : null,
      folder: t.folder ? { id: t.folder.id, name: t.folder.name } : null,
      space: t.space ? { id: t.space.id, name: t.space.name } : null,
    },
    tags: (t.tags ?? []).map((tag) => tag.name),
    description: t.description ?? null,
  };
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function ok(value: unknown): ToolResult {
  return { content: toText(value), data: (value && typeof value === "object" ? (value as Record<string, unknown>) : undefined) };
}

function err(message: string): ToolResult {
  return { content: `Error: ${message}`, error: message };
}

// ── Plugin ─────────────────────────────────────────────────────────────

export default definePlugin({
  async setup(ctx) {
    // Resolve config once at setup so we can fail fast if the secret
    // is missing. If the secret is rotated, the operator can reload
    // the plugin instance from the PluginManager UI.
    let cached: ResolvedConfig | null = null;
    const getCfg = async (): Promise<ResolvedConfig> => {
      if (!cached) cached = await resolveConfig(ctx);
      return cached;
    };

    ctx.logger.info(`${PLUGIN_ID} v0.1.0 starting`);

    // ── list_workspaces ───────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listWorkspaces,
      {
        displayName: "ClickUp List Workspaces",
        description: "Discover ClickUp workspaces (called 'Teams' in the API) visible to the current API token. Call this first to get a workspaceId.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, _run: RunContextLike): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const data = await cuFetch<{ teams: Array<{ id: string; name: string; color?: string; members?: unknown[] }> }>(
            cfg,
            "/team",
          );
          return ok({
            workspaces: data.teams.map((t) => ({
              id: t.id,
              name: t.name,
              color: t.color ?? null,
              memberCount: Array.isArray(t.members) ? t.members.length : null,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_spaces ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listSpaces,
      {
        displayName: "ClickUp List Spaces",
        description: "List spaces in a workspace. Each space typically maps to one LMTM client.",
        parametersSchema: {
          type: "object",
          properties: {
            workspaceId: { type: "string" },
            archived: { type: "boolean", default: false },
          },
          required: ["workspaceId"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { workspaceId: string; archived?: boolean };
          const data = await cuFetch<{ spaces: Array<{ id: string; name: string; private?: boolean; multiple_lists?: boolean; status?: { color?: string; archvied?: boolean } }> }>(
            cfg,
            `/team/${encodeURIComponent(p.workspaceId)}/space`,
            { query: { archived: p.archived } },
          );
          return ok({
            spaces: data.spaces.map((s) => ({
              id: s.id,
              name: s.name,
              private: s.private ?? false,
              multipleLists: s.multiple_lists ?? true,
              archived: s.status?.archvied ?? false,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_folders ──────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listFolders,
      {
        displayName: "ClickUp List Folders",
        description: "List folders in a space. Folders group related lists (e.g. per month or per project).",
        parametersSchema: {
          type: "object",
          properties: {
            spaceId: { type: "string" },
            archived: { type: "boolean", default: false },
          },
          required: ["spaceId"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { spaceId: string; archived?: boolean };
          const data = await cuFetch<{ folders: Array<{ id: string; name: string; orderindex?: number; hidden?: boolean; lists?: Array<{ id: string; name: string }> }> }>(
            cfg,
            `/space/${encodeURIComponent(p.spaceId)}/folder`,
            { query: { archived: p.archived } },
          );
          return ok({
            folders: data.folders.map((f) => ({
              id: f.id,
              name: f.name,
              hidden: f.hidden ?? false,
              lists: (f.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_folderless_lists ─────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listFolderlessLists,
      {
        displayName: "ClickUp Folderless Lists",
        description: "List lists in a space that are NOT inside any folder.",
        parametersSchema: {
          type: "object",
          properties: {
            spaceId: { type: "string" },
            archived: { type: "boolean", default: false },
          },
          required: ["spaceId"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { spaceId: string; archived?: boolean };
          const data = await cuFetch<{ lists: Array<{ id: string; name: string; orderindex?: number; status?: string | null; assignee?: string | null; task_count?: string }> }>(
            cfg,
            `/space/${encodeURIComponent(p.spaceId)}/list`,
            { query: { archived: p.archived } },
          );
          return ok({
            lists: data.lists.map((l) => ({
              id: l.id,
              name: l.name,
              taskCount: l.task_count ? Number(l.task_count) : null,
              status: l.status ?? null,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_lists ────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listLists,
      {
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
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { folderId: string; archived?: boolean };
          const data = await cuFetch<{ lists: Array<{ id: string; name: string; orderindex?: number; status?: string | null; assignee?: string | null; task_count?: string }> }>(
            cfg,
            `/folder/${encodeURIComponent(p.folderId)}/list`,
            { query: { archived: p.archived } },
          );
          return ok({
            lists: data.lists.map((l) => ({
              id: l.id,
              name: l.name,
              taskCount: l.task_count ? Number(l.task_count) : null,
              status: l.status ?? null,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_tasks ────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listTasks,
      {
        displayName: "ClickUp List Tasks",
        description: "List tasks in a list with optional filters (status, assignees, pagination, sort). Returns at most 100 per page.",
        parametersSchema: {
          type: "object",
          properties: {
            listId: { type: "string" },
            archived: { type: "boolean", default: false },
            status: { type: "array", items: { type: "string" } },
            assignees: { type: "array", items: { type: "number" } },
            includeClosed: { type: "boolean", default: false },
            page: { type: "number", minimum: 0, default: 0 },
            pageSize: { type: "number", minimum: 1, maximum: 100, default: 50 },
            orderBy: { type: "string", enum: ["id", "created", "updated", "due_date"], default: "updated" },
            reverse: { type: "boolean", default: true },
          },
          required: ["listId"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as {
            listId: string;
            archived?: boolean;
            status?: string[];
            assignees?: number[];
            includeClosed?: boolean;
            page?: number;
            pageSize?: number;
            orderBy?: "id" | "created" | "updated" | "due_date";
            reverse?: boolean;
          };
          const query: Record<string, string | number | boolean | Array<string | number> | undefined> = {
            archived: p.archived,
            page: p.page ?? 0,
            limit: p.pageSize ?? 50,
            order_by: p.orderBy ?? "updated",
            reverse: p.reverse ?? true,
          };
          if (p.status && p.status.length > 0) query.statuses = p.status;
          if (p.assignees && p.assignees.length > 0) query.assignees = p.assignees;
          if (p.includeClosed) query.include_closed = true;

          const data = await cuFetch<{
            tasks: Array<Parameters<typeof taskSummary>[0]>;
            lastPage?: boolean;
          }>(cfg, `/list/${encodeURIComponent(p.listId)}/task`, { query });

          return ok({
            lastPage: data.lastPage ?? true,
            tasks: data.tasks.map(taskSummary),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── get_task ──────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.getTask,
      {
        displayName: "ClickUp Get Task",
        description: "Fetch full detail of a single task: id, name, status, priority, assignees, dates, description, tags, location.",
        parametersSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            includeSubtasks: { type: "boolean", default: false },
          },
          required: ["taskId"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { taskId: string; includeSubtasks?: boolean };
          const data = await cuFetch<Record<string, unknown>>(
            cfg,
            `/task/${encodeURIComponent(p.taskId)}`,
            { query: p.includeSubtasks ? { include_subtasks: true } : undefined },
          );
          return ok(taskSummary(data as unknown as Parameters<typeof taskSummary>[0]));
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── search_tasks ──────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.searchTasks,
      {
        displayName: "ClickUp Search Tasks",
        description: "Free-text search across task names + descriptions in a workspace.",
        parametersSchema: {
          type: "object",
          properties: {
            workspaceId: { type: "string" },
            query: { type: "string" },
            limit: { type: "number", minimum: 1, maximum: 50, default: 20 },
            statuses: { type: "array", items: { type: "string" } },
          },
          required: ["workspaceId", "query"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { workspaceId: string; query: string; limit?: number; statuses?: string[] };
          const body: Record<string, unknown> = {
            query: p.query,
            limit: p.limit ?? 20,
            search_for: "tasks",
          };
          if (p.statuses && p.statuses.length > 0) {
            body.filters = { statuses: p.statuses };
          }
          const data = await cuFetch<{ tasks: Parameters<typeof taskSummary>[0][] }>(
            cfg,
            `/team/${encodeURIComponent(p.workspaceId)}/task`,
            { method: "POST", jsonBody: body },
          );
          return ok({
            count: data.tasks.length,
            tasks: data.tasks.map(taskSummary),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── create_task ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.createTask,
      {
        displayName: "ClickUp Create Task",
        description: "Create a new task in a list. Status must match an existing status in the list (use list_tasks to discover them).",
        parametersSchema: {
          type: "object",
          properties: {
            listId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            assignees: { type: "array", items: { type: "number" } },
            status: { type: "string" },
            priority: { type: "integer", minimum: 1, maximum: 4 },
            dueDate: { type: "number" },
            startDate: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["listId", "name"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as {
            listId: string;
            name: string;
            description?: string;
            assignees?: number[];
            status?: string;
            priority?: number;
            dueDate?: number;
            startDate?: number;
            tags?: string[];
          };
          const body: Record<string, unknown> = { name: p.name };
          if (p.description) body.description = p.description;
          if (p.assignees) body.assignees = p.assignees;
          if (p.status) body.status = p.status;
          if (p.priority) body.priority = p.priority;
          if (p.dueDate) body.due_date = p.dueDate;
          if (p.startDate) body.start_date = p.startDate;
          if (p.tags) body.tags = p.tags;
          const data = await cuFetch<Record<string, unknown>>(
            cfg,
            `/list/${encodeURIComponent(p.listId)}/task`,
            { method: "POST", jsonBody: body },
          );
          return ok(taskSummary(data as unknown as Parameters<typeof taskSummary>[0]));
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── update_task ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.updateTask,
      {
        displayName: "ClickUp Update Task",
        description: "Patch one or more fields on an existing task. Only include fields you want to change.",
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
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as {
            taskId: string;
            name?: string;
            description?: string;
            status?: string;
            priority?: number;
            dueDate?: number | null;
            startDate?: number | null;
            assigneesAdd?: number[];
            assigneesRemove?: number[];
          };
          const body: Record<string, unknown> = {};
          if (p.name !== undefined) body.name = p.name;
          if (p.description !== undefined) body.description = p.description;
          if (p.status !== undefined) body.status = p.status;
          if (p.priority !== undefined) body.priority = p.priority;
          if (p.dueDate !== undefined) body.due_date = p.dueDate;
          if (p.startDate !== undefined) body.start_date = p.startDate;
          if (p.assigneesAdd || p.assigneesRemove) {
            body.assignees = { add: p.assigneesAdd ?? [], rem: p.assigneesRemove ?? [] };
          }
          const data = await cuFetch<Record<string, unknown>>(
            cfg,
            `/task/${encodeURIComponent(p.taskId)}`,
            { method: "PUT", jsonBody: body },
          );
          return ok(taskSummary(data as unknown as Parameters<typeof taskSummary>[0]));
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── add_comment ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.addComment,
      {
        displayName: "ClickUp Add Comment",
        description: "Append a comment to a task. Use for status updates, blockers, handoff notes.",
        parametersSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            commentText: { type: "string" },
            notifyAll: { type: "boolean", default: false },
          },
          required: ["taskId", "commentText"],
        },
      },
      async (params, _run): Promise<ToolResult> => {
        try {
          const cfg = await getCfg();
          const p = params as { taskId: string; commentText: string; notifyAll?: boolean };
          const data = await cuFetch<{ id: string; comment: Array<{ id: string; comment_text: string; user: { id: number; username: string }; date: string }> }>(
            cfg,
            `/task/${encodeURIComponent(p.taskId)}/comment`,
            {
              method: "POST",
              jsonBody: {
                comment_text: p.commentText,
                notify_all: p.notifyAll ?? false,
              },
            },
          );
          return ok({
            id: data.id,
            comments: data.comment.map((c) => ({
              id: c.id,
              text: c.comment_text,
              author: c.user.username,
              createdAt: c.date,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );
  },
});
