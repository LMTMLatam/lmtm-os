// LMTM-OS: Meta (Facebook + Instagram) Marketing API plugin worker.
// Wraps the Graph API v21.0 endpoints that the 14 LMTM-OS agents need
// for ad operations: list accounts, read/create/update campaigns, list
// ad sets + ads, and pull performance insights.
//
// Reference: https://developers.facebook.com/docs/marketing-apis
//
// Auth: the active per-company Meta OAuth access token. Resolved at
// call time via ctx.ads.resolveToken("meta", runContext.companyId),
// which reads from the unified ads_connections table (the legacy
// meta_connections export is an alias of this table). Tokens are
// created by the existing /api/ads/oauth/start OAuth flow.

import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./manifest.js";

const DEFAULT_GRAPH_VERSION = "v21.0";
const GRAPH = "https://graph.facebook.com";
const PAGE_LIMIT = 200;

type RunContextLike = {
  companyId: string;
  runId?: string;
  actorId?: string;
};

type ToolResult = {
  content: string;
  data?: Record<string, unknown>;
  error?: string;
};

class MetaApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

type ResolvedToken = {
  accessToken: string;
  label: string;
  tokenType: string;
  expiresAt: string | null;
  apiVersion: string;
  metadata: {
    developerToken: string | null;
    managerAccountId: string | null;
    appId: string | null;
    merchantId: string | null;
    tenantId: string | null;
  };
};

async function resolveToken(
  ctx: {
    config: { get(): Promise<Record<string, unknown>> };
    ads: {
      resolveToken(
        platform: "meta",
        companyId: string,
      ): Promise<{
        accessToken: string;
        label: string;
        tokenType: string;
        expiresAt: string | null;
        metadata: {
          developerToken: string | null;
          managerAccountId: string | null;
          appId: string | null;
          merchantId: string | null;
          tenantId: string | null;
        };
      } | null>;
    };
  },
  companyId: string,
): Promise<ResolvedToken> {
  const cfg = (await ctx.config.get()) as { apiVersion?: string };
  const tok = await ctx.ads.resolveToken("meta", companyId);
  if (!tok) {
    throw new Error(
      `No active Meta connection for company ${companyId}. Have an admin connect Meta via /api/ads/oauth/start?platform=meta&companyId=${companyId}.`,
    );
  }
  return {
    ...tok,
    apiVersion: cfg.apiVersion ?? DEFAULT_GRAPH_VERSION,
  };
}

function graphUrl(apiVersion: string, path: string): string {
  return `${GRAPH}/${apiVersion}${path}`;
}

async function graphFetch<T = unknown>(
  cfg: ResolvedToken,
  path: string,
  init?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, string | number | boolean | undefined | null | unknown[]>;
    jsonBody?: Record<string, unknown> | Array<unknown>;
  },
): Promise<T> {
  const url = new URL(graphUrl(cfg.apiVersion, path));
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === v?.valueOf?.() && v === null) continue;
      if (Array.isArray(v)) url.searchParams.set(k, JSON.stringify(v));
      else if (v === "") continue;
      else url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set("access_token", cfg.accessToken);

  const fetchInit: RequestInit = { method: init?.method ?? "GET" };
  const headers: Record<string, string> = {};
  if (init?.jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(init.jsonBody);
  }
  if (Object.keys(headers).length > 0) fetchInit.headers = headers;

  const r = await fetch(url.toString(), fetchInit);
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!r.ok) {
    const body = parsed as {
      error?: { message?: string; code?: number; type?: string; error_subcode?: number };
    } | null;
    const msg = body?.error?.message ?? text.slice(0, 300) ?? `HTTP ${r.status}`;
    throw new MetaApiError(r.status, body?.error?.code ? String(body.error.code) : null, msg);
  }
  return parsed as T;
}

function ok(value: unknown): ToolResult {
  return {
    content: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    data: value && typeof value === "object" ? (value as Record<string, unknown>) : undefined,
  };
}

function err(message: string): ToolResult {
  return { content: `Error: ${message}`, error: message };
}

