-- 0103: Add missing insight columns to ads_insights
-- The Drizzle schema declares: conversions, conversion_value, video_views, raw.
-- These were never added to the live DB (the original 0089 only had leads
-- and actions). Without this migration, the new dashboard queries
-- (timeseries, funnel) that reference these columns fail with 500,
-- and the aggregator's insert fails with "column raw does not exist".

ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "conversions" INTEGER DEFAULT 0;
ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "conversion_value" NUMERIC(14,2);
ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "video_views" INTEGER DEFAULT 0;
ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "raw" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "client_id" UUID;
