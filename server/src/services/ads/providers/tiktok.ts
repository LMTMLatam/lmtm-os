// LMTM-OS: TikTok Ads provider.
// Implements the AdsProvider contract for the TikTok Business API
// (open_api v1.3). All endpoints are REST + bearer auth; pagination
// uses page= + page_size= params; the API returns JSON with a
// `code` field that must be 0 for success (non-zero is an error).
//
// Required env vars (Render env):
//   TIKTOK_APP_ID       — TikTok developer app id
//   TIKTOK_APP_SECRET   — TikTok developer app secret
//
// Required connection fields (ads_connections row):
//   accessToken       — user access token (24h); refresh before it expires
//   refreshToken      — long-lived (365d), used to mint a fresh access token
//   adAccountId       — TikTok advertiser id (a numeric string)
//
// Note: TikTok has no equivalent of Meta Pages here. The Display API
// (organic video) is a separate product with separate credentials; we
// do not wire it as part of the Ads sync — return [] from listPages /
// syncOrganicPosts until the user adds a Display API app.

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
} from "../types.js";
import type { AdsConnection, AdsAccountMapping } from "@paperclipai/db";

const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

const SCOPES = [
  "user.info.basic",
  "user.info.email",
  "ads.read",
  "ads.management",
  // Optional, only requested if the user wants reporting; non-essential.
  "ads.report",
];

