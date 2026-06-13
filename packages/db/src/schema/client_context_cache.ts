// LMTM-OS: client_context_cache
//
// Per-(client, source) cache of the latest "context" payload
// fetched from an external system. Used by the agent context loader
// to inject domain context (e.g. ClickUp "Enfoque Técnico" list
// contents) into prompts without hitting the external API on every
// agent invocation.
//
// `source` is free-form for now but expected values are:
//   - "clickup-enfoque-tecnico"   (list contents, Enfoque Técnico)
//   - "meta-account-context"      (cached Meta account info)
//   - "google-ads-context"        (cached Google Ads context)

import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { clients } from "./clients.js";

export const clientContextCache = pgTable(
  "client_context_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clientSourceUq: uniqueIndex("client_context_cache_client_source_idx").on(
      table.clientId,
      table.source,
    ),
  }),
);

export type ClientContextCache = typeof clientContextCache.$inferSelect;
export type NewClientContextCache = typeof clientContextCache.$inferInsert;
