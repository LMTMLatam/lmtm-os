// LMTM-OS: creative opportunities engine (#5).
// Per client, combines performance gaps + niche learnings + the content
// knowledge graph + Customer Brain + upcoming key dates into ranked, actionable
// opportunities. Mostly deterministic, with an optional AI-generated idea.
//
// High-priority opportunities (priority >= OPPORTUNITY_AUTOCREATE_THRESHOLD) are
// automatically materialized as issues (originKind="agent_proposed" — pending
// approval if external work, or active if internal). The created issue id is
// stored in opportunities.converted_issue_id so subsequent runs don't
// re-create the same one.

import type { Db } from "@paperclipai/db";
import { opportunities, clients } from "@paperclipai/db";
import { and, eq, desc, isNull, gte, sql } from "drizzle-orm";
import { aggInsights, dayStr, aiNarrative } from "./agency-ops.js";
import { getBrainContext } from "./customer-brain.js";
import { learningsForNiche } from "./learning-engine.js";
import { topContent } from "./knowledge-graph.js";
import { upcomingEfemerides } from "./efemerides.js";
import { resolveCompanyId, activeClients } from "./intel-common.js";
import { issueService } from "./issues.js";
import { resolveTriageOwnerId } from "./client-tasks.js";
import { getLatestScore } from "./account-scoring.js";

// Anything at or above this priority becomes a real issue in the per-client
// Tareas panel. Below stays as a "sugerencia" the operator reviews manually.
export const OPPORTUNITY_AUTOCREATE_THRESHOLD = 70;

interface Draft { kind: string; title: string; rationale: string; suggestedAction: string; priority: number; basis: Record<string, unknown> }

