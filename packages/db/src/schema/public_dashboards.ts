import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// LMTM-OS: public dashboards
// A read-only "view key" the agency can hand to a client so they can open
// the dashboard at /public/dashboards/:slug without a login. No expiration
// by design — the agency revokes by deleting the row or toggling `enabled`.

export const publicDashboards = pgTable(
  "public_dashboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label"),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (table) => ({
    slugUq: uniqueIndex("public_dashboards_slug_uq").on(table.slug),
    clientIdx: index("public_dashboards_client_idx").on(table.clientId),
    enabledIdx: index("public_dashboards_enabled_idx").on(table.enabled),
  }),
);

export type PublicDashboard = typeof publicDashboards.$inferSelect;
export type NewPublicDashboard = typeof publicDashboards.$inferInsert;
