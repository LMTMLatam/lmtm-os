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
  AdSetSummary,
  NormalizedCampaign,
  NormalizedAdSet,
  NormalizedAdCreative,
  NormalizedInsight,
  NormalizedOrganicPost,
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
  let retryCount = 0;
  while (url) {
    const r: { data: T[]; paging?: { next?: string; cursors?: { after?: string } } } = await fetch(url).then(async (res) => {
      if (res.ok) return res.json();
      // Rate-limit (code 4) and transient 5xx: exponential backoff, up to 5 tries.
      const text = await res.text().catch(() => "");
      const isRateLimit = res.status === 429 || (res.status === 403 && /limit reached|too many/i.test(text));
      const isTransient = res.status >= 500;
      if ((isRateLimit || isTransient) && retryCount < 5) {
        retryCount++;
        const delayMs = Math.min(60_000, 1000 * Math.pow(2, retryCount));
        console.warn(`[meta-paginate] ${path} → ${res.status}, retry ${retryCount}/5 in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
        return null; // signal "retry without throwing"
      }
      throw new Error(`Graph pagination ${path} → ${res.status}: ${text.slice(0, 300)}`);
    });
    if (r == null) continue; // retry path; loop will refetch same URL
    if (r.data?.length) yield r.data;
    url = r.paging?.next ?? null;
    retryCount = 0; // reset on a successful page
  }
}

// Caches user-token → page-token (per pageId) for the life of the process.
const pageTokenCache = new Map<string, string>();

async function getPageAccessToken(userToken: string, pageId: string): Promise<string> {
  const cacheKey = `${userToken.slice(0, 16)}:${pageId}`;
  const cached = pageTokenCache.get(cacheKey);
  if (cached) return cached;
  // PAGINATE: /me/accounts defaults to 25 results, and the agency admins 50+
  // pages — a single fetch silently missed everything past the first batch and
  // looked like a missing scope ("no se encontró access_token") when the token
  // was fine. Cache every page token seen along the way (free wins).
  let found: string | null = null;
  for await (const batch of paginate<{ id: string; access_token?: string }>(
    "/me/accounts",
    { fields: "id,access_token" },
    userToken,
  )) {
    for (const acct of batch) {
      if (acct.access_token) pageTokenCache.set(`${userToken.slice(0, 16)}:${acct.id}`, acct.access_token);
      if (acct.id === pageId && acct.access_token) found = acct.access_token;
    }
    if (found) break;
  }
  if (!found) {
    throw new Error(
      `Meta: no se encontró access_token para la página ${pageId} en /me/accounts. ` +
      `La página no está autorizada para el app: reconectá Meta y en la pantalla de permisos incluí esa página.`,
    );
  }
  return found;
}

function unixToDate(unix: string | number | undefined): Date | undefined {
  if (unix == null) return undefined;
  const n = typeof unix === "string" ? parseInt(unix, 10) : unix;
  if (!Number.isFinite(n)) return undefined;
  return new Date(n * 1000);
}

function inferPostType(permalinkUrl: string | undefined, fullPicture: string | undefined): string {
  const u = (permalinkUrl ?? "").toLowerCase();
  if (u.includes("/videos/")) return "video";
  if (u.includes("/photos/")) return "photo";
  if (u.includes("/posts/")) return "status";
  if (u.includes("/reel/") || u.includes("/reels/")) return "reel";
  // Fallback heuristic: if there is a picture but no clear link shape
  if (fullPicture) return "photo";
  return "post";
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
    // Dedupe by page id: a Page can appear both directly and via a business.
    const byId = new Map<string, PageSummary>();
    const add = (p: { id?: string; name?: string }) => {
      if (!p?.id || byId.has(p.id)) return;
      byId.set(p.id, { id: p.id, name: p.name ?? p.id, raw: p as Record<string, unknown> });
    };

    // 1) Pages the user administers directly (/me/accounts). Always available
    //    with pages_show_list.
    try {
      for await (const batch of paginate<{ id: string; name?: string }>(
        "/me/accounts",
        { fields: "id,name" },
        token,
      )) {
        for (const p of batch) add(p);
      }
    } catch {
      // ignore — business pages below may still resolve
    }

    // 2) Pages reached through Business Managers (the agency model). /me/accounts
    //    only returns Pages with a DIRECT role, so client Pages assigned via a
    //    Business Manager (e.g. DUNOD) are invisible there. Enumerate them via
    //    each business's owned_pages + client_pages. Requires the
    //    business_management scope; if the token lacks it these calls throw and
    //    we silently keep just the direct-role pages.
    try {
      const businessIds: string[] = [];
      for await (const batch of paginate<{ id: string }>(
        "/me/businesses",
        { fields: "id" },
        token,
      )) {
        for (const b of batch) if (b.id) businessIds.push(b.id);
      }
      // Enumerate each business's owned + client pages with BOUNDED concurrency.
      // Sequentially across ~25 businesses (2 edges each) the inventory load
      // hung; but firing all ~50 calls at once spikes Meta's app-level rate
      // limit (x-app-usage call_count > 100% → 403 "(#4) Application request
      // limit reached"), which then makes the paginate backoff stall for
      // minutes. A small worker pool keeps it fast without tripping the limit.
      const edgeJobs: Array<{ bizId: string; edge: "owned_pages" | "client_pages" }> = [];
      for (const bizId of businessIds) {
        edgeJobs.push({ bizId, edge: "owned_pages" });
        edgeJobs.push({ bizId, edge: "client_pages" });
      }
      const CONCURRENCY = 4;
      let cursor = 0;
      const runEdge = async (job: { bizId: string; edge: string }) => {
        try {
          for await (const batch of paginate<{ id: string; name?: string }>(
            `/${job.bizId}/${job.edge}`,
            { fields: "id,name" },
            token,
          )) {
            for (const p of batch) add(p);
          }
        } catch {
          // one failing edge must not break the rest
        }
      };
      const workers = Array.from({ length: Math.min(CONCURRENCY, edgeJobs.length) }, async () => {
        while (cursor < edgeJobs.length) {
          const job = edgeJobs[cursor++];
          await runEdge(job);
        }
      });
      await Promise.all(workers);
    } catch {
      // token lacks business_management — return direct-role pages only
    }

    return [...byId.values()];
  },

  async listAdSets(adAccountId: string, token: string): Promise<AdSetSummary[]> {
    const accountId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const result: AdSetSummary[] = [];
    // Exclude DELETED/ARCHIVED by default — these are noise for the
    // dashboard. Callers that want everything can pass statusFilter=all
    // via the route layer; the provider returns the raw list including
    // those, and the route decides what to keep.
    // (We don't add a filtering param at this layer to keep the
    // contract generic; we just include both status fields so the
    // route can decide based on `effective_status`.)
    for await (const batch of paginate<{
      id: string; name?: string; status?: string; effective_status?: string;
      campaign_id?: string; daily_budget?: string; lifetime_budget?: string;
    }>(
      `/${accountId}/adsets`,
      { fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget" },
      token,
    )) {
      for (const a of batch) {
        result.push({
          id: a.id,
          name: a.name ?? a.id,
          // Prefer effective_status (the runtime state) and fall back
          // to status. The route layer filters by this.
          status: a.effective_status ?? a.status ?? "unknown",
          campaignId: a.campaign_id,
          dailyBudget: num(a.daily_budget),
          lifetimeBudget: num(a.lifetime_budget),
          raw: a as Record<string, unknown>,
        });
      }
    }
    return result;
  },

  async listAdAccountsForPage(pageId: string, token: string): Promise<AdAccountSummary[]> {
    // A page's "primary" ad accounts can be discovered via:
    //   /<page_id>/adaccounts?fields=id,name,currency,timezone_name,account_status
    //   /<page_id>/promote_pages?fields=ad_platform,ad_account_id
    // We use the simpler `adaccounts` edge.
    const result: AdAccountSummary[] = [];
    try {
      for await (const batch of paginate<{
        id: string; name?: string; currency?: string; timezone_name?: string;
        account_status?: number;
      }>(
        `/${pageId}/adaccounts`,
        { fields: "id,name,currency,timezone_name,account_status" },
        token,
      )) {
        for (const a of batch) {
          result.push({
            id: a.id,
            name: a.name ?? a.id,
            currency: a.currency ?? "USD",
            timezone: a.timezone_name ?? "UTC",
            status: a.account_status === 1 ? "active" : "disabled",
            raw: a as Record<string, unknown>,
          });
        }
      }
    } catch {
      // Some pages (or tokens) don't expose /adaccounts. Return [].
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
        // level "ad" (not "adset"): at adset level Meta omits ad_id, which left
        // every ads_insights row with ad_id NULL — the per-ad creatives view
        // could never join metrics and rendered all zeros. Ad level still
        // returns adset_id, so the included-adsets filter keeps working.
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
    // In the new Pages experience, reading a Page's posts requires a
    // PAGE-level access token, not the user-level one. Get the page
    // token from /me/accounts.
    const pageToken = await getPageAccessToken(connection.accessToken, pageId);
    const out: NormalizedOrganicPost[] = [];
    for await (const batch of paginate<{
      id: string; message?: string; story?: string; full_picture?: string;
      permalink_url?: string; created_time?: string; type?: string;
      shares?: { count?: number };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }>(
      `/${pageId}/posts`,
      {
        // `type` is deprecated in Graph API v3.3+ — omit it to avoid a 400.
        // Engagement comes from the post object's own summary fields (no extra
        // calls): Meta deprecated the post-level /insights impressions metrics,
        // so the old per-post /insights fetch always 400'd and organic
        // engagement stayed empty.
        fields: "id,message,story,full_picture,permalink_url,created_time,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
        since: Math.floor(since.getTime() / 1000).toString(),
        until: Math.floor(until.getTime() / 1000).toString(),
      },
      pageToken,
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
          // `type` was deprecated in Graph API v3.3+, so we infer it
          // from the permalink URL. Example:
          //   https://facebook.com/PktGlobal/photos/123 → "photo"
          //   https://facebook.com/PktGlobal/videos/123 → "video"
          postType: inferPostType(p.permalink_url, p.full_picture),
          metrics: [
            { metric: "post_reactions_by_type_total", value: p.reactions?.summary?.total_count ?? 0 },
            { metric: "post_comments", value: p.comments?.summary?.total_count ?? 0 },
            { metric: "post_shares", value: p.shares?.count ?? 0 },
          ],
          raw: p as Record<string, unknown>,
        });
      }
    }

    // Instagram organic media for the IG business account linked to this page.
    // Most LMTM clients post primarily on Instagram, so a FB-only sweep left
    // their "página orgánica" section nearly empty. IG media carries its
    // engagement (like_count/comments_count) directly on the media object.
    // Stored under the same FB pageId so the client→posts mapping resolves
    // unchanged. Best-effort: a page without a linked IG business account (or
    // missing instagram_basic permission) must not fail the FB sweep.
    try {
      const igRes = await gGet<{ instagram_business_account?: { id?: string } }>(
        `/${pageId}`,
        { fields: "instagram_business_account{id}" },
        pageToken,
      );
      const igId = igRes.instagram_business_account?.id;
      if (igId) {
        for await (const media of paginate<{
          id: string; caption?: string; permalink?: string; timestamp?: string;
          media_type?: string; media_product_type?: string;
          thumbnail_url?: string; media_url?: string;
          like_count?: number; comments_count?: number;
        }>(
          `/${igId}/media`,
          {
            fields: "id,caption,permalink,timestamp,media_type,media_product_type,thumbnail_url,media_url,like_count,comments_count",
            since: Math.floor(since.getTime() / 1000).toString(),
            until: Math.floor(until.getTime() / 1000).toString(),
          },
          pageToken,
        )) {
          for (const m of media) {
            out.push({
              id: m.id,
              pageId,
              message: m.caption,
              fullPicture: m.thumbnail_url ?? m.media_url,
              permalinkUrl: m.permalink,
              createdTime: m.timestamp ? new Date(m.timestamp) : undefined,
              postType:
                m.media_product_type === "REELS" ? "reel"
                : m.media_type === "VIDEO" ? "video"
                : m.media_type === "CAROUSEL_ALBUM" ? "carousel"
                : "photo",
              metrics: [
                { metric: "post_reactions_by_type_total", value: m.like_count ?? 0 },
                { metric: "post_comments", value: m.comments_count ?? 0 },
              ],
              raw: m as Record<string, unknown>,
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[meta-organic] IG media for page ${pageId} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return out;
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

// ── Audience demographics ─────────────────────────────────────────────────────
// Not part of the AdsProvider interface (only Meta supports it). The insights
// sync deliberately omits `breakdowns` to keep the money table small and fast;
// this is a separate, light, account-level pass (no time_increment → a handful
// of rows per call) so the /audience dashboard has real age/gender/platform/
// device data instead of empty arrays.

export interface NormalizedAudienceRow {
  dimension: "age" | "gender" | "publisher_platform" | "device";
  key: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  reach: number;
}

interface MetaBreakdownRow {
  age?: string; gender?: string; publisher_platform?: string; impression_device?: string;
  impressions?: string; clicks?: string; spend?: string; reach?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

function addInto(
  map: Map<string, NormalizedAudienceRow>,
  dimension: NormalizedAudienceRow["dimension"],
  key: string | undefined,
  row: MetaBreakdownRow,
): void {
  const k = (key ?? "unknown").toString();
  const cur = map.get(k) ?? { dimension, key: k, impressions: 0, clicks: 0, spend: 0, leads: 0, reach: 0 };
  cur.impressions += intNum(row.impressions);
  cur.clicks += intNum(row.clicks);
  cur.spend += num(row.spend) ?? 0;
  cur.leads += leadsFromActions(row.actions);
  cur.reach += intNum(row.reach);
  map.set(k, cur);
}

/**
 * Fetch account-level demographic breakdowns for the window. Two Graph calls
 * (age+gender, publisher_platform+device). Best-effort: a failing breakdown
 * returns nothing for that dimension rather than throwing the whole pass.
 */
export async function fetchMetaAudience(
  connection: AdsConnection,
  mapping: AdsAccountMapping,
  since: Date,
  until: Date,
): Promise<NormalizedAudienceRow[]> {
  if (!mapping.adAccountId) return [];
  const timeRange = JSON.stringify({ since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) });
  const fields = "impressions,clicks,spend,reach,actions";
  const ages = new Map<string, NormalizedAudienceRow>();
  const genders = new Map<string, NormalizedAudienceRow>();
  const platforms = new Map<string, NormalizedAudienceRow>();
  const devices = new Map<string, NormalizedAudienceRow>();

  try {
    const r = await gGet<{ data?: MetaBreakdownRow[] }>(
      `/${mapping.adAccountId}/insights`,
      { level: "account", time_range: timeRange, breakdowns: "age,gender", fields, limit: "500" },
      connection.accessToken,
    );
    for (const row of r.data ?? []) {
      addInto(ages, "age", row.age, row);
      addInto(genders, "gender", row.gender, row);
    }
  } catch (e) {
    console.warn(`[meta-audience] age/gender failed for ${mapping.adAccountId}: ${String(e).slice(0, 160)}`);
  }

  try {
    const r = await gGet<{ data?: MetaBreakdownRow[] }>(
      `/${mapping.adAccountId}/insights`,
      { level: "account", time_range: timeRange, breakdowns: "publisher_platform,impression_device", fields, limit: "500" },
      connection.accessToken,
    );
    for (const row of r.data ?? []) {
      addInto(platforms, "publisher_platform", row.publisher_platform, row);
      addInto(devices, "device", row.impression_device, row);
    }
  } catch (e) {
    console.warn(`[meta-audience] platform/device failed for ${mapping.adAccountId}: ${String(e).slice(0, 160)}`);
  }

  return [
    ...ages.values(), ...genders.values(), ...platforms.values(), ...devices.values(),
  ];
}
