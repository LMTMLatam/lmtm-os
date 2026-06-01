-- LMTM-OS: clients table (the agency-level source of truth for client accounts).
-- This is independent of the platform connections: a single client may have
-- connections on Meta, Google, TikTok, LinkedIn, or none.
--
-- Distinction from `companies`:
--   - `companies` is the Paperclip tenancy boundary (in our setup, one company
--     per agency / instance).
--   - `clients` is the LMTM-OS concept: a real-world customer of the agency.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients') THEN
    CREATE TABLE "clients" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "legal_name" text,
      "tax_id" text,
      "status" text NOT NULL DEFAULT 'active',
      "tier" text NOT NULL DEFAULT 'standard',
      "owner_agent_id" uuid,
      "primary_contact_name" text,
      "primary_contact_email" text,
      "primary_contact_phone" text,
      "website_url" text,
      "industry" text,
      "monthly_retainer_cents" bigint DEFAULT 0,
      "currency" text NOT NULL DEFAULT 'ARS',
      "crm_external_id" text,
      "planilla_source" text,
      "planilla_external_id" text,
      "planilla_synced_at" timestamptz,
      "onboarded_at" timestamptz,
      "offboarded_at" timestamptz,
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "clients_slug_uq" ON "clients"("slug");
CREATE INDEX IF NOT EXISTS "clients_status_idx" ON "clients"("status");
CREATE INDEX IF NOT EXISTS "clients_owner_agent_idx" ON "clients"("owner_agent_id");
CREATE INDEX IF NOT EXISTS "clients_crm_external_idx" ON "clients"("crm_external_id");
CREATE INDEX IF NOT EXISTS "clients_planilla_idx" ON "clients"("planilla_source", "planilla_external_id");

ALTER TABLE "ads_connections" ADD COLUMN IF NOT EXISTS "client_id" uuid;
CREATE INDEX IF NOT EXISTS "ads_connections_client_idx" ON "ads_connections"("client_id");

ALTER TABLE "ads_account_mappings" ADD COLUMN IF NOT EXISTS "client_id" uuid;
CREATE INDEX IF NOT EXISTS "ads_account_mappings_client_idx" ON "ads_account_mappings"("client_id");

ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_agent_fk"
  FOREIGN KEY ("owner_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL
  NOT VALID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_owner_agent_fk') THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_agent_fk"
      FOREIGN KEY ("owner_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_connections_client_fk') THEN
    ALTER TABLE "ads_connections" ADD CONSTRAINT "ads_connections_client_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_account_mappings_client_fk') THEN
    ALTER TABLE "ads_account_mappings" ADD CONSTRAINT "ads_account_mappings_client_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
  END IF;
END $$;
