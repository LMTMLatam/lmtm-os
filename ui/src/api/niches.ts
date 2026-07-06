import { api } from "./client";

export interface NicheIntel {
  niche: string;
  clients: Array<{ id: string; slug: string; name: string }>;
  ads30d: { spend: number; leads: number; ctr: number; cpl: number | null };
  benchmark: { pattern: string; evidence: Record<string, unknown> | null } | null;
  winningFormat: { pattern: string; evidence: Record<string, unknown> | null } | null;
  winningFormatAds: { pattern: string; evidence: Record<string, unknown> | null } | null;
  experiment: { pattern: string; evidence: Record<string, unknown> | null } | null;
  topContent: Array<{ title: string | null; format: string | null; score: number; clientName: string }>;
  competitors: Array<{ name: string; clientName: string }>;
}

export interface SalesKit {
  niche: string;
  clientCount: number;
  winningFormat: string | null;
  onePager: string;
}

export const nichesApi = {
  list: () => api.get<{ niches: NicheIntel[] }>("/growth/niches"),
  salesKit: (niche: string) => api.get<SalesKit>(`/growth/niches/${encodeURIComponent(niche)}/sales-kit`),
  // Rename a niche across all its clients (blank `to` clears it).
  rename: (from: string, to: string) =>
    api.post<{ renamed: number; from: string; to: string | null }>("/growth/niches/rename", { from, to }),
};
