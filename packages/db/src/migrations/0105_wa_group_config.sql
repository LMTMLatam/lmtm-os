-- Per-group WA bot config + delivery targets
-- Idempotent: safe to apply multiple times.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_group_config'
  ) THEN
    CREATE TABLE "wa_group_config" (
      "group_jid" text PRIMARY KEY NOT NULL,
      "group_name" text,
      "enabled" boolean NOT NULL DEFAULT true,
      "inactivity_minutes" integer NOT NULL DEFAULT 30,
      "min_messages" integer NOT NULL DEFAULT 3,
      "delivery_mode" text NOT NULL DEFAULT 'group',
      "delivery_target" text,
      "summary_tone" text NOT NULL DEFAULT 'rio_platense',
      "notes" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_daily_digests'
  ) THEN
    CREATE TABLE "wa_daily_digests" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "digest_date" text NOT NULL,
      "content" text NOT NULL,
      "groups_count" integer NOT NULL DEFAULT 0,
      "summaries_count" integer NOT NULL DEFAULT 0,
      "sent_to" text,
      "sent_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'wa_daily_digests_date_uq'
  ) THEN
    CREATE UNIQUE INDEX "wa_daily_digests_date_uq" ON "wa_daily_digests" ("digest_date");
  END IF;
END $$;
