-- Meta (Facebook/Instagram) API connections per company.
-- Idempotent: safe to apply multiple times.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meta_connections'
  ) THEN
    CREATE TABLE "meta_connections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "label" text NOT NULL,
      "business_id" text,
      "page_id" text,
      "ad_account_id" text,
      "token_type" text NOT NULL DEFAULT 'user',
      "access_token" text NOT NULL,
      "expires_at" timestamp with time zone,
      "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "status" text NOT NULL DEFAULT 'active',
      "last_check_at" timestamp with time zone,
      "last_error" text,
      "created_by_user_id" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'meta_connections_company_idx'
  ) THEN
    CREATE INDEX "meta_connections_company_idx" ON "meta_connections" ("company_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'meta_connections_company_label_uq'
  ) THEN
    CREATE UNIQUE INDEX "meta_connections_company_label_uq" ON "meta_connections" ("company_id", "label");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'meta_connections_ad_account_idx'
  ) THEN
    CREATE INDEX "meta_connections_ad_account_idx" ON "meta_connections" ("ad_account_id");
  END IF;
END $$;
