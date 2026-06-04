// LMTM-OS: Google Ads plugin worker.
//
// Wraps the Google Ads REST API v17 endpoints the 14 LMTM-OS agents need
// for ad operations: list accessible customers, read/create/update
// campaigns, list ad groups, pull performance insights, and run raw GAQL
// queries for advanced reads.
//
// Reference: https://developers.google.com/google-ads/api/rest/overview
//
// Auth: per-company OAuth access token (short-lived) + the agency's
// `developer_token` (per-MCC) + optional `manager_account_id` for
// `login-customer-id`. All three are resolved at call time via
// `ctx.ads.resolveToken("google", runContext.companyId)`, which returns
// the unified `ads_connections` row for the platform. Tokens are never
// cached across requests and are scoped to the requesting company.

import { definePlugin, runWorker, type PluginAdsClient, type PluginConfigClient } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./manifest.js";

const DEFAULT_API_VERSION = "v17";
const ADS_API = "https://googleads.googleapis.com";

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

class GoogleAdsApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

type ResolvedToken = {
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
  apiVersion: string;
};

async function resolveToken(
  config: PluginConfigClient,
  ads: PluginAdsClient,
  companyId: string,
): Promise<ResolvedToken> {
  const cfg = (await config.get()) as { apiVersion?: string };
  const tok = await ads.resolveToken("google", companyId);
  if (!tok) {
    throw new Error(
      `No active Google Ads connection for company ${companyId}. Have an admin connect Google Ads via /api/ads/oauth/start?platform=google&companyId=${companyId}.`,
    );
  }
  if (!tok.metadata.developerToken) {
    throw new Error(
      `Google Ads connection for company ${companyId} is missing a developer_token. Re-authorize and include the developer token.`,
    );
  }
  return {
    ...tok,
    apiVersion: cfg.apiVersion ?? DEFAULT_API_VERSION,
  };
}

function adsUrl(apiVersion: string, path: string): string {
  return `${ADS_API}/${apiVersion}${path}`;
}

function normalizeCustomerId(id: string): string {
  return id.replace(/[-\s]/g, "");
}

function authHeaders(cfg: ResolvedToken): Record<string, string> {
  if (!cfg.metadata.developerToken) {
    throw new Error("Google Ads request requires a developer_token on the connection");
  }
  const h: Record<string, string> = {
    Authorization: `Bearer ${cfg.accessToken}`,
    "developer-token": cfg.metadata.developerToken,
  };
  if (cfg.metadata.managerAccountId) {
    h["login-customer-id"] = normalizeCustomerId(cfg.metadata.managerAccountId);
  }
  return h;
}

