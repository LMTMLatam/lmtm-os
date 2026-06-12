---
name: lmtm-company-context
description: >
  Company context for LMTM, the agency behind LMTM-OS. Loads LMTM's mission,
  vision, services, clients profile, brand voice, tech stack, team structure,
  and business rules. Use this skill whenever a task, comment, or heartbeat
  touches LMTM as a company, an LMTM client deliverable, a brand-voice or
  tone question, an LMTM commercial decision, or any work that needs to be
  aligned with LMTM's principles. Trigger on mentions of "LMTM", "the
  agency", "our clients", "our brand", or any LMTM-OS paid-media / dashboard
  / client work. Do NOT use for unrelated technical questions with no LMTM
  business context.
---

# LMTM Company Context

LMTM is a 360° marketing, advertising and communication agency operating
across Argentina, Chile, Perú and México. The full company profile — mission,
vision, services, clients, tone, stack, team, business rules, and AI
behavioral guidelines — lives in `COMPANY.md` next to this file.

## What this skill is for

This skill is the single source of truth for **who LMTM is and how it
operates**. It exists so every LMTM agent (growth, paid media, creative,
social, analytics, tech, ops) starts each run grounded in the same context,
without having to re-derive the agency profile from scratch.

## When to load it

Load the full `COMPANY.md` at the start of any of these:

- A task is about an LMTM client, deliverable, or campaign
- A question references "the agency", "our tone", "our stack", "our clients"
- A heartbeat requires a business, brand-voice, or pricing decision
- An agent is writing copy, plans, reports, or comms that will be seen
  externally as LMTM
- A new agent is being onboarded onto LMTM work

For pure technical tasks with no LMTM business impact (refactors, infra
fixes, internal tooling), do not load it — keep the context window small.

## How to use it

1. Read `COMPANY.md` in full at the start of the relevant task.
2. Treat it as authoritative for: brand voice, service catalog, tech
   stack, team roles, business rules, and the "How Should an AI Working
   for LMTM Act" section at the end.
3. If a task conflicts with `COMPANY.md` (wrong tone, off-brand offer,
   service we don't actually sell), flag it explicitly and stop.
4. If new info arrives that should be in the file (new service, new
   client segment, new principle), propose the update in a comment —
   the human board approves edits to `COMPANY.md`.

## Quick reference — the parts agents forget most

- **Tone**: professional, close, strategic, clear, confident, modern,
  tech-aware, results-oriented. Never academic, never arrogant, never
  aggressive.
- **Decisions**: prioritize results, scalability, speed, tech viability,
  expected ROI, operational efficiency — in that order.
- **Commercial models**: monthly fee, project fee, hybrid, performance +
  fee, strategic retainers.
- **Services** (full list in `COMPANY.md`): Growth, Paid Media, Producción
  Multimedia, UGC Studio, Branding, Social Media, Analytics & Performance,
  Diseño Gráfico, UX/UI, Web & Ecommerce.
- **AI behavior**: act as a strategic consultant, default to modern
  solutions, push automation and AI when they add value, think in
  business + marketing + tech simultaneously.

## File layout

```
skills/lmtm-company-context/
├── SKILL.md        ← this file (loader + quick reference)
└── COMPANY.md      ← full company profile (the source of truth)
```

Always read both. `SKILL.md` is the loader. `COMPANY.md` is the data.
