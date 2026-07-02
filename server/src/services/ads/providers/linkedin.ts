// LMTM-OS: LinkedIn Ads provider.
// Implements the AdsProvider contract for the LinkedIn Marketing API
// (REST, versioned via the `LinkedIn-Version` header). Endpoints all
// live under https://api.linkedin.com/rest/. The API uses cursor-based
// pagination via the `start` and `count` query params; the response
// includes a `paging` object with `next.start` for the next page.
//
// Required env vars (Render env):
//   LINKEDIN_CLIENT_ID       — OAuth 2.0 client id (from developer.linkedin.com)
//   LINKEDIN_CLIENT_SECRET   — OAuth 2.0 client secret
//   LINKEDIN_API_VERSION     — e.g. "202406" (defaults to "202406")
//
// Required connection fields (ads_connections row):
//   accessToken       — user access token (60d); refresh before it expires
//   refreshToken      — long-lived (365d)
//   adAccountId       — numeric LinkedIn ad account id
//
// Note: LinkedIn Pages exist (organic posts) but live behind the Posts
// API with different scopes (w_member_social, r_organization_social).
// Marketing API access tokens don't carry those scopes, so listPages
// returns []. Wire the Posts API as a separate flow when the user
// wants organic LinkedIn.

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

const API_BASE = "https://api.linkedin.com/rest";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const DEFAULT_API_VERSION = "202406";

