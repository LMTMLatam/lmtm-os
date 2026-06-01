import {
  pgTable, uuid, text, timestamp, jsonb, integer, numeric, date, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { metaConnections } from "./meta_connections.js";

export const syncLogs = pgTable("sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => metaConnections.id, { onDelete: "cascade" }),
  jobName: text("job_name").notNull(),
  status: text("status").notNull().default("running"), // running | completed | failed | partial
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  recordsSynced: integer("records_synced").default(0),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("sync_logs_company_idx").on(t.companyId),
  jobIdx: index("sync_logs_job_idx").on(t.jobName, t.status),
}));

export const metaCampaigns = pgTable("meta_campaigns", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
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
  companyIdx: index("meta_campaigns_company_idx").on(t.companyId),
  accountIdx: index("meta_campaigns_account_idx").on(t.adAccountId),
}));

export const metaAdsets = pgTable("meta_adsets", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
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
  companyIdx: index("meta_adsets_company_idx").on(t.companyId),
  campaignIdx: index("meta_adsets_campaign_idx").on(t.campaignId),
}));

export const metaAds = pgTable("meta_ads", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
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
  companyIdx: index("meta_ads_company_idx").on(t.companyId),
  adsetIdx: index("meta_ads_adset_idx").on(t.adsetId),
}));

export const metaAdsInsights = pgTable("meta_ads_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
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
  actions: jsonb("actions").$type<Array<{ action_type: string; value: string }>>().default([]),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("meta_insights_company_idx").on(t.companyId),
  dateIdx: index("meta_insights_date_idx").on(t.date),
  uniq: uniqueIndex("meta_insights_uniq").on(t.connectionId, t.adAccountId, t.campaignId, t.adsetId, t.adId, t.date),
}));

export const metaPagePosts = pgTable("meta_page_posts", {
  id: text("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
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
  companyIdx: index("meta_page_posts_company_idx").on(t.companyId),
  pageIdx: index("meta_page_posts_page_idx").on(t.pageId),
}));

export const metaPostInsights = pgTable("meta_post_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => metaPagePosts.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  value: integer("value").default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("meta_post_insights_uniq").on(t.postId, t.metric),
}));

export const metaAlerts = pgTable("meta_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  adAccountId: text("ad_account_id"), // which client ad account this alert belongs to
  severity: text("severity").notNull(), // info | warning | critical
  title: text("title").notNull(),
  description: text("description"),
  metric: text("metric"),
  currentValue: numeric("current_value", { precision: 12, scale: 4 }),
  thresholdValue: numeric("threshold_value", { precision: 12, scale: 4 }),
  recommendation: text("recommendation"),
  entityType: text("entity_type"), // campaign | adset | ad | account
  entityId: text("entity_id"),
  status: text("status").notNull().default("pending"), // pending | seen | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  companyIdx: index("meta_alerts_company_idx").on(t.companyId),
  statusIdx: index("meta_alerts_status_idx").on(t.companyId, t.status),
  accountIdx: index("meta_alerts_account_idx").on(t.adAccountId),
}));
