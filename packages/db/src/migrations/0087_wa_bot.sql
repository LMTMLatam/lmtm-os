DO $$ BEGIN

CREATE TABLE IF NOT EXISTS wa_bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_phone TEXT,
  last_qr TEXT,
  summary_hour INTEGER NOT NULL DEFAULT 20,
  summary_destination TEXT NOT NULL DEFAULT 'group',
  session_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid TEXT NOT NULL,
  group_name TEXT,
  sender_jid TEXT NOT NULL,
  sender_name TEXT,
  body TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wa_group_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid TEXT NOT NULL,
  group_name TEXT,
  summary_date TEXT NOT NULL,
  content TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'wa_group_messages_group_idx') THEN
    CREATE INDEX wa_group_messages_group_idx ON wa_group_messages(group_jid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'wa_group_messages_ts_idx') THEN
    CREATE INDEX wa_group_messages_ts_idx ON wa_group_messages(timestamp);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'wa_group_summaries_group_date_uq') THEN
    CREATE UNIQUE INDEX wa_group_summaries_group_date_uq ON wa_group_summaries(group_jid, summary_date);
  END IF;
END $$;
