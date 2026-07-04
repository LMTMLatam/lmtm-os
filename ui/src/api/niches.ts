import { api } from "./client";

export interface NicheIntel {
  niche: string;
  clients: Array<{ id: string; slug: string; name: string }>;
  ads30d: { spend: number; leads: number; ctr: number; cpl: number | null };
  benchmark: { pattern: string; evidence: Record<string, unknown> | null } | null;
  winningFormat: { pattern: string; evidence: Record<string, unknown> | null } | null;
  experiment: { pattern: string; evidence: Record<string, unknown> | null } | null;
  topContent: Array<{ title: string | null; format: string | null; score: number; clientName: string }>;
  competitors: Array<{ name: string; clientName: string }>;
}

export const nichesApi = {
  list: () => api.get<{ niches: NicheIntel[] }>("/growth/niches"),
};
