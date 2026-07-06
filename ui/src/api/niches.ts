import { api } from "./client";

export interface ClientAds30d {
  spend: number;
  leads: number;
  ctr: number;
  cpl: number | null;
  impressions: number;
}

/** Structured numbers mined into learnings.evidence (niche_benchmark). */
export interface BenchmarkEvidence {
  avgCtr?: number;
  idealCtr?: number;
  avgCpl?: number;
  idealCpl?: number;
  clients?: number;
  windowDays?: number;
}

export interface NicheIntel {
  niche: string;
  clients: Array<{ id: string; slug: string; name: string; ads30d: ClientAds30d | null }>;
  ads30d: { spend: number; leads: number; ctr: number; cpl: number | null };
  benchmark: { pattern: string; evidence: BenchmarkEvidence | null } | null;
  winningFormat: { pattern: string; evidence: { topFormat?: string; topAvg?: number; samples?: number } | null } | null;
  winningFormatAds: { pattern: string; evidence: { ranked?: Array<{ format: string; ctr: number; n: number }> } | null } | null;
  experiment: { pattern: string; evidence: Record<string, unknown> | null } | null;
  /** Plan de acción minado a diario: qué hacer con cada cliente del nicho + ideas de IA. */
  actions: Array<{ priority: 1 | 2 | 3; action: string; clientSlug?: string | null; kind: "accion" | "idea" }>;
  topCampaigns: Array<{ name: string; clientName: string; spend: number; leads: number; ctr: number; cpl: number | null }>;
  hooks: Array<{ text: string; format: string | null; timesUsed: number }>;
  trends: Array<{ title: string; tag: string; url: string | null }>;
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
