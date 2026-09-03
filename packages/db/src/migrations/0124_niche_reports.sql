CREATE TABLE IF NOT EXISTS "niche_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "niche" text NOT NULL,
  "week" text NOT NULL,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_agent_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "niche_reports_niche_week_idx" ON "niche_reports" ("niche","week");
