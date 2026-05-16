-- Map per-company ad accounts to a shared Meta connection.
-- Idempotent: safe to apply multiple times.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_ad_account_mappings'
  ) THEN
    CREATE TABLE "meta_ad_account_mappings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "connection_id" uuid NOT NULL REFERENCES "meta_connections"("id") ON DELETE CASCADE,
      "ad_account_id" text NOT NULL,
      "label" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'meta_mappings_company_idx'
  ) THEN
    CREATE INDEX "meta_mappings_company_idx" ON "meta_ad_account_mappings" ("company_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'meta_mappings_connection_idx'
  ) THEN
    CREATE INDEX "meta_mappings_connection_idx" ON "meta_ad_account_mappings" ("connection_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'meta_mappings_company_account_uq'
  ) THEN
    CREATE UNIQUE INDEX "meta_mappings_company_account_uq" ON "meta_ad_account_mappings" ("company_id", "ad_account_id");
  END IF;
END $$;
