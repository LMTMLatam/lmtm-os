// LMTM-OS: ClickUp MCP tools.
// Each tool has a Zod schema (input validation) and an async function
// (the implementation). The server wires these up via server.tool()
// in index.ts.
//
// Reference: https://clickup.com/api/developer

import { z } from "zod";
import { clickupFetch } from "./api.js";

// ---- Read: workspace → space → folder → list → task tree ----

export const listWorkspacesSchema = z.object({});

export async function listWorkspaces(_input: z.infer<typeof listWorkspacesSchema>) {
  const data = await clickupFetch<{ teams: Array<{ id: string; name: string; color?: string; avatar?: string | null; members?: Array<{ user: { id: number; username: string; email: string } }> }> }>(
    readToken(),
    "/team",
  );
  return {
    workspaces: data.teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? null,
      memberCount: Array.isArray(t.members) ? t.members.length : null,
    })),
  };
}

export const listSpacesSchema = z.object({
  workspaceId: z.string().min(1).describe("ClickUp workspace id (a.k.a. team id, from list_workspaces)"),
  archived: z.boolean().optional().default(false),
});

export async function listSpaces(input: z.infer<typeof listSpacesSchema>) {
  const data = await clickupFetch<{ spaces: Array<{ id: string; name: string; private?: boolean; status?: { color?: string; archvied?: boolean }; multiple_lists?: boolean }> }>(
    readToken(),
    `/team/${encodeURIComponent(input.workspaceId)}/space`,
    { query: { archived: input.archived } },
  );
  return {
    spaces: data.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      private: s.private ?? false,
      multipleLists: s.multiple_lists ?? true,
      archived: s.status?.archvied ?? false,
    })),
  };
}

export const listFoldersSchema = z.object({
  spaceId: z.string().min(1).describe("ClickUp space id (from list_spaces)"),
  archived: z.boolean().optional().default(false),
});

export async function listFolders(input: z.infer<typeof listFoldersSchema>) {
  const data = await clickupFetch<{ folders: Array<{ id: string; name: string; orderindex?: number; hidden?: boolean; lists?: Array<{ id: string; name: string }> }> }>(
    readToken(),
    `/space/${encodeURIComponent(input.spaceId)}/folder`,
    { query: { archived: input.archived } },
  );
  return {
    folders: data.folders.map((f) => ({
      id: f.id,
      name: f.name,
      hidden: f.hidden ?? false,
      lists: (f.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
    })),
  };
}

export const listFolderlessListsSchema = z.object({
  spaceId: z.string().min(1).describe("ClickUp space id"),
  archived: z.boolean().optional().default(false),
});

export async function listFolderlessLists(input: z.infer<typeof listFolderlessListsSchema>) {
  // ClickUp spaces can have lists outside of any folder ("folderless lists").
  const data = await clickupFetch<{ lists: Array<{ id: string; name: string; orderindex?: number; status?: string | null; assignee?: string | null; task_count?: string }> }>(
    readToken(),
    `/space/${encodeURIComponent(input.spaceId)}/list`,
    { query: { archived: input.archived } },
  );
  return {
    lists: data.lists.map((l) => ({
      id: l.id,
      name: l.name,
      taskCount: l.task_count ? Number(l.task_count) : null,
      status: l.status ?? null,
    })),
  };
}

export const listListsSchema = z.object({
  folderId: z.string().min(1).describe("ClickUp folder id (from list_folders)"),
  archived: z.boolean().optional().default(false),
});

export async function listLists(input: z.infer<typeof listListsSchema>) {
  const data = await clickupFetch<{ lists: Array<{ id: string; name: string; orderindex?: number; status?: string | null; assignee?: string | null; task_count?: string }> }>(
    readToken(),
    `/folder/${encodeURIComponent(input.folderId)}/list`,
    { query: { archived: input.archived } },
  );
  return {
    lists: data.lists.map((l) => ({
      id: l.id,
      name: l.name,
      taskCount: l.task_count ? Number(l.task_count) : null,
      status: l.status ?? null,
    })),
  };
}

export const listTasksSchema = z.object({
  listId: z.string().min(1).describe("ClickUp list id"),
  archived: z.boolean().optional().default(false),
  status: z.array(z.string()).optional().describe("Filter by status name(s) (e.g. ['to do', 'in progress'])"),
  assignees: z.array(z.number()).optional().describe("Filter by assignee user id(s)"),
  includeClosed: z.boolean().optional().default(false),
  page: z.number().int().min(0).optional().default(0),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  orderBy: z.enum(["id", "created", "updated", "due_date"]).optional().default("updated"),
  reverse: z.boolean().optional().default(true),
});

export async function listTasks(input: z.infer<typeof listTasksSchema>) {
  const query: Record<string, string | number | boolean | undefined> = {
    archived: input.archived,
    page: input.page,
    limit: input.pageSize,
    order_by: input.orderBy,
    reverse: input.reverse,
  };
  if (input.status && input.status.length > 0) query.statuses = JSON.stringify(input.status);
  if (input.assignees && input.assignees.length > 0) query.assignees = JSON.stringify(input.assignees);
  if (input.includeClosed) query.include_closed = true;

  const data = await clickupFetch<{
    tasks: Array<{
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
    }>;
    lastPage?: boolean;
  }>(readToken(), `/list/${encodeURIComponent(input.listId)}/task`, { query });

  return {
    lastPage: data.lastPage ?? true,
    tasks: data.tasks.map(taskSummary),
  };
}

export const getTaskSchema = z.object({
  taskId: z.string().min(1).describe("ClickUp task id (e.g. 'abc123')"),
  includeSubtasks: z.boolean().optional().default(false),
});

export async function getTask(input: z.infer<typeof getTaskSchema>) {
  const data = await clickupFetch<Record<string, unknown>>(
    readToken(),
    `/task/${encodeURIComponent(input.taskId)}`,
    { query: input.includeSubtasks ? { include_subtasks: true } : undefined },
  );
  return taskSummary(data as unknown as TaskLike);
}

// ---- Write: tasks, comments ----

export const createTaskSchema = z.object({
  listId: z.string().min(1).describe("ClickUp list id where the task will be created"),
  name: z.string().min(1).describe("Task title"),
  description: z.string().optional().describe("Plain-text or markdown description"),
  assignees: z.array(z.number()).optional().describe("Assignee user ids"),
  status: z.string().optional().describe("Status name (must match an existing status in the list)"),
  priority: z.number().int().min(1).max(4).optional().describe("1=urgent, 2=high, 3=normal, 4=low"),
  dueDate: z.number().int().optional().describe("Due date as Unix ms"),
  startDate: z.number().int().optional().describe("Start date as Unix ms"),
  tags: z.array(z.string()).optional().describe("Tag names to apply (must exist in the space)"),
});

export async function createTask(input: z.infer<typeof createTaskSchema>) {
  const body: Record<string, unknown> = { name: input.name };
  if (input.description) body.description = input.description;
  if (input.assignees) body.assignees = input.assignees;
  if (input.status) body.status = input.status;
  if (input.priority) body.priority = input.priority;
  if (input.dueDate) body.due_date = input.dueDate;
  if (input.startDate) body.start_date = input.startDate;
  if (input.tags) body.tags = input.tags;

  const data = await clickupFetch<Record<string, unknown>>(
    readToken(),
    `/list/${encodeURIComponent(input.listId)}/task`,
    { method: "POST", jsonBody: body },
  );
  return taskSummary(data as unknown as TaskLike);
}

export const updateTaskSchema = z.object({
  taskId: z.string().min(1).describe("ClickUp task id"),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.string().optional().describe("Status name (must match an existing status)"),
  priority: z.number().int().min(1).max(4).optional(),
  dueDate: z.number().int().optional().nullable().describe("Unix ms, or null to clear"),
  startDate: z.number().int().optional().nullable().describe("Unix ms, or null to clear"),
  assigneesAdd: z.array(z.number()).optional().describe("User ids to add as assignees"),
  assigneesRemove: z.array(z.number()).optional().describe("User ids to remove from assignees"),
});

export async function updateTask(input: z.infer<typeof updateTaskSchema>) {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.status !== undefined) body.status = input.status;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.dueDate !== undefined) body.due_date = input.dueDate;
  if (input.startDate !== undefined) body.start_date = input.startDate;
  if (input.assigneesAdd || input.assigneesRemove) {
    body.assignees = { add: input.assigneesAdd ?? [], rem: input.assigneesRemove ?? [] };
  }
  const data = await clickupFetch<Record<string, unknown>>(
    readToken(),
    `/task/${encodeURIComponent(input.taskId)}`,
    { method: "PUT", jsonBody: body },
  );
  return taskSummary(data as unknown as TaskLike);
}

