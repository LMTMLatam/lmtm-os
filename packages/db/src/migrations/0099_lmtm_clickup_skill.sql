-- LMTM-OS: assign the lmtm-clickup-conventions skill to the 7 agents
-- that work on client deliverables or PM/CRM operations. Other agents
-- (SEO, Data, Brand, etc.) don't directly manage ClickUp tasks and
-- don't need the skill in their context.
UPDATE "agents" AS a
SET
  "adapter_config" = jsonb_set(
    a."adapter_config",
    '{paperclipSkillSync,desiredSkills}',
    to_jsonb(s.desired_skills),
    false
  ),
  "updated_at" = now()
FROM (
  VALUES
    -- Luna (CMO) — strategic + operations backlog
    (
      '11111111-0000-4000-8000-000000000001'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-launch-playbook',
        'lmtm-pricing-quote',
        'lmtm-reporting-cadence',
        'lmtm-escalation-policy',
        'lmtm-crisis-comms',
        'lmtm-clickup-conventions',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Milo (Paid Media) — campaign tasks per client
    (
      '11111111-0000-4000-8000-000000000002'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-paid-media-kpi',
        'lmtm-meta-ads-advanced',
        'lmtm-copywriting-frameworks',
        'lmtm-funnels',
        'lmtm-email-marketing',
        'lmtm-google-trends',
        'lmtm-web-search',
        'lmtm-attribution-models',
        'lmtm-statistics',
        'lmtm-clickup-conventions',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Camila (Content) — content production tasks
    (
      '11111111-0000-4000-8000-000000000003'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-content-brand-voice',
        'lmtm-copywriting-frameworks',
        'lmtm-creative-brief',
        'lmtm-ugc-script',
        'lmtm-email-marketing',
        'lmtm-funnels',
        'lmtm-prompt-engineering-image',
        'lmtm-prompt-engineering-video',
        'lmtm-image-postprocess',
        'lmtm-clickup-conventions',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Ana (CRM Analyst) — cobranzas + soporte tickets
    (
      '11111111-0000-4000-8000-000000000008'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-cold-outreach',
        'lmtm-discovery-call',
        'lmtm-email-marketing',
        'lmtm-funnels',
        'lmtm-pricing-quote',
        'lmtm-clickup-conventions',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Esteban (CRM Engineer) — technical tickets
    (
      '11111111-0000-4000-8000-000000000009'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-n8n-workflows',
        'lmtm-postgres-patterns',
        'lmtm-typescript-patterns',
        'lmtm-clickup-conventions',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Roxana (Reports) — recurring report tasks
    (
      '11111111-0000-4000-8000-00000000000d'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-reporting-cadence',
        'lmtm-dashboard-design',
        'lmtm-sql-patterns',
        'lmtm-statistics',
        'lmtm-attribution-models',
        'lmtm-paid-media-kpi',
        'lmtm-clickup-conventions',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Pablo (PM) — principal: cualquier Space, cualquier List
    (
      '11111111-0000-4000-8000-00000000000e'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-n8n-workflows',
        'lmtm-postgres-patterns',
        'lmtm-typescript-patterns',
        'lmtm-escalation-policy',
        'lmtm-crisis-comms',
        'lmtm-clickup-conventions',
        'lmtm-tool-reference'
      ]::text[]
    )
) AS s(agent_id, desired_skills)
WHERE a."id" = s.agent_id;
