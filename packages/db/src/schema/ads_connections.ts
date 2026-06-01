import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";

// LMTM-OS: platform-agnostic ad platform connections.
// One row = one (client, platform, token) triple. A single client may have
// rows for multiple platforms (Meta + Google + TikTok + LinkedIn), and a
// single platform token can be reused across multiple clients (a token from
// the agency's Business Manager reaches many client ad accounts).
//
// accessToken is stored encrypted-at-rest by the application layer. The
// token "shape" varies per platform:
//   - meta:    long-lived user token (60d) or System User token (no expiry)
//   - google:  OAuth 2.0 access + refresh token pair; expires ~1h
//   - tiktok:  OAuth 2.0 access + refresh token; expires ~24h
//   - linkedin: OAuth 2.0 access + refresh; expires ~60d
//
// `clientId` is optional: a connection may be created before we know which
// client it will be assigned to. Once assigned, ad-account mappings link
// the connection to specific clients.
export const adsConnections = pgTable(
  "ads_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    platform: text("platform").notNull().default("meta"),
    label: text("label").notNull(),
    businessId: text("business_id"),
    pageId: text("page_id"),
    adAccountId: text("ad_account_id"),
    managerAccountId: text("manager_account_id"),
    merchantId: text("merchant_id"),
    appId: text("app_id"),
    tenantId: text("tenant_id"),
    clientIdText: text("client_id_text"),
    tokenType: text("token_type").notNull().default("user"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    developerToken: text("developer_token"),
    clientSecret: text("client_secret"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("ads_connections_company_idx").on(table.companyId),
    clientIdx: index("ads_connections_client_idx").on(table.clientId),
    companyLabelUq: uniqueIndex("ads_connections_company_label_uq").on(table.companyId, table.label),
    adAccountIdx: index("ads_connections_ad_account_idx").on(table.adAccountId),
    platformIdx: index("ads_connections_platform_idx").on(table.platform),
  }),
);

export type AdsConnection = typeof adsConnections.$inferSelect;
export type NewAdsConnection = typeof adsConnections.$inferInsert;
