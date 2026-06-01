// LMTM-OS: Meta (Facebook + Instagram) Ads provider.
// Implementation extracted from the legacy server/src/services/meta-sync.ts.
// Hits the Graph API v21.0. All output is normalized to the platform-
// agnostic shape defined in ../types.ts so callers don't need to know
// about object_story_spec or effective_object_story_id.

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

const GRAPH = "https://graph.facebook.com/v21.0";
const PAGE_LIMIT = 50;

function gGet<T = unknown>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return fetch(url.toString()).then(async (r) => {
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`Graph ${path} → ${r.status}: ${text}`);
    }
    return r.json() as Promise<T>;
  });
}

async function* paginate<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
  token: string,
): AsyncGenerator<T[]> {
  let url: string | null = `${GRAPH}${path}?limit=${PAGE_LIMIT}&access_token=${encodeURIComponent(token)}`;
  for (const [k, v] of Object.entries(params)) url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  while (url) {
    const r: { data: T[]; paging?: { next?: string; cursors?: { after?: string } } } = await fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Graph pagination ${path} → ${res.status}`);
      return res.json();
    });
    if (r.data?.length) yield r.data;
    url = r.paging?.next ?? null;
  }
}

function unixToDate(unix: string | number | undefined): Date | undefined {
  if (unix == null) return undefined;
  const n = typeof unix === "string" ? parseInt(unix, 10) : unix;
  if (!Number.isFinite(n)) return undefined;
  return new Date(n * 1000);
}

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

function leadsFromActions(actions: Array<{ action_type?: string; value?: string }> | undefined): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (!a.action_type) continue;
    if (["lead", "onsite_conversion.lead_grouped", "leadgen_other"].includes(a.action_type)) {
      total += intNum(a.value);
    }
  }
  return total;
}

function conversionsFromActions(actions: Array<{ action_type?: string; value?: string }> | undefined): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (!a.action_type) continue;
    if (a.action_type.startsWith("offsite_conversion") || a.action_type === "purchase") {
      total += intNum(a.value);
    }
  }
  return total;
}

export const metaProvider: AdsProvider = {
  platform: "meta",

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokenSet> {
    const appId = process.env.META_APP_ID ?? "";
    const appSecret = process.env.META_APP_SECRET ?? "";
    if (!appId || !appSecret) {
      throw new Error("META_APP_ID / META_APP_SECRET not configured");
    }
    // Step 1: code -> short-lived token.
    const step1 = await gGet<{ access_token: string }>("/oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }, "");
    // Step 2: exchange for long-lived (60d) token.
    const step2 = await gGet<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: step1.access_token,
    }, "");
    return {
      accessToken: step2.access_token,
      expiresAt: step2.expires_in ? new Date(Date.now() + step2.expires_in * 1000) : undefined,
      scopes: [],
    };
  },

  async refreshToken(refreshToken: string): Promise<OAuthTokenSet> {
    // Meta does not have refresh tokens in the OAuth 2.0 sense. The
    // "long-lived" token (60d) is re-exchanged inline at exchange time.
    // For System User tokens (tokenType=system) there's nothing to refresh.
    return {
      accessToken: refreshToken,
      scopes: [],
    };
  },

  async listAdAccounts(token: string): Promise<AdAccountSummary[]> {
    const result: AdAccountSummary[] = [];
    for await (const batch of paginate<{ id: string; name?: string; account_status?: number; currency?: string; timezone_name?: string }>(
      "/me/adaccounts",
      { fields: "id,name,account_status,currency,timezone_name" },
      token,
    )) {
      for (const acc of batch) {
        result.push({
          id: acc.id,
          name: acc.name ?? acc.id,
          currency: acc.currency ?? "USD",
          timezone: acc.timezone_name ?? "UTC",
          status: acc.account_status === 1 ? "active" : "disabled",
          raw: acc as Record<string, unknown>,
        });
      }
    }
    return result;
  },

  async listPages(token: string): Promise<PageSummary[]> {
    const result: PageSummary[] = [];
    for await (const batch of paginate<{ id: string; name?: string }>(
      "/me/accounts",
      { fields: "id,name" },
      token,
    )) {
      for (const p of batch) {
        result.push({ id: p.id, name: p.name ?? p.id, raw: p as Record<string, unknown> });
      }
    }
    return result;
  },

  async syncCampaigns(connection, mapping, _since, _until): Promise<NormalizedCampaign[]> {
    if (!mapping.adAccountId) return [];
    const out: NormalizedCampaign[] = [];
    for await (const batch of paginate<{
      id: string; name?: string; status?: string; effective_status?: string;
      objective?: string; daily_budget?: string; lifetime_budget?: string;
      start_time?: string; stop_time?: string; buying_type?: string; updated_time?: string;
    }>(
      `/${mapping.adAccountId}/campaigns`,
      { fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type,updated_time" },
      connection.accessToken,
    )) {
      for (const c of batch) {
        out.push({
          id: c.id,
          name: c.name ?? c.id,
          status: c.effective_status ?? c.status ?? "unknown",
          objective: c.objective,
          dailyBudget: num(c.daily_budget),
          lifetimeBudget: num(c.lifetime_budget),
          startTime: c.start_time ? new Date(c.start_time) : undefined,
          stopTime: c.stop_time ? new Date(c.stop_time) : undefined,
          raw: c as Record<string, unknown>,
        });
      }
    }
    return out;
  },

  async syncAdSets(connection, mapping, _since, _until): Promise<NormalizedAdSet[]> {
    if (!mapping.adAccountId) return [];
    const out: NormalizedAdSet[] = [];
    for await (const batch of paginate<{
      id: string; name?: string; status?: string; effective_status?: string;
      campaign_id?: string; daily_budget?: string; lifetime_budget?: string;
    }>(
      `/${mapping.adAccountId}/adsets`,
      { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget" },
      connection.accessToken,
    )) {
      for (const a of batch) {
        out.push({
          id: a.id,
          campaignId: a.campaign_id ?? "",
          name: a.name ?? a.id,
          status: a.effective_status ?? a.status ?? "unknown",
          dailyBudget: num(a.daily_budget),
          lifetimeBudget: num(a.lifetime_budget),
          raw: a as Record<string, unknown>,
        });
      }
    }
    return out;
  },

  async syncAds(connection, mapping, _since, _until): Promise<NormalizedAdCreative[]> {
    if (!mapping.adAccountId) return [];
    const out: NormalizedAdCreative[] = [];
    for await (const batch of paginate<{
      id: string; name?: string; status?: string; effective_status?: string;
      adset_id?: string; campaign_id?: string; creative?: { id?: string; thumbnail_url?: string; image_url?: string; body?: string; title?: string; call_to_action_type?: string; object_story_spec?: { page_id?: string } };
    }>(
      `/${mapping.adAccountId}/ads`,
      { fields: "id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,image_url,body,title,call_to_action_type,object_story_spec}" },
      connection.accessToken,
    )) {
      for (const ad of batch) {
        out.push({
          id: ad.id,
          adsetId: ad.adset_id,
          campaignId: ad.campaign_id,
          name: ad.name ?? ad.id,
          status: ad.effective_status ?? ad.status ?? "unknown",
          creativeId: ad.creative?.id,
          thumbnailUrl: ad.creative?.thumbnail_url,
          imageUrl: ad.creative?.image_url,
          body: ad.creative?.body,
          title: ad.creative?.title,
          callToAction: ad.creative?.call_to_action_type,
          raw: ad as Record<string, unknown>,
        });
      }
    }
    return out;
  },

  async syncInsights(connection, mapping, since, until): Promise<NormalizedInsight[]> {
    if (!mapping.adAccountId) return [];
    const out: NormalizedInsight[] = [];
    const timeRange = JSON.stringify({ since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) });
    for await (const batch of paginate<{
      campaign_id?: string; campaign_name?: string; adset_id?: string; ad_id?: string;
      date_start: string;
      impressions?: string; clicks?: string; spend?: string; reach?: string;
      ctr?: string; cpc?: string; cpm?: string;
      actions?: Array<{ action_type: string; value: string }>;
    }>(
      `/${mapping.adAccountId}/insights`,
      {
        level: "ad",
        time_range: timeRange,
        time_increment: "1",
        fields: "campaign_id,campaign_name,adset_id,ad_id,date_start,impressions,clicks,spend,reach,ctr,cpc,cpm,actions",
      },
      connection.accessToken,
    )) {
      for (const row of batch) {
        out.push({
          date: new Date(row.date_start + "T00:00:00Z"),
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          adsetId: row.adset_id,
          adId: row.ad_id,
          impressions: intNum(row.impressions),
          clicks: intNum(row.clicks),
          spend: num(row.spend) ?? 0,
          reach: intNum(row.reach),
          ctr: num(row.ctr),
          cpc: num(row.cpc),
          cpm: num(row.cpm),
          leads: leadsFromActions(row.actions),
          conversions: conversionsFromActions(row.actions),
          raw: row as Record<string, unknown>,
        });
      }
    }
    return out;
  },

  async syncOrganicPosts(connection, mapping, since, until): Promise<NormalizedOrganicPost[]> {
    const pageId = mapping.pageId;
    if (!pageId) {
      throw new Error(
        "Meta: el mapping no tiene pageId. Reconectá Meta con la página del cliente (auth_type=rerequest) y volvé a sincronizar.",
      );
    }
    // To get a page-token we'd need to call /me/accounts and pick the
    // page-specific access_token. For the common case, the user-token
    // is enough for organic reads.
    const out: NormalizedOrganicPost[] = [];
    for await (const batch of paginate<{
      id: string; message?: string; story?: string; full_picture?: string;
      permalink_url?: string; created_time?: string; type?: string;
    }>(
      `/${pageId}/posts`,
      {
        fields: "id,message,story,full_picture,permalink_url,created_time,type",
        since: Math.floor(since.getTime() / 1000).toString(),
        until: Math.floor(until.getTime() / 1000).toString(),
      },
      connection.accessToken,
    )) {
      for (const p of batch) {
        out.push({
          id: p.id,
          pageId,
          message: p.message,
          story: p.story,
          fullPicture: p.full_picture,
          permalinkUrl: p.permalink_url,
          createdTime: unixToDate(p.created_time),
          postType: p.type,
          raw: p as Record<string, unknown>,
        });
      }
    }
    return out;
  },

  async fetchPostMetrics(connection, post): Promise<NormalizedPostMetric[]> {
    const metrics = [
      "post_impressions_unique",
      "post_impressions",
      "post_engaged_users",
      "post_clicks",
      "post_reactions_by_type_total",
    ];
    const r = await gGet<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>(
      `/${post.id}/insights`,
      { metric: metrics.join(",") },
      connection.accessToken,
    );
    const result: NormalizedPostMetric[] = [];
    for (const m of r.data ?? []) {
      const value = m.values?.[0]?.value ?? 0;
      result.push({ metric: m.name, value });
    }
    return result;
  },

  async healthCheck(connection, mapping): Promise<{ ok: boolean; hint?: string }> {
    if (connection.status !== "active") {
      return { ok: false, hint: `connection status = ${connection.status}` };
    }
    if (!mapping.adAccountId) {
      return { ok: false, hint: "mapping has no adAccountId" };
    }
    try {
      await gGet(`/${mapping.adAccountId}`, { fields: "id,account_status" }, connection.accessToken);
      return { ok: true };
    } catch (err) {
      return { ok: false, hint: err instanceof Error ? err.message : "Graph probe failed" };
    }
  },
};
