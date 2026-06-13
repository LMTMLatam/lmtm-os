-- LMTM-OS: ClickUp per-client folder + standard list detection
--
-- Every client with a ClickUp planilla has 3 standard lists:
--   📲 Redes Sociales  (posts → Make → published)
--   Producción de video  (videos the client must produce)
--   Enfoque Técnico  (context: networks, brand voice, etc. — used
--   to seed the agents with the right context per client)
--
-- This migration adds columns to `clients` to store the IDs of those
-- lists + the parent folder, so the dashboard button can deep-link
-- into each section, and the agent context loader can pull the
-- Enfoque Técnico list and inject it into prompts.
--
-- Idempotent: safe to apply multiple times.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='clients'
                 AND column_name='clickup_folder_id') THEN
    ALTER TABLE "clients" ADD COLUMN "clickup_folder_id" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='clients'
                 AND column_name='clickup_list_redes_id') THEN
    ALTER TABLE "clients" ADD COLUMN "clickup_list_redes_id" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='clients'
                 AND column_name='clickup_list_video_id') THEN
    ALTER TABLE "clients" ADD COLUMN "clickup_list_video_id" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='clients'
                 AND column_name='clickup_list_enfoque_tecnico_id') THEN
    ALTER TABLE "clients" ADD COLUMN "clickup_list_enfoque_tecnico_id" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='clients'
                 AND column_name='clickup_lists_synced_at') THEN
    ALTER TABLE "clients" ADD COLUMN "clickup_lists_synced_at" timestamp with time zone;
  END IF;
END $$;
--> statement-breakpoint

-- Per-list last-fetched content for the "Enfoque Técnico" context
-- (used by the agent context loader). Stores the latest dump of the
-- list as JSONB so we don't have to hit ClickUp on every agent run.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_context_cache'
  ) THEN
    CREATE TABLE "client_context_cache" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
      "source" text NOT NULL,
      "external_id" text NOT NULL,
      "payload" jsonb NOT NULL DEFAULT '{}',
      "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "client_context_cache_client_source_idx"
  ON "client_context_cache" ("client_id", "source");
