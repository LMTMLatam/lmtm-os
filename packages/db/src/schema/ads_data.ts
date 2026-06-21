import {
  pgTable, uuid, text, timestamp, jsonb, integer, numeric, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { clients } from "./clients.js";
import { adsConnections } from "./ads_connections.js";

// LMTM-OS: platform-agnostic ad data tables.
// The schema is shared across Meta, Google, TikTok, LinkedIn. Platform-
// specific fields that don't fit the common shape go into `raw` (jsonb).
//
// The "money table" is `adsInsights` — every chart, KPI, alert and
// dashboard reads from it. If it's empty, every dashboard shows $0.

// Generic job audit trail.
export const syncLogs = pgTable("sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // SET NULL (not CASCADE): a connection delete must not erase the audit trail.
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  jobName: text("job_name").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  recordsSynced: integer("records_synced").default(0),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("sync_logs_company_idx").on(t.companyId),
  clientIdx: index("sync_logs_client_idx").on(t.clientId),
  jobIdx: index("sync_logs_job_idx").on(t.jobName, t.status),
  platformIdx: index("sync_logs_platform_idx").on(t.platform),
}));

// Campaigns, per (connection, adAccount, platform).
export const adsCampaigns = pgTable("ads_campaigns", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // SET NULL (not CASCADE): deleting/replacing a connection must not destroy
  // ad history (insights/campaigns/etc. are unrecoverable) — see migration 0111.
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  adAccountId: text("ad_account_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  objective: text("objective"),
  dailyBudget: numeric("daily_budget"),
  lifetimeBudget: numeric("lifetime_budget"),
  startTime: timestamp("start_time", { withTimezone: true }),
  stopTime: timestamp("stop_time", { withTimezone: true }),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("ads_campaigns_company_idx").on(t.companyId),
  clientIdx: index("ads_campaigns_client_idx").on(t.clientId),
  accountIdx: index("ads_campaigns_account_idx").on(t.adAccountId),
  platformIdx: index("ads_campaigns_platform_idx").on(t.platform),
}));

// Ad sets (Meta, TikTok) / ad groups (Google, LinkedIn).
export const adsAdsets = pgTable("ads_adsets", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // SET NULL (not CASCADE): deleting/replacing a connection must not destroy
  // ad history (insights/campaigns/etc. are unrecoverable) — see migration 0111.
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  campaignId: text("campaign_id"),
  adAccountId: text("ad_account_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  dailyBudget: numeric("daily_budget"),
  lifetimeBudget: numeric("lifetime_budget"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("ads_adsets_company_idx").on(t.companyId),
  clientIdx: index("ads_adsets_client_idx").on(t.clientId),
  campaignIdx: index("ads_adsets_campaign_idx").on(t.campaignId),
  platformIdx: index("ads_adsets_platform_idx").on(t.platform),
}));

// Ads / creatives (one row per ad creative in the platform sense).
export const adsCreatives = pgTable("ads_creatives", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // SET NULL (not CASCADE): deleting/replacing a connection must not destroy
  // ad history (insights/campaigns/etc. are unrecoverable) — see migration 0111.
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  adsetId: text("adset_id"),
  campaignId: text("campaign_id"),
  adAccountId: text("ad_account_id").notNull(),
  name: text("name").notNull(),
  status: text("status"),
  creativeId: text("creative_id"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("ads_creatives_company_idx").on(t.companyId),
  clientIdx: index("ads_creatives_client_idx").on(t.clientId),
  adsetIdx: index("ads_creatives_adset_idx").on(t.adsetId),
  platformIdx: index("ads_creatives_platform_idx").on(t.platform),
}));

// The money table: one row per (ad × day). The unique index enforces
// idempotent re-syncs — the same key gets upserted, not duplicated.
export const adsInsights = pgTable("ads_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // SET NULL (not CASCADE): deleting/replacing a connection must not destroy
  // ad history (insights/campaigns/etc. are unrecoverable) — see migration 0111.
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  adAccountId: text("ad_account_id").notNull(),
  campaignId: text("campaign_id"),
  campaignName: text("campaign_name"),
  adsetId: text("adset_id"),
  adId: text("ad_id"),
  date: date("date").notNull(),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  spend: numeric("spend", { precision: 12, scale: 2 }).default("0"),
  reach: integer("reach").default(0),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  cpc: numeric("cpc", { precision: 10, scale: 2 }),
  cpm: numeric("cpm", { precision: 10, scale: 2 }),
  leads: integer("leads").default(0),
  conversions: integer("conversions").default(0),
  conversionValue: numeric("conversion_value", { precision: 14, scale: 2 }),
  videoViews: integer("video_views").default(0),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("ads_insights_company_idx").on(t.companyId),
  clientIdx: index("ads_insights_client_idx").on(t.clientId),
  dateIdx: index("ads_insights_date_idx").on(t.date),
  platformIdx: index("ads_insights_platform_idx").on(t.platform),
  uniq: uniqueIndex("ads_insights_uniq").on(t.connectionId, t.platform, t.adAccountId, t.campaignId, t.adsetId, t.adId, t.date),
}));

// Organic posts (Meta Pages, LinkedIn Pages). Platforms without organic
// reach (Google Ads) have no rows here.
export const organicPosts = pgTable("organic_posts", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  // SET NULL (not CASCADE): deleting/replacing a connection must not destroy
  // ad history (insights/campaigns/etc. are unrecoverable) — see migration 0111.
  connectionId: uuid("connection_id").references(() => adsConnections.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  pageId: text("page_id").notNull(),
  message: text("message"),
  story: text("story"),
  fullPicture: text("full_picture"),
  permalinkUrl: text("permalink_url"),
  createdTime: timestamp("created_time", { withTimezone: true }),
  postType: text("post_type"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("organic_posts_company_idx").on(t.companyId),
  clientIdx: index("organic_posts_client_idx").on(t.clientId),
  pageIdx: index("organic_posts_page_idx").on(t.pageId),
  platformIdx: index("organic_posts_platform_idx").on(t.platform),
}));

export const organicPostInsights = pgTable("organic_post_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => organicPosts.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  value: numeric("value", { precision: 18, scale: 4 }).default("0"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("organic_post_insights_uniq").on(t.postId, t.metric),
}));

// Alerts evaluated per (client, ad account) by the Data Analyst agent.
export const adsAlerts = pgTable("ads_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("meta"),
  adAccountId: text("ad_account_id"),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  metric: text("metric"),
  currentValue: numeric("current_value", { precision: 12, scale: 4 }),
  thresholdValue: numeric("threshold_value", { precision: 12, scale: 4 }),
  recommendation: text("recommendation"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("ads_alerts_company_idx").on(t.companyId),
  statusIdx: index("ads_alerts_status_idx").on(t.companyId, t.status),
  accountIdx: index("ads_alerts_account_idx").on(t.adAccountId),
  clientIdx: index("ads_alerts_client_idx").on(t.clientId),
  platformIdx: index("ads_alerts_platform_idx").on(t.platform),
}));
