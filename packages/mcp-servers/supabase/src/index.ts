import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  countRows,
  countSchema,
  describeTable,
  describeTableSchema,
  listTables,
  listTablesSchema,
  query,
  querySchema,
} from "./tools.js";

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

export function createSupabaseMcpServer() {
  const server = new McpServer({
    name: "supabase",
    version: "0.1.0",
  });

  server.tool(
    "list_tables",
    "List tables visible in a Postgres schema (default: public). Returns name + type.",
    listTablesSchema.shape,
    wrap(listTables),
  );

  server.tool(
    "describe_table",
    "Return column metadata for a table (name, type, nullable, default).",
    describeTableSchema.shape,
    wrap(describeTable),
  );

  server.tool(
    "query",
    "Execute a read-only SQL query (SELECT/WITH/EXPLAIN/SHOW/TABLE only). Returns rows.",
    querySchema.shape,
    wrap(query),
  );

  server.tool(
    "count_rows",
    "Count rows in a table.",
    countSchema.shape,
    wrap(countRows),
  );

  return server;
}

export async function runServer() {
  const server = createSupabaseMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
