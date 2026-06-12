-- Create WhatsApp Watcher agent
INSERT INTO agents (
  id, company_id, name, role, title, status, adapter_type,
  adapter_config, capabilities, budget_monthly_cents, created_at, updated_at, permissions
)
SELECT
  '22222222-0000-4000-8000-000000000001'::uuid,
  c.id,
  'WhatsApp Watcher',
  'general',
  'Watcher silencioso de grupos de WhatsApp - resume al final de cada conversacion',
  'idle',
  'openclaw_gateway',
  '{"desiredSkills": ["lmtm-company-context", "lmtm-whatsapp-summarizer", "paperclip"]}'::jsonb,
  'wa:read,wa:summarize,wa:monitor',
  5000,
  now(),
  now(),
  '{}'::jsonb
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'WhatsApp Watcher')
LIMIT 1
RETURNING id, name, title, adapter_config->'desiredSkills' AS skills;
