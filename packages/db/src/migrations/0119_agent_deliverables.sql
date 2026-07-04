-- LMTM-OS: structured agent deliverables.
-- Agents produce comments (0 structured artifacts in 30d) — a finished copy, a
-- campaign spec, a report lives buried in a comment thread, not as a reusable
-- object. This table captures the deliverable itself: typed, titled, tied to
-- the issue and (optionally) the client, findable and reusable later.

CREATE TABLE IF NOT EXISTS agent_deliverables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issue_id    uuid REFERENCES issues(id) ON DELETE SET NULL,
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  kind        text NOT NULL,            -- copy | campaign_spec | report | research | plan | other
  title       text NOT NULL,
  content     text NOT NULL,            -- the artifact (markdown)
  url         text,                     -- optional link (ClickUp task, Sheet, etc.)
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_deliverables_company_idx ON agent_deliverables (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_deliverables_client_idx ON agent_deliverables (client_id);
CREATE INDEX IF NOT EXISTS agent_deliverables_issue_idx ON agent_deliverables (issue_id);
