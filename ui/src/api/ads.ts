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

export const adsApi = {
  listConnections: (companyId: string, platform?: AdsPlatform) => {
    const qs = new URLSearchParams({ companyId });
    if (platform) qs.set("platform", platform);
    return api.get<AdsConnectionsResponse>(`/ads/connections?${qs.toString()}`);
  },
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
