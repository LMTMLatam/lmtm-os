// LMTM-OS: feedback agent + auto-derivation (#2).
// Ingests WhatsApp group messages, classifies them (request / complaint /
// question / praise), links them to a client when possible, stores them, and
// escalates actionable/negative ones to the agency team. Surfaces in the panel.

import type { Db } from "@paperclipai/db";
import { waGroupMessages, feedbackItems, clients, companies } from "@paperclipai/db";
import { gte, eq, desc, and } from "drizzle-orm";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";
import { resolveCompanyId } from "./intel-common.js";

const RX = {
  complaint: /\b(problema|error|no funciona|no anda|mal|queja|reclamo|urgente|molest|cancel|atras|demor|tarde|falla|roto)\b/i,
  request: /\b(necesito|pueden|podr[ií]an|quiero|solicito|me gustar[ií]a|hace falta|por favor|pod[eé]s|me pasan|mandame|env[ií]en)\b/i,
  praise: /\b(gracias|excelente|genial|perfecto|barbaro|buen[ií]simo|crack|de diez|impecable)\b/i,
};

function classify(body: string): { classification: string; sentiment: string; actionable: boolean } {
  const t = body || "";
  if (RX.complaint.test(t)) return { classification: "complaint", sentiment: "negative", actionable: true };
  if (RX.request.test(t)) return { classification: "request", sentiment: "neutral", actionable: true };
  if (t.trim().endsWith("?")) return { classification: "question", sentiment: "neutral", actionable: true };
  if (RX.praise.test(t)) return { classification: "praise", sentiment: "positive", actionable: false };
  return { classification: "comment", sentiment: "neutral", actionable: false };
}

export async function ingestFeedback(db: Db): Promise<{ captured: number; escalated: number }> {
  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const msgs = await db.select().from(waGroupMessages).where(gte(waGroupMessages.timestamp, since)).orderBy(desc(waGroupMessages.timestamp)).limit(500);
  if (msgs.length === 0) return { captured: 0, escalated: 0 };

  const [defaultCompany] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!defaultCompany) return { captured: 0, escalated: 0 };
  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const matchClient = (groupName: string | null): string | null => {
    if (!groupName) return null;
    const g = groupName.toLowerCase();
    return clientRows.find((c) => g.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(g))?.id ?? null;
  };

  const team = alertsNumber();
  let captured = 0, escalated = 0;

  for (const m of msgs) {
    const { classification, sentiment, actionable } = classify(m.body);
    if (classification === "comment") continue; // ignore chatter
    const clientId = matchClient(m.groupName);
    const companyId = (clientId && (await resolveCompanyId(db, clientId))) || defaultCompany.id;

    const inserted = await db.insert(feedbackItems).values({
      companyId, clientId: clientId ?? null, source: "whatsapp",
      rawText: m.body.slice(0, 1000), classification, sentiment,
      status: actionable ? "open" : "logged", externalRef: m.id,
    }).onConflictDoNothing({ target: feedbackItems.externalRef }).returning({ id: feedbackItems.id });

    if (inserted.length === 0) continue; // already processed
    captured += 1;

    // Escalate complaints to the team immediately.
    if (classification === "complaint" && team) {
      const who = m.groupName ?? "grupo";
      const body = `🔴 *Feedback a atender* (${who})\n${m.senderName ? m.senderName + ": " : ""}${m.body.slice(0, 300)}\n\n_LMTM-OS · feedback_`;
      const r = await sendWhatsAppToNumber(team, body);
      if (r.ok) escalated += 1;
    }
  }
  return { captured, escalated };
}

export async function listFeedback(db: Db, opts: { clientId?: string; status?: string } = {}) {
  const conds = [];
  if (opts.clientId) conds.push(eq(feedbackItems.clientId, opts.clientId));
  if (opts.status) conds.push(eq(feedbackItems.status, opts.status));
  return db.select().from(feedbackItems)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(feedbackItems.createdAt)).limit(100);
}

let fbTimer: ReturnType<typeof setInterval> | null = null;
export function initFeedbackAgent(db: Db): void {
  if (fbTimer) return;
  setTimeout(() => { ingestFeedback(db).catch((e) => console.warn("[feedback] ingest failed:", e)); }, 10 * 60 * 1000);
  fbTimer = setInterval(() => { ingestFeedback(db).catch((e) => console.warn("[feedback] ingest failed:", e)); }, 60 * 60 * 1000);
  console.log("[feedback-agent] scheduled feedback ingestion hourly");
}
