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
  clickupFolderId: string | null;
  clickupListRedesId: string | null;
  clickupListVideoId: string | null;
  /** Repurposed: holds the Enfoque Técnico DOC id (not a list). */
  clickupListEnfoqueTecnicoId: string | null;
  clickupListsSyncedAt: string | null;
  onboardedAt: string | null;
  offboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: { clickupTeamId?: string; clickupSpaceId?: string; notifyWhatsapp?: string } & Record<string, unknown>;
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
  timeseries: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<TimeseriesResponse>(`/clients/${idOrSlug}/timeseries${qs}`);
  },
  adsets: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<ClientAdsetsResponse>(`/clients/${idOrSlug}/adsets${qs}`);
  },
  creatives: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<ClientCreativesResponse>(`/clients/${idOrSlug}/creatives${qs}`);
  },
  organic: (idOrSlug: string) =>
    api.get<ClientOrganicResponse>(`/clients/${idOrSlug}/organic`),
  alerts: (idOrSlug: string) =>
    api.get<ClientAlertsResponse>(`/clients/${idOrSlug}/alerts`),
  audience: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<ClientAudienceResponse>(`/clients/${idOrSlug}/audience${qs}`);
  },
  funnel: (idOrSlug: string, params?: { since?: string; until?: string }) => {
    const sp = new URLSearchParams();
    if (params?.since) sp.set("since", params.since);
    if (params?.until) sp.set("until", params.until);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<ClientFunnelResponse>(`/clients/${idOrSlug}/funnel${qs}`);
  },
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
  clickupSync: (idOrSlug: string) =>
    api.post<{ folderId: string | null; redes: string | null; video: string | null; enfoqueTecnico: string | null; teamId: string | null; warnings: string[] }>(`/clients/${idOrSlug}/clickup/sync`, null),
  clickupEnfoqueTecnicoRefresh: (idOrSlug: string) =>
    api.post<{ chars: number; pages: number }>(`/clients/${idOrSlug}/clickup/enfoque-tecnico/refresh`, null),
  setNotifyWhatsapp: (idOrSlug: string, whatsapp: string) =>
    api.put<{ ok: boolean; notifyWhatsapp: string | null }>(`/clients/${idOrSlug}/notify`, { whatsapp }),
  runAlerts: (idOrSlug: string) =>
    api.post<{ client: string; alerts: Array<{ severity: string; title: string; description: string; recommendation: string }>; delivered: boolean; deliveryError: string | null }>(`/clients/${idOrSlug}/alerts/run`, null),
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

// ============================================================
//   EXTENDED DASHBOARD TYPES — for the 13-section dashboard
// ============================================================

export interface TimeseriesPoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  reach: number;
  videoViews: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
export interface TimeseriesResponse {
  client: { id: string; slug: string; name: string; currency: string };
  since: string;
  until: string;
  series: TimeseriesPoint[];
}

export interface ClientAdset {
  id: string;
  name: string;
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  adAccountId: string;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
export interface ClientAdsetsResponse {
  client: { id: string; slug: string; name: string; currency: string };
  since: string;
  until: string;
  adsets: ClientAdset[];
}

export interface ClientCreative {
  id: string;
  name: string;
  status: string;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adAccountId: string;
  imageUrl: string | null;
  videoId: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversions: number;
  reach: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
}
export interface ClientCreativesResponse {
  client: { id: string; slug: string; name: string; currency: string };
  since: string;
  until: string;
  creatives: ClientCreative[];
}

export interface ClientOrganicPost {
  id: string;
  pageId: string;
  message: string;
  postType: string;
  createdTime: string | null;
  permalinkUrl: string | null;
  fullPicture: string | null;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
  impressions: number;
  engaged: number;
  engagementRate: number;
  score: number;
  metadata: Record<string, unknown>;
}
export interface ClientOrganicResponse {
  client: { id: string; slug: string; name: string; currency: string };
  posts: ClientOrganicPost[];
}

export interface ClientAlert {
  id: string;
  severity: "info" | "warn" | "critical" | string;
  title: string;
  description: string | null;
  metric: string | null;
  currentValue: number | null;
  thresholdValue: number | null;
  recommendation: string | null;
  entityType: string | null;
  entityId: string | null;
  status: string;
  createdAt: string;
}
export interface ClientAlertsResponse {
  client: { id: string; slug: string; name: string; currency: string };
  alerts: ClientAlert[];
}

export interface AudienceBucket {
  key: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpl: number;
}
export interface ClientAudienceResponse {
  client: { id: string; slug: string; name: string; currency: string };
  since: string;
  until: string;
  age: AudienceBucket[];
  gender: AudienceBucket[];
  platform: AudienceBucket[];
  device: AudienceBucket[];
}

export interface ClientFunnelData {
  impressions: number;
  clicks: number;
  landingVisits: number;
  leads: number;
  conversions: number;
  spend: number;
  revenue: number;
  reach: number;
  rates: {
    ctr: number;
    clickToLanding: number;
    landingToLead: number;
    clickToLead: number;
    leadToSale: number;
    clickToSale: number;
  };
  cpls: {
    cpc: number;
    cpl: number;
    cpa: number;
    roas: number;
  };
}
export interface ClientFunnelResponse {
  client: { id: string; slug: string; name: string; currency: string };
  since: string;
  until: string;
  funnel: ClientFunnelData;
}
