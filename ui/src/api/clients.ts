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
  // LMTM-OS: per-client Google Sheets planilla mapping (auto-detected, can be overridden).
  sheetsSpreadsheetId: string | null;
  sheetsDetectedAt: string | null;
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
  // Assign/edit a client's niche (industry). Blank string clears it.
  setNiche: (idOrSlug: string, industry: string) =>
    api.patch<Client>(`/clients/${idOrSlug}`, { industry }),
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
    api.post<SyncAdsResponse>(`/integrations/sync/${job}`, { connectionId, mappingId, since, until }),
  clickupSync: (idOrSlug: string) =>
    api.post<{ folderId: string | null; redes: string | null; video: string | null; enfoqueTecnico: string | null; teamId: string | null; warnings: string[] }>(`/clients/${idOrSlug}/clickup/sync`, null),
  clickupEnfoqueTecnicoRefresh: (idOrSlug: string) =>
    api.post<{ chars: number; pages: number }>(`/clients/${idOrSlug}/clickup/enfoque-tecnico/refresh`, null),
  setNotifyWhatsapp: (idOrSlug: string, whatsapp: string) =>
    api.put<{ ok: boolean; notifyWhatsapp: string | null }>(`/clients/${idOrSlug}/notify`, { whatsapp }),
  runAlerts: (idOrSlug: string) =>
    api.post<{ client: string; alerts: Array<{ severity: string; title: string; description: string; recommendation: string }>; delivered: boolean; teamConfigured: boolean; deliveryError: string | null }>(`/clients/${idOrSlug}/alerts/run`, null),
  runReport: (idOrSlug: string) =>
    api.post<{ client: string; hasData: boolean; created: boolean; url: string | null; error: string | null }>(`/clients/${idOrSlug}/report/run`, null),
  runPortfolioBrief: () =>
    api.post<{ delivered: boolean; error?: string; brief: string }>(`/clients/portfolio/brief`, null),
  // Intelligence layer
  scores: () => api.get<Record<string, { health: number; ops: number }>>(`/clients/scores`),
  intel: (idOrSlug: string) => api.get<ClientIntel>(`/clients/${idOrSlug}/intel`),
  runScore: (idOrSlug: string) => api.post<{ healthScore: number; opsScore: number; components: Record<string, unknown> }>(`/clients/${idOrSlug}/score/run`, null),
  refreshBrain: (idOrSlug: string) => api.post<{ updated: number }>(`/clients/${idOrSlug}/brain/refresh`, null),
  // Banco de información: carga manual de contexto al brain del cliente
  addBrainNote: (idOrSlug: string, body: { content: string; kind?: string; key?: string }) =>
    api.post<{ ok: boolean; kind: string; key: string }>(`/clients/${idOrSlug}/brain/note`, body),
  runOpportunities: (idOrSlug: string) => api.post<{ created: number; materialized: number }>(`/clients/${idOrSlug}/opportunities/run`, null),
  rebuildContent: (idOrSlug: string) => api.post<{ items: number }>(`/clients/${idOrSlug}/content/rebuild`, null),
  // Competitors + content (pauta vs posteo)
  listCompetitors: (idOrSlug: string) => api.get<{ competitors: Competitor[] }>(`/clients/${idOrSlug}/competitors`),
  addCompetitor: (idOrSlug: string, body: Partial<Competitor> & { name: string }) =>
    api.post<Competitor>(`/clients/${idOrSlug}/competitors`, body),
  deleteCompetitor: (idOrSlug: string, cid: string) =>
    api.delete<void>(`/clients/${idOrSlug}/competitors/${cid}`),
  generateContent: (idOrSlug: string) =>
    api.post<{ batchId: string; created: number }>(`/clients/${idOrSlug}/content/generate`, null),
  listContentIdeas: (idOrSlug: string) => api.get<{ ideas: ContentIdea[] }>(`/clients/${idOrSlug}/content-ideas`),
  contentCsvUrl: (idOrSlug: string) => `/api/clients/${idOrSlug}/content-ideas.csv`,
  // Content calendar from the Redes Sociales list (live from ClickUp)
  contentCalendar: (idOrSlug: string, month?: string) =>
    api.get<ContentCalendarResponse>(`/clients/${idOrSlug}/content-calendar${month ? `?month=${month}` : ""}`),
  composePost: (idOrSlug: string, body: { name: string; date: string; platforms: string[]; format?: string; gancho?: string; angulo?: string; copy?: string }) =>
    api.post<{ taskId: string; url: string | null; copy: string; warnings: string[] }>(`/clients/${idOrSlug}/content-calendar/compose`, body),
  // Baúl de Ganchos
  listHooks: (idOrSlug: string) =>
    api.get<{ client: { id: string; slug: string; name: string }; hooks: Hook[] }>(`/clients/${idOrSlug}/hooks`),
  addHook: (idOrSlug: string, body: { text: string; format?: string; sourceKind?: string; sourceRef?: string; views?: number; global?: boolean }) =>
    api.post<Hook>(`/clients/${idOrSlug}/hooks`, body),
  useHook: (hookId: string) => api.post<Hook>(`/hooks/${hookId}/use`, null),
  pinHook: (hookId: string, pinned: boolean) => api.patch<Hook>(`/hooks/${hookId}`, { pinned }),
  deleteHook: (hookId: string) => api.delete<void>(`/hooks/${hookId}`),
  // Tendencias (global, filtered by niche)
  listTrends: (params?: { niche?: string; days?: number }) => {
    const sp = new URLSearchParams();
    if (params?.niche) sp.set("niche", params.niche);
    if (params?.days) sp.set("days", String(params.days));
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<{ since: string; trends: Trend[] }>(`/growth/trends${qs}`);
  },
  setTrendTag: (trendId: string, tag: string) => api.patch<Trend>(`/growth/trends/${trendId}`, { tag }),
  // Per-client tasks panel (issues + scheduled content + posting status + suggestions)
  tasks: (idOrSlug: string) => api.get<ClientTasksResponse>(`/clients/${idOrSlug}/tasks`),
  taskAction: (issueId: string, action: "approve" | "dismiss") =>
    api.post<{ ok: boolean; task: { id: string; identifier: string | null; status: string } }>(`/clients/tasks/${issueId}/${action}`, null),
  suggestionAction: (clientId: string, oppId: string, action: "accept" | "dismiss") =>
    api.post<{ ok: boolean; status?: string; issue?: { id: string; identifier: string | null; title: string; status: string; priority: string } }>(`/clients/${clientId}/suggestions/${oppId}/${action}`, null),
  listOpportunities: (clientId: string) =>
    api.get<{ client: { id: string; slug: string; name: string }; opportunities: Array<{ id: string; kind: string; title: string; rationale: string | null; suggestedAction: string | null; priority: number; status: string; convertedIssueId: string | null; convertedAt: string | null; createdAt: string }> }>(`/clients/${clientId}/opportunities`),
  refreshSheetsMapping: (clientId: string) =>
    api.post<{ ok: boolean; spreadsheetId: string | null; error?: string }>(`/clients/${clientId}/sheets/refresh`, null),
  setSheetsMapping: (clientId: string, spreadsheetId: string) =>
    api.put<{ ok: boolean }>(`/clients/${clientId}/sheets`, { spreadsheetId }),
  removeSheetsMapping: (clientId: string) =>
    api.delete<{ ok: boolean }>(`/clients/${clientId}/sheets`),
};

