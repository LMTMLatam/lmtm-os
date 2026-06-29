-- LMTM-OS: tag issues with the LMTM client they belong to.
-- Lets agents create tasks scoped to a specific agency client (e.g. tasks
-- detected in that client's WhatsApp group) and powers the per-client task
-- panel. Nullable + SET NULL so deleting a client never destroys task history.
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='issues' AND column_name='client_id'
  ) THEN
    ALTER TABLE "issues" ADD COLUMN "client_id" uuid;
    ALTER TABLE "issues"
      ADD CONSTRAINT "issues_client_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "issues_client_idx" ON "issues" ("client_id");
  END IF;
END $$;
