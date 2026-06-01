-- LMTM-OS: planilla_sync_state
-- Tracks the last time each planilla source was polled, plus per-source
-- metadata. The Dashboard Builder agent polls the configured planilla
-- (Google Sheets, Airtable, etc.) and creates/updates clients accordingly.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'planilla_sync_state') THEN
    CREATE TABLE "planilla_sync_state" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "source" text NOT NULL UNIQUE,
      "kind" text NOT NULL,
      "external_resource_id" text NOT NULL,
      "credentials_secret_id" uuid,
      "last_poll_at" timestamptz,
      "last_success_at" timestamptz,
      "last_error" text,
      "consecutive_failures" integer NOT NULL DEFAULT 0,
      "polled_count" integer NOT NULL DEFAULT 0,
      "created_count" integer NOT NULL DEFAULT 0,
      "updated_count" integer NOT NULL DEFAULT 0,
      "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "planilla_sync_state_source_idx" ON "planilla_sync_state"("source");

-- LMTM-OS: client_dashboard_links
-- A client may have multiple magic-link access URLs (rotated, expired,
-- scoped to specific sections). Each link is signed and time-bounded.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'client_dashboard_links') THEN
    CREATE TABLE "client_dashboard_links" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "client_id" uuid NOT NULL,
      "token_hash" text NOT NULL UNIQUE,
      "scopes" text[] NOT NULL DEFAULT ARRAY['dashboard:read']::text[],
      "expires_at" timestamptz NOT NULL,
      "revoked_at" timestamptz,
      "last_used_at" timestamptz,
      "use_count" integer NOT NULL DEFAULT 0,
      "created_by_user_id" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "client_dashboard_links_client_idx" ON "client_dashboard_links"("client_id");
CREATE INDEX IF NOT EXISTS "client_dashboard_links_expires_idx" ON "client_dashboard_links"("expires_at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_dashboard_links_client_fk') THEN
    ALTER TABLE "client_dashboard_links" ADD CONSTRAINT "client_dashboard_links_client_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
  END IF;
END $$;
