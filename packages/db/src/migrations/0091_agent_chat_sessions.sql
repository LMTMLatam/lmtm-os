-- Migration 0091: Agent chat sessions (memory/context persistence)

DO $$ BEGIN

IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_chat_sessions') THEN
  CREATE TABLE agent_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_key TEXT NOT NULL DEFAULT 'default',
    client_context TEXT,
    messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX agent_chat_sessions_company_idx ON agent_chat_sessions(company_id);
  CREATE INDEX agent_chat_sessions_key_idx ON agent_chat_sessions(company_id, agent_key);
END IF;

END $$;
