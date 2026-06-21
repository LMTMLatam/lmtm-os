-- LMTM-OS: stop losing ad history when an ads connection is replaced/deleted.
--
-- Every ads data table had `connection_id -> ads_connections ON DELETE CASCADE`,
-- so deleting OR replacing a Meta connection (e.g. on reconnect) wiped the
-- client's mappings, insights, campaigns, adsets, creatives and organic posts.
-- Insights are months of data that cannot be re-fetched → unacceptable loss.
--
-- Fix: make connection_id nullable and switch the FK to ON DELETE SET NULL on
-- the data/history tables. A connection delete now orphans the rows (null
-- connection) instead of destroying them — dashboards keep showing history and
-- mappings survive for re-linking. Idempotent.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('ads_account_mappings', 'meta_ad_account_mappings_connection_id_fkey', true),
      ('ads_adsets',           'meta_adsets_connection_id_fkey',             true),
      ('ads_campaigns',        'meta_campaigns_connection_id_fkey',          true),
      ('ads_creatives',        'meta_ads_connection_id_fkey',                true),
      ('ads_insights',         'meta_ads_insights_connection_id_fkey',       true),
      ('organic_posts',        'meta_page_posts_connection_id_fkey',         true),
      ('sync_logs',            'sync_logs_connection_id_fkey',               false)
    ) AS t(tbl, old_constraint, make_nullable)
  LOOP
    -- only act if the table + column exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=rec.tbl AND column_name='connection_id'
    ) THEN
      -- 1) make the column nullable so SET NULL is legal
      IF rec.make_nullable THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN connection_id DROP NOT NULL', rec.tbl);
      END IF;

      -- 2) drop the old CASCADE constraint (any of the possible names)
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', rec.tbl, rec.old_constraint);
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', rec.tbl, rec.tbl || '_connection_set_null_fk');

      -- 3) re-add the FK as ON DELETE SET NULL
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (connection_id) REFERENCES ads_connections(id) ON DELETE SET NULL',
        rec.tbl, rec.tbl || '_connection_set_null_fk'
      );
    END IF;
  END LOOP;
END $$;
