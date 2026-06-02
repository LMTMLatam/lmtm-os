# @paperclipai/mcp-clickup

Standalone [Model Context Protocol](https://modelcontextprotocol.io/) (MCP)
server exposing ClickUp tasks, lists, spaces, and comments as MCP tools.
Designed to be invoked over stdio by an MCP client such as Claude
Desktop, Cursor, Cline, or the Paperclip MCP client.

## Tools

### Read — discovery
- `list_workspaces({})` — workspaces (a.k.a. Teams) visible to the token
- `list_spaces({ workspaceId, archived? })` — spaces inside a workspace
- `list_folders({ spaceId, archived? })` — folders inside a space
- `list_folderless_lists({ spaceId, archived? })` — lists not inside a folder
- `list_lists({ folderId, archived? })` — lists inside a folder

### Read — tasks
- `list_tasks({ listId, archived?, status?, assignees?, includeClosed?, page?, pageSize?, orderBy?, reverse? })`
- `get_task({ taskId, includeSubtasks? })`
- `search_tasks({ workspaceId, query, limit?, statuses? })`

### Write
- `create_task({ listId, name, description?, assignees?, status?, priority?, dueDate?, startDate?, tags? })`
- `update_task({ taskId, name?, description?, status?, priority?, dueDate?, startDate?, assigneesAdd?, assigneesRemove? })`
- `add_comment({ taskId, commentText, notifyAll? })`

## Authentication

ClickUp uses a **personal API token**, sent bare in the `Authorization`
header (no `Bearer` prefix). Generate one at:

> ClickUp → **Settings** → **Apps** → **API Token**

The token has access to everything the issuing user can see. For tighter
scoping, generate a per-user token.

Set it as an env var before starting the server:

```bash
export CLICKUP_API_TOKEN=pk_1234567_XXXXXXXXXXXXXXXX
```

## Run

### Build once

```bash
pnpm --filter @paperclipai/mcp-clickup build
```

### Invoke via the bin shim

```bash
CLICKUP_API_TOKEN=pk_... npx lmtm-mcp-clickup
```

### Or run from source in dev

```bash
CLICKUP_API_TOKEN=pk_... pnpm --filter @paperclipai/mcp-clickup dev
```

## Wiring with Claude Desktop / Cline / Cursor

Add to your MCP config (`~/.config/claude-desktop/config.json` or
equivalent):

```json
{
  "mcpServers": {
    "clickup": {
      "command": "npx",
      "args": ["lmtm-mcp-clickup"],
      "env": {
        "CLICKUP_API_TOKEN": "pk_..."
      }
    }
  }
}
```

## Notes

- **Priority is numeric in ClickUp**: `1=urgent, 2=high, 3=normal, 4=low`.
  The `priority` field in the task output is the string label
  (`"urgent"`, `"high"`, etc.).
- **Status names are case-sensitive** and must match the exact names
  configured in the list. Use `list_tasks` first to see the valid
  values.
- **Tags are by name, not id** in create_task. The tag must already
  exist in the space.
- **Date fields are Unix milliseconds**, not ISO strings.
- **List pages** cap at 100; paginate with `page` + `pageSize` for
  large lists.
- **Folderless lists**: a space can have lists outside of any folder.
  Use `list_folderless_lists` to discover them.

## Why this is a standalone package, not a Paperclip plugin

Paperclip's agent adapters don't yet have a generic MCP bridge — they
load `tools` from `ctx.context.tools` but don't spawn MCP subprocesses.
This package follows the same pattern as `@paperclipai/mcp-supabase`
and the upstream `@paperclipai/mcp-server`: it runs as its own process
and any MCP client can talk to it. When Paperclip adds a runtime MCP
bridge, this server will plug in without code changes.
