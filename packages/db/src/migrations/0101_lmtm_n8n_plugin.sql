-- LMTM-OS: add the lmtm-n8n-conventions skill to Nicolas (n8n
-- orchestrator) and Luna (CMO oversight), and register the
-- lmtm-n8n plugin row so the UI shows it immediately.
--
-- The skill body itself is loaded at runtime from the bundled
-- packages/adapters/minimax-local/skills/lmtm-n8n-conventions/SKILL.md
-- file by the M3 adapter. This migration only updates the
-- per-agent desiredSkills list (which the adapter filters against)
-- and seeds the plugin row.

BEGIN;

-- 1. Add the skill to Nicolas (n8n orchestrator agent) and Luna (CMO).
-- desiredSkills is a JSONB array of strings. We use jsonb_set to replace
-- it with the union of the existing list and the new skill.
UPDATE "agents" AS a
SET
  "adapter_config" = jsonb_set(
    a."adapter_config",
    '{paperclipSkillSync,desiredSkills}',
    to_jsonb(
      (
        SELECT array_agg(DISTINCT v)
        FROM unnest(
          COALESCE(
            ARRAY(
              SELECT jsonb_array_elements_text(
                a."adapter_config"->'paperclipSkillSync'->'desiredSkills'
              )
            ),
            ARRAY[]::text[]
          ) || ARRAY['lmtm-n8n-conventions']
        ) AS v
      )
    ),
    false
  ),
  "updated_at" = now()
WHERE a."id" IN (
  '11111111-0000-4000-8000-000000000007',  -- Nicolas
  '11111111-0000-4000-8000-000000000001'   -- Luna
);

-- 2. Plugin row for lmtm-n8n.
-- The lmtm-n8n plugin's `autoInstallLocalPlugins` IIFE on server startup
-- will discover the baked-in copy at
-- /app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n/
-- and reconcile status to `ready`. We insert a row here so the UI sees the
-- plugin immediately, even on first deploy before the startup hook runs.
INSERT INTO plugins (
  id,
  plugin_key,
  package_name,
  package_path,
  version,
  api_version,
  categories,
  manifest_json,
  status,
  installed_at,
  updated_at
)
SELECT
  '00000000-0000-4000-8000-000000001101',
  'lmtm-n8n',
  '@paperclipai/lmtm-n8n',
  '/app/.paperclip/plugins/node_modules/@paperclipai/lmtm-n8n',
  '0.1.0',
  1,
  '["connector", "automation"]'::jsonb,
  jsonb_build_object(
    'id', 'lmtm-n8n',
    'apiVersion', 1,
    'version', '0.1.0',
    'displayName', 'n8n MCP (LMTM)',
    'description', 'Bridge to the LMTM n8n instance''s instance-level MCP server (HTTP transport, JSON-RPC 2.0).',
    'author', 'LMTM',
    'capabilities', jsonb_build_array('secrets.read-ref', 'http.outbound', 'agent.tools.register')
  ),
  'installed',
  NOW(),
  NOW()
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plugins')
  AND NOT EXISTS (
    SELECT 1 FROM plugins WHERE plugin_key = 'lmtm-n8n'
  );

COMMIT;