export async function generateClientOpportunities(db: Db, clientId: string): Promise<{ created: number; materialized: number; opportunities: Draft[] }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { created: 0, materialized: 0, opportunities: [] };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { created: 0, materialized: 0, opportunities: [] };

  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));
  const w7 = await aggInsights(db, clientId, d(7), d(0));
  const nicheLearnings = await learningsForNiche(db, client.industry);
  const top = await topContent(db, clientId, 5);
  const efem = upcomingEfemerides(today, 14);

  const drafts: Draft[] = [];

  // 1. Apply the niche's winning format (cumulative learning).
  if (nicheLearnings[0]) {
    const l = nicheLearnings[0];
    const fmt = (l.evidence as { topFormat?: string })?.topFormat;
    if (fmt) drafts.push({
      kind: "content", title: `Priorizar formato "${fmt}"`,
      rationale: l.pattern, suggestedAction: `Planificar la próxima tanda de contenido en formato "${fmt}".`,
      priority: 80, basis: { learning: l.pattern },
    });
  }

  // 2. Anticipate upcoming key dates.
  for (const e of efem.slice(0, 3)) {
    drafts.push({
      kind: "timing", title: `Contenido para ${e.name}`,
      rationale: `${e.name} es el ${e.date} (en ${e.inDays} días).`,
      suggestedAction: `Crear pieza/campaña alusiva con anticipación.`,
      priority: 70 - e.inDays, basis: { efemeride: e.name, date: e.date },
    });
  }

  // 3. Replicate top-performing content.
  if (top[0]?.title) drafts.push({
    kind: "content", title: `Replicar lo que funcionó: "${top[0].title.slice(0, 60)}"`,
    rationale: `Es de tu contenido con mejor desempeño (score ${Number(top[0].score ?? 0)}).`,
    suggestedAction: "Producir variantes del ángulo/formato que mejor rindió.",
    priority: 65, basis: { contentRef: top[0].contentRef },
  });

  // 4. Fix performance gaps.
  if (w7.impressions >= 500) {
    const ctr = w7.clicks / w7.impressions * 100;
    if (ctr < 1) drafts.push({
      kind: "campaign", title: "Refrescar creatividades (CTR bajo)",
      rationale: `CTR ${ctr.toFixed(2)}% en 7 días.`, suggestedAction: "Testear 3 nuevos hooks/creatividades.",
      priority: 75, basis: { ctr: Number(ctr.toFixed(2)) },
    });
    if (w7.spend > 0 && w7.leads === 0) drafts.push({
      kind: "campaign", title: "Revisar conversión (gasto sin leads)",
      rationale: `$${Math.round(w7.spend)} gastados sin leads.`, suggestedAction: "Auditar tracking, oferta y landing.",
      priority: 90, basis: { spend: Math.round(w7.spend) },
    });
  }

  // 5. Upsell: a client that's winning AND on an upswing is the moment to
  // propose scaling (more budget / a new service). Grounded in real data:
  // sustained 30-day lead volume + healthy account score + this week beating
  // last week. External (commercial) → becomes an approval proposal, never an
  // autonomous spend action.
  const w30 = await aggInsights(db, clientId, d(30), d(0));
  const prev7 = await aggInsights(db, clientId, d(14), d(7));
  const score = await getLatestScore(db, clientId).catch(() => null);
  const health = score?.healthScore ?? 0;
  const onUpswing = w7.leads > prev7.leads || (w7.impressions >= 200 && prev7.impressions >= 200 &&
    (w7.clicks / w7.impressions) > (prev7.clicks / Math.max(prev7.impressions, 1)));
  if (w30.leads >= 10 && health >= 65 && onUpswing) {
    const cpl = w30.leads > 0 ? w30.spend / w30.leads : 0;
    drafts.push({
      kind: "upsell",
      title: "Oportunidad de upsell (rindiendo y en alza)",
      rationale: `30 días: ${w30.leads} leads, CPL $${Math.round(cpl)}, score de salud ${health}. Esta semana (${w7.leads} leads) supera la anterior (${prev7.leads}).`,
      suggestedAction: "Proponerle al cliente escalar pauta o sumar un servicio (contenido/CRM/otra plataforma). Armar la propuesta comercial con estos números.",
      priority: 78,
      basis: { leads30d: w30.leads, cpl: Math.round(cpl), healthScore: health, leads7d: w7.leads, leadsPrev7d: prev7.leads },
    });
  }

  // 6. Optional AI-generated creative idea from the combined context.
  try {
    const brain = await getBrainContext(db, clientId, 1200);
    const idea = await aiNarrative(
      "Sos un creativo de LMTM. Proponé UNA idea de contenido concreta y original para este cliente, en 1-2 oraciones, accionable. Sin títulos ni saludos.",
      `Cliente: ${client.name} (${client.industry ?? "s/rubro"})\nContexto:\n${brain || "s/d"}\nAprendizaje de nicho: ${nicheLearnings[0]?.pattern ?? "s/d"}`,
    );
    if (idea) drafts.push({
      kind: "content", title: `Idea creativa: ${idea.slice(0, 70)}`,
      rationale: "Generada por IA a partir del contexto del cliente.", suggestedAction: idea,
      priority: 60, basis: { ai: true },
    });
  } catch { /* AI optional */ }

  // Persist (dedup by client+kind+title).
  let created = 0;
  for (const o of drafts) {
    const res = await db.insert(opportunities).values({
      companyId, clientId, kind: o.kind, title: o.title.slice(0, 200),
      rationale: o.rationale, suggestedAction: o.suggestedAction, basis: o.basis, priority: o.priority, status: "new",
    }).onConflictDoUpdate({
      target: [opportunities.clientId, opportunities.kind, opportunities.title],
      set: { rationale: o.rationale, suggestedAction: o.suggestedAction, basis: o.basis, priority: o.priority },
    }).returning({ id: opportunities.id });
    if (res.length) created += 1;
  }

  // Materialize high-priority opportunities as issues (per-client Tareas panel).
  // Skip ones already converted, so a second run won't duplicate the issue.
  const autocreate = drafts.filter((d) => d.priority >= OPPORTUNITY_AUTOCREATE_THRESHOLD);
  let materialized = 0;
  for (const o of autocreate) {
    const issueId = await materializeOpportunityAsIssue(db, {
      clientId,
      clientName: client.name,
      companyId,
      title: o.title,
      rationale: o.rationale,
      suggestedAction: o.suggestedAction,
      basis: o.basis,
      priority: o.priority,
      kind: o.kind,
    });
    if (issueId) materialized += 1;
  }

  return {
    created,
    materialized,
    opportunities: drafts.sort((a, b) => b.priority - a.priority),
  };
}

