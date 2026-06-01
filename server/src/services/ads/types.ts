// LMTM-OS: AdsProvider interface
// Every ad platform (Meta, Google Ads, TikTok Ads, LinkedIn Ads) implements
// this contract. The generic sync/aggregation layer in this folder only
// talks to the interface — it has no knowledge of platform-specific shapes.
//
// The contract is intentionally narrow: list accounts, fetch creatives, fetch
// insights, refresh tokens. Anything more exotic (reporting, attribution,
// audiences) is a higher-level service that composes these primitives.

import type { AdsConnection, AdsAccountMapping, Client } from "@paperclipai/db";

export type AdsPlatform = "meta" | "google" | "tiktok" | "linkedin";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface NormalizedCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startTime?: Date;
  stopTime?: Date;
  raw: Record<string, unknown>;
}

export interface NormalizedAdSet {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  raw: Record<string, unknown>;
}

export interface NormalizedAdCreative {
  id: string;
  adsetId?: string;
  campaignId?: string;
  name: string;
  status: string;
  creativeId?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  body?: string;
  title?: string;
  callToAction?: string;
  raw: Record<string, unknown>;
}

export interface NormalizedInsight {
  date: Date;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adId?: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  leads?: number;
  conversions?: number;
  conversionValue?: number;
  videoViews?: number;
  raw: Record<string, unknown>;
}

export interface NormalizedOrganicPost {
  id: string;
  pageId: string;
  message?: string;
  story?: string;
  fullPicture?: string;
  permalinkUrl?: string;
  createdTime?: Date;
  postType?: string;
  raw: Record<string, unknown>;
}

export interface NormalizedPostMetric {
  metric: string;
  value: number;
}

export interface AdAccountSummary {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  raw: Record<string, unknown>;
}

export interface PageSummary {
  id: string;
  name: string;
  raw: Record<string, unknown>;
}

export interface AdsProvider {
  readonly platform: AdsPlatform;

  /**
   * Exchange an OAuth authorization code for a token set. Used right after
   * the user grants the agency access to their platform account.
   */
  exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet>;

  /**
   * Refresh an expired access token. Returns the new token set; throws if
   * the refresh token is invalid (caller should mark connection as revoked).
   */
  refreshToken(refreshToken: string): Promise<OAuthTokenSet>;

  /**
   * Probe: list the ad accounts the current token can see. Used both at
   * connection time (so the user picks the right account) and at
   * dashboard-time (to detect "lost access" before the next sync).
   */
  listAdAccounts(token: string): Promise<AdAccountSummary[]>;

  /**
   * Probe (Meta + LinkedIn only): list the pages the current user token
   * can act on. Google Ads and TikTok return [].
   */
  listPages(token: string): Promise<PageSummary[]>;

  /**
   * Core: fetch all campaigns in an ad account. Caller persists the result
   * to the adsCampaigns table.
   */
  syncCampaigns(connection: AdsConnection, mapping: AdsAccountMapping, since: Date, until: Date): Promise<NormalizedCampaign[]>;

  /**
   * Core: fetch all ad sets under an ad account.
   */
  syncAdSets(connection: AdsConnection, mapping: AdsAccountMapping, since: Date, until: Date): Promise<NormalizedAdSet[]>;

  /**
   * Core: fetch all ad creatives under an ad account.
   */
  syncAds(connection: AdsConnection, mapping: AdsAccountMapping, since: Date, until: Date): Promise<NormalizedAdCreative[]>;

  /**
   * Core: fetch the daily insights for an ad account. The "money" call.
   */
  syncInsights(connection: AdsConnection, mapping: AdsAccountMapping, since: Date, until: Date): Promise<NormalizedInsight[]>;

  /**
   * Organic (Meta + LinkedIn). Returns [] for Google / TikTok.
   */
  syncOrganicPosts(connection: AdsConnection, mapping: AdsAccountMapping, since: Date, until: Date): Promise<NormalizedOrganicPost[]>;

  /**
   * Per-post metrics (impressions, reach, reactions, etc.). Called per
   * post id after syncOrganicPosts.
   */
  fetchPostMetrics(connection: AdsConnection, post: NormalizedOrganicPost): Promise<NormalizedPostMetric[]>;

  /**
   * Light health check. Returns false (and a hint) if the token is
   * expired, the connection is revoked, or the account is in an
   * unrecoverable state. Called before every sync job so we don't waste
   * time on doomed requests.
   */
  healthCheck(connection: AdsConnection, mapping: AdsAccountMapping): Promise<{ ok: boolean; hint?: string }>;
}
