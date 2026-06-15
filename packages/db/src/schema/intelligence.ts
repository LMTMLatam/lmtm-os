// LMTM-OS: intelligence layer schema.
// Customer Brain, account scores, feedback, content knowledge graph,
// cumulative learnings and creative opportunities. See migration
// 0107_intelligence_layer.sql.

import { pgTable, uuid, text, integer, numeric, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// ── Customer Brain: living per-client memory ──────────────────────────────────
export const clientMemory = pgTable(
  "client_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // fact | preference | decision | event | performance | risk
    key: text("key").notNull(),
    content: text("content").notNull(),
    source: text("source"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0.7"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clientKindKey: uniqueIndex("client_memory_client_kind_key_idx").on(t.clientId, t.kind, t.key),
    clientIdx: index("client_memory_client_idx").on(t.clientId),
  }),
);
export type ClientMemory = typeof clientMemory.$inferSelect;
export type NewClientMemory = typeof clientMemory.$inferInsert;

// ── Account scores: operational + health ──────────────────────────────────────
export const accountScores = pgTable(
  "account_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    healthScore: integer("health_score").notNull().default(0),
    opsScore: integer("ops_score").notNull().default(0),
    components: jsonb("components").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ clientDate: uniqueIndex("account_scores_client_date_idx").on(t.clientId, t.date) }),
);
export type AccountScore = typeof accountScores.$inferSelect;
export type NewAccountScore = typeof accountScores.$inferInsert;

// ── Feedback items: captured + classified + routed ────────────────────────────
export const feedbackItems = pgTable(
  "feedback_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    rawText: text("raw_text").notNull(),
    classification: text("classification"),
    sentiment: text("sentiment"),
    routedIssueId: uuid("routed_issue_id"),
    status: text("status").notNull().default("new"),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    externalUq: uniqueIndex("feedback_items_external_idx").on(t.externalRef),
    clientIdx: index("feedback_items_client_idx").on(t.clientId),
  }),
);
export type FeedbackItem = typeof feedbackItems.$inferSelect;
export type NewFeedbackItem = typeof feedbackItems.$inferInsert;

// ── Content performance: knowledge graph of content <-> results ───────────────
export const contentPerformance = pgTable(
  "content_performance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    contentRef: text("content_ref").notNull(),
    source: text("source").notNull(), // meta | organic | clickup
    title: text("title"),
    format: text("format"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    score: numeric("score", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refUq: uniqueIndex("content_perf_ref_idx").on(t.contentRef, t.source),
    clientIdx: index("content_perf_client_idx").on(t.clientId),
  }),
);
export type ContentPerformance = typeof contentPerformance.$inferSelect;
export type NewContentPerformance = typeof contentPerformance.$inferInsert;

// ── Learnings: cumulative cross-client/niche patterns ─────────────────────────
export const learnings = pgTable(
  "learnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(), // global | niche | client
    scopeKey: text("scope_key"),
    pattern: text("pattern").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    metricImpact: text("metric_impact"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0.5"),
    occurrences: integer("occurrences").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ scopePattern: uniqueIndex("learnings_scope_pattern_idx").on(t.scope, t.scopeKey, t.pattern) }),
);
export type Learning = typeof learnings.$inferSelect;
export type NewLearning = typeof learnings.$inferInsert;

// ── Opportunities: creative/operational opportunities ─────────────────────────
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // content | campaign | budget | timing
    title: text("title").notNull(),
    rationale: text("rationale"),
    suggestedAction: text("suggested_action"),
    basis: jsonb("basis").$type<Record<string, unknown>>().notNull().default({}),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("new"),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dedup: uniqueIndex("opportunities_dedup_idx").on(t.clientId, t.kind, t.title),
    clientIdx: index("opportunities_client_idx").on(t.clientId),
  }),
);
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
