// LMTM-OS: Google tool implementations (Sheets · Drive · Apps Script).
// These power the content pipeline: agents read/write the per-client
// planning Sheet, copy Sheet templates in Drive when onboarding a new
// client, and create/update the bound Apps Script that pushes rows into
// ClickUp. All calls go through gFetch (OAuth2 refresh-token auth).

import { z } from "zod";
import { gFetch } from "./api.js";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const SCRIPT = "https://script.googleapis.com/v1/projects";

// ── Sheets ────────────────────────────────────────────────────────────────

export const sheetsReadSchema = z.object({
  spreadsheetId: z.string().describe("The spreadsheet ID (from its URL)."),
  range: z
    .string()
    .describe("A1 notation range, e.g. 'Hoja 1!A1:F100' or 'A:F'. Include the tab name to be safe."),
});
export async function sheetsRead(i: z.infer<typeof sheetsReadSchema>) {
  return gFetch(`${SHEETS}/${i.spreadsheetId}/values/${encodeURIComponent(i.range)}`, {
    query: { majorDimension: "ROWS" },
  });
}

export const sheetsAppendSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe("Target range/tab, e.g. 'Hoja 1!A1'. Rows are appended after the last row with data."),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).describe("Rows to append; each row is an array of cell values."),
});
export async function sheetsAppend(i: z.infer<typeof sheetsAppendSchema>) {
  return gFetch(`${SHEETS}/${i.spreadsheetId}/values/${encodeURIComponent(i.range)}:append`, {
    method: "POST",
    query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
    jsonBody: { values: i.values },
  });
}

export const sheetsUpdateSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe("Exact A1 range to overwrite, e.g. 'Hoja 1!A2:F2'."),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});
export async function sheetsUpdate(i: z.infer<typeof sheetsUpdateSchema>) {
  return gFetch(`${SHEETS}/${i.spreadsheetId}/values/${encodeURIComponent(i.range)}`, {
    method: "PUT",
    query: { valueInputOption: "USER_ENTERED" },
    jsonBody: { values: i.values },
  });
}

export const sheetsMetadataSchema = z.object({
  spreadsheetId: z.string(),
});
export async function sheetsMetadata(i: z.infer<typeof sheetsMetadataSchema>) {
  return gFetch(`${SHEETS}/${i.spreadsheetId}`, {
    query: { fields: "spreadsheetId,properties.title,sheets.properties(sheetId,title,index,gridProperties)" },
  });
}

export const sheetsCreateSchema = z.object({
  title: z.string().describe("Title of the new spreadsheet."),
});
export async function sheetsCreate(i: z.infer<typeof sheetsCreateSchema>) {
  return gFetch(SHEETS, { method: "POST", jsonBody: { properties: { title: i.title } } });
}

// ── Drive ─────────────────────────────────────────────────────────────────

export const driveListSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Drive query (q). E.g. \"name contains 'Plantilla'\", \"'<folderId>' in parents\", \"mimeType='application/vnd.google-apps.spreadsheet'\". Omit to list recent files.",
    ),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});
export async function driveList(i: z.infer<typeof driveListSchema>) {
  return gFetch(DRIVE, {
    query: {
      q: i.query,
      pageSize: i.pageSize ?? 25,
      fields: "files(id,name,mimeType,parents,modifiedTime,webViewLink),nextPageToken",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    },
  });
}

export const driveCopySchema = z.object({
  fileId: z.string().describe("ID of the file (e.g. a Sheet template) to copy."),
  name: z.string().describe("Name for the new copy."),
  parentFolderId: z.string().optional().describe("Destination folder ID. Omit to copy into the same location."),
});
export async function driveCopy(i: z.infer<typeof driveCopySchema>) {
  return gFetch(`${DRIVE}/${i.fileId}/copy`, {
    method: "POST",
    query: { supportsAllDrives: true, fields: "id,name,webViewLink,parents" },
    jsonBody: { name: i.name, ...(i.parentFolderId ? { parents: [i.parentFolderId] } : {}) },
  });
}

export const driveGetSchema = z.object({
  fileId: z.string(),
});
export async function driveGet(i: z.infer<typeof driveGetSchema>) {
  return gFetch(`${DRIVE}/${i.fileId}`, {
    query: { supportsAllDrives: true, fields: "id,name,mimeType,parents,modifiedTime,webViewLink,owners(emailAddress)" },
  });
}