/**
 * If the opportunity is high-priority and not yet materialized, create an
 * issue tagged to the client. Internal work → `todo` (active). External work
 * (anything involving the client, money or publishing) → `backlog` with
 * `origin_kind=agent_proposed` (needs approval in the Tareas panel).
 *
 * Returns the created issue id, or null if skipped (already converted / no
 * company / error). Best-effort — never throws so the rest of the run keeps
 * going.
 */
export async function materializeOpportunityAsIssue(
  db: Db,
  input: {
    clientId: string;
    clientName: string;
    companyId: string;
    title: string;
    rationale: string;
    suggestedAction: string;
    basis: Record<string, unknown>;
    priority: number;
    kind: string;
  },
): Promise<string | null> {
  try {
    // Find the matching opportunity row (same dedup key) and skip if already
    // converted — materializing twice would create duplicate issues.
    const [row] = await db
      .select({ id: opportunities.id, convertedIssueId: opportunities.convertedIssueId })
      .from(opportunities)
      .where(and(
        eq(opportunities.clientId, input.clientId),
        eq(opportunities.kind, input.kind),
        eq(opportunities.title, input.title.slice(0, 200)),
      ))
      .limit(1);
    if (row?.convertedIssueId) return null; // already done

    // External kinds ("campaign", "budget", "upsell") touch client / money →
    // proposal. Content / timing are informational, internal work → active.
    const isExternal = input.kind === "campaign" || input.kind === "budget" || input.kind === "upsell";
    const priority =
      input.priority >= 90 ? "urgent"
      : input.priority >= 75 ? "high"
      : input.priority >= 60 ? "medium"
      : "low";

    const description = [
      `**Cliente**: ${input.clientName}`,
      `**Por qué** (rationale): ${input.rationale || "(s/d)"}`,
      `**Acción sugerida**: ${input.suggestedAction || "(s/d)"}`,
      `_Origen: opportunities-engine · prioridad ${input.priority} · auto-creado_`,
    ].join("\n\n");

    const assigneeAgentId = await resolveTriageOwnerId(db, input.companyId);
    // Prefix the issue title with the client name. The opportunity dedup key
    // (clientId, kind, title) stays on the raw title, but generic titles like
    // `Priorizar formato "ad"` are identical across clients and render as a wall
    // of "duplicates" on the board — the client name makes each one legible.
    const issueTitle = `[${input.clientName}] ${input.title}`.slice(0, 200);
    const created = await issueService(db).create(input.companyId, {
      title: issueTitle,
      description,
      status: (isExternal ? "backlog" : "todo") as never,
      priority: priority as never,
      clientId: input.clientId,
      originKind: "agent_proposed",
      createdByAgentId: null,
      ...(assigneeAgentId ? { assigneeAgentId } : {}),
    } as never);
    const issueId = String((created as Record<string, unknown>).id ?? "");
    if (!issueId) return null;

    if (row?.id) {
      await db
        .update(opportunities)
        .set({ convertedIssueId: issueId, convertedAt: new Date(), status: "converted" })
        .where(eq(opportunities.id, row.id));
    }
    return issueId;
  } catch (e) {
    console.warn("[opportunities] materialize failed", input.clientId, input.kind, input.title, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function listOpportunities(db: Db, clientId: string) {
  return db.select().from(opportunities).where(eq(opportunities.clientId, clientId))
    .orderBy(desc(opportunities.priority), desc(opportunities.createdAt)).limit(50);
}

export async function runAllOpportunities(db: Db): Promise<{ clients: number; materialized: number }> {
  const rows = await activeClients(db);
  let done = 0;
  let materialized = 0;
  for (const c of rows) {
    const r = await generateClientOpportunities(db, c.id).catch(() => ({ created: 0, materialized: 0 }));
    if (r.created > 0) done += 1;
    materialized += r.materialized ?? 0;
  }
  return { clients: done, materialized };
}

let oppTimer: ReturnType<typeof setInterval> | null = null;
export function initOpportunities(db: Db): void {
  if (oppTimer) return;
  setTimeout(() => { runAllOpportunities(db).catch((e) => console.warn("[opportunities] run failed:", e)); }, 30 * 60 * 1000);
  oppTimer = setInterval(() => { runAllOpportunities(db).catch((e) => console.warn("[opportunities] run failed:", e)); }, 24 * 3600 * 1000);
  console.log("[opportunities-engine] scheduled opportunities every 24h");
}
