-- LMTM-OS: competitor library + generated content ideas (pauta vs posteo).
-- Idempotent so it can re-run safely.

-- 1. Competitors: manually-curated competitor library per client.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='competitors') THEN
    CREATE TABLE "competitors" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "fb_page_url" text,
      "ig_handle" text,
      "website" text,
      "notes" text,
      "sample_ads" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitors_client_idx" ON "competitors" ("client_id");
--> statement-breakpoint

-- 2. Content ideas: AI-generated, split into pauta (paid) vs posteo (organic).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='content_ideas') THEN
    CREATE TABLE "content_ideas" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "format" text,
      "title" text NOT NULL,
      "copy" text,
      "rationale" text,
      "source" text,
      "batch_id" uuid,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_ideas_client_idx" ON "content_ideas" ("client_id","kind");
