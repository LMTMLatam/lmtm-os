-- Mapeo de skills LMTM por agente (basado en rol y título)
-- Skills core que todo agente de LMTM recibe:
--   lmtm-company-context (contexto de la agencia)
--   paperclip (control plane coordination)

WITH skill_map AS (
  SELECT * FROM (VALUES
    -- CEO
    ('CEO', ARRAY['lmtm-company-context','lmtm-marketing-auditoria','lmtm-marketing-funnel','lmtm-marketing-competidores','lmtm-marketing-propuesta','paperclip','paperclip-converting-plans-to-tasks']::text[]),
    -- Content Creator
    ('Content Creator', ARRAY['lmtm-company-context','lmtm-marketing-copy','lmtm-marketing-emails','lmtm-marketing-seo-contenido','paperclip']::text[]),
    -- Creative Strategist
    ('Creative Strategist', ARRAY['lmtm-company-context','lmtm-marketing-copy','lmtm-marketing-ads','lmtm-marketing-landing','paperclip']::text[]),
    -- Finance Manager (2 agentes con mismo nombre)
    ('Finance Manager', ARRAY['lmtm-company-context','paperclip']::text[]),
    -- Growth Hacker
    ('Growth Hacker', ARRAY['lmtm-company-context','lmtm-marketing-funnel','lmtm-marketing-auditoria','lmtm-marketing-ads','lmtm-marketing-competidores','lmtm-marketing-landing','paperclip']::text[]),
    -- Lead Hunter (researcher, prospecting)
    ('Lead Hunter', ARRAY['lmtm-company-context','lmtm-marketing-competidores','lmtm-marketing-propuesta','paperclip']::text[]),
    -- Media Auditor
    ('Media Auditor', ARRAY['lmtm-company-context','lmtm-marketing-auditoria','lmtm-marketing-ads','lmtm-marketing-landing','lmtm-marketing-seo-contenido','paperclip']::text[]),
    -- Meta Analyst (2 agentes)
    ('Meta Analyst', ARRAY['lmtm-company-context','lmtm-marketing-ads','lmtm-marketing-funnel','lmtm-marketing-competidores','paperclip']::text[]),
    -- Outbound Strategist
    ('Outbound Strategist', ARRAY['lmtm-company-context','lmtm-marketing-copy','lmtm-marketing-emails','lmtm-marketing-propuesta','paperclip']::text[]),
    -- SEO Specialist
    ('SEO Specialist', ARRAY['lmtm-company-context','lmtm-marketing-seo-contenido','lmtm-marketing-copy','lmtm-marketing-auditoria','paperclip']::text[]),
    -- Social Media
    ('Social Media', ARRAY['lmtm-company-context','lmtm-marketing-copy','lmtm-marketing-landing','paperclip']::text[])
  ) AS t(name, skills)
)
UPDATE agents a
SET adapter_config = jsonb_set(
  COALESCE(a.adapter_config, '{}'::jsonb),
  '{desiredSkills}',
  to_jsonb(sm.skills),
  true
),
updated_at = now()
FROM skill_map sm
WHERE a.name = sm.name
RETURNING a.name, jsonb_array_length(a.adapter_config->'desiredSkills') AS skill_count;
