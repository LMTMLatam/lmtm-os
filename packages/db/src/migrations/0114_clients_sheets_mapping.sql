-- LMTM-OS: per-client Google Sheets planilla mapping.
-- Lets the agency link each client to its own Drive Sheet (the per-client
-- planning sheet LMTM copies from a template on onboarding). Auto-detection
-- looks for a Sheet whose title matches the client name; the operator can
-- override manually.
--
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='sheets_spreadsheet_id'
  ) THEN
    ALTER TABLE "clients" ADD COLUMN "sheets_spreadsheet_id" text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='sheets_detected_at'
  ) THEN
    ALTER TABLE "clients" ADD COLUMN "sheets_detected_at" timestamp with time zone;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "clients_sheets_spreadsheet_idx"
  ON "clients" ("sheets_spreadsheet_id");