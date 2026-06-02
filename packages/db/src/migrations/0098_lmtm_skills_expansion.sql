-- LMTM-OS: expand the desired skills per agent.
-- Adds 24 new skills (B1 web research, B2 marketing, B3 data,
-- B4 creative, B5 sales/business, B6 tech) and reassigns each
-- agent's `paperclipSkillSync.desiredSkills` to a role-tailored set.
-- Idempotent: re-runs produce the same end state.

-- Available skill keys (must exist in the adapter's bundled
-- `packages/adapters/minimax-local/skills/<key>/SKILL.md`):
--   lmtm-agency-overview
--   lmtm-clients-planilla
--   lmtm-paid-media-kpi
--   lmtm-content-brand-voice
--   lmtm-seo-playbook
--   lmtm-reporting-cadence
--   lmtm-escalation-policy
--   lmtm-tool-reference
--   lmtm-web-search
--   lmtm-google-trends
--   lmtm-meta-ads-advanced
--   lmtm-copywriting-frameworks
--   lmtm-funnels
--   lmtm-launch-playbook
--   lmtm-email-marketing
--   lmtm-creative-brief
--   lmtm-prompt-engineering-image
--   lmtm-prompt-engineering-video
--   lmtm-ugc-script
--   lmtm-image-postprocess
--   lmtm-cold-outreach
--   lmtm-discovery-call
--   lmtm-pricing-quote
--   lmtm-crisis-comms
--   lmtm-sql-patterns
--   lmtm-cohort-analysis
--   lmtm-attribution-models
--   lmtm-statistics
--   lmtm-dashboard-design
--   lmtm-n8n-workflows
--   lmtm-postgres-patterns
--   lmtm-typescript-patterns

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
    -- Luna (CMO): strategy, launches, pricing, reporting, crisis.
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
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Milo (Paid Media): ads depth, copy, funnels, email, research, attribution.
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
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Camila (Content): voice + copy + brief + UGC + image/video gen.
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
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Sergio (SEO): playbook + web research + trends.
    (
      '11111111-0000-4000-8000-000000000004'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-seo-playbook',
        'lmtm-web-search',
        'lmtm-google-trends',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Delfina (Data): SQL + cohorts + attribution + stats + dashboards.
    (
      '11111111-0000-4000-8000-000000000005'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-sql-patterns',
        'lmtm-cohort-analysis',
        'lmtm-attribution-models',
        'lmtm-statistics',
        'lmtm-dashboard-design',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Dario (Dashboards): dashboard design + SQL + KPI.
    (
      '11111111-0000-4000-8000-000000000006'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-dashboard-design',
        'lmtm-sql-patterns',
        'lmtm-paid-media-kpi',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Nicolas (n8n): workflows + postgres + typescript.
    (
      '11111111-0000-4000-8000-000000000007'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-n8n-workflows',
        'lmtm-postgres-patterns',
        'lmtm-typescript-patterns',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Ana (CRM Analyst): outreach + discovery + email + funnels + pricing.
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
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Esteban (CRM Engineer): n8n + postgres + typescript.
    (
      '11111111-0000-4000-8000-000000000009'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-n8n-workflows',
        'lmtm-postgres-patterns',
        'lmtm-typescript-patterns',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Carla (Conversion): funnels + copy + UGC + brief + KPI + email.
    (
      '11111111-0000-4000-8000-00000000000a'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-funnels',
        'lmtm-copywriting-frameworks',
        'lmtm-ugc-script',
        'lmtm-creative-brief',
        'lmtm-paid-media-kpi',
        'lmtm-email-marketing',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Bianca (Brand): voice + brief + copy + image/video gen + postprocess.
    (
      '11111111-0000-4000-8000-00000000000b'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-content-brand-voice',
        'lmtm-creative-brief',
        'lmtm-copywriting-frameworks',
        'lmtm-prompt-engineering-image',
        'lmtm-prompt-engineering-video',
        'lmtm-image-postprocess',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Carlos (Competitor): web research + trends.
    (
      '11111111-0000-4000-8000-00000000000c'::uuid,
      ARRAY[
        'lmtm-agency-overview',
        'lmtm-clients-planilla',
        'lmtm-web-search',
        'lmtm-google-trends',
        'lmtm-escalation-policy',
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Roxana (Reports): cadence + dashboards + SQL + stats + attribution.
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
        'lmtm-tool-reference'
      ]::text[]
    ),
    -- Pablo (PM): clients + tech stack + crisis.
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
        'lmtm-tool-reference'
      ]::text[]
    )
) AS s(agent_id, desired_skills)
WHERE a."id" = s.agent_id;
