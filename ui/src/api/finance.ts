import { api } from "./client";

export type FinanceType = "income" | "expense";
export type Recurrence = "one_time" | "monthly" | "yearly";

export interface FinanceEntry {
  id: string;
  type: FinanceType;
  category: string;
  description: string | null;
  amountCents: number;
  currency: string;
  clientId: string | null;
  clientName: string | null;
  recurring: boolean;
  recurrence: Recurrence;
  occurredAt: string;
}

export interface FinanceEntryInput {
  type: FinanceType;
  category?: string;
  description?: string | null;
  amountCents: number;
  currency?: string;
  clientId?: string | null;
  recurring?: boolean;
  recurrence?: Recurrence;
  occurredAt?: string;
}

export interface FinanceSummary {
  byTypeCurrency: Array<{ type: FinanceType; currency: string; total: number; count: number }>;
  byCategory: Array<{ type: FinanceType; category: string; currency: string; total: number }>;
  recurringMonthly: Array<{ type: FinanceType; currency: string; monthly: number }>;
}

export const financeApi = {
  list: (companyId: string, params: { type?: FinanceType; category?: string; clientId?: string; since?: string; until?: string } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const qs = q.toString();
    return api.get<{ entries: FinanceEntry[] }>(`/companies/${companyId}/finance/entries${qs ? `?${qs}` : ""}`);
  },
  summary: (companyId: string, params: { since?: string; until?: string } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const qs = q.toString();
    return api.get<FinanceSummary>(`/companies/${companyId}/finance/summary${qs ? `?${qs}` : ""}`);
  },
  create: (companyId: string, body: FinanceEntryInput) =>
    api.post<FinanceEntry>(`/companies/${companyId}/finance/entries`, body),
  update: (companyId: string, id: string, body: Partial<FinanceEntryInput>) =>
    api.put<FinanceEntry>(`/companies/${companyId}/finance/entries/${id}`, body),
  remove: (companyId: string, id: string) =>
    api.delete<{ ok: boolean }>(`/companies/${companyId}/finance/entries/${id}`),
};
