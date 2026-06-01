ALTER TABLE "meta_alerts" ADD COLUMN IF NOT EXISTS "ad_account_id" text;
CREATE INDEX IF NOT EXISTS "meta_alerts_account_idx" ON "meta_alerts" ("ad_account_id");
