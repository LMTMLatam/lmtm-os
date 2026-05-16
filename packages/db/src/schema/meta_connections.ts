import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

// Meta (Facebook/Instagram) API connections per company.
// One company may have multiple connections (e.g. different ad accounts /
// pages owned by the same Business Manager, or split between agencies).
//
// accessToken is stored encrypted-at-rest by the application layer; the
// column itself is opaque text. Long-lived user tokens expire (~60d), page
// tokens never expire as long as the user token they were derived from
// stays valid, and System User tokens never expire.
export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    businessId: text("business_id"),
    pageId: text("page_id"),
    adAccountId: text("ad_account_id"),
    tokenType: text("token_type").notNull().default("user"), // user | system | page | app
    accessToken: text("access_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"), // active | expired | revoked | error
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("meta_connections_company_idx").on(table.companyId),
    companyLabelUq: uniqueIndex("meta_connections_company_label_uq").on(table.companyId, table.label),
    adAccountIdx: index("meta_connections_ad_account_idx").on(table.adAccountId),
  }),
);
