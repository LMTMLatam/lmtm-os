// LMTM-OS: shared helpers for the intelligence-layer services.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsInsights, companies, clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";

/**
 * Resolve a company id for a client. Clients are not directly tied to a
 * company column, so we resolve via ad mappings → ad insights → the first
 * company in the instance (single-tenant fallback).
 */
export async function resolveCompanyId(db: Db, clientId: string): Promise<string | null> {
  const [m] = await db.select({ c: adsAccountMappings.companyId }).from(adsAccountMappings).where(eq(adsAccountMappings.clientId, clientId)).limit(1);
  if (m?.c) return m.c;
  const [i] = await db.select({ c: adsInsights.companyId }).from(adsInsights).where(eq(adsInsights.clientId, clientId)).limit(1);
  if (i?.c) return i.c;
  const [co] = await db.select({ id: companies.id }).from(companies).limit(1);
  return co?.id ?? null;
}

/** Active clients, with the fields the intelligence services need. */
export async function activeClients(db: Db) {
  return db.select().from(clients).where(eq(clients.status, "active"));
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};
