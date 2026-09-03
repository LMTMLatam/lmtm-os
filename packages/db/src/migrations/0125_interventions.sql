CREATE TABLE IF NOT EXISTS "interventions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vigilante" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'alerta',
  "level" integer NOT NULL DEFAULT 2,
  "client_id" uuid,
  "title" text NOT NULL,
  "body" text,
  "dedupe_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "interventions_open_dedupe_uq" ON "interventions" ("dedupe_key") WHERE "status" = 'open';
CREATE INDEX IF NOT EXISTS "interventions_status_level_idx" ON "interventions" ("status","level");
