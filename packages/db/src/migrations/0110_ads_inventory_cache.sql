-- LMTM-OS: cache the "pages-with-sets" inventory per ads connection.
-- Building that payload hits the Meta Graph API ~50+ times, which both hangs
-- the "Conectar ad account" screen and trips Meta's app-level rate limit
-- (#4 Application request limit reached). The route now serves this cache and
-- only rebuilds occasionally, falling back to the stale payload when throttled.
-- Idempotent.

CREATE TABLE IF NOT EXISTS "ads_inventory_cache" (
  "connection_id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fetched_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='ads_inventory_cache'
      AND constraint_name='ads_inventory_cache_connection_fk'
  ) THEN
    ALTER TABLE "ads_inventory_cache"
      ADD CONSTRAINT "ads_inventory_cache_connection_fk"
      FOREIGN KEY ("connection_id") REFERENCES "ads_connections"("id") ON DELETE CASCADE;
  END IF;
END $$;
