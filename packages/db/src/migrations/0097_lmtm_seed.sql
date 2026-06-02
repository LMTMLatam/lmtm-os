-- LMTM-OS: seed initial data.
-- Creates the LMTM company, 14 agents, the goals hierarchy, and the
-- default org chart. Idempotent: re-runs are safe.

-- 1. LMTM company.
INSERT INTO "companies" ("id", "name", "description", "status", "issue_prefix", "issue_counter", "brand_color")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'LMTM',
  'LMTM - Agencia creativa publicitaria',
  'active',
  'LMTM',
  0,
  '#000000'
) ON CONFLICT ("issue_prefix") DO NOTHING;

-- 2. LMTM user (board owner). Better-auth tables require careful creation;
--    this seed only touches the board_api_keys surface which is optional.
--    The user themselves is created via the `paperclipai auth-bootstrap-ceo`
--    CLI command.

-- 3. 14 agents. UUIDs are deterministic so the seed is idempotent.
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "metadata", "created_at", "updated_at")
VALUES
  -- CMO (top of the agency tree)
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Luna (CMO)', 'cmo', 'Chief Marketing Officer', 'compass', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 21600, "wakeOnDemand": true, "maxConcurrentRuns": 2}}'::jsonb,
   50000, '{"lmtm_role": "cmo", "spanish_name": "Luna"}'::jsonb, now(), now()),

  -- Paid Media Manager (reports to CMO)
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Milo (Paid Media)', 'pm', 'Paid Media Manager', 'megaphone', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 7200, "wakeOnDemand": true, "maxConcurrentRuns": 4}}'::jsonb,
   80000, '{"lmtm_role": "paid_media"}'::jsonb, now(), now()),

  -- Content Strategist
  ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Camila (Content)', 'pm', 'Content Strategist', 'pen-line', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": false, "intervalSec": 43200, "wakeOnDemand": true, "maxConcurrentRuns": 2}}'::jsonb,
   40000, '{"lmtm_role": "content"}'::jsonb, now(), now()),

  -- SEO Specialist
  ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Sergio (SEO)', 'engineer', 'SEO Specialist', 'search', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   30000, '{"lmtm_role": "seo"}'::jsonb, now(), now()),

  -- Data Analyst
  ('11111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Delfina (Data)', 'researcher', 'Data Analyst', 'line-chart', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 7200, "wakeOnDemand": true, "maxConcurrentRuns": 3}}'::jsonb,
   60000, '{"lmtm_role": "data_analyst"}'::jsonb, now(), now()),

  -- Dashboard Builder
  ('11111111-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Dario (Dashboards)', 'engineer', 'Dashboard Builder', 'layout-dashboard', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": false, "intervalSec": 0, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   20000, '{"lmtm_role": "dashboard_builder"}'::jsonb, now(), now()),

  -- n8n Orchestrator
  ('11111111-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Nicolas (n8n)', 'engineer', 'n8n Orchestrator', 'workflow', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": false, "intervalSec": 0, "wakeOnDemand": true, "maxConcurrentRuns": 2}}'::jsonb,
   20000, '{"lmtm_role": "n8n_orchestrator"}'::jsonb, now(), now()),

  -- CRM Analyst
  ('11111111-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Ana (CRM Analyst)', 'researcher', 'CRM Analyst', 'database', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 1800, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   30000, '{"lmtm_role": "crm_analyst"}'::jsonb, now(), now()),

  -- CRM Engineer
  ('11111111-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'Esteban (CRM Engineer)', 'engineer', 'CRM Engineer', 'wrench', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": false, "intervalSec": 0, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   20000, '{"lmtm_role": "crm_engineer"}'::jsonb, now(), now()),

  -- Conversion Specialist
  ('11111111-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'Carla (Conversion)', 'pm', 'Conversion Specialist', 'target', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": false, "intervalSec": 43200, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   25000, '{"lmtm_role": "conversion"}'::jsonb, now(), now()),

  -- Brand Guardian
  ('11111111-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001', 'Bianca (Brand)', 'designer', 'Brand Guardian', 'shield', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": false, "intervalSec": 0, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   15000, '{"lmtm_role": "brand_guardian"}'::jsonb, now(), now()),

  -- Competitor Intel
  ('11111111-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000001', 'Carlos (Competitor)', 'researcher', 'Competitor Intel', 'binoculars', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 21600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   20000, '{"lmtm_role": "competitor_intel"}'::jsonb, now(), now()),

  -- Reporting
  ('11111111-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000001', 'Roxana (Reports)', 'pm', 'Reporting', 'file-text', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb,
   15000, '{"lmtm_role": "reporting", "cron": "0 11 * * * America/Argentina/Buenos_Aires"}'::jsonb, now(), now()),

  -- PM/Coordinator
  ('11111111-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000001', 'Pablo (PM)', 'pm', 'PM/Coordinator', 'gantt-chart', 'idle', 'minimax_cloud',
   '{"model": "MiniMax-M3"}'::jsonb,
   '{"heartbeat": {"enabled": true, "intervalSec": 14400, "wakeOnDemand": true, "maxConcurrentRuns": 2}}'::jsonb,
   25000, '{"lmtm_role": "pm_coordinator"}'::jsonb, now(), now())
ON CONFLICT ("id") DO NOTHING;

-- 4. Org chart: everyone reports to the PM/Coordinator, who reports to the CMO.
--    (The CMO is the strategic lead; the PM keeps day-to-day operations moving.)
UPDATE "agents" SET "reports_to" = '11111111-0000-0000-0000-00000000000e' WHERE "id" IN (
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004',
  '11111111-0000-0000-0000-000000000005',
  '11111111-0000-0000-0000-000000000006',
  '11111111-0000-0000-0000-000000000007',
  '11111111-0000-0000-0000-000000000008',
  '11111111-0000-0000-0000-000000000009',
  '11111111-0000-0000-0000-00000000000a',
  '11111111-0000-0000-0000-00000000000b',
  '11111111-0000-0000-0000-00000000000c',
  '11111111-0000-0000-0000-00000000000d'
);
UPDATE "agents" SET "reports_to" = '11111111-0000-0000-0000-000000000001' WHERE "id" = '11111111-0000-0000-0000-00000000000e';

-- 5. Goals hierarchy.
INSERT INTO "goals" ("id", "company_id", "title", "description", "level", "status", "owner_agent_id", "created_at", "updated_at")
VALUES
  ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Crecer LMTM a 100 clientes activos en 12 meses',
   'North star: escalar la agencia a 100 clientes activos con dashboards funcionando, retencion >85% y NPS >50.',
   'company', 'active', '11111111-0000-0000-0000-000000000001', now(), now()),

  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'ROAS promedio > 3x en todos los clientes con ads activos',
   'Mantener un ROAS promedio agregado > 3x en los clientes que corren campanas. Reportar mensualmente al cliente.',
   'task', 'active', '11111111-0000-0000-0000-000000000002', now(), now()),

  ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   '100% de bugs criticos del CRM detectados y arreglados en 24h',
   'El CRM Analyst detecta anomalias; el CRM Engineer las arregla. SLA: 24h para criticos, 7d para no-criticos.',
   'task', 'active', '11111111-0000-0000-0000-000000000008', now(), now()),

  ('22222222-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'Onboarding de clientes en < 48h',
   'Desde que el cliente aparece en la planilla hasta que tiene dashboard funcionando y link de acceso: menos de 48h habiles.',
   'task', 'active', '11111111-0000-0000-0000-000000000006', now(), now())
ON CONFLICT ("id") DO NOTHING;
