-- LMTM-OS: performance indexes for the two hottest query patterns found in
-- pg_stat_statements (2026-07-11 review).
--
-- 1) Recovery/activity/issues look up heartbeat runs by the issueId embedded
--    in context_snapshot. Without an index that predicate seq-scans the table
--    AND detoasts every row's context_snapshot jsonb (~113ms/call, >1M calls,
--    32h of accumulated DB time). The expression index answers it without
--    touching the jsonb heap.
CREATE INDEX IF NOT EXISTS heartbeat_runs_ctx_issue_idx
  ON heartbeat_runs (company_id, (context_snapshot ->> 'issueId'));

-- 2) Per-client insights lookups (aggregator, dashboards, agent tools) filter
--    ads_insights by client_id, which only had company/date indexes → 127k
--    seq scans reading 981M rows. date is included for client+range sweeps.
CREATE INDEX IF NOT EXISTS ads_insights_client_date_idx
  ON ads_insights (client_id, date);
