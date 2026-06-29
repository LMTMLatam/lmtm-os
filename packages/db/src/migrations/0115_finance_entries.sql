-- LMTM-OS: business finance ledger (income & expenses).
-- Separate from finance_events (which tracks agent/system billing). This is the
-- agency's own money: client monthly payments (income), subscriptions and other
-- expenses, all categorized ("sectorized") and optionally recurring.

CREATE TABLE IF NOT EXISTS finance_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN ('income','expense')),
  category        text NOT NULL DEFAULT 'general',
  description     text,
  amount_cents    bigint NOT NULL,
  currency        text NOT NULL DEFAULT 'ARS',
  recurring       boolean NOT NULL DEFAULT false,
  recurrence      text NOT NULL DEFAULT 'one_time' CHECK (recurrence IN ('one_time','monthly','yearly')),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_entries_company_occurred_idx ON finance_entries (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS finance_entries_company_type_idx ON finance_entries (company_id, type);
CREATE INDEX IF NOT EXISTS finance_entries_client_idx ON finance_entries (client_id);
