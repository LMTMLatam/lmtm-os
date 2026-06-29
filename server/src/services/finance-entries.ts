// LMTM-OS: business finance service (income & expenses).
// The agency's own money — client payments (income), subscriptions and other
// expenses (expense), categorized and optionally recurring. Separate from the
// agent-cost ledger in finance.ts / finance_events.

import type { Db } from "@paperclipai/db";
import { financeEntries, clients } from "@paperclipai/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export type FinanceType = "income" | "expense";
export type Recurrence = "one_time" | "monthly" | "yearly";

export interface FinanceEntryInput {
  type: FinanceType;
  category?: string;
  description?: string | null;
  amountCents: number;
  currency?: string;
  clientId?: string | null;
  recurring?: boolean;
  recurrence?: Recurrence;
  occurredAt?: string | Date;
}

const TYPES: FinanceType[] = ["income", "expense"];
const RECURRENCES: Recurrence[] = ["one_time", "monthly", "yearly"];

function clean(input: FinanceEntryInput) {
  const type: FinanceType = TYPES.includes(input.type) ? input.type : "expense";
  const recurrence: Recurrence = RECURRENCES.includes(input.recurrence as Recurrence)
    ? (input.recurrence as Recurrence)
    : "one_time";
  return {
    type,
    category: (input.category ?? "general").trim().slice(0, 60) || "general",
    description: input.description ? String(input.description).slice(0, 500) : null,
    amountCents: Math.round(Math.abs(Number(input.amountCents) || 0)),
    currency: (input.currency ?? "ARS").trim().slice(0, 8).toUpperCase() || "ARS",
    clientId: input.clientId || null,
    recurring: Boolean(input.recurring) || recurrence !== "one_time",
    recurrence,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
  };
}

export function financeEntriesService(db: Db) {
  return {
    async list(
      companyId: string,
      filters: { type?: FinanceType; category?: string; clientId?: string; since?: string; until?: string } = {},
    ) {
      const conds = [eq(financeEntries.companyId, companyId)];
      if (filters.type && TYPES.includes(filters.type)) conds.push(eq(financeEntries.type, filters.type));
      if (filters.category) conds.push(eq(financeEntries.category, filters.category));
      if (filters.clientId) conds.push(eq(financeEntries.clientId, filters.clientId));
      if (filters.since) conds.push(gte(financeEntries.occurredAt, new Date(filters.since)));
      if (filters.until) conds.push(lte(financeEntries.occurredAt, new Date(filters.until)));
      const rows = await db
        .select({
          id: financeEntries.id,
          type: financeEntries.type,
          category: financeEntries.category,
          description: financeEntries.description,
          amountCents: financeEntries.amountCents,
          currency: financeEntries.currency,
          clientId: financeEntries.clientId,
          clientName: clients.name,
          recurring: financeEntries.recurring,
          recurrence: financeEntries.recurrence,
          occurredAt: financeEntries.occurredAt,
        })
        .from(financeEntries)
        .leftJoin(clients, eq(clients.id, financeEntries.clientId))
        .where(and(...conds))
        .orderBy(desc(financeEntries.occurredAt))
        .limit(500);
      return rows;
    },

    async create(companyId: string, input: FinanceEntryInput) {
      const v = clean(input);
      const [row] = await db
        .insert(financeEntries)
        .values({ companyId, ...v })
        .returning();
      return row;
    },

    async update(id: string, input: Partial<FinanceEntryInput>) {
      const merged = clean(input as FinanceEntryInput);
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.type !== undefined) set.type = merged.type;
      if (input.category !== undefined) set.category = merged.category;
      if (input.description !== undefined) set.description = merged.description;
      if (input.amountCents !== undefined) set.amountCents = merged.amountCents;
      if (input.currency !== undefined) set.currency = merged.currency;
      if (input.clientId !== undefined) set.clientId = merged.clientId;
      if (input.recurring !== undefined) set.recurring = merged.recurring;
      if (input.recurrence !== undefined) set.recurrence = merged.recurrence;
      if (input.occurredAt !== undefined) set.occurredAt = merged.occurredAt;
      const [row] = await db.update(financeEntries).set(set as never).where(eq(financeEntries.id, id)).returning();
      return row ?? null;
    },

    async remove(id: string) {
      await db.delete(financeEntries).where(eq(financeEntries.id, id));
      return { ok: true };
    },

    /** Totals by type + category, per currency, plus recurring monthly run-rate. */
    async summary(companyId: string, range: { since?: string; until?: string } = {}) {
      const conds = [eq(financeEntries.companyId, companyId)];
      if (range.since) conds.push(gte(financeEntries.occurredAt, new Date(range.since)));
      if (range.until) conds.push(lte(financeEntries.occurredAt, new Date(range.until)));

      const byTypeCur = await db
        .select({
          type: financeEntries.type,
          currency: financeEntries.currency,
          total: sql<number>`sum(${financeEntries.amountCents})::bigint`,
          count: sql<number>`count(*)::int`,
        })
        .from(financeEntries)
        .where(and(...conds))
        .groupBy(financeEntries.type, financeEntries.currency);

      const byCategory = await db
        .select({
          type: financeEntries.type,
          category: financeEntries.category,
          currency: financeEntries.currency,
          total: sql<number>`sum(${financeEntries.amountCents})::bigint`,
        })
        .from(financeEntries)
        .where(and(...conds))
        .groupBy(financeEntries.type, financeEntries.category, financeEntries.currency)
        .orderBy(sql`sum(${financeEntries.amountCents}) desc`);

      // Recurring monthly run-rate (normalize yearly to /12), per type+currency.
      const recurring = await db
        .select({
          type: financeEntries.type,
          currency: financeEntries.currency,
          monthly: sql<number>`sum(case when ${financeEntries.recurrence}='yearly' then ${financeEntries.amountCents}/12 else ${financeEntries.amountCents} end)::bigint`,
        })
        .from(financeEntries)
        .where(and(eq(financeEntries.companyId, companyId), eq(financeEntries.recurring, true)))
        .groupBy(financeEntries.type, financeEntries.currency);

      return {
        byTypeCurrency: byTypeCur.map((r) => ({ ...r, total: Number(r.total ?? 0) })),
        byCategory: byCategory.map((r) => ({ ...r, total: Number(r.total ?? 0) })),
        recurringMonthly: recurring.map((r) => ({ ...r, monthly: Number(r.monthly ?? 0) })),
      };
    },
  };
}
