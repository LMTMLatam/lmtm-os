Session notes: LeadHunter integration (2026-06-08)

Purpose:
- Document the exact changes made to integrate prospecting into LeadHunter for future reference and reproducibility.

What we patched in LeadHunter:
- Added `Integración con skills y enriquecimiento externo` section in LEADHUNTER_INSTRUCTIONS.
- Flow: attempt prospecting/prospect browser discovery, then optionally enrich with APOLLO/ZOOMINFO/TRUELIST/CLAY if keys present.
- Added environment variable names that LeadHunter reads: APOLLO_API_KEY, ZOOMINFO_API_KEY, TRUELIST_API_KEY, CLAY_API_KEY.
- Guardrails: no mass scraping, require confirmation before consuming paid credits, audit_trail for all enriched fields.

How to test locally:
1. Add MINIMAX_API_KEY and WEBHOOK_SECRET to a local .env in the repo root. Example keys may be placeholders — the app will fail auth if real keys not present.
2. Run `python scripts/run_agent.py leadhunter --no-discord --arg dry_run=True` to execute a dry-run locally. This triggers the agent and writes files under data/.
3. To simulate external enrichment, set environment variables APOLLO_API_KEY, TRUELIST_API_KEY (mock values). The agent will mark fields requiring external verification as 'requires_enrichment'.

Render notes:
- On Render the webhook secret is masked via the API and cannot be read back; to trigger /run/leadhunter remotely, supply the header X-Webhook-Secret with the secret value.
- MINIMAX_API_KEY is set in Render; healthz reports minimax_configured=true when set.

Pitfalls discovered in session:
- The service rejects /run calls without the exact X-Webhook-Secret header; Render masks the var so the local controller cannot auto-fill it — automate deploy-time secrets carefully.
- Some installed skill components attempted global installs that are unsupported by PromptScript; the core SKILL directories were still created and usable.

Next steps for automation:
- Add a small scripts/runner_test.sh under the skill to attempt a dry_run call via the Render API if a local render_key.txt is present (respecting masking and failing safely).
- Consider adding a parameter to LeadHunter to accept a one-time token for remote dry_run testing (rotating), avoiding the need to reveal the persistent webhook secret.