function num(v: unknown): number | undefined {
  if (typeof v === "string") {
    const f = parseFloat(v);
    return Number.isFinite(f) ? f : undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function intNum(v: unknown): number {
  const n = num(v);
  return n ?? 0;
}

function needEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not configured. Set it in the Render dashboard under Environment.`);
  return v;
}

type TiktokResponse<T> = {
  code: number;
  message: string;
  request_id?: string;
  data: T;
};

async function ttFetch<T = unknown>(
  accessToken: string,
  path: string,
  query?: Record<string, string | number | undefined>,
  init?: { method?: "GET" | "POST"; jsonBody?: Record<string, unknown> },
): Promise<TiktokResponse<T>> {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    "Access-Token": accessToken,
    "Content-Type": "application/json",
  };
  const r = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers,
    body: init?.jsonBody ? JSON.stringify(init.jsonBody) : undefined,
  });
  const text = await r.text();
  let json: TiktokResponse<T>;
  try {
    json = JSON.parse(text) as TiktokResponse<T>;
  } catch {
    throw new Error(`TikTok ${path} returned non-JSON (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok) {
    throw new Error(`TikTok ${path} → ${r.status}: ${text.slice(0, 200)}`);
  }
  if (json.code !== 0) {
    throw new Error(`TikTok ${path} → code ${json.code}: ${json.message}`);
  }
  return json;
}

async function tokenPost(form: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}> {
  const body = new URLSearchParams({ ...form, client_key: needEnv("TIKTOK_APP_ID"), client_secret: needEnv("TIKTOK_APP_SECRET") });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  let json: Awaited<ReturnType<typeof tokenPost>>;
  try {
    json = JSON.parse(text) as Awaited<ReturnType<typeof tokenPost>>;
  } catch {
    throw new Error(`TikTok token endpoint returned non-JSON (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok || json.error) {
    throw new Error(`TikTok token error: ${json.error ?? r.status} — ${json.error_description ?? text.slice(0, 200)}`);
  }
  return json;
}

export const tiktokAdsProvider: AdsProvider = {
  platform: "tiktok",

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const res = await tokenPost({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : undefined,
      scopes: (res.scope ?? "").split(",").filter(Boolean),
    };
  },

  async refreshToken(refreshToken: string): Promise<OAuthTokenSet> {
    const res = await tokenPost({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return {
      accessToken: res.access_token,
      // TikTok rotates refresh tokens on every refresh — use the new one.
      refreshToken: res.refresh_token ?? refreshToken,
      expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : undefined,
      scopes: (res.scope ?? "").split(",").filter(Boolean),
    };
  },

  async listAdAccounts(token: string): Promise<AdAccountSummary[]> {
    // /file/advertiser/info/ lists the advertisers the current user has
    // access to. TikTok also has "business centers" that own multiple
    // advertisers; this endpoint is enough for the agency connect flow.
    const res = await ttFetch<{ list: Array<{
      advertiser_id: string;
      advertiser_name: string;
      currency: string;
      timezone: string;
      status: string;
    }> }>(token, "/file/advertiser/info/", { advertiser_size: 1000 });
    return res.data.list.map((acc) => ({
      id: acc.advertiser_id,
      name: acc.advertiser_name,
      currency: acc.currency || "USD",
      timezone: acc.timezone || "UTC",
      status: acc.status === "STATUS_ENABLE" ? "active" : "disabled",
      raw: acc as unknown as Record<string, unknown>,
    }));
  },

  async listPages(_token: string): Promise<PageSummary[]> {
    return [];
  },

  async syncCampaigns(connection, mapping, _since, _until): Promise<NormalizedCampaign[]> {
    const advertiserId = mapping.adAccountId;
    if (!advertiserId) return [];
    const out: NormalizedCampaign[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = await ttFetch<{ list: Array<{
        campaign_id: string;
        campaign_name: string;
        operation_status: string;
        objective_type: string;
        budget_mode: string;
        budget: number;
        create_time: string;
        modify_time: string;
      }>; page_info: { total_page: number; page: number; page_size: number; total_number: number } }>(
        connection.accessToken,
        "/campaign/get/",
        { advertiser_id: advertiserId, page_size: 100, page: cursor ? undefined : 1, cursor },
      );
      for (const c of res.data.list) {
        out.push({
          id: c.campaign_id,
          name: c.campaign_name,
          status: (c.operation_status ?? "UNKNOWN").toLowerCase(),
          objective: c.objective_type,
          dailyBudget: c.budget_mode === "BUDGET_MODE_DAY" ? c.budget : undefined,
          lifetimeBudget: c.budget_mode === "BUDGET_MODE_TOTAL" ? c.budget : undefined,
          raw: c as unknown as Record<string, unknown>,
        });
      }
      // TikTok's cursor pagination: stop when the page is short.
      if (res.data.list.length < 100) break;
      cursor = String(page + 2);
    }
    return out;
  },

  async syncAdSets(connection, mapping, _since, _until): Promise<NormalizedAdSet[]> {
    // TikTok calls ad sets "ad groups".
    const advertiserId = mapping.adAccountId;
    if (!advertiserId) return [];
    const out: NormalizedAdSet[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = await ttFetch<{ list: Array<{
        adgroup_id: string;
        adgroup_name: string;
        campaign_id: string;
        operation_status: string;
        budget_mode: string;
        budget: number;
      }> }>(
        connection.accessToken,
        "/adgroup/get/",
        { advertiser_id: advertiserId, page_size: 100, cursor },
      );
      for (const a of res.data.list) {
        out.push({
          id: a.adgroup_id,
          campaignId: a.campaign_id,
          name: a.adgroup_name,
          status: (a.operation_status ?? "UNKNOWN").toLowerCase(),
          dailyBudget: a.budget_mode === "BUDGET_MODE_DAY" ? a.budget : undefined,
          lifetimeBudget: a.budget_mode === "BUDGET_MODE_TOTAL" ? a.budget : undefined,
          raw: a as unknown as Record<string, unknown>,
        });
      }
      if (res.data.list.length < 100) break;
      cursor = String(page + 2);
    }
    return out;
  },

  async syncAds(connection, mapping, _since, _until): Promise<NormalizedAdCreative[]> {
    const advertiserId = mapping.adAccountId;
    if (!advertiserId) return [];
    const out: NormalizedAdCreative[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const res = await ttFetch<{ list: Array<{
        ad_id: string;
        ad_name: string;
        adgroup_id: string;
        campaign_id: string;
        operation_status: string;
        ad_text: string;
        ad_title: string;
        call_to_action: string;
        image_ids: string[];
      }> }>(
        connection.accessToken,
        "/ad/get/",
        { advertiser_id: advertiserId, page_size: 100, cursor },
      );
      for (const ad of res.data.list) {
        out.push({
          id: ad.ad_id,
          name: ad.ad_name,
          status: (ad.operation_status ?? "UNKNOWN").toLowerCase(),
          adsetId: ad.adgroup_id,
          campaignId: ad.campaign_id,
          title: ad.ad_title || undefined,
          body: ad.ad_text || undefined,
          callToAction: ad.call_to_action || undefined,
          // Image URL is a separate lookup; we leave imageUrl undefined
          // and let the dashboard fetch it on demand.
          raw: ad as unknown as Record<string, unknown>,
        });
      }
      if (res.data.list.length < 100) break;
      cursor = String(page + 2);
    }
    return out;
  },

  async syncInsights(connection, mapping, since, until): Promise<NormalizedInsight[]> {
    const advertiserId = mapping.adAccountId;
    if (!advertiserId) return [];
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);
    // TikTok's report API: dimensions per day per entity, metrics as a
    // comma-separated list. Page size 200 is the practical max.
    const res = await ttFetch<{ list: Array<{
      dimensions: { stat_time_day: string; campaign_id: string; adgroup_id: string; ad_id: string };
      metrics: {
        impressions: string;
        clicks: string;
        spend: string;
        ctr: string;
        cpc: string;
        cpm: string;
        conversions: string;
        conversion_value: string;
        video_views: string;
      };
    }> }>(
      connection.accessToken,
      "/report/integrated/get/",
      undefined,
      {
        method: "POST",
        jsonBody: {
          advertiser_id: advertiserId,
          report_type: "BASIC",
          dimensions: JSON.stringify(["stat_time_day", "campaign_id", "adgroup_id", "ad_id"]),
          metrics: JSON.stringify([
            "impressions", "clicks", "spend", "ctr", "cpc", "cpm",
            "conversions", "conversion_value", "video_views",
          ]),
          data_level: "AUCTION_AD",
          start_date: sinceStr,
          end_date: untilStr,
          page_size: 200,
        },
      },
    );
    return res.data.list.map((row) => {
      const m = row.metrics;
      return {
        date: new Date(`${row.dimensions.stat_time_day}T00:00:00Z`),
        campaignId: row.dimensions.campaign_id || undefined,
        adsetId: row.dimensions.adgroup_id || undefined,
        adId: row.dimensions.ad_id || undefined,
        impressions: intNum(m.impressions),
        clicks: intNum(m.clicks),
        spend: num(m.spend) ?? 0,
        ctr: num(m.ctr),
        cpc: num(m.cpc),
        cpm: num(m.cpm),
        conversions: intNum(m.conversions),
        conversionValue: num(m.conversion_value),
        videoViews: intNum(m.video_views),
        raw: row as unknown as Record<string, unknown>,
      } as NormalizedInsight;
    });
  },

  async syncOrganicPosts(_connection, _mapping, _since, _until): Promise<NormalizedOrganicPost[]> {
    return [];
  },

  async healthCheck(connection, mapping): Promise<{ ok: boolean; hint?: string }> {
    if (!mapping.adAccountId) {
      return {
        ok: false,
        hint: "No ad account mapped. Add a mapping in /c/<slug>/ads/connections.",
      };
    }
    try {
      // Cheap probe: just read the advertiser info for the mapped id.
      await ttFetch(
        connection.accessToken,
        "/file/advertiser/info/",
        { advertiser_ids: JSON.stringify([mapping.adAccountId]) },
      );
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("INVALID_TOKEN")) {
        return {
          ok: false,
          hint: "Access token expired or revoked. Refresh via OAuth.",
        };
      }
      if (msg.includes("40002") || msg.includes("scope")) {
        return {
          ok: false,
          hint: "Missing scope. Re-authorize with ads.read and ads.report.",
        };
      }
      return { ok: false, hint: msg.slice(0, 240) };
    }
  },
};

export const tiktokAdsProviderScopes = SCOPES;
