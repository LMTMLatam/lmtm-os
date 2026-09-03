-- LMTM-OS: index the heartbeat_runs.wakeup_request_id FK. Every delete on
-- agent_wakeup_requests fires the FK trigger's per-row lookup on this column;
-- without an index that's a seq scan per row, which made the retention
-- sweeper time out. Also speeds run→wakeup joins.
CREATE INDEX IF NOT EXISTS heartbeat_runs_wakeup_request_idx
  ON heartbeat_runs (wakeup_request_id)
  WHERE wakeup_request_id IS NOT NULL;