const SCOPES = [
  "r_ads",
  "r_ads_reporting",
  // rw_ads is needed for write-side operations; we don't use it here.
  // Add to the auth URL only if the user wants to manage campaigns.
  // "rw_ads",
  "openid",
  "profile",
  "email",
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

function apiVersion(): string {
  return process.env.LINKEDIN_API_VERSION ?? DEFAULT_API_VERSION;
}

async function tokenPost(form: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}> {
  const body = new URLSearchParams({
    ...form,
    client_id: needEnv("LINKEDIN_CLIENT_ID"),
    client_secret: needEnv("LINKEDIN_CLIENT_SECRET"),
  });
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
    throw new Error(`LinkedIn token endpoint returned non-JSON (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok || json.error) {
    throw new Error(`LinkedIn token error: ${json.error ?? r.status} — ${json.error_description ?? text.slice(0, 200)}`);
  }
  return json;
}

async function liFetch<T = unknown>(
  accessToken: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const r = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": apiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const text = await r.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    throw new Error(`LinkedIn ${path} returned non-JSON (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok) {
    // LinkedIn returns errors as { status, code, message } in the body.
    const body = json as unknown as { message?: string; code?: string };
    throw new Error(
      `LinkedIn ${path} → ${r.status}: ${body.message ?? text.slice(0, 200)} (code ${body.code ?? "n/a"})`,
    );
  }
  return json;
}

// LinkedIn's pagination: response.paging = { start, count, links: [], total }
// When more results are available, links[] contains an entry with `rel: "next"`
// and `href` like "/rest/adAccounts?start=50&count=50". Some endpoints also
// return `next.start` directly.
async function liPaginate<T>(
  accessToken: string,
  path: string,
  baseQuery: Record<string, string | number | undefined>,
  extract: (response: T) => { items: unknown[]; nextStart?: number | null },
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let start: number | undefined;
  for (let i = 0; i < 50; i++) {
    const query = { ...baseQuery, count: 100, start: start ?? 0 };
    const res = await liFetch<T>(accessToken, path, query);
    const { items, nextStart } = extract(res);
    for (const item of items) out.push(item as Record<string, unknown>);
    if (nextStart == null) break;
    start = nextStart;
  }
  return out;
}

export const linkedinAdsProvider: AdsProvider = {
  platform: "linkedin",

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
      scopes: (res.scope ?? "").split(" ").filter(Boolean),
    };
  },

  async refreshToken(refreshToken: string): Promise<OAuthTokenSet> {
    const res = await tokenPost({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? refreshToken,
      expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : undefined,
      scopes: (res.scope ?? "").split(" ").filter(Boolean),
    };
  },

  async listAdAccounts(token: string): Promise<AdAccountSummary[]> {
    type AccList = {
      elements: Array<{
        id: number;
        name: string;
        status: string;
        currency: string;
        timezone: string;
        type: string;
        notifiedOnCreate?: boolean;
        notifiedOnCampaignOptimization?: boolean;
        version?: { versionTag: string };
      }>;
      paging?: { count: number; start: number; total: number };
    };
    const rows = await liPaginate<AccList>(
      token,
      "/adAccounts",
      { q: "search" },
      (res) => ({ items: res.elements, nextStart: res.paging ? res.paging.start + res.paging.count : null }),
    );
    return rows.map((row) => {
      const acc = row as AccList["elements"][number];
      return {
        id: String(acc.id),
        name: acc.name,
        currency: acc.currency || "USD",
        timezone: acc.timezone || "UTC",
        status: acc.status === "ACTIVE" ? "active" : "disabled",
        raw: row,
      };
    });
  },

  async listPages(_token: string): Promise<PageSummary[]> {
    return [];
  },

  async syncCampaigns(connection, mapping, _since, _until): Promise<NormalizedCampaign[]> {
    // LinkedIn calls campaign groups "campaign groups" and campaigns
    // "campaigns". We sync campaigns (the leaf) here, with their parent
    // group id as a hint to the UI.
    const acctId = mapping.adAccountId;
    if (!acctId) return [];
    type CampList = {
      elements: Array<{
        id: number;
        name: string;
        status: string;
        type: string;
        objectiveType?: string;
        dailyBudget?: { amount: string; currencyCode: string };
        totalBudget?: { amount: string; currencyCode: string };
        runSchedule?: { start: number; end: number };
        costType?: string;
        unitCost?: { amount: string; currencyCode: string };
      }>;
      paging?: { count: number; start: number; total: number };
    };
    const rows = await liPaginate<CampList>(
      connection.accessToken,
      "/adCampaigns",
      { q: "search", search: `(account:(values:List(${acctId})))` },
      (res) => ({ items: res.elements, nextStart: res.paging ? res.paging.start + res.paging.count : null }),
    );
    return rows.map((row) => {
      const c = row as CampList["elements"][number];
      return {
        id: String(c.id),
        name: c.name,
        status: c.status.toLowerCase(),
        objective: c.objectiveType,
        dailyBudget: c.dailyBudget ? num(c.dailyBudget.amount) : undefined,
        lifetimeBudget: c.totalBudget ? num(c.totalBudget.amount) : undefined,
        startTime: c.runSchedule ? new Date(c.runSchedule.start) : undefined,
        stopTime: c.runSchedule?.end ? new Date(c.runSchedule.end) : undefined,
        raw: row,
      };
    });
  },

  async syncAdSets(connection, mapping, _since, _until): Promise<NormalizedAdSet[]> {
    // LinkedIn's "creative" is what shows in the feed; "ad sets" in our
    // model map to LinkedIn's "adCampaign" (already in syncCampaigns) or
    // to "creatives" inside a campaign. We don't have a true "ad set"
    // entity in LinkedIn, so return [] from this method to keep the
    // contract honest. Use syncAds to fetch creatives.
    void connection; void mapping;
    return [];
  },

  async syncAds(connection, mapping, _since, _until): Promise<NormalizedAdCreative[]> {
    const acctId = mapping.adAccountId;
    if (!acctId) return [];
    type CreativeList = {
      elements: Array<{
        id: number;
        name: string;
        content?: {
          textAd?: { headline: string; description: string; landingPage: string };
          spotlights?: { headline: string; description: string; landingPage: string };
        };
        intendedStatus?: string;
        campaign?: string;
        servingStatuses?: string[];
      }>;
      paging?: { count: number; start: number; total: number };
    };
    const rows = await liPaginate<CreativeList>(
      connection.accessToken,
      "/creatives",
      { q: "search", search: `(account:(values:List(${acctId})))` },
      (res) => ({ items: res.elements, nextStart: res.paging ? res.paging.start + res.paging.count : null }),
    );
    return rows.map((row) => {
      const c = row as CreativeList["elements"][number];
      const textAd = c.content?.textAd;
      const spotlights = c.content?.spotlights;
      return {
        id: String(c.id),
        name: c.name,
        status: (c.intendedStatus ?? c.servingStatuses?.[0] ?? "UNKNOWN").toLowerCase(),
        // LinkedIn's creatives don't nest inside a campaign id directly;
        // we leave campaignId undefined and let the UI resolve from the
        // campaign entity.
        title: textAd?.headline ?? spotlights?.headline ?? undefined,
        body: textAd?.description ?? spotlights?.description ?? undefined,
        callToAction: undefined, // LinkedIn doesn't expose a single CTA.
        raw: row,
      };
    });
  },

  async syncInsights(connection, mapping, since, until): Promise<NormalizedInsight[]> {
    const acctId = mapping.adAccountId;
    if (!acctId) return [];
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);
    // adAnalytics is the official reporting endpoint. Pivot on creative
    // for ad-level metrics; timeGranularity=DAILY; date range as YYYY-MM-DD.
    // The response shape is pivot-specific; the simplest pivot for our
    // needs is "creative" (one row per ad per day).
    type Analytics = {
      elements: Array<{
        pivotValues: string[]; // [creativeId, ...]
        dateRange?: { start: { year: number; month: number; day: number }; end: { year: number; month: number; day: number } };
        "pivot~"?: Record<string, string>; // pivot field name -> id
        impressions?: number;
        clicks?: number;
        costInUsd?: string;
        externalWebsiteConversions?: number;
        conversionValueInUsd?: string;
        videoViews?: number;
        videoCompletions?: number;
        follows?: number;
      }>;
      paging?: { count: number; start: number; total: number };
    };
    // We need daily granularity; pull one day at a time to keep the
    // response small. For a 30-day window that's 30 calls — within
    // LinkedIn's rate limits (default 100k/day).
    const out: NormalizedInsight[] = [];
    for (
      let d = new Date(since);
      d <= until && d.getTime() <= until.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const day = d.toISOString().slice(0, 10);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      const nextDay = next.toISOString().slice(0, 10);
      const rows = await liPaginate<Analytics>(
        connection.accessToken,
        "/adAnalytics",
        {
          q: "analytics",
          pivot: "CREATIVE",
          timeGranularity: "DAILY",
          accounts: `List(${acctId})`,
          // Inclusive start, exclusive end (LinkedIn convention).
          dateRange: `(start:(year:${d.getUTCFullYear()},month:${d.getUTCMonth() + 1},day:${d.getUTCDate()}),end:(year:${next.getUTCFullYear()},month:${next.getUTCMonth() + 1},day:${next.getUTCDate()}))`,
        },
        (res) => ({ items: res.elements, nextStart: res.paging ? res.paging.start + res.paging.count : null }),
      );
      for (const row of rows) {
        const r = row as Analytics["elements"][number];
        // pivotValues[0] is the creative id when pivot=CREATIVE.
        const adId = r.pivotValues?.[0];
        out.push({
          date: new Date(`${day}T00:00:00Z`),
          adId,
          impressions: intNum(r.impressions),
          clicks: intNum(r.clicks),
          spend: num(r.costInUsd) ?? 0,
          conversions: intNum(r.externalWebsiteConversions),
          conversionValue: num(r.conversionValueInUsd),
          videoViews: intNum(r.videoViews),
          // LinkedIn doesn't expose CTR / CPC / CPM in this pivot; the
          // caller can derive them from the absolute numbers.
          raw: row,
        });
      }
      // Suppress unused-var lint
      void sinceStr; void untilStr; void nextDay;
    }
    return out;
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
      // Cheap probe: read the mapped ad account record.
      await liFetch(
        connection.accessToken,
        `/adAccounts/${encodeURIComponent(mapping.adAccountId)}`,
      );
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("INVALID_ACCESS_TOKEN")) {
        return {
          ok: false,
          hint: "Access token expired or revoked. Refresh via OAuth.",
        };
      }
      if (msg.includes("403") || msg.includes("MISSING_SCOPE")) {
        return {
          ok: false,
          hint: "Missing scope. Re-authorize with r_ads and r_ads_reporting.",
        };
      }
      if (msg.includes("404")) {
        return {
          ok: false,
          hint: "Ad account id not found, or you don't have access.",
        };
      }
      return { ok: false, hint: msg.slice(0, 240) };
    }
  },
};

export const linkedinAdsProviderScopes = SCOPES;
