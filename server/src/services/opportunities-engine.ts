// LMTM-OS: creative opportunities engine (#5).
// Per client, combines performance gaps + niche learnings + the content
// knowledge graph + Customer Brain + upcoming key dates into ranked, actionable
// opportunities. Mostly deterministic, with an optional AI-generated idea.

import type { Db } from "@paperclipai/db";
import { opportunities, clients } from "@paperclipai/db";
import { eq, desc } from "drizzle-orm";
import { aggInsights, dayStr, aiNarrative } from "./agency-ops.js";
import { getBrainContext } from "./customer-brain.js";
import { learningsForNiche } from "./learning-engine.js";
import { topContent } from "./knowledge-graph.js";
import { upcomingEfemerides } from "./efemerides.js";
import { resolveCompanyId, activeClients } from "./intel-common.js";

interface Draft { kind: string; title: string; rationale: string; suggestedAction: string; priority: number; basis: Record<string, unknown> }

export async function generateClientOpportunities(db: Db, clientId: string): Promise<{ created: number; opportunities: Draft[] }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { created: 0, opportunities: [] };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { created: 0, opportunities: [] };

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

  // 5. Optional AI-generated creative idea from the combined context.
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
  return { created, opportunities: drafts.sort((a, b) => b.priority - a.priority) };
}

export async function listOpportunities(db: Db, clientId: string) {
  return db.select().from(opportunities).where(eq(opportunities.clientId, clientId))
    .orderBy(desc(opportunities.priority), desc(opportunities.createdAt)).limit(50);
}

export async function runAllOpportunities(db: Db): Promise<{ clients: number }> {
  const rows = await activeClients(db);
  let done = 0;
  for (const c of rows) { const r = await generateClientOpportunities(db, c.id).catch(() => ({ created: 0 })); if (r.created > 0) done += 1; }
  return { clients: done };
}

let oppTimer: ReturnType<typeof setInterval> | null = null;
export function initOpportunities(db: Db): void {
  if (oppTimer) return;
  setTimeout(() => { runAllOpportunities(db).catch((e) => console.warn("[opportunities] run failed:", e)); }, 30 * 60 * 1000);
  oppTimer = setInterval(() => { runAllOpportunities(db).catch((e) => console.warn("[opportunities] run failed:", e)); }, 24 * 3600 * 1000);
  console.log("[opportunities-engine] scheduled opportunities every 24h");
}
