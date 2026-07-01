// LMTM-OS: Customer Brain — living per-client memory (#1).
//
// Accumulates and continuously updates facts/decisions/preferences/events/
// performance per client, fed from ClickUp's Enfoque Técnico, ad performance,
// and other signals. Read by agent-chat (context injection), the weekly report
// and the opportunities engine.

import type { Db } from "@paperclipai/db";
import { clientMemory, clients } from "@paperclipai/db";
import { and, eq, desc } from "drizzle-orm";
import { aggInsights, dayStr } from "./agency-ops.js";
import { getEnfoqueTecnicoContext } from "./clickup-sync.js";
import { resolveCompanyId, activeClients } from "./intel-common.js";

export type MemoryKind = "fact" | "preference" | "decision" | "event" | "performance" | "context" | "risk";

export async function upsertMemory(
  db: Db,
  input: { companyId: string; clientId: string; kind: MemoryKind; key: string; content: string; source?: string; confidence?: number; pinned?: boolean },
): Promise<void> {
  await db.insert(clientMemory).values({
    companyId: input.companyId,
    clientId: input.clientId,
    kind: input.kind,
    key: input.key,
    content: input.content,
    source: input.source ?? null,
    confidence: input.confidence != null ? String(input.confidence) : "0.7",
    pinned: input.pinned ?? false,
  }).onConflictDoUpdate({
    target: [clientMemory.clientId, clientMemory.kind, clientMemory.key],
    set: { content: input.content, source: input.source ?? null, updatedAt: new Date() },
  });
}

export async function getClientBrain(db: Db, clientId: string) {
  return db.select().from(clientMemory).where(eq(clientMemory.clientId, clientId))
    .orderBy(desc(clientMemory.pinned), desc(clientMemory.updatedAt)).limit(100);
}

/** True if the client already has a memory entry with this key. Use for
 *  idempotency checks — reliable regardless of how large the brain is (scanning
 *  the truncated getBrainContext string can miss the entry once the brain grows). */
export async function hasMemory(db: Db, clientId: string, key: string): Promise<boolean> {
  const [row] = await db.select({ id: clientMemory.id }).from(clientMemory)
    .where(and(eq(clientMemory.clientId, clientId), eq(clientMemory.key, key))).limit(1);
  return !!row;
}

/** Compact, prompt-ready context string from the client's brain (pinned first). */
export async function getBrainContext(db: Db, clientId: string, maxChars = 2500): Promise<string> {
  const rows = await getClientBrain(db, clientId);
  if (rows.length === 0) return "";
  const lines = rows.map((r) => `- [${r.kind}] ${r.content}`);
  let out = "";
  for (const l of lines) {
    if (out.length + l.length > maxChars) break;
    out += (out ? "\n" : "") + l;
  }
  return out;
}

/** Derive/refresh memory entries for a client from its current signals. */
export async function refreshClientBrain(db: Db, clientId: string): Promise<{ updated: number }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { updated: 0 };
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { updated: 0 };
  let updated = 0;

  // Pinned identity facts.
  const identity = [client.industry ? `Rubro: ${client.industry}` : null, client.websiteUrl ? `Web: ${client.websiteUrl}` : null]
    .filter(Boolean).join(" · ");
  if (identity) {
    await upsertMemory(db, { companyId, clientId, kind: "fact", key: "identity", content: identity, source: "client", pinned: true });
    updated++;
  }

  // Enfoque Técnico context (the client's networks/strategy doc).
  try {
    const ctx = await getEnfoqueTecnicoContext(db, clientId, { maxAgeMs: 60 * 60 * 1000 });
    const md = (ctx.markdown ?? "").trim();
    if (md) {
      await upsertMemory(db, { companyId, clientId, kind: "context", key: "enfoque-tecnico", content: md.slice(0, 4000), source: "clickup", confidence: 0.9, pinned: true });
      updated++;
    }
  } catch { /* no enfoque */ }

  // Weekly performance snapshot.
  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));
  const w = await aggInsights(db, clientId, d(7), d(0));
  if (w.impressions > 0 || w.spend > 0) {
    const ctr = w.impressions > 0 ? (w.clicks / w.impressions) * 100 : 0;
    const cpl = w.leads > 0 ? w.spend / w.leads : 0;
    const perf = `Últimos 7d: inversión $${Math.round(w.spend)}, ${w.leads} leads, CTR ${ctr.toFixed(2)}%${w.leads > 0 ? `, CPL $${Math.round(cpl)}` : ""}.`;
    await upsertMemory(db, { companyId, clientId, kind: "performance", key: "weekly-ads", content: perf, source: "ads", confidence: 1 });
    updated++;
  }

  return { updated };
}

let brainTimer: ReturnType<typeof setInterval> | null = null;

export function initCustomerBrain(db: Db): void {
  if (brainTimer) return;
  const run = async () => {
    const rows = await activeClients(db);
    for (const c of rows) { await refreshClientBrain(db, c.id).catch(() => {}); }
  };
  setTimeout(() => { run().catch((e) => console.warn("[customer-brain] refresh failed:", e)); }, 8 * 60 * 1000);
  brainTimer = setInterval(() => { run().catch((e) => console.warn("[customer-brain] refresh failed:", e)); }, 12 * 3600 * 1000);
  console.log("[customer-brain] scheduled brain refresh every 12h");
}

