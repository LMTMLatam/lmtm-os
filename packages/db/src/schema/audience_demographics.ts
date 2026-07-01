import {
  pgTable, uuid, text, timestamp, integer, numeric, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";
import { adsConnections } from "./ads_connections.js";

// LMTM-OS: audience demographics snapshot.
// Populated by a Meta breakdowns pass (age/gender/publisher_platform/device).
// The /audience endpoint reads from here so dashboards show who the ads reach,
// instead of the always-empty raw-breakdown tally it used before.
export const audienceDemographics = pgTable("audience_demographics", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  adAccountId: text("ad_account_id"),
  dimension: text("dimension").notNull(), // age | gender | publisher_platform | device
  dimKey: text("dim_key").notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
  leads: integer("leads").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  periodSince: date("period_since"),
  periodUntil: date("period_until"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index("audience_demographics_client_idx").on(t.clientId),
  companyIdx: index("audience_demographics_company_idx").on(t.companyId),
  uniq: uniqueIndex("audience_demographics_uniq").on(t.clientId, t.dimension, t.dimKey),
}));
