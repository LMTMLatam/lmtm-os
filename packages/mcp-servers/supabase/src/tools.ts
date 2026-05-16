import { z } from "zod";
import { assertReadOnly, getSql } from "./db.js";

export const listTablesSchema = z.object({
  schema: z.string().min(1).default("public"),
});

export async function listTables(input: z.infer<typeof listTablesSchema>) {
  const sql = getSql();
  const rows = await sql<
    { table_name: string; table_type: string }[]
  >`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = ${input.schema}
    ORDER BY table_name
  `;
  return rows.map((r) => ({ name: r.table_name, type: r.table_type }));
}

export const describeTableSchema = z.object({
  schema: z.string().min(1).default("public"),
  table: z.string().min(1),
});

export async function describeTable(input: z.infer<typeof describeTableSchema>) {
  const sql = getSql();
  const columns = await sql<
    {
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }[]
  >`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = ${input.schema}
      AND table_name = ${input.table}
    ORDER BY ordinal_position
  `;
  return {
    schema: input.schema,
    table: input.table,
    columns: columns.map((c) => ({
      name: c.column_name,
      type: c.data_type,
      nullable: c.is_nullable === "YES",
      default: c.column_default,
    })),
  };
}

export const querySchema = z.object({
  sql: z.string().min(1).describe("Read-only SQL. Only SELECT/WITH/EXPLAIN/SHOW/TABLE allowed."),
  limit: z.number().int().positive().max(500).default(100),
});

export async function query(input: z.infer<typeof querySchema>) {
  assertReadOnly(input.sql);
  const sql = getSql();
  const rows = await sql.unsafe(`${input.sql.replace(/;\s*$/, "")} LIMIT ${input.limit}`);
  return {
    rowCount: rows.length,
    rows,
  };
}

export const countSchema = z.object({
  schema: z.string().min(1).default("public"),
  table: z.string().min(1),
});

export async function countRows(input: z.infer<typeof countSchema>) {
  const sql = getSql();
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM ${sql(input.schema)}.${sql(input.table)}
  `;
  return { count: Number(rows[0]?.count ?? 0) };
}
