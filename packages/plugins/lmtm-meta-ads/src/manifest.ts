import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "lmtm-meta-ads";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listAdAccounts: "meta-list-ad-accounts",
  listCampaigns: "meta-list-campaigns",
  getCampaign: "meta-get-campaign",
  createCampaign: "meta-create-campaign",
  updateCampaign: "meta-update-campaign",
  listAdSets: "meta-list-adsets",
  listAds: "meta-list-ads",
  getInsights: "meta-get-insights",
  listPages: "meta-list-pages",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Meta Ads (LMTM)",
  description:
    "Read and write Facebook + Instagram ad campaigns, ad sets, and ads via the Meta Marketing API. Pull performance insights (spend, impressions, CTR, ROAS).",
  author: "LMTM",
  categories: ["connector"],
  capabilities: [
    "secrets.read-ref",
    "http.outbound",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      accessTokenSecretRef: {
        type: "string",
        title: "Meta access token (secret ref or env var name)",
        description:
          "Reference to the long-lived Meta system-user access token. The plugin also reads process.env[refName] as a fallback for Render-style env-var-only deployments.",
        default: "META_ACCESS_TOKEN",
      },
      apiVersion: {
        type: "string",
        title: "Graph API version",
        description: "Pin a specific Graph API version (e.g. v21.0). Defaults to v21.0.",
        default: "v21.0",
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.listAdAccounts,
      displayName: "Meta List Ad Accounts",
      description:
        "List the ad accounts the current Meta access token can access (act_adaccounts edge on the /me user). Call this first to get an ad account id (act_...) for the other tools.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.listCampaigns,
      displayName: "Meta List Campaigns",
      description:
        "List campaigns in an ad account. Supports filtering by status (ACTIVE, PAUSED, ARCHIVED) and date range via the time_range parameter.",
      parametersSchema: {
        type: "object",
        properties: {
          adAccountId: {
            type: "string",
            description: "Ad account id, with or without the act_ prefix (e.g. act_12345 or 12345).",
          },
          statusFilter: {
            type: "string",
            enum: ["ACTIVE", "PAUSED", "ARCHIVED", "all"],
            default: "ACTIVE",
            description: "Filter by campaign status. Default ACTIVE only.",
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 500,
            default: 100,
          },
        },
        required: ["adAccountId"],
      },
    },
    {
      name: TOOL_NAMES.getCampaign,
      displayName: "Meta Get Campaign",
      description: "Fetch a single campaign by id, with full configuration and current status.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: {
            type: "string",
            description: "Meta campaign id (numeric, without the act_ prefix).",
          },
        },
        required: ["campaignId"],
      },
    },
    {
      name: TOOL_NAMES.createCampaign,
      displayName: "Meta Create Campaign",
      description:
        "Create a new campaign in an ad account. Supports the three common objectives (OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_LEADS, OUTCOME_SALES) and a daily/lifetime budget.",
      parametersSchema: {
        type: "object",
        properties: {
          adAccountId: { type: "string" },
          name: { type: "string" },
          objective: {
            type: "string",
            enum: [
              "OUTCOME_AWARENESS",
              "OUTCOME_TRAFFIC",
              "OUTCOME_ENGAGEMENT",
              "OUTCOME_LEADS",
              "OUTCOME_SALES",
              "OUTCOME_APP_PROMOTION",
            ],
            default: "OUTCOME_TRAFFIC",
          },
          status: { type: "string", enum: ["ACTIVE", "PAUSED"], default: "PAUSED" },
          dailyBudgetCents: {
            type: "number",
            minimum: 100,
            description: "Daily budget in account currency CENTS (e.g. 5000 = $50.00).",
          },
          lifetimeBudgetCents: {
            type: "number",
            minimum: 100,
            description: "Lifetime budget in account currency CENTS. Set ONE of daily or lifetime.",
          },
          specialAdCategories: {
            type: "array",
            items: { type: "string" },
            description: 'Optional. e.g. ["HOUSING", "EMPLOYMENT", "CREDIT"].',
          },
        },
        required: ["adAccountId", "name"],
      },
    },
    {
      name: TOOL_NAMES.updateCampaign,
      displayName: "Meta Update Campaign",
      description: "Patch one or more fields on an existing campaign (name, status, budget). Only ACTIVE and PAUSED transitions are supported for status.",
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
    {
      name: TOOL_NAMES.listAdSets,
      displayName: "Meta List Ad Sets",
      description: "List ad sets in an ad account, optionally filtered by parent campaign id.",
      parametersSchema: {
        type: "object",
        properties: {
          adAccountId: { type: "string" },
          campaignId: {
            type: "string",
            description: "Optional. Restrict to a single campaign's ad sets.",
          },
          statusFilter: {
            type: "string",
            enum: ["ACTIVE", "PAUSED", "ARCHIVED", "all"],
            default: "ACTIVE",
          },
          limit: { type: "number", minimum: 1, maximum: 500, default: 100 },
        },
        required: ["adAccountId"],
      },
    },
    {
      name: TOOL_NAMES.listAds,
      displayName: "Meta List Ads",
      description: "List ads in an ad account, optionally filtered by parent ad set or campaign.",
      parametersSchema: {
        type: "object",
        properties: {
          adAccountId: { type: "string" },
          campaignId: { type: "string" },
          adSetId: { type: "string" },
          statusFilter: {
            type: "string",
            enum: ["ACTIVE", "PAUSED", "ARCHIVED", "all"],
            default: "ACTIVE",
          },
          limit: { type: "number", minimum: 1, maximum: 500, default: 100 },
        },
        required: ["adAccountId"],
      },
    },
    {
      name: TOOL_NAMES.getInsights,
      displayName: "Meta Get Insights",
      description:
        "Pull performance insights for a campaign, ad set, ad, or full account. Returns spend, impressions, clicks, CTR, CPC, CPM, conversions and ROAS broken down by day.",
      parametersSchema: {
        type: "object",
        properties: {
          adAccountId: { type: "string" },
          level: {
            type: "string",
            enum: ["account", "campaign", "adset", "ad"],
            default: "campaign",
          },
          objectId: {
            type: "string",
            description: "Campaign/ad set/ad id when level != account. For account level, pass the adAccountId here too.",
          },
          datePreset: {
            type: "string",
            enum: [
              "today",
              "yesterday",
              "last_7d",
              "last_14d",
              "last_30d",
              "last_90d",
              "this_month",
              "last_month",
              "this_quarter",
              "lifetime",
            ],
            default: "last_7d",
          },
          timeIncrement: {
            type: "string",
            enum: ["all_days", "daily", "monthly"],
            default: "daily",
          },
        },
        required: ["adAccountId"],
      },
    },
    {
      name: TOOL_NAMES.listPages,
      displayName: "Meta List Pages",
      description:
        "List Facebook Pages the current access token can use for organic posts / ad creatives. The first page is usually what you want for a brand account.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number", minimum: 1, maximum: 200, default: 50 },
        },
      },
    },
  ],
};

export default manifest;