export const addCommentSchema = z.object({
  taskId: z.string().min(1).describe("ClickUp task id"),
  commentText: z.string().min(1).describe("Comment body. Plain text; ClickUp renders it as-is."),
  notifyAll: z.boolean().optional().default(false).describe("Notify all task assignees (default: only mentioned users)"),
});

export async function addComment(input: z.infer<typeof addCommentSchema>) {
  const data = await clickupFetch<{ id: string; comment: Array<{ id: string; comment_text: string; user: { id: number; username: string }; date: string }> }>(
    readToken(),
    `/task/${encodeURIComponent(input.taskId)}/comment`,
    {
      method: "POST",
      jsonBody: {
        comment_text: input.commentText,
        notify_all: input.notifyAll,
      },
    },
  );
  return {
    id: data.id,
    comments: data.comment.map((c) => ({
      id: c.id,
      text: c.comment_text,
      author: c.user.username,
      createdAt: c.date,
    })),
  };
}

// ---- Search ----

export const searchTasksSchema = z.object({
  workspaceId: z.string().min(1).describe("ClickUp workspace id"),
  query: z.string().min(1).describe("Text to search in task names + descriptions"),
  limit: z.number().int().min(1).max(50).optional().default(20),
  statuses: z.array(z.string()).optional().describe("Restrict to these status names"),
});

export async function searchTasks(input: z.infer<typeof searchTasksSchema>) {
  const body: Record<string, unknown> = {
    query: input.query,
    limit: input.limit,
    search_for: "tasks",
  };
  if (input.statuses && input.statuses.length > 0) {
    body.filters = { statuses: input.statuses };
  }
  const data = await clickupFetch<{ tasks: TaskLike[] }>(
    readToken(),
    `/team/${encodeURIComponent(input.workspaceId)}/task`,
    { method: "POST", jsonBody: body },
  );
  return {
    count: data.tasks.length,
    tasks: data.tasks.map(taskSummary),
  };
}

// ---- Helpers ----

type TaskLike = {
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
};

function taskSummary(t: TaskLike) {
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

function readToken(): string {
  const t = process.env.CLICKUP_API_TOKEN?.trim();
  if (!t) {
    throw new Error(
      "CLICKUP_API_TOKEN not set. Export it before starting the server: export CLICKUP_API_TOKEN=pk_...",
    );
  }
  return t;
}