async function adsFetch<T = unknown>(
  cfg: ResolvedToken,
  path: string,
  init?: {
    method?: "GET" | "POST";
    body?: Record<string, unknown> | Array<unknown>;
  },
): Promise<T> {
  const url = adsUrl(cfg.apiVersion, path);
  const fetchInit: RequestInit = { method: init?.method ?? "GET" };
  const headers = authHeaders(cfg);
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(init.body);
  }
  fetchInit.headers = headers;

  const r = await fetch(url, fetchInit);
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!r.ok) {
    const body = parsed as {
      error?: {
        message?: string;
        code?: number | string;
        status?: string;
        details?: Array<{ message?: string; errorCode?: { requestError?: string } }>;
      };
    } | null;
    const detailMsg = body?.error?.details
      ?.map((d) => d.message ?? d.errorCode?.requestError ?? "")
      .filter(Boolean)
      .join(" | ");
    const msg =
      body?.error?.message ??
      detailMsg ??
      text.slice(0, 300) ??
      `HTTP ${r.status}`;
    throw new GoogleAdsApiError(
      r.status,
      body?.error?.code != null ? String(body.error.code) : null,
      msg,
    );
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

type GaqlRow = Record<string, unknown>;
type GaqlResponse = { results?: GaqlRow[]; nextPageToken?: string; totalResultsCount?: number };

async function searchStream(
  cfg: ResolvedToken,
  customerId: string,
  query: string,
  limit: number,
): Promise<GaqlRow[]> {
  const cid = normalizeCustomerId(customerId);
  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;
  while (rows.length < limit) {
    const remaining = limit - rows.length;
    const body: Record<string, unknown> = { query, pageSize: Math.min(remaining, 10000) };
    if (pageToken) body.pageToken = pageToken;
    const data = await adsFetch<GaqlResponse>(
      cfg,
      `/customers/${cid}/googleAds:search`,
      { method: "POST", body },
    );
    if (data.results) rows.push(...data.results);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return rows;
}

function pick<T = string>(row: GaqlRow, key: string): T | null {
  const v = row[key];
  return v == null ? null : (v as T);
}

function pickMicros(row: GaqlRow, key: string): number | null {
  const v = row[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeCampaign(row: GaqlRow) {
  return {
    id: String(pick(row, "campaign.id") ?? ""),
    name: pick(row, "campaign.name"),
    status: pick(row, "campaign.status"),
    channelType: pick(row, "campaign.advertisingChannelType"),
    channelSubType: pick(row, "campaign.advertisingChannelSubType"),
    startDate: pick(row, "campaign.startDate"),
    endDate: pick(row, "campaign.endDate"),
    servingStatus: pick(row, "campaign.servingStatus"),
  };
}

function normalizeAdGroup(row: GaqlRow) {
  return {
    id: String(pick(row, "adGroup.id") ?? ""),
    name: pick(row, "adGroup.name"),
    status: pick(row, "adGroup.status"),
    campaignId: String(pick(row, "adGroup.campaign") ?? ""),
    type: pick(row, "adGroup.type"),
    cpcBidMicros: pickMicros(row, "adGroup.cpcBidMicros"),
  };
}

function normalizeMetricRow(row: GaqlRow) {
  const cost = pickMicros(row, "metrics.costMicros") ?? 0;
  const conversions = pickMicros(row, "metrics.conversions") ?? 0;
  const conversionsValue = pickMicros(row, "metrics.conversionsValue") ?? 0;
  return {
    date: pick(row, "segments.date"),
    customerId: String(pick(row, "customer.id") ?? ""),
    campaignId: String(pick(row, "campaign.id") ?? ""),
    adGroupId: String(pick(row, "adGroup.id") ?? ""),
    adId: String(pick(row, "adGroupAd.ad.id") ?? ""),
    impressions: pickMicros(row, "metrics.impressions") ?? 0,
    clicks: pickMicros(row, "metrics.clicks") ?? 0,
    ctr: pickMicros(row, "metrics.ctr") ?? 0,
    averageCpc: pickMicros(row, "metrics.averageCpc") ?? 0,
    costMicros: cost,
    conversions,
    conversionsValue,
    costPerConversion: pickMicros(row, "metrics.costPerConversion") ?? 0,
    conversionRate: pickMicros(row, "metrics.conversionRate") ?? 0,
  };
}

function aggregateMetrics(rows: ReturnType<typeof normalizeMetricRow>[]) {
  const totals = rows.reduce(
    (acc, r) => {
      acc.costMicros += r.costMicros;
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.conversions += r.conversions;
      acc.conversionsValue += r.conversionsValue;
      return acc;
    },
    { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 },
  );
  return {
    ...totals,
    cost: totals.costMicros / 1_000_000,
    ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
    averageCpc: totals.clicks > 0 ? totals.costMicros / totals.clicks : 0,
    costPerConversion: totals.conversions > 0 ? totals.costMicros / totals.conversions : 0,
  };
}

// ── Plugin ─────────────────────────────────────────────────────────────

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} v${PLUGIN_VERSION} starting`);

    const getToken = async (run: RunContextLike): Promise<ResolvedToken> => {
      if (!run?.companyId) {
        throw new Error("Run context missing companyId; cannot resolve Google Ads token.");
      }
      return resolveToken(ctx.config, ctx.ads, run.companyId);
    };

    // ── list_accounts ──────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listAccounts,
      {
        displayName: "Google List Accessible Accounts",
        description:
          "List the Google Ads customer accounts the current OAuth user can access. Use this first to find a customerId for the other tools.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const data = await adsFetch<{ resourceNames?: string[] }>(
            cfg,
            "/customers:listAccessibleCustomers",
          );
          const customers = (data.resourceNames ?? [])
            .map((rn) => {
              const m = rn.match(/^customers\/(\d+)$/);
              return m ? m[1] : null;
            })
            .filter((x): x is string => Boolean(x));
          return ok({ count: customers.length, customerIds: customers });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_campaigns ─────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listCampaigns,
      {
        displayName: "Google List Campaigns",
        description: "List campaigns in a Google Ads customer, filtered by status.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            statusFilter: { type: "string", enum: ["ENABLED", "PAUSED", "REMOVED", "all"] },
            limit: { type: "number" },
          },
          required: ["customerId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            customerId: string;
            statusFilter?: "ENABLED" | "PAUSED" | "REMOVED" | "all";
            limit?: number;
          };
          const limit = p.limit ?? 100;
          const statusClause =
            p.statusFilter && p.statusFilter !== "all"
              ? ` AND campaign.status = '${p.statusFilter}'`
              : "";
          const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertisingChannelType, campaign.advertisingChannelSubType, campaign.startDate, campaign.endDate, campaign.servingStatus FROM campaign WHERE campaign.status IN ('ENABLED','PAUSED','REMOVED')${statusClause} ORDER BY campaign.id`;
          const rows = await searchStream(cfg, p.customerId, query, limit);
          return ok({
            count: rows.length,
            campaigns: rows.map(normalizeCampaign),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── get_campaign ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.getCampaign,
      {
        displayName: "Google Get Campaign",
        description: "Fetch a single campaign with full configuration.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            campaignId: { type: "string" },
          },
          required: ["customerId", "campaignId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as { customerId: string; campaignId: string };
          const cid = normalizeCustomerId(p.customerId);
          const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertisingChannelType, campaign.advertisingChannelSubType, campaign.startDate, campaign.endDate, campaign.servingStatus, campaign.manualCpc, campaign.targetCpa FROM campaign WHERE campaign.resource_name = 'customers/${cid}/campaigns/${p.campaignId}'`;
          const rows = await searchStream(cfg, cid, query, 1);
          if (rows.length === 0) {
            return err(`Campaign ${p.campaignId} not found in customer ${cid}`);
          }
          return ok(normalizeCampaign(rows[0]));
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── create_campaign ────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.createCampaign,
      {
        displayName: "Google Create Campaign",
        description:
          "Create a new Search campaign with a daily budget. Returns the new campaign id and budget id.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            name: { type: "string" },
            dailyBudgetMicros: { type: "number" },
            status: { type: "string", enum: ["ENABLED", "PAUSED"] },
          },
          required: ["customerId", "name", "dailyBudgetMicros"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            customerId: string;
            name: string;
            dailyBudgetMicros: number;
            status?: "ENABLED" | "PAUSED";
          };
          const cid = normalizeCustomerId(p.customerId);
          const data = await adsFetch<{ results?: GaqlRow[] }>(
            cfg,
            `/customers/${cid}/campaignBudgets:mutate`,
            {
              method: "POST",
              body: {
                operations: [
                  {
                    create: {
                      name: `${p.name} budget`,
                      amountMicros: String(p.dailyBudgetMicros),
                      deliveryMethod: "STANDARD",
                    },
                  },
                ],
              },
            },
          );
          const budgetResourceName = data.results?.[0]?.resourceName as string | undefined;
          if (!budgetResourceName) {
            return err("Failed to create campaign budget: no resourceName in response");
          }
          const campaignData = await adsFetch<{ results?: GaqlRow[] }>(
            cfg,
            `/customers/${cid}/campaigns:mutate`,
            {
              method: "POST",
              body: {
                operations: [
                  {
                    create: {
                      name: p.name,
                      advertisingChannelType: "SEARCH",
                      status: p.status ?? "PAUSED",
                      campaignBudget: budgetResourceName,
                    },
                  },
                ],
              },
            },
          );
          const campaignResourceName = campaignData.results?.[0]?.resourceName as
            | string
            | undefined;
          if (!campaignResourceName) {
            return err("Campaign created but no resourceName in response");
          }
          const m = campaignResourceName.match(/\/campaigns\/(\d+)$/);
          return ok({
            created: true,
            campaignId: m ? m[1] : null,
            resourceName: campaignResourceName,
            budgetResourceName,
            status: p.status ?? "PAUSED",
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── update_campaign_status ─────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.updateCampaignStatus,
      {
        displayName: "Google Update Campaign Status",
        description: "Change a campaign's status to ENABLED or PAUSED.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            campaignId: { type: "string" },
            status: { type: "string", enum: ["ENABLED", "PAUSED"] },
          },
          required: ["customerId", "campaignId", "status"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            customerId: string;
            campaignId: string;
            status: "ENABLED" | "PAUSED";
          };
          const cid = normalizeCustomerId(p.customerId);
          const resourceName = `customers/${cid}/campaigns/${p.campaignId}`;
          const data = await adsFetch<{ results?: GaqlRow[] }>(
            cfg,
            `/customers/${cid}/campaigns:mutate`,
            {
              method: "POST",
              body: {
                operations: [
                  {
                    update: {
                      resourceName,
                      status: p.status,
                    },
                    updateMask: "status",
                  },
                ],
              },
            },
          );
          return ok({
            updated: true,
            resourceName,
            newStatus: p.status,
            result: data.results?.[0] ?? null,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── list_ad_groups ─────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.listAdGroups,
      {
        displayName: "Google List Ad Groups",
        description: "List ad groups in a customer, optionally scoped to a campaign.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            campaignId: { type: "string" },
            statusFilter: { type: "string", enum: ["ENABLED", "PAUSED", "REMOVED", "all"] },
            limit: { type: "number" },
          },
          required: ["customerId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            customerId: string;
            campaignId?: string;
            statusFilter?: "ENABLED" | "PAUSED" | "REMOVED" | "all";
            limit?: number;
          };
          const limit = p.limit ?? 100;
          const clauses: string[] = [];
          if (p.statusFilter && p.statusFilter !== "all") {
            clauses.push(`ad_group.status = '${p.statusFilter}'`);
          }
          if (p.campaignId) {
            const cid = normalizeCustomerId(p.customerId);
            clauses.push(
              `ad_group.campaign = 'customers/${cid}/campaigns/${p.campaignId}'`,
            );
          }
          const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
          const query = `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.campaign, ad_group.type, ad_group.cpc_bid_micros FROM ad_group ${where} ORDER BY ad_group.id`;
          const rows = await searchStream(cfg, p.customerId, query, limit);
          return ok({
            count: rows.length,
            adGroups: rows.map(normalizeAdGroup),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── get_insights ───────────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.getInsights,
      {
        displayName: "Google Get Insights",
        description:
          "Pull daily performance metrics (spend, impressions, clicks, CTR, conversions, cost_per_conversion) for a customer, campaign, ad group, or ad.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            level: { type: "string", enum: ["customer", "campaign", "ad_group", "ad"] },
            resourceId: { type: "string" },
            datePreset: { type: "string" },
          },
          required: ["customerId"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            customerId: string;
            level?: "customer" | "campaign" | "ad_group" | "ad";
            resourceId?: string;
            datePreset?: string;
          };
          const level = p.level ?? "campaign";
          const datePreset = p.datePreset ?? "LAST_7_DAYS";
          const cid = normalizeCustomerId(p.customerId);
          const selectFields = [
            "segments.date",
            "metrics.cost_micros",
            "metrics.impressions",
            "metrics.clicks",
            "metrics.ctr",
            "metrics.average_cpc",
            "metrics.conversions",
            "metrics.conversions_value",
            "metrics.cost_per_conversion",
            "metrics.conversion_rate",
          ];
          if (level !== "customer") selectFields.push("customer.id");
          if (level === "campaign" || level === "ad_group" || level === "ad") {
            selectFields.push("campaign.id");
          }
          if (level === "ad_group" || level === "ad") {
            selectFields.push("ad_group.id");
          }
          if (level === "ad") {
            selectFields.push("ad_group_ad.ad.id");
          }
          const clauses: string[] = [`segments.date DURING ${datePreset}`];
          if (level === "campaign" && p.resourceId) {
            clauses.push(`campaign.resource_name = 'customers/${cid}/campaigns/${p.resourceId}'`);
          } else if (level === "ad_group" && p.resourceId) {
            clauses.push(`ad_group.resource_name = 'customers/${cid}/adGroups/${p.resourceId}'`);
          } else if (level === "ad" && p.resourceId) {
            clauses.push(
              `ad_group_ad.resource_name = 'customers/${cid}/adGroupAds/${p.resourceId}'`,
            );
          }
          const query = `SELECT ${selectFields.join(", ")} FROM ${level} WHERE ${clauses.join(" AND ")} ORDER BY segments.date`;
          const rows = await searchStream(cfg, cid, query, 5000);
          const normalized = rows.map(normalizeMetricRow);
          const totals = aggregateMetrics(normalized);
          return ok({
            level,
            datePreset,
            count: normalized.length,
            totals,
            rows: normalized,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );

    // ── search (raw GAQL) ──────────────────────────────────────────
    ctx.tools.register(
      TOOL_NAMES.search,
      {
        displayName: "Google GAQL Search",
        description:
          "Run a raw GAQL SELECT query. Use for advanced reads not covered by the other tools. Mutate operations are NOT allowed.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["customerId", "query"],
        },
      },
      async (params, run): Promise<ToolResult> => {
        try {
          const cfg = await getToken(run);
          const p = params as {
            customerId: string;
            query: string;
            limit?: number;
          };
          const trimmed = p.query.trim();
          if (!/^select\b/i.test(trimmed)) {
            return err("GAQL search only accepts SELECT queries (no mutate / create / update)");
          }
          if (/\b(mutate|create|update|delete)\b/i.test(trimmed)) {
            return err("GAQL search does not allow mutate/create/update/delete keywords");
          }
          const limit = p.limit ?? 1000;
          const rows = await searchStream(cfg, p.customerId, trimmed, limit);
          return ok({
            count: rows.length,
            rows,
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
