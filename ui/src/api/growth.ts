import { api } from "./client";

export interface GrowthSpendPoint {
  date: string;
  spend: number;
  leads: number;
}

export interface GrowthThroughputPoint {
  week: string;
  created: number;
  done: number;
}

export interface GrowthProposal {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  createdAt: string;
}

export interface GrowthRoundtable {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  createdAt: string;
  category: string;
  proposals: GrowthProposal[];
}

export interface GrowthOverview {
  kpis: {
    activeClients: number;
    spend30d: number;
    leads30d: number;
    spendCurrency: string | null;
    issuesDoneThisWeek: number;
  };
  spendTrend: GrowthSpendPoint[];
  issuesThroughput: GrowthThroughputPoint[];
  roundtables: GrowthRoundtable[];
}

export interface AgentEfficiency {
  days: number;
  totals: { total: number; realRuns: number; maintenanceRuns: number; failedRuns: number; maintenancePct: number; failedPct: number };
  byAgent: Array<{ agent: string; real: number; maintenance: number; failed: number }>;
}

export const growthApi = {
  overview: () => api.get<GrowthOverview>("/growth/overview"),
  agentEfficiency: () => api.get<AgentEfficiency>("/growth/agent-efficiency"),
};
