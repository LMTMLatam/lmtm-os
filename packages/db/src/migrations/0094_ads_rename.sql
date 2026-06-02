-- Rename Meta-specific tables to platform-agnostic names.
-- Existing data is preserved; new column "platform" defaults to 'meta' so
-- all current connections/mappings continue to work.
-- After this migration the "meta_*" identifiers are gone — code, queries
-- and other migrations must reference the new names.
-- This migration is fully idempotent: every rename and column add is a
-- no-op when the target state is already in place. The DB was bootstrapped
-- partially (renames applied by hand) so the script must tolerate the
-- mid-state.

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_connections'
  ) THEN
    ALTER TABLE "meta_connections" RENAME TO "ads_connections";
  END IF;
END $do$;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "refresh_token" text;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "developer_token" text;
-- The OAuth app client_id (text) column was renamed to client_id_text
-- directly on the production DB. For fresh installs the column is
-- always uuid (see 0095), so this guard is a no-op everywhere.
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "client_id_text" text;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "client_secret" text;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "manager_account_id" text;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "merchant_id" text;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "app_id" text;
ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "tenant_id" text;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_connections'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_connections'
            AND indexname LIKE 'meta_connections_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_connections_', 'ads_connections_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_ad_account_mappings'
  ) THEN
    ALTER TABLE "meta_ad_account_mappings" RENAME TO "ads_account_mappings";
  END IF;
END $do$;
ALTER TABLE "ads_account_mappings" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_account_mappings'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_account_mappings'
            AND indexname LIKE 'meta_mappings_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_mappings_', 'ads_account_mappings_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "client_id" uuid;
CREATE INDEX IF NOT EXISTS "sync_logs_platform_idx" ON "sync_logs"("platform");
CREATE INDEX IF NOT EXISTS "sync_logs_client_idx" ON "sync_logs"("client_id");

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_campaigns'
  ) THEN
    ALTER TABLE "meta_campaigns" RENAME TO "ads_campaigns";
  END IF;
END $do$;
ALTER TABLE "ads_campaigns" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "ads_campaigns" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_campaigns'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_campaigns'
            AND indexname LIKE 'meta_campaigns_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_campaigns_', 'ads_campaigns_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_adsets'
  ) THEN
    ALTER TABLE "meta_adsets" RENAME TO "ads_adsets";
  END IF;
END $do$;
ALTER TABLE "ads_adsets" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "ads_adsets" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_adsets'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_adsets'
            AND indexname LIKE 'meta_adsets_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_adsets_', 'ads_adsets_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_ads'
  ) THEN
    ALTER TABLE "meta_ads" RENAME TO "ads_creatives";
  END IF;
END $do$;
ALTER TABLE "ads_creatives" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "ads_creatives" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_creatives'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_creatives'
            AND indexname LIKE 'meta_ads_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_ads_', 'ads_creatives_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_ads_insights'
  ) THEN
    ALTER TABLE "meta_ads_insights" RENAME TO "ads_insights";
  END IF;
END $do$;
ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "ads_insights" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_insights'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_insights'
            AND indexname LIKE 'meta_insights_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_insights_', 'ads_insights_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_page_posts'
  ) THEN
    ALTER TABLE "meta_page_posts" RENAME TO "organic_posts";
  END IF;
END $do$;
ALTER TABLE "organic_posts" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "organic_posts" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organic_posts'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'organic_posts'
            AND indexname LIKE 'meta_page_posts_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_page_posts_', 'organic_posts_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_post_insights'
  ) THEN
    ALTER TABLE "meta_post_insights" RENAME TO "organic_post_insights";
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organic_post_insights'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'organic_post_insights'
            AND indexname LIKE 'meta_post_insights_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_post_insights_', 'organic_post_insights_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_alerts'
  ) THEN
    ALTER TABLE "meta_alerts" RENAME TO "ads_alerts";
  END IF;
END $do$;
ALTER TABLE "ads_alerts" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'meta';
ALTER TABLE "ads_alerts" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $do$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ads_alerts'
  ) THEN
    EXECUTE $inner$
      DO $$
      DECLARE
        idx record;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'ads_alerts'
            AND indexname LIKE 'meta_alerts_%'
        LOOP
          EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx.indexname,
            replace(idx.indexname, 'meta_alerts_', 'ads_alerts_'));
        END LOOP;
      END $$;
    $inner$;
  END IF;
END $do$;
