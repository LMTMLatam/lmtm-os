import { api } from "./client";

export type ClientStatus = "active" | "paused" | "offboarded" | "churned";
export type ClientTier = "starter" | "standard" | "growth" | "enterprise";

export interface Client {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  status: ClientStatus;
  tier: ClientTier;
  ownerAgentId: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  websiteUrl: string | null;
  industry: string | null;
  monthlyRetainerCents: number;
  currency: string;
  crmExternalId: string | null;
  planillaSource: string | null;
  planillaExternalId: string | null;
  planillaSyncedAt: string | null;
  onboardedAt: string | null;
  offboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsListResponse {
  clients: Client[];
}

export const clientsApi = {
  list: (status?: ClientStatus) => {
    const qs = status ? `?status=${status}` : "";
    return api.get<ClientsListResponse>(`/clients${qs}`);
  },
  get: (idOrSlug: string) => api.get<Client>(`/clients/${idOrSlug}`),
  create: (body: Partial<Client> & { name: string; slug: string }) =>
    api.post<Client>("/clients", body),
  adsSummary: (idOrSlug: string) =>
    api.get<ClientAdsSummary>(`/clients/${idOrSlug}/ads-summary`),
  campaigns: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<ClientCampaignsResponse>(`/clients/${idOrSlug}/campaigns${qs}`);
  },
  campaignsCsvUrl: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return `/api/clients/${idOrSlug}/campaigns.csv${qs}`;
  },
  syncAds: (connectionId: string, mappingId: string, job: "campaigns" | "insights" | "all" = "all", since?: string, until?: string) =>
    api.post<SyncAdsResponse>(`/ads/sync/${job}`, { connectionId, mappingId, since, until }),
};

export interface ClientCampaign {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  platform: string;
  adAccountId: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}

export interface ClientCampaignsResponse {
  client: { id: string; slug: string; name: string; currency: string };
  since: string;
  until: string;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
  campaigns: ClientCampaign[];
}

export interface SyncAdsResponse {
  ok: boolean;
  job: string;
  connectionId: string;
  mappingId: string;
  since: string;
  until: string;
  totalRecords: number;
  results: Array<{
    job: string;
    status: "completed" | "failed" | "partial";
    recordsSynced: number;
    error?: string;
  }>;
}

export interface ClientAdsAccount {
  mappingId: string;
  connectionId: string;
  platform: string;
  adAccountId: string;
  mappingLabel: string | null;
  pageId: string | null;
  connectionLabel: string | null;
  connectionStatus: string;
  businessId: string | null;
}

export interface ClientAdsSummary {
  client: { id: string; slug: string; name: string };
  accounts: ClientAdsAccount[];
  campaigns: {
    total: number;
    byStatus: Record<string, number>;
    byPlatform: Record<string, number>;
  };
  insights: {
    since: string;
    byPlatform: Record<string, {
      platform: string;
      impressions: number;
      clicks: number;
      spend: number;
      leads: number;
      days: number;
      ctr: number;
      cpc: number;
    }>;
    totals: {
      impressions: number;
      clicks: number;
      spend: number;
      leads: number;
      days: number;
      ctr: number;
      cpc: number;
    };
  };
  oauthReady: { meta: boolean };
  oauthStartUrl: string | null;
}
