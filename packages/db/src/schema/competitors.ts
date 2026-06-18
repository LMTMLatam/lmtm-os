// LMTM-OS: competitor library + generated content ideas. See migration
// 0108_competitors_content.sql.

import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// ── Competitors: manually-curated per client ──────────────────────────────────
export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fbPageUrl: text("fb_page_url"),
    igHandle: text("ig_handle"),
    website: text("website"),
    notes: text("notes"),
    // Pasted ad copies / links the team observed from this competitor.
    sampleAds: jsonb("sample_ads").$type<Array<{ text?: string; url?: string }>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ clientIdx: index("competitors_client_idx").on(t.clientId) }),
);
export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;

// ── Content ideas: AI-generated, split pauta (paid) vs posteo (organic) ───────
export const contentIdeas = pgTable(
  "content_ideas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // pauta | posteo
    format: text("format"),
    title: text("title").notNull(),
    copy: text("copy"),
    rationale: text("rationale"),
    source: text("source"),
    batchId: uuid("batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ clientIdx: index("content_ideas_client_idx").on(t.clientId, t.kind) }),
);
export type ContentIdea = typeof contentIdeas.$inferSelect;
export type NewContentIdea = typeof contentIdeas.$inferInsert;
