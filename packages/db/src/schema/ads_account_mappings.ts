import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";
import { adsConnections } from "./ads_connections.js";

// LMTM-OS: per-platform, per-client account mapping.
// One ads_connection can be reused across multiple client accounts. This
// table records which (connection, ad-account) pairs are assigned to which
// client, so the Dashboard Agent can resolve "datos para cliente X" to a
// (connection, adAccountId, pageId) tuple without re-asking each time.
//
// `pageId` is Meta-specific (other platforms store no equivalent). For
// non-Meta platforms the column is null and the platform-specific id lives
// in the connection (e.g. `managerAccountId` for Google, `merchantId`).
//
// `includedAdsets` is a jsonb array of adset IDs the user has explicitly
// opted-in to sync (Make.com-style subset selection). Empty array means
// "sync all adsets under the ad_account" (default for new mappings).
export const adsAccountMappings = pgTable(
  "ads_account_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => adsConnections.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    platform: text("platform").notNull().default("meta"),
    adAccountId: text("ad_account_id").notNull(),
    pageId: text("page_id"),
    label: text("label"),
    includedAdsets: jsonb("included_adsets").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("ads_account_mappings_company_idx").on(table.companyId),
    connectionIdx: index("ads_account_mappings_connection_idx").on(table.connectionId),
    clientIdx: index("ads_account_mappings_client_idx").on(table.clientId),
    companyAccountUq: uniqueIndex("ads_account_mappings_company_account_uq").on(table.companyId, table.adAccountId),
    platformIdx: index("ads_account_mappings_platform_idx").on(table.platform),
  }),
);

export type AdsAccountMapping = typeof adsAccountMappings.$inferSelect;
export type NewAdsAccountMapping = typeof adsAccountMappings.$inferInsert;
