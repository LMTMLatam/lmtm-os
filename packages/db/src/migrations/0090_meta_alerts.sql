-- Migration 0090: Meta alerts table

DO $$ BEGIN

IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_alerts') THEN
  CREATE TABLE meta_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metric TEXT,
    current_value NUMERIC(12,4),
    threshold_value NUMERIC(12,4),
    recommendation TEXT,
    entity_type TEXT,
    entity_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX meta_alerts_company_idx ON meta_alerts(company_id);
  CREATE INDEX meta_alerts_status_idx ON meta_alerts(company_id, status);
END IF;

END $$;