export const driveMoveSchema = z.object({
  fileId: z.string().describe("ID of the file to move (e.g. an Apps Script project, which is a Drive file)."),
  addParentId: z.string().describe("Destination folder ID."),
  removeParentId: z.string().optional().describe("Current parent folder ID to detach from (e.g. 'root')."),
});
export async function driveMove(i: z.infer<typeof driveMoveSchema>) {
  return gFetch(`${DRIVE}/${i.fileId}`, {
    method: "PATCH",
    query: {
      supportsAllDrives: true,
      addParents: i.addParentId,
      removeParents: i.removeParentId ?? "root",
      fields: "id,name,parents",
    },
  });
}

export const driveCreateFolderSchema = z.object({
  name: z.string(),
  parentFolderId: z.string().optional().describe("Parent folder ID. Omit for My Drive root."),
});
export async function driveCreateFolder(i: z.infer<typeof driveCreateFolderSchema>) {
  return gFetch(DRIVE, {
    method: "POST",
    query: { supportsAllDrives: true, fields: "id,name,webViewLink" },
    jsonBody: {
      name: i.name,
      mimeType: "application/vnd.google-apps.folder",
      ...(i.parentFolderId ? { parents: [i.parentFolderId] } : {}),
    },
  });
}

// ── Apps Script ─────────────────────────────────────────────────────────────
// Note: the Apps Script API must be enabled for the project and the user
// (script.google.com/home/usersettings → Google Apps Script API ON).

export const scriptCreateSchema = z.object({
  title: z.string().describe("Title of the new Apps Script project."),
  parentId: z
    .string()
    .optional()
    .describe("Optional Drive file ID (e.g. a Sheet) to bind the script to as a container-bound script."),
});
export async function scriptCreate(i: z.infer<typeof scriptCreateSchema>) {
  return gFetch(SCRIPT, {
    method: "POST",
    jsonBody: { title: i.title, ...(i.parentId ? { parentId: i.parentId } : {}) },
  });
}

export const scriptGetContentSchema = z.object({
  scriptId: z.string(),
});
export async function scriptGetContent(i: z.infer<typeof scriptGetContentSchema>) {
  return gFetch(`${SCRIPT}/${i.scriptId}/content`);
}

export const scriptProcessesSchema = z.object({
  scriptId: z.string().describe("The Apps Script project id whose executions to list."),
  statuses: z
    .array(z.enum(["COMPLETED", "CANCELED", "FAILED", "TIMED_OUT", "RUNNING", "PAUSED", "UNKNOWN"]))
    .optional()
    .describe("Filter to these execution statuses (e.g. ['FAILED','TIMED_OUT'] to catch errors)."),
  pageSize: z.number().int().min(1).max(50).optional().default(20),
});
export async function scriptProcesses(i: z.infer<typeof scriptProcessesSchema>) {
  // scriptId is a top-level query param (NOT under scriptProcessFilter). We
  // fetch recent executions and let the caller filter by status, which avoids
  // the repeated-param encoding the single-value query helper can't express.
  const query: Record<string, string | number> = {
    scriptId: i.scriptId,
    pageSize: i.pageSize ?? 20,
  };
  if (i.statuses?.length === 1) query["scriptProcessFilter.statuses"] = i.statuses[0];
  return gFetch("https://script.googleapis.com/v1/processes:listScriptProcesses", { query });
}

export const scriptUpdateContentSchema = z.object({
  scriptId: z.string(),
  files: z
    .array(
      z.object({
        name: z.string().describe("File name without extension, e.g. 'Code' or 'appsscript'."),
        type: z.enum(["SERVER_JS", "HTML", "JSON"]).describe("SERVER_JS for .gs code, JSON for the manifest (must be named 'appsscript')."),
        source: z.string().describe("Full file contents."),
      }),
    )
    .describe("Complete set of files for the project. This REPLACES all existing files, so include the manifest too."),
});
export async function scriptUpdateContent(i: z.infer<typeof scriptUpdateContentSchema>) {
  return gFetch(`${SCRIPT}/${i.scriptId}/content`, {
    method: "PUT",
    jsonBody: { files: i.files },
  });
}
