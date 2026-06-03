-- LMTM-OS: assign two new skills.
--
-- 1. lmtm-agent-browser-patterns: knowledge-only version of
--    vercel-labs/agent-browser. Assigned to all 14 agents because the
--    pattern is universally useful, even though actual execution
--    happens on a human's machine (the agent-browser CLI can't be
--    installed in the Render container).
--
-- 2. lmtm-find-skills: workflow for discovering new skills on GitHub
--    when an agent detects a gap. Assigned only to Luna (CMO) and
--    Pablo (PM) because they're the ones who decide which tools the
--    team uses.

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
    -- Luna (CMO): adds find-skills + agent-browser
    ('11111111-0000-4000-8000-000000000001'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-launch-playbook',
       'lmtm-pricing-quote','lmtm-reporting-cadence','lmtm-escalation-policy',
       'lmtm-crisis-comms','lmtm-clickup-conventions','lmtm-tool-reference',
       'lmtm-find-skills','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Milo (Paid Media): adds agent-browser
    ('11111111-0000-4000-8000-000000000002'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-paid-media-kpi',
       'lmtm-meta-ads-advanced','lmtm-copywriting-frameworks','lmtm-funnels',
       'lmtm-email-marketing','lmtm-google-trends','lmtm-web-search',
       'lmtm-attribution-models','lmtm-statistics','lmtm-clickup-conventions',
       'lmtm-escalation-policy','lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Camila (Content)
    ('11111111-0000-4000-8000-000000000003'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-content-brand-voice',
       'lmtm-copywriting-frameworks','lmtm-creative-brief','lmtm-ugc-script',
       'lmtm-email-marketing','lmtm-funnels','lmtm-prompt-engineering-image',
       'lmtm-prompt-engineering-video','lmtm-image-postprocess',
       'lmtm-clickup-conventions','lmtm-escalation-policy','lmtm-tool-reference',
       'lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Sergio (SEO)
    ('11111111-0000-4000-8000-000000000004'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-seo-playbook',
       'lmtm-web-search','lmtm-google-trends','lmtm-escalation-policy',
       'lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Delfina (Data)
    ('11111111-0000-4000-8000-000000000005'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-sql-patterns',
       'lmtm-cohort-analysis','lmtm-attribution-models','lmtm-statistics',
       'lmtm-dashboard-design','lmtm-escalation-policy','lmtm-tool-reference',
       'lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Dario (Dashboards)
    ('11111111-0000-4000-8000-000000000006'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-dashboard-design',
       'lmtm-sql-patterns','lmtm-paid-media-kpi','lmtm-escalation-policy',
       'lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Nicolas (n8n)
    ('11111111-0000-4000-8000-000000000007'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-n8n-workflows',
       'lmtm-postgres-patterns','lmtm-typescript-patterns','lmtm-escalation-policy',
       'lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Ana (CRM Analyst)
    ('11111111-0000-4000-8000-000000000008'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-cold-outreach',
       'lmtm-discovery-call','lmtm-email-marketing','lmtm-funnels',
       'lmtm-pricing-quote','lmtm-clickup-conventions','lmtm-escalation-policy',
       'lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Esteban (CRM Engineer)
    ('11111111-0000-4000-8000-000000000009'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-n8n-workflows',
       'lmtm-postgres-patterns','lmtm-typescript-patterns',
       'lmtm-clickup-conventions','lmtm-escalation-policy','lmtm-tool-reference',
       'lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Carla (Conversion)
    ('11111111-0000-4000-8000-00000000000a'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-funnels',
       'lmtm-copywriting-frameworks','lmtm-ugc-script','lmtm-creative-brief',
       'lmtm-paid-media-kpi','lmtm-email-marketing','lmtm-escalation-policy',
       'lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Bianca (Brand)
    ('11111111-0000-4000-8000-00000000000b'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-content-brand-voice',
       'lmtm-creative-brief','lmtm-copywriting-frameworks',
       'lmtm-prompt-engineering-image','lmtm-prompt-engineering-video',
       'lmtm-image-postprocess','lmtm-escalation-policy','lmtm-tool-reference',
       'lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Carlos (Competitor)
    ('11111111-0000-4000-8000-00000000000c'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-web-search',
       'lmtm-google-trends','lmtm-escalation-policy','lmtm-tool-reference',
       'lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Roxana (Reports)
    ('11111111-0000-4000-8000-00000000000d'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-reporting-cadence',
       'lmtm-dashboard-design','lmtm-sql-patterns','lmtm-statistics',
       'lmtm-attribution-models','lmtm-paid-media-kpi',
       'lmtm-clickup-conventions','lmtm-tool-reference','lmtm-agent-browser-patterns'
     ]::text[]
    ),
    -- Pablo (PM): adds find-skills + agent-browser
    ('11111111-0000-4000-8000-00000000000e'::uuid,
     ARRAY[
       'lmtm-agency-overview','lmtm-clients-planilla','lmtm-n8n-workflows',
       'lmtm-postgres-patterns','lmtm-typescript-patterns','lmtm-escalation-policy',
       'lmtm-crisis-comms','lmtm-clickup-conventions','lmtm-tool-reference',
       'lmtm-find-skills','lmtm-agent-browser-patterns'
     ]::text[]
    )
) AS s(agent_id, desired_skills)
WHERE a."id" = s.agent_id;
