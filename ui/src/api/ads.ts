import { api } from "./client";

export type AdsPlatform = "meta" | "google" | "tiktok" | "linkedin";

export interface AdsConnection {
  id: string;
  companyId: string;
  clientId: string | null;
  platform: AdsPlatform;
  label: string;
  businessId: string | null;
  pageId: string | null;
  adAccountId: string | null;
  managerAccountId: string | null;
  tokenType: string;
  expiresAt: string | null;
  scopes: string[];
  status: "active" | "expired" | "revoked" | "error";
  lastCheckAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdsConnectionsResponse {
  connections: AdsConnection[];
}

export interface AdsAdAccount {
  id: string;            // e.g. "act_1234567890"
  accountId: string;     // numeric
  name: string;
  currency: string;
  timezone: string;
  status: string;        // "active" | "disabled" | etc
  businessId?: string;
  businessName?: string;
}

export interface AdsPage {
  id: string;
  name: string;
  category?: string;
  picture?: { data: { url: string } };
  accessToken?: string;
  tasks?: string[];
}

export interface AdsAdSet {
  id: string;
  name: string;
  status: string;
  campaignId?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface AdsAdAccountsResponse { accounts: AdsAdAccount[]; }
export interface AdsPagesResponse { pages: AdsPage[]; }

export interface AdsPageWithAdSets {
  page: { id: string; name: string };
  adAccounts: AdsAdAccount[];
  adSets: Record<string, AdsAdSet[]>;
  existingMapping: AdsMapping | null;
}
export interface AdsPagesWithAdSetsResponse { pages: AdsPageWithAdSets[]; }

export interface AdsMapping {
  id: string;
  companyId: string;
  connectionId: string;
  clientId: string | null;
  platform: AdsPlatform;
  adAccountId: string;
  pageId: string | null;
  label: string | null;
  includedAdsets?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdsMappingsResponse { mappings: AdsMapping[]; }

export const adsApi = {
  listConnections: (companyId: string, platform?: AdsPlatform) => {
    const qs = new URLSearchParams({ companyId });
    if (platform) qs.set("platform", platform);
    return api.get<AdsConnectionsResponse>(`/ads/connections?${qs.toString()}`);
  },
  getConnection: (id: string) =>
    api.get<AdsConnection>(`/ads/connections/${id}`),
  listAdAccounts: (connectionId: string) =>
    api.get<AdsAdAccountsResponse>(`/ads/connections/${connectionId}/ad-accounts`),
  listPages: (connectionId: string) =>
    api.get<AdsPagesResponse>(`/ads/connections/${connectionId}/pages`),
  // Make.com-style: pages + their linked ad accounts + ad sets.
  listPagesWithAdSets: (connectionId: string) =>
    api.get<AdsPagesWithAdSetsResponse>(`/ads/connections/${connectionId}/pages-with-adsets`),
  // Diagnostics: see per-ad-account adset counts + errors.
  pagesWithAdSetsDiagnostics: (connectionId: string) =>
    api.get<{
      pages: number;
      adAccounts: number;
      adSetsByAdAccount: Record<string, { total: number; active: number; paused: number; other: number; error?: string }>;
      errors: string[];
    }>(`/ads/connections/${connectionId}/pages-with-adsets/diagnostics`),
  listMappings: (params?: { companyId?: string; clientId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.set("companyId", params.companyId);
    if (params?.clientId) sp.set("clientId", params.clientId);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return api.get<AdsMappingsResponse>(`/ads/mappings${qs}`);
  },
  createMapping: (body: {
    companyId: string;
    connectionId: string;
    adAccountId: string;
    clientId?: string;
    pageId?: string;
    platform?: AdsPlatform;
    label?: string;
    includedAdsets?: string[];
  }) => api.post<{ mapping: AdsMapping; skipped: boolean; updated: boolean }>("/ads/mappings", body),
  createBulkMappings: (body: {
    companyId: string;
    connectionId: string;
    mappings: Array<{
      adAccountId: string;
      pageId?: string;
      clientId?: string;
      platform?: AdsPlatform;
      label?: string;
      includedAdsets?: string[];
    }>;
  }) => api.post<{ created: AdsMapping[]; updated: AdsMapping[]; skipped: number }>("/ads/mappings/bulk", body),
  deleteConnection: (id: string) => api.delete<{ ok: true }>(`/ads/connections/${id}`),
  /**
   * Returns the absolute URL the user must visit to start the Meta OAuth flow.
   * The server redirects to facebook.com/v21.0/dialog/oauth and, on success,
   * back to the panel URL with the new connection row in `ads_connections`.
   */
  metaOAuthStartUrl: (companyId: string, label?: string) => {
    const qs = new URLSearchParams({ companyId });
    if (label) qs.set("label", label);
    return `/api/meta/oauth/start?${qs.toString()}`;
  },
};

