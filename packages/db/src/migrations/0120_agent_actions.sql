-- LMTM-OS: ledger of real actions the agents take (not just proposals).
-- Records every write-action executed through the system (starting with Meta
-- ad pauses) so we can later measure whether the action actually improved the
-- client's numbers — closing the propose→act→measure loop.

CREATE TABLE IF NOT EXISTS agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  kind        text NOT NULL,             -- pause_ad_entity | ...
  entity_type text,                      -- campaign | adset | ...
  entity_id   text,
  detail      jsonb NOT NULL DEFAULT '{}',
  outcome     jsonb,                     -- filled later: did it help? (metrics before/after)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_actions_client_idx ON agent_actions (client_id);
CREATE INDEX IF NOT EXISTS agent_actions_kind_idx ON agent_actions (kind, created_at);
