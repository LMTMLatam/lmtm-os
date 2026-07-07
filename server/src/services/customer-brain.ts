// LMTM-OS: Customer Brain — living per-client memory (#1).
//
// Accumulates and continuously updates facts/decisions/preferences/events/
// performance per client, fed from ClickUp's Enfoque Técnico, ad performance,
// and other signals. Read by agent-chat (context injection), the weekly report
// and the opportunities engine.

import type { Db } from "@paperclipai/db";
import { clientMemory, clients, videoReferences } from "@paperclipai/db";
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

/** Compact, prompt-ready context string from the client's brain.
 *
 * Priority: pinned → kind (estrategia/hechos antes que alertas) → recency.
 * Every memory gets a per-line cap so una sola memoria enorme no puede
 * comerse (ni vaciar) todo el presupuesto: el loop viejo hacía `break` en la
 * PRIMERA línea que no entraba, y como el "enfoque-tecnico" pinneado mide
 * hasta 4000 chars, 5 de 6 clientes con enfoque recibían contexto VACÍO en
 * ideas/reportes/oportunidades (detectado 2026-07-07). */
const KIND_WEIGHT: Record<string, number> = { context: 0, fact: 1, preference: 2, decision: 3, performance: 4, event: 5, risk: 6 };

export async function getBrainContext(db: Db, clientId: string, maxChars = 2500): Promise<string> {
  const rows = await getClientBrain(db, clientId);
  if (rows.length === 0) return "";
  const ordered = [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const kw = (KIND_WEIGHT[a.kind] ?? 9) - (KIND_WEIGHT[b.kind] ?? 9);
    if (kw !== 0) return kw;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  // Una línea puede usar hasta ~40% del presupuesto: el enfoque técnico entra
  // resumido y siguen quedando ~60% para feedback, review, notas y performance.
  const perLineCap = Math.max(800, Math.floor(maxChars * 0.4));
  let out = "";
  for (const r of ordered) {
    const room = maxChars - out.length;
    if (room < 80) break; // no queda espacio útil
    let line = `- [${r.kind}] ${r.content}`;
    const cap = Math.min(perLineCap, room);
    if (line.length > cap) line = line.slice(0, cap - 1) + "…";
    out += (out ? "\n" : "") + line;
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

  // Perfil de videos derivado de las referencias etiquetadas por el equipo
  // (tipo: Blanda/VSL/Comercial/Engagement · concepto: Cinemático/UGC/...).
  // Pinned al brain para que TODA generación de contenido lo respete — es el
  // eslabón "etiquetás una vez → el agente crea con ese perfil".
  try {
    const refs = await db.select({ categorias: videoReferences.categorias })
      .from(videoReferences).where(eq(videoReferences.clientId, clientId));
    const tagged = refs.filter((r) => (r.categorias ?? []).length > 0);
    if (tagged.length > 0) {
      const TIPOS = new Set(["blanda", "vsl", "comercial", "engagement"]);
      const counts = new Map<string, number>();
      for (const r of tagged) for (const c of r.categorias ?? []) {
        const k = c.trim();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const tipos = ranked.filter(([k]) => TIPOS.has(k.toLowerCase())).slice(0, 2).map(([k, n]) => `${k} (${n})`);
      const conceptos = ranked.filter(([k]) => !TIPOS.has(k.toLowerCase())).slice(0, 3).map(([k, n]) => `${k} (${n})`);
      const content = `Perfil de videos del cliente (derivado de ${tagged.length} referencias etiquetadas por el equipo): ` +
        `${tipos.length ? `tipo dominante ${tipos.join(", ")}` : "sin tipo dominante todavía"}` +
        `${conceptos.length ? `; conceptos: ${conceptos.join(", ")}` : ""}. ` +
        `Las ideas de video para Super Redes deben seguir este perfil (indicar tipo + concepto en el copy).`;
      await upsertMemory(db, { companyId, clientId, kind: "preference", key: "video-profile", content, source: "video-references", confidence: 0.9, pinned: true });
      updated++;
    }
  } catch { /* sin referencias no hay perfil */ }

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

