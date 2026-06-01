// LMTM-OS: Google Ads provider.
// STUB. The interface and dispatcher are wired up; the implementations
// return [] for now. To complete this provider:
//
//   1. Set up Google Ads API credentials:
//        - GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET (OAuth 2.0)
//        - GOOGLE_ADS_DEVELOPER_TOKEN (MCC-level token, applies to all
//          child accounts in the manager hierarchy)
//        - GOOGLE_ADS_LOGIN_CUSTOMER_ID (the MCC acting on behalf of
//          child accounts; this is how an agency manages client accounts)
//
//   2. Implement OAuth flow:
//        - exchangeOAuthCode: POST https://oauth2.googleapis.com/token
//          grant_type=authorization_code
//        - refreshToken: POST same endpoint, grant_type=refresh_token
//          (access token expires in 1h; refresh is critical here, unlike
//          Meta where the long-lived token is 60d)
//
//   3. Implement API calls using google-ads-api Node client (or raw
//      GAQL via gRPC — the Node client is simpler):
//        - listAdAccounts: customer_client resource under the manager
//          account (paginated, filter to MANAGER and CLIENT customers)
//        - syncCampaigns: GAQL `SELECT campaign.id, campaign.name,
//          campaign.status, campaign.start_date, campaign.end_date,
//          campaign.advertising_channel_type FROM campaign`
//        - syncInsights: GAQL `SELECT ... FROM campaign WHERE
//          segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'`
//        - Google Ads has no organic posts (no Pages API for ads manager)
//
//   4. Token shape:
//        accessToken, refreshToken, expiresAt. Make sure to refresh
//        before every sync if expiresAt < now + 5min.

import type {
  AdsProvider,
  OAuthTokenSet,
  AdAccountSummary,
  PageSummary,
  NormalizedCampaign,
  NormalizedAdSet,
  NormalizedAdCreative,
  NormalizedInsight,
  NormalizedOrganicPost,
  NormalizedPostMetric,
} from "../types.js";
import type { AdsConnection, AdsAccountMapping } from "@paperclipai/db";

function notImplemented(method: string): never {
  throw new Error(
    `Google Ads provider.${method} not implemented yet. ` +
    `Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN ` +
    `in Render env and complete the stub. See server/src/services/ads/providers/google.ts for instructions.`,
  );
}

export const googleAdsProvider: AdsProvider = {
  platform: "google",

  async exchangeOAuthCode(_code: string, _redirectUri: string): Promise<OAuthTokenSet> {
    notImplemented("exchangeOAuthCode");
  },

  async refreshToken(_refreshToken: string): Promise<OAuthTokenSet> {
    notImplemented("refreshToken");
  },

  async listAdAccounts(_token: string): Promise<AdAccountSummary[]> {
    notImplemented("listAdAccounts");
  },

  async listPages(_token: string): Promise<PageSummary[]> {
    // Google Ads has no equivalent of Meta Pages — organic reach is
    // not part of Google Ads. Always return [].
    return [];
  },

  async syncCampaigns(_connection: AdsConnection, _mapping: AdsAccountMapping, _since: Date, _until: Date): Promise<NormalizedCampaign[]> {
    return [];
  },

  async syncAdSets(_connection: AdsConnection, _mapping: AdsAccountMapping, _since: Date, _until: Date): Promise<NormalizedAdSet[]> {
    return [];
  },

  async syncAds(_connection: AdsConnection, _mapping: AdsAccountMapping, _since: Date, _until: Date): Promise<NormalizedAdCreative[]> {
    return [];
  },

  async syncInsights(_connection: AdsConnection, _mapping: AdsAccountMapping, _since: Date, _until: Date): Promise<NormalizedInsight[]> {
    return [];
  },

  async syncOrganicPosts(_connection: AdsConnection, _mapping: AdsAccountMapping, _since: Date, _until: Date): Promise<NormalizedOrganicPost[]> {
    return [];
  },

  async fetchPostMetrics(_connection: AdsConnection, _post: NormalizedOrganicPost): Promise<NormalizedPostMetric[]> {
    return [];
  },

  async healthCheck(_connection: AdsConnection, _mapping: AdsAccountMapping): Promise<{ ok: boolean; hint?: string }> {
    return { ok: false, hint: "Google Ads provider is a stub. Complete server/src/services/ads/providers/google.ts to enable." };
  },
};