export interface Hook {
  id: string;
  clientId: string | null; // null = global (niche-level)
  niche: string | null;
  text: string;
  sourceKind: string; // manual | organico | competidor | tendencia
  sourceRef: string | null;
  format: string | null;
  views: number | null;
  timesUsed: number;
  pinned: boolean;
  createdAt: string;
}

export interface Trend {
  id: string;
  day: string; // YYYY-MM-DD
  title: string;
  url: string | null;
  source: string | null;
  tag: string; // potencial-de-gancho | explicativo | ignorar
  niches: string[];
  summary: string | null;
  createdAt: string;
}

export interface CalendarItem {
  id: string;
  name: string;
  status: string;
  published: boolean;
  sentToMake: boolean;
  date: string; // ISO, from ClickUp start_date
  networks: string[]; // from "Plataformas" custom field
  format: string | null;
  url: string | null;
}
export interface ContentCalendarResponse {
  client: { id: string; slug: string; name: string };
  month: string; // YYYY-MM
  hasRedesList: boolean;
  items: CalendarItem[];
}

export interface ClientTask {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  originKind: string;
  createdAt: string;
  needsApproval: boolean;
}
export interface ClientSuggestion {
  id: string;
  kind: string;
  title: string;
  rationale: string | null;
  suggestedAction: string | null;
  priority: number;
  status: string;
  createdAt: string;
}
export interface ClientScheduledItem {
  name: string;
  status: string;
  published: boolean;
  plannedDate: string | null;
  url: string | null;
}
export interface ClientTasksResponse {
  client: { id: string; name: string; slug: string };
  tasks: ClientTask[];
  suggestions: ClientSuggestion[];
  scheduled: ClientScheduledItem[];
  posting: {
    status: "ok" | "warn" | "unverifiable";
    detail: string;
    publishedLast7: number;
    plannedPastDue: number;
    hasNetwork: boolean;
  };
}

export interface Competitor {
  id: string;
  name: string;
  fbPageUrl: string | null;
  igHandle: string | null;
  website: string | null;
  notes: string | null;
  sampleAds: Array<{ text?: string; url?: string }>;
}

export interface ContentIdea {
  id: string;
  kind: "pauta" | "posteo";
  format: string | null;
  title: string;
  copy: string | null;
  rationale: string | null;
  source: string | null;
  createdAt: string;
}

export interface ClientIntel {
  client: { id: string; slug: string; name: string; enfoqueTecnicoUrl: string | null };
  score: { healthScore: number; opsScore: number; components: Record<string, unknown>; date: string } | null;
  brain: Array<{ id: string; kind: string; key: string; content: string; pinned: boolean; updatedAt: string }>;
  opportunities: Array<{ id: string; kind: string; title: string; rationale: string | null; suggestedAction: string | null; priority: number; status: string }>;
  feedback: Array<{ id: string; classification: string | null; sentiment: string | null; rawText: string; status: string; createdAt: string }>;
  topContent: Array<{ id: string; title: string | null; format: string | null; score: string | null; source: string }>;
}

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
  /** Daily snapshot from the balance monitor: explains an empty dashboard
   *  (account halted for debt, out of budget) instead of silent zeros. */
  accountHealth: {
    status: number;
    statusLabel: string;
    remaining: number | null;
    currency: string;
    checkedAt: string;
  } | null;
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
