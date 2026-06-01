// LMTM-OS: LinkedIn Ads provider.
// STUB. To complete:
//
//   1. Set up LinkedIn Marketing API credentials:
//        - LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET (OAuth 2.0 app)
//        - The agency needs "Marketing Developer Platform" access from
//          LinkedIn (separate approval from regular API access). Apply at
//          https://www.linkedin.com/developers/.
//
//   2. OAuth flow (standard OAuth 2.0):
//        - exchangeOAuthCode: POST
//          https://www.linkedin.com/oauth/v2/accessToken
//          grant_type=authorization_code
//        - refreshToken: same endpoint, grant_type=refresh_token
//          (access token expires in 60d; refresh token in 365d)
//
//   3. API calls (all to https://api.linkedin.com/rest/, versioned):
//        - listAdAccounts: GET /rest/adAccounts?q=search
//          (requires r_ads_reporting scope)
//        - syncCampaigns: GET /rest/adCampaignGroups?q=criteria
//        - syncAdSets: GET /rest/adCampaigns?q=criteria
//        - syncAds: GET /rest/creatives?q=criteria
//        - syncInsights: GET /rest/adAnalytics?q=criteria&pivot=creative
//          with timeGranularity=DAILY and date range
//
//   4. LinkedIn has organic Pages (Posts API), but accessing them via
//      the same Marketing API requires additional scopes. The simpler
//      path is to keep organic posts Meta-only for v1 and revisit
//      LinkedIn organic in a later phase.

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
    `LinkedIn Ads provider.${method} not implemented yet. ` +
    `Set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET in Render env and ` +
    `complete the stub. See server/src/services/ads/providers/linkedin.ts for instructions.`,
  );
}

export const linkedinAdsProvider: AdsProvider = {
  platform: "linkedin",

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
    // LinkedIn Pages exist but require the Posts API scopes, not the
    // Marketing API scopes. Leave returning [] until the user adds the
    // Posts API app to the same OAuth flow.
    return [];
  },

  async syncCampaigns(_c: AdsConnection, _m: AdsAccountMapping, _s: Date, _u: Date): Promise<NormalizedCampaign[]> {
    return [];
  },

  async syncAdSets(_c: AdsConnection, _m: AdsAccountMapping, _s: Date, _u: Date): Promise<NormalizedAdSet[]> {
    return [];
  },

  async syncAds(_c: AdsConnection, _m: AdsAccountMapping, _s: Date, _u: Date): Promise<NormalizedAdCreative[]> {
    return [];
  },

  async syncInsights(_c: AdsConnection, _m: AdsAccountMapping, _s: Date, _u: Date): Promise<NormalizedInsight[]> {
    return [];
  },

  async syncOrganicPosts(_c: AdsConnection, _m: AdsAccountMapping, _s: Date, _u: Date): Promise<NormalizedOrganicPost[]> {
    return [];
  },

  async fetchPostMetrics(_c: AdsConnection, _p: NormalizedOrganicPost): Promise<NormalizedPostMetric[]> {
    return [];
  },

  async healthCheck(_c: AdsConnection, _m: AdsAccountMapping): Promise<{ ok: boolean; hint?: string }> {
    return { ok: false, hint: "LinkedIn Ads provider is a stub. Complete server/src/services/ads/providers/linkedin.ts to enable." };
  },
};
