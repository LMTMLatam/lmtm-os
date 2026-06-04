---
title: Pablo wakeup prompt size — known issue
date: 2026-06-04
slug: pablo-wakeup-prompt-size
status: open
severity: medium
owner: pablo-pm
---

# Pablo wakeup prompt size — known issue

**Symptom**: Pablo's heartbeat wakeup sometimes returns `process_lost`
from the M3 API or times out at the 90s default. The other 13 agents
don't show this.

**Why** (measured 2026-06-04): Pablo's `desiredSkills` array
(11 entries) totals **58,262 chars of SKILL.md content**, which is
~14,500 tokens of pure system-prompt payload. The 11 skills are:

| Skill | chars |
|---|---|
| lmtm-typescript-patterns | 8,064 |
| lmtm-crisis-comms | 7,802 |
| lmtm-clickup-conventions | 7,382 |
| lmtm-n8n-workflows | 7,013 |
| lmtm-postgres-patterns | 6,972 |
| lmtm-find-skills | 5,633 |
| lmtm-agent-browser-patterns | 5,541 |
| lmtm-tool-reference | 2,868 |
| lmtm-escalation-policy | 2,553 |
| lmtm-clients-planilla | 2,330 |
| lmtm-agency-overview | 2,104 |

With the base system prompt (~50 tokens), the `# Skills (injected
by LMTM-OS)` header, the skill separators (`---`), and the per-skill
headers (`## Skill: <name>`), the total system prompt is roughly
~15,500 tokens. Add the tool schema (~5-10k tokens for the 4 plugins'
~30 tools), the wake payload (~500-2000 tokens), and the truncated
session messages (up to 50 × ~300 tokens = 15k), and the request
payload can hit **40k+ tokens** in pathological cases.

**Why it intermittently fails**: the M3 API seems to have an
unstated rate limit on input size, OR the upstream is
silently dropping very large requests (`process_lost` = the
adapter's child process was killed before the response came back).
The 90s timeout in `execute.ts:131` is generous but the upstream
may also be queueing.

## Workarounds (in priority order)

### 1. Drop redundant skills from Pablo's desiredSkills

Pablo's actual workflow is PM/coordination, but his desiredSkills
includes `lmtm-typescript-patterns` (8k), `lmtm-postgres-patterns`
(7k), and `lmtm-agent-browser-patterns` (5.5k). These are
engineering skills that Pablo's actual conversation rarely
needs — he delegates to `esteban-crm-engineer` and `carla-conversion`
when code is needed.

**Recommendation**: remove these from Pablo's `desiredSkills`:

```bash
# Via the API (Pablo's agent id is 11111111-0000-4000-8000-00000000000e)
curl -X POST https://lmtm.onrender.com/api/agents/11111111-0000-4000-8000-00000000000e/skills/sync \
  -H "Cookie: ..." -H "Content-Type: application/json" \
  -d '{"desiredSkills":["lmtm-agency-overview","lmtm-clients-planilla","lmtm-clickup-conventions","lmtm-n8n-workflows","lmtm-escalation-policy","lmtm-crisis-comms","lmtm-tool-reference","lmtm-find-skills"]}'
```

That drops ~20k chars (~5k tokens), bringing the total down to
~38k chars (~9.5k tokens) and probably eliminating the
`process_lost` failures.

### 2. Reduce `maxConversationMessages` default

`packages/adapters/minimax-local/src/server/execute.ts:132` sets
`maxMessages = 50`. Reducing to 20 would halve the session-history
contribution. Trade-off: the model loses earlier context.

### 3. Add a per-skill block char cap

Modify `loadDesiredSkillBlocks` in `execute.ts:85-110` to truncate
each block at, say, 4,000 chars with a `[... truncated. Use the
load_skill tool to read the full content if needed]` footer. The
model can then ask for the full skill explicitly when it needs it.

This requires exposing a `load_skill` tool that reads
`SKILL.md` by key. Roughly 1 day of work.

### 4. Split skills into "core" (always loaded) and "extended" (loaded on demand)

Add a `core: true` flag to `PaperclipSkillEntry`. The adapter
loads only `core` skills by default and exposes a tool to load
extended ones. Same effort as #3 but cleaner.

## Open question for the user

Does Pablo actually USE `lmtm-typescript-patterns` and
`lmtm-postgres-patterns` in his current 14-agent workflow? If
not, #1 is the right answer (zero code change, immediate
improvement). If he does, #3 is the better path.

## Status

- [ ] Audit Pablo's last 20 wakeups to see which skills he actually invokes
- [ ] Decide: trim desiredSkills (cheap) or refactor skill loading (expensive)
- [ ] Apply fix
- [ ] Verify over 24h that `process_lost` rate drops to 0
