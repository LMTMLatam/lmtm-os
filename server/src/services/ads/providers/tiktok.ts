// LMTM-OS: TikTok Ads provider.
// STUB. To complete:
//
//   1. Set up TikTok Marketing API credentials:
//        - TIKTOK_APP_ID, TIKTOK_APP_SECRET (App-level)
//        - TIKTOK_ACCESS_TOKEN, TIKTOK_REFRESH_TOKEN (per user; access
//          expires in 24h, refresh in 365d)
//
//   2. OAuth flow (TikTok uses standard OAuth 2.0 with PKCE):
//        - exchangeOAuthCode: POST
//          https://open.tiktokapis.com/v2/oauth/token/
//          with grant_type=authorization_code
//        - refreshToken: same endpoint, grant_type=refresh_token
//
//   3. API calls (all to https://business-api.tiktok.com/open_api/v1.3/):
//        - listAdAccounts: GET /file/advertiser/info/ with the user's
//          advertiser accounts. TikTok also has a "business center" (BC)
//          that owns multiple advertiser accounts, similar to Meta BM.
//        - syncCampaigns: GET /campaign/get/ with advertiser_id
//        - syncAdSets: GET /adgroup/get/ (TikTok calls ad sets "ad groups")
//        - syncAds: GET /ad/get/
//        - syncInsights: GET /report/integrated/get/ with
//          metrics=impressions,clicks,spend,ctr,cpc,cpm,conversion,etc.
//          and dimensions=ad_id,stat_time_day
//
//   4. TikTok does have an organic video API (via Display API) but it's
//      separate from the Ads API and uses a different app credential.
//      Leave syncOrganicPosts returning [] unless the user also wants
//      organic TikTok tracking.

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
    `TikTok Ads provider.${method} not implemented yet. ` +
    `Set TIKTOK_APP_ID, TIKTOK_APP_SECRET in Render env and complete ` +
    `the stub. See server/src/services/ads/providers/tiktok.ts for instructions.`,
  );
}

export const tiktokAdsProvider: AdsProvider = {
  platform: "tiktok",

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
    return { ok: false, hint: "TikTok Ads provider is a stub. Complete server/src/services/ads/providers/tiktok.ts to enable." };
  },
};
