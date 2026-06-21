-- LMTM-OS: map WhatsApp groups to clients.
-- Adds wa_group_config.client_id so each WhatsApp group can be assigned to a
-- client; group summaries then surface in that client's WhatsApp section.
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wa_group_config' AND column_name='client_id'
  ) THEN
    ALTER TABLE "wa_group_config" ADD COLUMN "client_id" uuid;
    ALTER TABLE "wa_group_config"
      ADD CONSTRAINT "wa_group_config_client_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS "wa_group_config_client_idx" ON "wa_group_config" ("client_id");
  END IF;
END $$;
