-- Migration 0084 was originally a regression that duplicated tables and
-- indexes already created idempotently in 0082_dry_vision.sql and
-- 0083_company_secret_provider_configs.sql. It has been rewritten to be a
-- safe no-op for fresh databases (everything it created already exists)
-- while still being idempotent if re-applied.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'documents_title_search_idx'
  ) THEN
    CREATE INDEX "documents_title_search_idx" ON "documents" USING gin ("title" gin_trgm_ops);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'documents_latest_body_search_idx'
  ) THEN
    CREATE INDEX "documents_latest_body_search_idx" ON "documents" USING gin ("latest_body" gin_trgm_ops);
  END IF;
END $$;
