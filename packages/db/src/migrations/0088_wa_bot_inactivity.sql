-- wa_bot_config: add inactivity_minutes (default 30 min)
ALTER TABLE "wa_bot_config" ADD COLUMN IF NOT EXISTS "inactivity_minutes" integer NOT NULL DEFAULT 30;
--> statement-breakpoint
-- wa_group_summaries: drop date uniqueness — summaries are now per-conversation, not per-day
DROP INDEX IF EXISTS "wa_group_summaries_group_date_uq";
