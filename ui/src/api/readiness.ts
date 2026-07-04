import { api } from "./client";

export interface ReadinessClient {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  checks: {
    metaAdAccount: boolean;
    metaPage: boolean;
    rubro: boolean;
    location: boolean;
    sheetRedes: boolean;
    scriptRedes: boolean;
    sheetProduccion: boolean;
    brain: boolean;
  };
  missing: string[];
  dark: boolean;
  readyPct: number;
}

export interface ReadinessResponse {
  totals: Record<string, number>;
  clients: ReadinessClient[];
}

export const readinessApi = {
  get: () => api.get<ReadinessResponse>("/growth/readiness"),
};
