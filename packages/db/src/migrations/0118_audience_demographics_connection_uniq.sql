-- LMTM-OS: scope the audience_demographics unique index by connection.
-- The snapshot is replaced per (client, connection), but the unique index was
-- (client_id, dimension, dim_key) — so a client with two Meta ad accounts had
-- the second connection's upsert OVERWRITE the first connection's rows instead
-- of coexisting. Including connection_id lets both accounts' demographics live
-- side by side, matching the per-connection delete in syncAudience.

DROP INDEX IF EXISTS audience_demographics_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS audience_demographics_uniq
  ON audience_demographics (client_id, connection_id, dimension, dim_key);
