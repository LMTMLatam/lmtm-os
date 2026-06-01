import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// LMTM-OS: planilla_sync_state
// Tracks each external "planilla" (Google Sheet, Airtable, etc.) that the
// Dashboard Builder agent polls. State machine: pending -> running -> done|error.

export const planillaSyncState = pgTable(
  "planilla_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    externalResourceId: text("external_resource_id").notNull(),
    credentialsSecretId: uuid("credentials_secret_id"),
    lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    consecutiveFailures: text("consecutive_failures").notNull().default("0"),
    polledCount: text("polled_count").notNull().default("0"),
    createdCount: text("created_count").notNull().default("0"),
    updatedCount: text("updated_count").notNull().default("0"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index("planilla_sync_state_source_idx").on(table.source),
  }),
);

export type PlanillaSyncState = typeof planillaSyncState.$inferSelect;
export type NewPlanillaSyncState = typeof planillaSyncState.$inferInsert;

// LMTM-OS: client_dashboard_links
// Each client can have multiple magic-link access URLs. Links are signed
// (token stored hashed), time-bounded, and scopeable to specific dashboard
// sections. The client receives the link via email/WhatsApp; opening the
// link sets a long-lived cookie scoped to that client only.

export const clientDashboardLinks = pgTable(
  "client_dashboard_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    scopes: text("scopes").array().notNull().default(["dashboard:read"]),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: text("use_count").notNull().default("0"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUq: uniqueIndex("client_dashboard_links_token_hash_uq").on(table.tokenHash),
    clientIdx: index("client_dashboard_links_client_idx").on(table.clientId),
    expiresIdx: index("client_dashboard_links_expires_idx").on(table.expiresAt),
  }),
);

export type ClientDashboardLink = typeof clientDashboardLinks.$inferSelect;
export type NewClientDashboardLink = typeof clientDashboardLinks.$inferInsert;
