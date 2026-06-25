// LMTM-OS: in-process wrappers around the ClickUp + Google Sheets MCP servers.
//
// The MCP servers themselves run as stdio children (used by Claude Code via
// `.mcp.json`). For the LMTM agents (running in-process on the server), it's
// cheaper and simpler to call the same tool implementations directly. These
// wrappers are what the `clickup_*` and `sheets_*` agent tools in
// `routes/agent-tools.ts` call.
//
// Auth (read from process.env at call time, NOT import time, so changing env
// in production picks up on the next call without a restart):
//   CLICKUP_API_TOKEN, GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN

import {
  listWorkspaces as cuListWorkspaces,
  listSpaces as cuListSpaces,
  listFolders as cuListFolders,
  listLists as cuListLists,
  listTasks as cuListTasks,
  getTask as cuGetTask,
  createTask as cuCreateTask,
  updateTask as cuUpdateTask,
  addComment as cuAddComment,
} from "@paperclipai/mcp-clickup";

import {
  sheetsRead as gSheetsRead,
  sheetsAppend as gSheetsAppend,
  sheetsUpdate as gSheetsUpdate,
  sheetsMetadata as gSheetsMetadata,
  driveList as gDriveList,
} from "@paperclipai/mcp-google";

export const clickupTools = {
  listWorkspaces: () => cuListWorkspaces({}),
  listSpaces: (input: { workspaceId: string; archived?: boolean }) => cuListSpaces(input as never),
  listFolders: (input: { spaceId: string; archived?: boolean }) => cuListFolders(input as never),
  listLists: (input: { folderId: string; archived?: boolean }) => cuListLists(input as never),
  listTasks: (input: { listId: string; archived?: boolean; limit?: number }) =>
    cuListTasks({ ...input, page: 0, reverse: false, pageSize: input.limit ?? 50, orderBy: "due_date", includeClosed: true } as never),
  getTask: (input: { taskId: string; includeSubtasks?: boolean }) =>
    cuGetTask({ taskId: input.taskId, includeSubtasks: input.includeSubtasks ?? false } as never),
  createTask: (input: {
    listId: string;
    name: string;
    description?: string;
    assignees?: number[];
    status?: string;
    priority?: number;
    dueDate?: number;
    startDate?: number;
    tags?: string[];
  }) => cuCreateTask(input),
  updateTask: (input: {
    taskId: string;
    name?: string;
    description?: string;
    status?: string;
    priority?: number;
    dueDate?: number | null;
    startDate?: number | null;
    assigneesAdd?: number[];
    assigneesRemove?: number[];
  }) => cuUpdateTask(input),
  addComment: (input: { taskId: string; commentText: string; notifyAll?: boolean }) =>
    cuAddComment({ taskId: input.taskId, commentText: input.commentText, notifyAll: input.notifyAll ?? false } as never),
} as const;

export const googleTools = {
  sheetsRead: (input: { spreadsheetId: string; range: string }) => gSheetsRead(input as never),
  sheetsAppend: (input: { spreadsheetId: string; range: string; values: unknown[][] }) =>
    gSheetsAppend({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
      values: input.values as Array<Array<string | number | boolean | null>>,
    } as never),
  sheetsUpdate: (input: { spreadsheetId: string; range: string; values: unknown[][] }) =>
    gSheetsUpdate({
      spreadsheetId: input.spreadsheetId,
      range: input.range,
      values: input.values as Array<Array<string | number | boolean | null>>,
    } as never),
  sheetsMetadata: (input: { spreadsheetId: string }) => gSheetsMetadata(input as never),
  driveList: (input: { query: string; limit?: number }) =>
    gDriveList({ query: input.query, pageSize: input.limit ?? 20 } as never),
} as const;

/**
 * Sanity-check at boot: do the MCP server packages import correctly? We don't
 * want an agent run to fail mid-flight because the import path is wrong.
 */
export function mcpToolsAvailable(): { clickup: boolean; google: boolean; reason?: string } {
  try {
    void clickupTools.listWorkspaces;
  } catch (e) {
    return { clickup: false, google: false, reason: e instanceof Error ? e.message : String(e) };
  }
  try {
    void googleTools.sheetsMetadata;
  } catch (e) {
    return { clickup: true, google: false, reason: e instanceof Error ? e.message : String(e) };
  }
  return { clickup: true, google: true };
}