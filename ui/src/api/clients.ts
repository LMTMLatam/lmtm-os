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
};

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
      conversions: number;
      days: number;
      ctr: number;
      cpc: number;
    }>;
    totals: {
      impressions: number;
      clicks: number;
      spend: number;
      leads: number;
      conversions: number;
      days: number;
      ctr: number;
      cpc: number;
    };
  };
  oauthReady: { meta: boolean };
  oauthStartUrl: string | null;
}
