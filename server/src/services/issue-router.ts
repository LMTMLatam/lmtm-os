// LMTM-OS: deterministic issue router (auto-delegation).
//
// Problem it fixes: every issue defaults to the triage owner (Pablo, the "CEO"),
// who is supposed to delegate to the right specialist. When the triage owner is
// busy/down, work piles up and gets marked blocked instead of flowing to the
// person who can do it. This router classifies an issue by area from its text
// and resolves the matching specialist agent from the company roster — server
// side and LLM-free, so it works even when the agent fleet can't run. New issues
// are routed at creation; a periodic sweep also re-routes anything still sitting
// on the triage owner.

import type { Db } from "@paperclipai/db";
import { agents, issues } from "@paperclipai/db";
import { and, eq, inArray } from "drizzle-orm";
import { resolveTriageOwnerId } from "./client-tasks.js";

// Area → (regex that matches the issue text, regex that matches the agent name).
// Order matters: the first area whose `text` matches wins, so put the most
// specific / highest-value areas first.
const AREAS: Array<{ area: string; text: RegExp; agent: RegExp }> = [
  { area: "paid", text: /\b(spend[_ ]?cap|pauta|inversi[oó]n|presupuesto|campa[nñ]a|ad ?account|meta ads?|cpa|cpl|cpm|roas|ctr|anuncio|ampliaci[oó]n)\b/i, agent: /paid media/i },
  // Engineering/infra goes BEFORE content: titles like "[INFRA] Fix sync
  // orgánico Meta → LMTM-OS" contain "orgánico" and used to mis-route to the
  // Content agent. Backend/sync/deploy work belongs to the CRM Engineer.
  //
  // Keep the technical signals SPECIFIC — bare words ("script", "logs", "500",
  // "sync") also appear in content titles ("script para el reel", "500
  // seguidores", "revisar logs de engagement") and used to hijack them. The
  // bracket tags + qualified phrases (apps script, job de sync, error 50x) catch
  // the real infra work without stealing copywriting tasks.
  { area: "engineering", text: /(\[(infra|eng|ing|backend|dev)\])|\b(backend|deploy|servidor|base de datos|database|migraci[oó]n|endpoint|\bapi\b|job de sync|sincronizaci[oó]n|apps? ?script|gateway|error t[eé]cnico|crashe?|timeout)\b|\b(error|http|status)\s*50[0-9]\b/i, agent: /engineer/i },
  { area: "content", text: /\b(contenido|posteo|postear|org[aá]nic[oa]s?|reel|carrusel|creativ[oa]|caption|guion|calendario de contenido)\b/i, agent: /content/i },
  { area: "seo", text: /\b(seo|posicionamiento|keywords?|serp|metatags?|sitemap)\b/i, agent: /\bseo\b/i },
  { area: "n8n", text: /\b(n8n|automatizaci[oó]n|webhook|workflow|escenario de make|integraci[oó]n)\b/i, agent: /n8n/i },
  { area: "competitor", text: /\b(competidor|competencia|benchmark|qu[eé] hace la marca)\b/i, agent: /competitor/i },
  { area: "crm", text: /\b(crm|funnel|embudo|lead[s]?|conversi[oó]n|seguimiento de leads|kommo)\b/i, agent: /crm analyst|conversion/i },
  { area: "brand", text: /\b(dise[nñ]o|brand|placa|logo|identidad visual|gr[aá]fica)\b/i, agent: /brand/i },
  { area: "reports", text: /\b(reporte|informe|dashboard|m[eé]tricas semanales|tablero)\b/i, agent: /dashboards|reports/i },
];

// Issues we never auto-route away from the triage owner: system/board items and
// cross-area coordination that genuinely belong to the PM.
const KEEP_ON_TRIAGE = /^\s*\[(board|sistema|system)\]|wakeup|detector|stranded|recover/i;

export type RosterAgent = { id: string; name: string };

export function classifyArea(text: string): string | null {
  for (const a of AREAS) if (a.text.test(text)) return a.area;
  return null;
}

/** Resolve the specialist agent id for an issue's text, or null if none fits. */
export function resolveSpecialist(roster: RosterAgent[], text: string): string | null {
  if (KEEP_ON_TRIAGE.test(text)) return null;
  for (const a of AREAS) {
    if (!a.text.test(text)) continue;
    const hit = roster.find((r) => a.agent.test(r.name));
    if (hit) return hit.id;
  }
  return null;
}

async function loadRoster(db: Db, companyId: string): Promise<RosterAgent[]> {
  return db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.adapterType, "claude_local")));
}

/**
 * Pick the best assignee for a brand-new issue: the matching specialist if the
 * text clearly belongs to an area, otherwise the triage owner (so nothing is
 * ever left unassigned). Returns null only if neither can be resolved.
 */
export async function routeNewIssue(
  db: Db,
  companyId: string,
  text: string,
): Promise<string | null> {
  if (!companyId) return null;
  const roster = await loadRoster(db, companyId);
  const specialist = resolveSpecialist(roster, text);
  if (specialist) return specialist;
  return resolveTriageOwnerId(db, companyId);
}

/**
 * Re-route issues still sitting on the triage owner to the right specialist.
 * Only touches actionable states; never reassigns board/system issues. Returns
 * how many were delegated.
 */
export async function sweepStrandedIssues(db: Db): Promise<{ scanned: number; routed: number }> {
  const companies = await db.select({ id: agents.companyId }).from(agents).groupBy(agents.companyId);
  let scanned = 0;
  let routed = 0;
  for (const { id: companyId } of companies) {
    const triageId = await resolveTriageOwnerId(db, companyId);
    if (!triageId) continue;
    const roster = await loadRoster(db, companyId);
    const stuck = await db
      .select({ id: issues.id, title: issues.title, description: issues.description })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.assigneeAgentId, triageId),
          inArray(issues.status, ["todo", "backlog", "in_progress", "blocked"] as never),
        ),
      );
    for (const i of stuck) {
      scanned += 1;
      const text = `${i.title}\n${i.description ?? ""}`;
      const target = resolveSpecialist(roster, text);
      if (target && target !== triageId) {
        await db.update(issues).set({ assigneeAgentId: target } as never).where(eq(issues.id, i.id));
        routed += 1;
      }
    }
  }
  if (routed > 0) console.log(`[issue-router] sweep: delegated ${routed}/${scanned} stranded issue(s)`);
  return { scanned, routed };
}

let routerTimer: ReturnType<typeof setInterval> | null = null;

export function initIssueRouter(db: Db): void {
  if (routerTimer) return;
  setTimeout(() => { void sweepStrandedIssues(db).catch((e) => console.warn("[issue-router] sweep failed:", e)); }, 5 * 60 * 1000);
  routerTimer = setInterval(() => { void sweepStrandedIssues(db).catch((e) => console.warn("[issue-router] sweep failed:", e)); }, 30 * 60 * 1000);
  console.log("[issue-router] scheduled stranded-issue delegation sweep");
}
