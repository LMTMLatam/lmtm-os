-- LMTM-OS: track when an opportunity was materialized into an issue.
-- Lets the opportunities engine skip already-converted rows on subsequent
-- runs, and lets the UI show "ya creada" / link to the source issue.
--
-- Idempotent (safe to re-run).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='opportunities' AND column_name='converted_issue_id'
  ) THEN
    ALTER TABLE "opportunities"
      ADD COLUMN "converted_issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='opportunities' AND column_name='converted_at'
  ) THEN
    ALTER TABLE "opportunities"
      ADD COLUMN "converted_at" timestamp with time zone;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "opportunities_converted_idx"
  ON "opportunities" ("client_id","converted_at");