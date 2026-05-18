-- WA Bot tables: config, group messages, daily summaries.
-- Idempotent: safe to apply multiple times.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_bot_config'
  ) THEN
    CREATE TABLE "wa_bot_config" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "status" text NOT NULL DEFAULT 'disconnected',
      "connected_phone" text,
      "last_qr" text,
      "summary_hour" integer NOT NULL DEFAULT 20,
      "summary_destination" text NOT NULL DEFAULT 'group',
      "session_data" jsonb,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_group_messages'
  ) THEN
    CREATE TABLE "wa_group_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "group_jid" text NOT NULL,
      "group_name" text,
      "sender_jid" text NOT NULL,
      "sender_name" text,
      "body" text NOT NULL,
      "timestamp" timestamp with time zone NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_group_summaries'
  ) THEN
    CREATE TABLE "wa_group_summaries" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "group_jid" text NOT NULL,
      "group_name" text,
      "summary_date" text NOT NULL,
      "content" text NOT NULL,
      "message_count" integer NOT NULL DEFAULT 0,
      "sent_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'wa_group_messages_group_idx'
  ) THEN
    CREATE INDEX "wa_group_messages_group_idx" ON "wa_group_messages" ("group_jid");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'wa_group_messages_ts_idx'
  ) THEN
    CREATE INDEX "wa_group_messages_ts_idx" ON "wa_group_messages" ("timestamp");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'wa_group_summaries_group_date_uq'
  ) THEN
    CREATE UNIQUE INDEX "wa_group_summaries_group_date_uq" ON "wa_group_summaries" ("group_jid", "summary_date");
  END IF;
END $$;
