// LMTM-OS: Google Ads provider.
// Implements the AdsProvider contract for the Google Ads API (v17).
// Authentication is OAuth 2.0 (authorization code + refresh token); the
// Google Ads API itself requires an extra `developer-token` header on
// every request and, when operating on behalf of client accounts under
// an MCC, a `login-customer-id` header pointing at the manager.
//
// Required env vars (Render env):
//   GOOGLE_ADS_CLIENT_ID       — OAuth 2.0 client id
//   GOOGLE_ADS_CLIENT_SECRET   — OAuth 2.0 client secret
//   GOOGLE_ADS_DEVELOPER_TOKEN — MCC-level developer token from
//                                https://ads.google.com/aw/apicenter
//                                (apply for Basic Access to use prod tier)
//
// Required connection fields (ads_connections row):
//   accessToken       — OAuth access token (short-lived, ~1h)
//   refreshToken      — OAuth refresh token (long-lived, until revoked)
//   developerToken    — stored on connection too so each company can use
//                       their own if needed (overrides env default)
//   managerAccountId  — MCC (login-customer-id); numeric, no dashes
//   adAccountId       — the client account id (without "act_" prefix
//                       here; we add it on the API call)
//
// Note: Google Ads does not have a "Pages" concept equivalent to Meta's.
// The organic surface (Google Business Profile) lives behind a separate
// API with different scopes, so we return [] from listPages for now.

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

const API_VERSION = "v17";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

const SCOPES = ["https://www.googleapis.com/auth/adwords"];

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

function microsToUnits(micros: unknown): number | undefined {
  // Google Ads reports spend as micros (1e-6 of the account currency).
  const n = num(micros);
  return n == null ? undefined : n / 1_000_000;
}

function rawCustomerId(id: string | null | undefined): string | null {
  if (!id) return null;
  // Google customer ids are 10 digits, no dashes. Tolerate "act_/123"
  // and "123-456-7890" and normalize.
  return id.replace(/^act_/i, "").replace(/-/g, "").trim() || null;
}

function needEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} not configured. Set it in the Render dashboard under Environment.`,
    );
  }
  return v;
}

async function tokenPost(form: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}> {
  const body = new URLSearchParams(form);
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  let json: Awaited<ReturnType<typeof tokenPost>>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Google token endpoint returned non-JSON (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok || json.error) {
    throw new Error(
      `Google token error: ${json.error ?? r.status} — ${json.error_description ?? text.slice(0, 200)}`,
    );
  }
  return json;
}

async function adsApi<T = unknown>(
  connection: AdsConnection,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const devToken = connection.developerToken ?? needEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const loginCid = rawCustomerId(connection.managerAccountId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  if (loginCid) headers["login-customer-id"] = loginCid;

  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    throw new Error(`Google Ads ${path} returned non-JSON (${r.status}): ${text.slice(0, 400)}`);
  }
  if (!r.ok) {
    throw new Error(`Google Ads ${path} → ${r.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

type SearchStreamResponse = Array<{
  results?: Array<Record<string, unknown>>;
  fieldMask?: string;
  // Pagination: Google Ads uses page tokens (pageSize + pageToken).
}>;

async function searchStream(
  connection: AdsConnection,
  customerId: string,
  query: string,
): Promise<Array<Record<string, unknown>>> {
  // Google Ads SearchStream is technically a streaming endpoint, but we
  // pull the whole response in one POST. For accounts with millions of
  // rows you'd want a real streaming client; for our use case (agency
  // with ~40 clients, 30-90 days of daily data) the single-call model is
  // fine.
  const path = `/customers/${customerId}/googleAds:searchStream`;
  const all: Array<Record<string, unknown>> = [];
  const res = await adsApi<SearchStreamResponse>(connection, "POST", path, { query });
  for (const chunk of res) {
    if (Array.isArray(chunk.results)) all.push(...chunk.results);
  }
  return all;
}

export const googleAdsProvider: AdsProvider = {
  platform: "google",

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const clientId = needEnv("GOOGLE_ADS_CLIENT_ID");
    const clientSecret = needEnv("GOOGLE_ADS_CLIENT_SECRET");
    const res = await tokenPost({
      client_id: clientId,
      client_secret: clientSecret,
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
    const clientId = needEnv("GOOGLE_ADS_CLIENT_ID");
    const clientSecret = needEnv("GOOGLE_ADS_CLIENT_SECRET");
    const res = await tokenPost({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    return {
      accessToken: res.access_token,
      refreshToken, // unchanged
      expiresAt: res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : undefined,
      scopes: (res.scope ?? "").split(" ").filter(Boolean),
    };
  },

  async listAdAccounts(token: string): Promise<AdAccountSummary[]> {
    // We need a connection object for the developer-token header, so
    // build a temporary one from the bearer alone. We use the user's
    // MCC as login-customer-id from the env (default MCC).
    const mcc = rawCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null);
    const conn = {
      accessToken: token,
      refreshToken: null,
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? null,
      managerAccountId: mcc,
    } as unknown as AdsConnection;
    if (!mcc) {
      throw new Error(
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID not set. Required to list child accounts under an MCC.",
      );
    }
    const query = `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.currency_code,
        customer_client.time_zone,
        customer_client.status,
        customer_client.manager
      FROM customer_client
      WHERE customer_client.manager = FALSE
    `.trim();
    const rows = await searchStream(conn, mcc, query);
    return rows
      .map((row) => row.customer_client as Record<string, unknown> | undefined)
      .filter((c): c is Record<string, unknown> => Boolean(c))
      .map((c) => ({
        id: String(c.id),
        name: (c.descriptive_name as string) ?? String(c.id),
        currency: (c.currency_code as string) ?? "USD",
        timezone: (c.time_zone as string) ?? "UTC",
        status: c.status === "ENABLED" ? "active" : "disabled",
        raw: c,
      }));
  },

  async listPages(_token: string): Promise<PageSummary[]> {
    // Google Ads has no equivalent of Meta Pages. Return [].
    return [];
  },

  async syncCampaigns(connection, mapping, _since, _until): Promise<NormalizedCampaign[]> {
    const cid = rawCustomerId(mapping.adAccountId);
    if (!cid) return [];
    const query = `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign.start_date, campaign.end_date,
        campaign.advertising_channel_type, campaign.advertising_channel_subtype
      FROM campaign
    `.trim();
    const rows = await searchStream(connection, cid, query);
    return rows
      .map((row) => row.campaign as Record<string, unknown> | undefined)
      .filter((c): c is Record<string, unknown> => Boolean(c))
      .map((c) => ({
        id: String(c.id),
        name: (c.name as string) ?? String(c.id),
        status: ((c.status as string) ?? "UNKNOWN").toLowerCase(),
        objective: (c.advertising_channel_type as string | undefined) ?? undefined,
        startTime: c.start_date ? new Date(`${c.start_date}T00:00:00Z`) : undefined,
        stopTime: c.end_date ? new Date(`${c.end_date}T00:00:00Z`) : undefined,
        raw: c,
      }));
  },

  async syncAdSets(connection, mapping, _since, _until): Promise<NormalizedAdSet[]> {
    // Google calls "ad sets" → "ad groups". Same hierarchy under campaign.
    const cid = rawCustomerId(mapping.adAccountId);
    if (!cid) return [];
    const query = `
      SELECT
        ad_group.id, ad_group.name, ad_group.status,
        ad_group.campaign, ad_group.cpc_bid_micros,
        ad_group.cpm_bid_micros
      FROM ad_group
    `.trim();
    const rows = await searchStream(connection, cid, query);
    return rows
      .map((row) => row.ad_group as Record<string, unknown> | undefined)
      .filter((g): g is Record<string, unknown> => Boolean(g))
      .map((g) => {
        const campaign = g.campaign as string | undefined;
        return {
          id: String(g.id),
          campaignId: campaign ?? "",
          name: (g.name as string) ?? String(g.id),
          status: ((g.status as string) ?? "UNKNOWN").toLowerCase(),
          // Google uses bid amounts (cpc_bid_micros / cpm_bid_micros),
          // not ad-set budgets. Leave daily/lifetime undefined to avoid
          // misrepresenting the data; the UI shows these fields per
          // platform's semantics.
          raw: g,
        };
      });
  },

  async syncAds(connection, mapping, _since, _until): Promise<NormalizedAdCreative[]> {
    const cid = rawCustomerId(mapping.adAccountId);
    if (!cid) return [];
    // ad_group_ad pulls creative metadata. The actual asset (image, video,
    // text) lives behind ad_group_ad.ad and may need a follow-up call to
    // fetch binary. We capture the metadata; binaries can be fetched
    // later by the dashboard if needed.
    const query = `
      SELECT
        ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
        ad_group_ad.ad.display_url, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.group, ad_group_ad.status,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.image_ad.image_url
      FROM ad_group_ad
    `.trim();
    const rows = await searchStream(connection, cid, query);
    return rows
      .map((row) => {
        const aga = row.ad_group_ad as Record<string, unknown> | undefined;
        return aga?.ad as Record<string, unknown> | undefined;
      })
      .filter((a): a is Record<string, unknown> => Boolean(a))
      .map((a) => {
        const headlines = ((a.responsive_search_ad as Record<string, unknown> | undefined)
          ?.headlines as Array<{ text?: string }> | undefined) ?? [];
        const descriptions = ((a.responsive_search_ad as Record<string, unknown> | undefined)
          ?.descriptions as Array<{ text?: string }> | undefined) ?? [];
        const imageAd = a.image_ad as Record<string, unknown> | undefined;
        const finalUrls = (a.final_urls as string[] | undefined) ?? [];
        return {
          id: String(a.id),
          name: (a.name as string) ?? String(a.id),
          status: ((a as Record<string, unknown>).status as string ?? "UNKNOWN").toLowerCase(),
          // ad_group is a resource name; parse just the id suffix.
          adsetId: a.group
            ? String(a.group).split("/").pop() ?? undefined
            : undefined,
          title: headlines.map((h) => h.text).filter(Boolean).join(" | ") || undefined,
          body: descriptions.map((d) => d.text).filter(Boolean).join(" | ") || undefined,
          imageUrl: imageAd?.image_url as string | undefined,
          raw: a,
          // We intentionally leave callToAction unset; Google Ads
          // doesn't have a single CTA concept the way Meta does.
        };
      });
  },

  async syncInsights(connection, mapping, since, until): Promise<NormalizedInsight[]> {
    const cid = rawCustomerId(mapping.adAccountId);
    if (!cid) return [];
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);
    const query = `
      SELECT
        segments.date,
        campaign.id, campaign.name,
        ad_group.id, ad_group_criterion.criterion_id,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.ctr, metrics.average_cpc, metrics.average_cpm,
        metrics.conversions, metrics.conversions_value,
        metrics.video_views
      FROM campaign
      WHERE segments.date BETWEEN '${sinceStr}' AND '${untilStr}'
    `.trim();
    const rows = await searchStream(connection, cid, query);
    return rows
      .map((row) => {
        const m = row.metrics as Record<string, unknown> | undefined;
        const seg = row.segments as Record<string, unknown> | undefined;
        const camp = row.campaign as Record<string, unknown> | undefined;
        const ag = row.ad_group as Record<string, unknown> | undefined;
        if (!m || !seg) return null;
        const dateStr = seg.date as string | undefined;
        if (!dateStr) return null;
        return {
          date: new Date(`${dateStr}T00:00:00Z`),
          campaignId: camp?.id ? String(camp.id) : undefined,
          campaignName: camp?.name as string | undefined,
          adsetId: ag?.id ? String(ag.id) : undefined,
          adId: row.ad_group_criterion
            ? String((row.ad_group_criterion as Record<string, unknown>).criterion_id ?? "")
            : undefined,
          impressions: intNum(m.impressions),
          clicks: intNum(m.clicks),
          spend: microsToUnits(m.cost_micros) ?? 0,
          ctr: num(m.ctr),
          cpc: microsToUnits(m.average_cpc),
          cpm: microsToUnits(m.average_cpm),
          conversions: intNum(m.conversions),
          conversionValue: num(m.conversions_value),
          videoViews: intNum(m.video_views),
          raw: row,
        } as NormalizedInsight;
      })
      .filter((x): x is NormalizedInsight => x !== null);
  },

  async syncOrganicPosts(_connection, _mapping, _since, _until): Promise<NormalizedOrganicPost[]> {
    // Organic content (Google Business Profile posts) is a separate API
    // with different scopes; we don't ship it as part of Google Ads
    // sync. Return [] until the user explicitly adds GBP support.
    return [];
  },

  async fetchPostMetrics(_connection, _post): Promise<NormalizedPostMetric[]> {
    return [];
  },

  async healthCheck(connection, mapping): Promise<{ ok: boolean; hint?: string }> {
    // Cheap probe: try to read the customer record for the mapped ad
    // account. If it succeeds, the token + developer token + account
    // mapping are all valid. If it 401/403, the access token is bad
    // (caller should refresh). If 404, the ad account id is wrong.
    const cid = rawCustomerId(mapping.adAccountId);
    if (!cid) {
      return {
        ok: false,
        hint: "No ad account mapped. Add a mapping in /c/<slug>/ads/connections.",
      };
    }
    if (!connection.developerToken && !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      return {
        ok: false,
        hint: "GOOGLE_ADS_DEVELOPER_TOKEN not set on Render env. Apply at https://ads.google.com/aw/apicenter.",
      };
    }
    try {
      const query = `SELECT customer.id, customer.status FROM customer LIMIT 1`;
      const rows = await searchStream(connection, cid, query);
      if (rows.length === 0) {
        return { ok: false, hint: "Customer record not found for the mapped ad account." };
      }
      const customer = rows[0]?.customer as Record<string, unknown> | undefined;
      const status = customer?.status as string | undefined;
      if (status && status !== "ENABLED") {
        return { ok: false, hint: `Google Ads account status: ${status}` };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("401") || msg.includes("AUTHENTICATION_ERROR")) {
        return {
          ok: false,
          hint: "Access token expired or revoked. Trigger an OAuth refresh.",
        };
      }
      if (msg.includes("403") || msg.includes("AUTHORIZATION_ERROR")) {
        return {
          ok: false,
          hint: "Developer token or login-customer-id is wrong. Verify GOOGLE_ADS_DEVELOPER_TOKEN and the MCC's login-customer-id header.",
        };
      }
      if (msg.includes("404") || msg.includes("CUSTOMER_NOT_FOUND")) {
        return {
          ok: false,
          hint: "Ad account id is wrong, or you don't have access to it from this MCC.",
        };
      }
      return { ok: false, hint: msg.slice(0, 240) };
    }
  },
};

export const googleAdsProviderScopes = SCOPES;