function normalizeAccount(a: {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  business_name?: string;
}) {
  return {
    id: a.id,
    name: a.name ?? null,
    accountId: a.id.startsWith("act_") ? a.id : `act_${a.id}`,
    status: a.account_status ?? null,
    currency: a.currency ?? null,
    timezone: a.timezone_name ?? null,
    business: a.business_name ?? null,
  };
}

function normalizeCampaign(c: {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  special_ad_categories?: string[];
  created_time?: string;
  updated_time?: string;
}) {
  return {
    id: c.id,
    name: c.name ?? null,
    status: c.status ?? null,
    objective: c.objective ?? null,
    dailyBudgetCents: c.daily_budget ? Number(c.daily_budget) : null,
    lifetimeBudgetCents: c.lifetime_budget ? Number(c.lifetime_budget) : null,
    startTime: c.start_time ?? null,
    stopTime: c.stop_time ?? null,
    specialAdCategories: c.special_ad_categories ?? [],
    createdTime: c.created_time ?? null,
    updatedTime: c.updated_time ?? null,
  };
}

function normalizeAdSet(s: {
  id: string;
  name?: string;
  campaign_id?: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  targeting?: Record<string, unknown>;
}) {
  return {
    id: s.id,
    name: s.name ?? null,
    campaignId: s.campaign_id ?? null,
    status: s.status ?? null,
    dailyBudgetCents: s.daily_budget ? Number(s.daily_budget) : null,
    lifetimeBudgetCents: s.lifetime_budget ? Number(s.lifetime_budget) : null,
    optimizationGoal: s.optimization_goal ?? null,
    billingEvent: s.billing_event ?? null,
    targeting: s.targeting ?? null,
  };
}

function normalizeAd(a: {
  id: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: string;
  creative?: { id?: string; title?: string; body?: string; image_url?: string };
  created_time?: string;
  updated_time?: string;
}) {
  return {
    id: a.id,
    name: a.name ?? null,
    adSetId: a.adset_id ?? null,
    campaignId: a.campaign_id ?? null,
    status: a.status ?? null,
    creative: a.creative
      ? {
          id: a.creative.id ?? null,
          title: a.creative.title ?? null,
          body: a.creative.body ?? null,
          imageUrl: a.creative.image_url ?? null,
        }
      : null,
    createdTime: a.created_time ?? null,
    updatedTime: a.updated_time ?? null,
  };
}

function normalizeInsightRow(row: {
  date_start?: string;
  date_stop?: string;
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  conversions?: string;
  purchase_roas?: Array<{ action_type?: string; value?: string }>;
  actions?: Array<{ action_type?: string; value?: string }>;
}) {
  const purchaseValue = row.purchase_roas?.find(
    (r) => r.action_type === "omni_purchase" || r.action_type === "purchase",
  )?.value;
  return {
    dateStart: row.date_start ?? null,
    dateStop: row.date_stop ?? null,
    accountId: row.account_id ?? null,
    campaignId: row.campaign_id ?? null,
    adSetId: row.adset_id ?? null,
    adId: row.ad_id ?? null,
    spend: row.spend ? Number(row.spend) : 0,
    impressions: row.impressions ? Number(row.impressions) : 0,
    clicks: row.clicks ? Number(row.clicks) : 0,
    ctr: row.ctr ? Number(row.ctr) : 0,
    cpc: row.cpc ? Number(row.cpc) : 0,
    cpm: row.cpm ? Number(row.cpm) : 0,
    reach: row.reach ? Number(row.reach) : 0,
    frequency: row.frequency ? Number(row.frequency) : 0,
    conversions: row.conversions ? Number(row.conversions) : 0,
    purchaseRoas: purchaseValue ? Number(purchaseValue) : null,
  };
}

