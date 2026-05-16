import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "MCP supabase server requires SUPABASE_DATABASE_URL (or DATABASE_URL).",
    );
  }
  _sql = postgres(url, {
    max: 2,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: url.includes("supabase.co") ? "require" : "prefer",
    onnotice: () => {},
  });
  return _sql;
}

const READONLY_RE = /^\s*(select|with|explain|show|table)\b/i;
const FORBIDDEN_RE = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|reindex|vacuum|copy)\b/i;

export function assertReadOnly(query: string) {
  const trimmed = query.trim();
  if (!READONLY_RE.test(trimmed)) {
    throw new Error("Only SELECT, WITH, EXPLAIN, SHOW and TABLE queries are allowed.");
  }
  if (FORBIDDEN_RE.test(trimmed)) {
    throw new Error("Mutating SQL keywords are forbidden in this read-only MCP server.");
  }
}
