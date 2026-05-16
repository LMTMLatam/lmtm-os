# @paperclipai/mcp-supabase

Standalone Model Context Protocol (MCP) server exposing read-only access to a
Postgres database (Supabase or any other Postgres). Designed to be invoked
over stdio by an MCP client such as Claude Desktop, Cursor, Cline, or the
Paperclip MCP client.

## Tools

- `list_tables({ schema?: string })` — list tables in a schema (default `public`)
- `describe_table({ schema?: string, table: string })` — column metadata
- `query({ sql: string, limit?: number })` — read-only SQL (SELECT/WITH/
  EXPLAIN/SHOW/TABLE). Mutating keywords (INSERT/UPDATE/…) are rejected. A
  `LIMIT N` is appended if not already present.
- `count_rows({ schema?: string, table: string })` — row count

## Configuration

Set one of these env vars before starting the server:

- `SUPABASE_DATABASE_URL` (preferred) — full Postgres connection string
- `DATABASE_URL` (fallback)

SSL is enforced when the host ends in `supabase.co`.

## Run

```bash
# Build once
pnpm --filter @paperclipai/mcp-supabase build

# Then either invoke via the bin shim
SUPABASE_DATABASE_URL=postgres://... npx lmtm-mcp-supabase

# Or run from source in dev
SUPABASE_DATABASE_URL=postgres://... pnpm --filter @paperclipai/mcp-supabase dev
```

## Wiring with Claude Desktop / Cline / Cursor

Add to your MCP config:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["lmtm-mcp-supabase"],
      "env": {
        "SUPABASE_DATABASE_URL": "postgres://..."
      }
    }
  }
}
```
