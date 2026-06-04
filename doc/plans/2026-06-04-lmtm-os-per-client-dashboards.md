---
title: LMTM-OS Per-Client Dashboards — novelty and plan
date: 2026-06-04
slug: lmtm-os-per-client-dashboards
status: draft
owner: dario-dashboards
reviewers: [luna-cmo, pablo-pm, delfina-data, roxana-reports]
---

# LMTM-OS Per-Client Dashboards — novelty and plan

## TL;DR

LMTM-OS is the first marketing-agency control plane that **builds, ships, and refreshes a per-client dashboard entirely from agent activity**. There is no human "build the dashboard" step. The 14 agents *are* the dashboard factory. This doc captures what makes that novel, what the architecture looks like, and what's next.

## The novelty

### 1. Dashboards are an *emergent* output, not a *built* artifact

In a typical agency, a human analyst:

1. Pulls ad-platform data into a sheet
2. Builds a chart in Looker / Tableau / Metabase
3. Sets up a weekly refresh
4. Hands the dashboard to the client

In LMTM-OS, the dashboard is **never hand-built**. It is the rendered output of the 14 agents' work:

- **Delfina (Data)** writes the SQL for every tile.
- **Dario (Dashboards)** packages each SQL statement as a tile + chart.
- **Roxana (Reports)** drafts the narrative that surrounds the tiles.
- **Milo (Paid Media)** provides the Meta + Google performance data live, via the per-company `ctx.ads.resolveToken` call.
- **Sergio (SEO)** provides organic traffic and keyword-rank data via lmtm-google-trends + lmtm-web-search.

When a new client is added (a new row in `clients`), the dashboard **already exists** because it is parameterized by `companyId`. The tile SQL is the same for every client; the data scoping is what changes.

### 2. The same `companyId` flows through **every layer**

LMTM-OS treats the `companyId` as a first-class partition key, not a UI toggle:

- The **UI** switches dashboards when `selectedCompanyId` changes (no reload required).
- The **plugin tools** (lmtm-meta-ads, lmtm-google-ads) resolve per-company OAuth tokens via `ctx.ads.resolveToken("meta"|"google", companyId)`.
- The **ClickUp plugin** scopes task queries to a per-company `planillaExternalId` (the ClickUp folder id).
- The **n8n plugin** invokes per-company webhook flows.
- The **Delfina SQL** includes `WHERE company_id = :companyId` in every query.
- The **ClickUp → Paperclip seed** writes one `clients` row per ClickUp folder, with `planillaExternalId = <clickup_folder_id>`.

A client never sees another client's data, and a query against the wrong `companyId` is a code-review-level error — there is no codepath that lets a developer forget the partition.

### 3. The dashboard is **read-write**, not just read

Every tile has a "fix it" button:

- A campaign tile showing a CTR drop opens a "Create new creative" task in ClickUp (assigned to Bianca, Brand Guardian).
- A budget tile showing spend over 80% opens a "Reallocate budget" task (assigned to Milo).
- A retainer tile showing monthly under-delivery opens a "Plan catch-up sprint" task (assigned to Pablo).

The "fix it" button is the **same path** an agent would take on its own. The dashboard just exposes the path to a human. This means the dashboard never lies about what is happening — every suggestion is an actual issue that was opened, with a real assignee, in a real ClickUp list.

### 4. **Black + white, sin logo**

Per the LMTM-OS brand spec, every dashboard tile is rendered in a strict black + white palette. No logos. No gradients. No brand-color clutter. The single accent color is reserved for *anomalies* (red for a regression, amber for a near-threshold breach, green for a goal hit). The visual hierarchy is: tile > metric > label. Nothing else.

### 5. **Per-client Plan de Marketing** is a first-class page

The "Plan de Marketing" list in every ClickUp folder maps to a Paperclip page that:

- Lists the 5–7 active initiatives for the current month
- Shows the agent assigned to each
- Shows the latest metric the initiative is moving
- Shows the last heartbeat that touched it

This page is what Luna (CMO) reviews every Monday. It is the *narrative* version of the dashboard.

## The architecture

### Data flow

```
┌──────────────┐   ad-platform REST   ┌──────────────────┐
│ Meta / Google│ ◄──────────────────── │ lmtm-meta-ads    │
│              │                      │ lmtm-google-ads  │
└──────────────┘                      │ (plugin workers) │
                                     └────────┬─────────┘
                                              │ ctx.ads.resolveToken
                                              ▼
                                     ┌──────────────────┐
                                     │ ads_connections  │  ← unified table
                                     │ (Postgres)       │
                                     └────────┬─────────┘
                                              │
                                              ▼
┌──────────────┐   GAQL / Trends      ┌──────────────────┐
│ Trends / SERP│ ◄──────────────────── │ n8n workflows    │
│              │                      │ (n8n MCP bridge) │
└──────────────┘                      └────────┬─────────┘
                                              │ webhook / cron
                                              ▼
                                     ┌──────────────────┐
                                     │ LMTM warehouse   │  ← Postgres
                                     │ (Postgres)       │
                                     └────────┬─────────┘
                                              │ SQL
                                              ▼
                                     ┌──────────────────┐
                                     │ Delfina tiles    │  ← SQL → JSON
                                     │ (api/clients/:id │
                                     │  /dashboard)     │
                                     └────────┬─────────┘
                                              │ JSON
                                              ▼
                                     ┌──────────────────┐
                                     │ Dario tiles      │  ← JSON → render
                                     │ (UI /c/<slug>/   │
                                     │  dashboard)      │
                                     └──────────────────┘
```

