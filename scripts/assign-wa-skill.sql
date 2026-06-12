-- Add lmtm-whatsapp-summarizer to CEO, Luna, Pablo (handling null adapter_config)
UPDATE agents
SET adapter_config = jsonb_set(
  COALESCE(adapter_config, '{}'::jsonb),
  '{desiredSkills}',
  COALESCE(adapter_config->'desiredSkills', '[]'::jsonb) || to_jsonb(ARRAY['lmtm-whatsapp-summarizer']::text[]),
  true
),
updated_at = now()
WHERE name IN ('CEO', 'Luna (CMO)', 'Pablo (PM)')
RETURNING name, jsonb_array_length(adapter_config->'desiredSkills') AS skill_count;
