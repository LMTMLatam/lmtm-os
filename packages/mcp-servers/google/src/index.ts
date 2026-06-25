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

export function createGoogleMcpServer() {
  const server = new McpServer({ name: "google", version: "0.1.0" });

  // Sheets
  server.tool(
    "sheets_read",
    "Read a range of cells from a Google Sheet (planning sheets per client). Returns rows of values.",
    sheetsReadSchema.shape,
    wrap(sheetsRead),
  );
  server.tool(
    "sheets_append",
    "Append rows to the end of a Google Sheet range. Use to add planned posts.",
    sheetsAppendSchema.shape,
    wrap(sheetsAppend),
  );
  server.tool(
    "sheets_update",
    "Overwrite an exact range in a Google Sheet. Use to fix/transcribe a row that didn't flow to ClickUp.",
    sheetsUpdateSchema.shape,
    wrap(sheetsUpdate),
  );
  server.tool(
    "sheets_metadata",
    "Get a spreadsheet's title and tab list (sheetId, title, dimensions). Use before reading to find the right tab.",
    sheetsMetadataSchema.shape,
    wrap(sheetsMetadata),
  );
  server.tool(
    "sheets_create",
    "Create a new empty Google Spreadsheet. Prefer drive_copy from a template for client onboarding.",
    sheetsCreateSchema.shape,
    wrap(sheetsCreate),
  );

  // Drive
  server.tool(
    "drive_list",
    "Search/list Drive files with an optional query (q). Use to find a client's folder, the Sheet template, or planning sheets.",
    driveListSchema.shape,
    wrap(driveList),
  );
  server.tool(
    "drive_copy",
    "Copy a Drive file (e.g. duplicate the Sheet template) into a folder with a new name. Core of client onboarding.",
    driveCopySchema.shape,
    wrap(driveCopy),
  );
  server.tool(
    "drive_get",
    "Get a Drive file's metadata (name, mimeType, parents, owner, link).",
    driveGetSchema.shape,
    wrap(driveGet),
  );
  server.tool(
    "drive_create_folder",
    "Create a Drive folder (e.g. the per-client folder under AALMTMLATAM).",
    driveCreateFolderSchema.shape,
    wrap(driveCreateFolder),
  );

  // Apps Script
  server.tool(
    "script_create",
    "Create a new Apps Script project, optionally bound to a Sheet (parentId). Use to provision the Sheet→ClickUp script for a new client.",
    scriptCreateSchema.shape,
    wrap(scriptCreate),
  );
  server.tool(
    "script_get_content",
    "Get the files (code + manifest) of an Apps Script project. Use to inspect/repair the Sheet→ClickUp script.",
    scriptGetContentSchema.shape,
    wrap(scriptGetContent),
  );
  server.tool(
    "script_update_content",
    "Replace ALL files of an Apps Script project (include the appsscript manifest). Use to fix or install the Sheet→ClickUp script.",
    scriptUpdateContentSchema.shape,
    wrap(scriptUpdateContent),
  );

  return server;
}

export async function runServer() {
  const server = createGoogleMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
