-- LMTM-OS: audience demographics snapshot per client.
-- The /audience endpoint used to tally age/gender/publisher/device from
-- ads_insights.raw, but the insights sync never requested Meta `breakdowns`,
-- so raw never carried them and every client's audience rendered empty.
-- This table stores a current snapshot of the demographic breakdown fetched
-- with explicit Meta breakdowns. One row per (client, dimension, key); each
-- sync upserts so the snapshot stays current and idempotent.

CREATE TABLE IF NOT EXISTS audience_demographics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES ads_connections(id) ON DELETE SET NULL,
  platform      text NOT NULL DEFAULT 'meta',
  ad_account_id text,
  dimension     text NOT NULL,            -- age | gender | publisher_platform | device
  dim_key       text NOT NULL,            -- e.g. '25-34', 'female', 'instagram', 'mobile_app'
  impressions   integer NOT NULL DEFAULT 0,
  clicks        integer NOT NULL DEFAULT 0,
  spend         numeric(14,2) NOT NULL DEFAULT 0,
  leads         integer NOT NULL DEFAULT 0,
  reach         integer NOT NULL DEFAULT 0,
  period_since  date,
  period_until  date,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audience_demographics_client_idx ON audience_demographics (client_id);
CREATE INDEX IF NOT EXISTS audience_demographics_company_idx ON audience_demographics (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS audience_demographics_uniq
  ON audience_demographics (client_id, dimension, dim_key);