### The 6 tile archetypes

| Archetype | Data source | Refresh cadence | Agent owner |
|-----------|-------------|-----------------|-------------|
| **Paid media KPI** | `lmtm-meta-ads:get_insights` + `lmtm-google-ads:get_insights` | 2h (Milo heartbeat) | Milo |
| **Organic SEO** | `lmtm-web-search` + `lmtm-google-trends` (via n8n) | 24h (Sergio heartbeat) | Sergio |
| **Cohort / funnel** | Delfina SQL on warehouse | 2h (Delfina heartbeat) | Delfina |
| **Budget pacing** | Realtime from ad-platform spend | 1h (Milo + Pablo) | Milo |
| **Initiative tracker** | ClickUp tasks in the per-folder lists | 5min (Pablo heartbeat) | Pablo |
| **Competitor watch** | `lmtm-web-search` scan | 6h (Carlos heartbeat) | Carlos |

Every tile is one SQL query (or one plugin tool call) with a `WHERE company_id = :companyId` clause. There are no per-client bespoke dashboards. The "per-client" part is the data, not the rendering.

### The "fix it" path

Every tile exposes a `recommendedAction` (one of: `create_creative_task`, `reallocate_budget`, `plan_catchup_sprint`, `none`). When a human clicks "fix it":

1. The UI posts to `/api/companies/:companyId/issues` with a prefilled body (assignee, due date, description).
2. Pablo's heartbeat picks it up within 4h and dispatches.
3. The tile re-renders with the new task linked.

This is the same path any agent uses to open a task on its own. The human just gets a button.

## Plan

### Done (this session)

- ✅ `clients` table in Paperclip with all planilla fields
- ✅ `/api/clients` (GET, POST, GET by id) endpoints
- ✅ 67 real clients seeded from the ClickUp "Clientes" space (`planillaSource = "clickup"`, `planillaExternalId = <folder_id>`)
- ✅ `lmtm-clients-planilla` skill (loaded by every agent)
- ✅ `lmtm-clickup-conventions` skill (the 1-Space-per-client-or-shared model)
- ✅ `lmtm-dashboard-design` skill (tile design spec)
- ✅ `lmtm-paid-media-kpi` skill (the paid-media tile definitions)
- ✅ 14 per-agent AGENTS.md files (each with their tile + role responsibilities)

### Next 7 days

- [ ] **Dashboard route**: `/c/<slug>/dashboard` (Dario)
- [ ] **First 3 tiles**: Paid Media KPI (spend / ROAS / CPA), Budget Pacing, Initiative Tracker
- [ ] **"Fix it" button** on Paid Media tile (create_creative_task)
- [ ] **Carla (Conversion) funnel tile** with cohort overlay

### Next 30 days

- [ ] All 6 tile archetypes live for all 67 active clients
- [ ] Per-client Slack digest (weekly, posted by Roxana)
- [ ] Anomaly auto-detection (CTR drop > 20% → Slack alert → auto-task)
- [ ] PDF export of the dashboard for client review meetings

### Open questions

- **Are the 67 clients in ClickUp the same as the 14-agent-paperclip LMTM company's clients?**
  Currently `clients` rows have `companyId = NULL` (clients are not company-scoped yet — they're a separate global table). We will need a "link client → company" step before the dashboard works end-to-end, or we treat all 67 as the LMTM company roster.
- **Tier heuristic**: All 67 clients show as `enterprise` because they all have 9–11 ClickUp lists. This is a noisy proxy. The next step is to ask Luna for the actual retainer per client and overwrite `monthlyRetainerCents` + `tier`.
- **The ClickUp structure is "1 Folder per client, N lists per service"** — this is the current LMTM convention. The original LMTM-OS spec was "1 Space per client, 1 Folder per month, 1 List per project". The seed preserves the current convention. Migrating to the spec convention is a separate effort (Pablo).

## Why this matters

Agency dashboards die because:
1. They are built once, then forgotten.
2. They are scoped to a person, not a role.
3. They are read-only — they tell you what happened, not what to do.

LMTM-OS dashboards are the opposite:
1. They are the *output* of agent activity, not a one-time project.
2. They are scoped to a `companyId` (the client), and refresh via the agent heartbeats.
3. They are read-write — every tile has a "fix it" button that opens a real task.

That is the novelty. Not the chart library. The fact that the chart is the trailing edge of a system of agents that already decided what to do.