function ensureActPrefix(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

// ── Plugin ─────────────────────────────────────────────────────────────

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} v${PLUGIN_VERSION} starting`);

    const getToken = async (run: RunContextLike): Promise<ResolvedToken> => {
      if (!run?.companyId) {
        throw new Error("Run context missing companyId; cannot resolve Meta token.");
      }
      return resolveToken(
        {
          config: ctx.config,
          ads: ctx.ads,
        },
        run.companyId,
      );
    };

    // ── list_ad_accounts ─────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listAdAccounts,
      {
        displayName: "Meta List Ad Accounts",
        description:
          "Discover the ad accounts the current access token can access. Call this first to get an act_... id for the other tools.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const data = await graphFetch<{
            data: Parameters<typeof normalizeAccount>[0][];
          }>(cfg, "/me/adaccounts", {
            query: {
              fields: "id,name,account_status,currency,timezone_name,business_name",
              limit: PAGE_LIMIT,
            },
          });
          return ok({
            count: data.data?.length ?? 0,
            accounts: (data.data ?? []).map(normalizeAccount),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_campaigns ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listCampaigns,
      {
        displayName: "Meta List Campaigns",
        description: "List campaigns in an ad account, filtered by status.",
        parametersSchema: {
          type: "object",
          properties: {
            adAccountId: { type: "string" },
            statusFilter: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED", "all"] },
            limit: { type: "number" },
          },
          required: ["adAccountId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            adAccountId: string;
            statusFilter?: "ACTIVE" | "PAUSED" | "ARCHIVED" | "all";
            limit?: number;
          };
          const filtering: Array<{ field: string; operator: string; value: string }> = [];
          if (p.statusFilter && p.statusFilter !== "all") {
            filtering.push({ field: "status", operator: "EQUAL", value: p.statusFilter });
          }
          const data = await graphFetch<{
            data: Parameters<typeof normalizeCampaign>[0][];
          }>(cfg, `/${ensureActPrefix(p.adAccountId)}/campaigns`, {
            query: {
              fields:
                "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,special_ad_categories,created_time,updated_time",
              limit: p.limit ?? 100,
              filtering: filtering.length > 0 ? filtering : undefined,
            },
          });
          return ok({
            count: data.data?.length ?? 0,
            campaigns: (data.data ?? []).map(normalizeCampaign),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── get_campaign ─────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.getCampaign,
      {
        displayName: "Meta Get Campaign",
        description: "Fetch one campaign by id with full config and current status.",
        parametersSchema: {
          type: "object",
          properties: { campaignId: { type: "string" } },
          required: ["campaignId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as { campaignId: string };
          const data = await graphFetch<Parameters<typeof normalizeCampaign>[0]>(
            cfg,
            `/${p.campaignId}`,
            {
              query: {
                fields:
                  "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,special_ad_categories,created_time,updated_time",
              },
            },
          );
          return ok(normalizeCampaign(data));
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── create_campaign ──────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.createCampaign,
      {
        displayName: "Meta Create Campaign",
        description:
          "Create a new campaign in an ad account. Created in PAUSED by default to let you review before flipping to ACTIVE.",
        parametersSchema: {
          type: "object",
          properties: {
            adAccountId: { type: "string" },
            name: { type: "string" },
            objective: { type: "string" },
            status: { type: "string" },
            dailyBudgetCents: { type: "number" },
            lifetimeBudgetCents: { type: "number" },
            specialAdCategories: { type: "array", items: { type: "string" } },
          },
          required: ["adAccountId", "name"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            adAccountId: string;
            name: string;
            objective?: string;
            status?: "ACTIVE" | "PAUSED";
            dailyBudgetCents?: number;
            lifetimeBudgetCents?: number;
            specialAdCategories?: string[];
          };
          if (!p.dailyBudgetCents && !p.lifetimeBudgetCents) {
            return err("Must supply either dailyBudgetCents or lifetimeBudgetCents");
          }
          const body: Record<string, unknown> = {
            name: p.name,
            objective: p.objective ?? "OUTCOME_TRAFFIC",
            status: p.status ?? "PAUSED",
            special_ad_categories: p.specialAdCategories ?? [],
          };
          if (p.dailyBudgetCents) body.daily_budget = p.dailyBudgetCents;
          if (p.lifetimeBudgetCents) body.lifetime_budget = p.lifetimeBudgetCents;
          const data = await graphFetch<{ id: string }>(
            cfg,
            `/${ensureActPrefix(p.adAccountId)}/campaigns`,
            { method: "POST", jsonBody: body },
          );
          return ok({ id: data.id, created: true });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── update_campaign ──────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.updateCampaign,
      {
        displayName: "Meta Update Campaign",
        description: "Patch one or more fields on a campaign. Status must be ACTIVE or PAUSED transitions; ARCHIVED is final.",
        parametersSchema: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            name: { type: "string" },
            status: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED"] },
            dailyBudgetCents: { type: "number" },
            lifetimeBudgetCents: { type: "number" },
          },
          required: ["campaignId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            campaignId: string;
            name?: string;
            status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
            dailyBudgetCents?: number;
            lifetimeBudgetCents?: number;
          };
          const update: Record<string, unknown> = {};
          if (p.name !== undefined) update.name = p.name;
          if (p.status !== undefined) update.status = p.status;
          if (p.dailyBudgetCents !== undefined) update.daily_budget = p.dailyBudgetCents;
          if (p.lifetimeBudgetCents !== undefined) update.lifetime_budget = p.lifetimeBudgetCents;
          if (Object.keys(update).length === 0) {
            return err("No fields to update");
          }
          const data = await graphFetch<{ success: boolean }>(
            cfg,
            `/${p.campaignId}`,
            { method: "POST", jsonBody: update },
          );
          return ok({ success: data.success === true, updated: Object.keys(update) });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_adsets ──────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listAdSets,
      {
        displayName: "Meta List Ad Sets",
        description: "List ad sets in an ad account, optionally scoped to a single campaign.",
        parametersSchema: {
          type: "object",
          properties: {
            adAccountId: { type: "string" },
            campaignId: { type: "string" },
            statusFilter: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED", "all"] },
            limit: { type: "number" },
          },
          required: ["adAccountId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            adAccountId: string;
            campaignId?: string;
            statusFilter?: "ACTIVE" | "PAUSED" | "ARCHIVED" | "all";
            limit?: number;
          };
          const filtering: Array<{ field: string; operator: string; value: string }> = [];
          // Filter by `effective_status` (runtime state) rather than
          // `status` (config state) — otherwise scheduled PAUSE/UNPAUSE
          // show up under the wrong bucket. Default ("ACTIVE" / null)
          // excludes DELETED + ARCHIVED which are noise for dashboards.
          if (p.statusFilter && p.statusFilter !== "all") {
            filtering.push({ field: "effective_status", operator: "EQUAL", value: p.statusFilter });
          } else if (!p.statusFilter) {
            // No filter requested → exclude DELETED/ARCHIVED by default.
            // Callers that want everything pass statusFilter="all".
            filtering.push({ field: "effective_status", operator: "NOT_IN", value: ["DELETED", "ARCHIVED"] });
          }
          if (p.campaignId) {
            filtering.push({ field: "campaign_id", operator: "EQUAL", value: p.campaignId });
          }
          const data = await graphFetch<{
            data: Parameters<typeof normalizeAdSet>[0][];
          }>(
            cfg,
            `/${ensureActPrefix(p.adAccountId)}/adsets`,
            {
              query: {
                fields:
                  "id,name,campaign_id,effective_status,status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting",
                limit: p.limit ?? 200,
                filtering: filtering.length > 0 ? filtering : undefined,
              },
            },
          );
          return ok({
            count: data.data?.length ?? 0,
            adSets: (data.data ?? []).map(normalizeAdSet),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_ads ─────────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listAds,
      {
        displayName: "Meta List Ads",
        description: "List ads in an ad account, optionally scoped to a campaign or ad set.",
        parametersSchema: {
          type: "object",
          properties: {
            adAccountId: { type: "string" },
            campaignId: { type: "string" },
            adSetId: { type: "string" },
            statusFilter: { type: "string", enum: ["ACTIVE", "PAUSED", "ARCHIVED", "all"] },
            limit: { type: "number" },
          },
          required: ["adAccountId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            adAccountId: string;
            campaignId?: string;
            adSetId?: string;
            statusFilter?: "ACTIVE" | "PAUSED" | "ARCHIVED" | "all";
            limit?: number;
          };
          const filtering: Array<{ field: string; operator: string; value: string }> = [];
          if (p.statusFilter && p.statusFilter !== "all") {
            filtering.push({ field: "status", operator: "EQUAL", value: p.statusFilter });
          }
          if (p.campaignId) {
            filtering.push({ field: "campaign_id", operator: "EQUAL", value: p.campaignId });
          }
          if (p.adSetId) {
            filtering.push({ field: "adset_id", operator: "EQUAL", value: p.adSetId });
          }
          const data = await graphFetch<{
            data: Parameters<typeof normalizeAd>[0][];
          }>(
            cfg,
            `/${ensureActPrefix(p.adAccountId)}/ads`,
            {
              query: {
                fields:
                  "id,name,adset_id,campaign_id,status,creative{id,title,body,image_url},created_time,updated_time",
                limit: p.limit ?? 100,
                filtering: filtering.length > 0 ? filtering : undefined,
              },
            },
          );
          return ok({
            count: data.data?.length ?? 0,
            ads: (data.data ?? []).map(normalizeAd),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── get_insights ─────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.getInsights,
      {
        displayName: "Meta Get Insights",
        description:
          "Pull performance insights (spend, impressions, clicks, CTR, CPC, CPM, conversions, ROAS) broken down by day for the requested level.",
        parametersSchema: {
          type: "object",
          properties: {
            adAccountId: { type: "string" },
            level: { type: "string", enum: ["account", "campaign", "adset", "ad"] },
            objectId: { type: "string" },
            datePreset: { type: "string" },
            timeIncrement: { type: "string", enum: ["all_days", "daily", "monthly"] },
          },
          required: ["adAccountId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            adAccountId: string;
            level?: "account" | "campaign" | "adset" | "ad";
            objectId?: string;
            datePreset?: string;
            timeIncrement?: "all_days" | "daily" | "monthly";
          };
          const level = p.level ?? "campaign";
          const idPath =
            level === "account"
              ? ensureActPrefix(p.adAccountId)
              : p.objectId
                ? p.objectId
                : ensureActPrefix(p.adAccountId);
          const data = await graphFetch<{
            data: Parameters<typeof normalizeInsightRow>[0][];
          }>(cfg, `/${idPath}/insights`, {
            query: {
              fields: [
                "date_start",
                "date_stop",
                "account_id",
                "campaign_id",
                "adset_id",
                "ad_id",
                "spend",
                "impressions",
                "clicks",
                "ctr",
                "cpc",
                "cpm",
                "reach",
                "frequency",
                "conversions",
                "purchase_roas",
              ].join(","),
              level,
              date_preset: p.datePreset ?? "last_7d",
              time_increment: p.timeIncrement ?? "daily",
              limit: PAGE_LIMIT,
            },
          });
          const rows = (data.data ?? []).map(normalizeInsightRow);
          const totals = rows.reduce(
            (acc, r) => {
              acc.spend += r.spend;
              acc.impressions += r.impressions;
              acc.clicks += r.clicks;
              acc.conversions += r.conversions;
              return acc;
            },
            { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
          );
          return ok({
            count: rows.length,
            level,
            totals,
            rows,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_pages ───────────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listPages,
      {
        displayName: "Meta List Pages",
        description:
          "List Facebook Pages the access token can act on. The first one is usually the brand page for organic posts / ad creatives.",
        parametersSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as { limit?: number };
          const data = await graphFetch<{
            data: Array<{ id: string; name: string; access_token?: string; category?: string; fan_count?: number }>;
          }>(cfg, "/me/accounts", {
            query: {
              fields: "id,name,category,fan_count,access_token",
              limit: p.limit ?? 50,
            },
          });
          // NOTE: do NOT return page access tokens to the model by default.
          return ok({
            count: data.data?.length ?? 0,
            pages: (data.data ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category ?? null,
              fanCount: p.fan_count ?? null,
              hasPageToken: Boolean(p.access_token),
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
