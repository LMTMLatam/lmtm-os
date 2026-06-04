import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "lmtm-google-ads";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listAccounts: "google-list-accounts",
  listCampaigns: "google-list-campaigns",
  getCampaign: "google-get-campaign",
  createCampaign: "google-create-campaign",
  updateCampaignStatus: "google-update-campaign-status",
  listAdGroups: "google-list-ad-groups",
  getInsights: "google-get-insights",
  search: "google-search",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Google Ads (LMTM)",
  description:
    "Read and write Google Ads campaigns, ad groups, and pull performance insights (spend, impressions, CTR, conversions) via the Google Ads REST API v17.",
  author: "LMTM",
  categories: ["connector"],
  capabilities: [
    "ads.token.resolve",
    "http.outbound",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      apiVersion: {
        type: "string",
        title: "Google Ads API version",
        description: "Pin a specific Google Ads API version (e.g. v17). Defaults to v17.",
        default: "v17",
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.listAccounts,
      displayName: "Google List Accessible Accounts",
      description:
        "Discover the Google Ads customer accounts the current OAuth user can access. Call this first to get a customer id for the other tools.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.listCampaigns,
      displayName: "Google List Campaigns",
      description:
        "List campaigns in a Google Ads customer account. Filter by status (ENABLED, PAUSED, REMOVED) and limit results.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "Google Ads customer id (10 digits, no dashes).",
          },
          statusFilter: {
            type: "string",
            enum: ["ENABLED", "PAUSED", "REMOVED", "all"],
            default: "ENABLED",
          },
          limit: { type: "number", minimum: 1, maximum: 1000, default: 100 },
        },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.getCampaign,
      displayName: "Google Get Campaign",
      description: "Fetch a single campaign by id with full configuration and current status.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          campaignId: { type: "string" },
        },
        required: ["customerId", "campaignId"],
      },
    },
    {
      name: TOOL_NAMES.createCampaign,
      displayName: "Google Create Campaign",
      description:
        "Create a new Search campaign with a daily budget. Created in PAUSED by default so you can review before flipping to ENABLED.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          name: { type: "string" },
          dailyBudgetMicros: {
            type: "number",
            minimum: 1000,
            description: "Daily budget in account currency MICROS (e.g. 50000000 = $50.00).",
          },
          status: { type: "string", enum: ["ENABLED", "PAUSED"], default: "PAUSED" },
        },
        required: ["customerId", "name", "dailyBudgetMicros"],
      },
    },
    {
      name: TOOL_NAMES.updateCampaignStatus,
      displayName: "Google Update Campaign Status",
      description:
        "Change a campaign's status to ENABLED or PAUSED. REMOVED is permanent and not supported here.",
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
    {
      name: TOOL_NAMES.listAdGroups,
      displayName: "Google List Ad Groups",
      description: "List ad groups in a customer, optionally scoped to a single campaign.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          campaignId: { type: "string" },
          statusFilter: { type: "string", enum: ["ENABLED", "PAUSED", "REMOVED", "all"], default: "ENABLED" },
          limit: { type: "number", minimum: 1, maximum: 1000, default: 100 },
        },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.getInsights,
      displayName: "Google Get Insights",
      description:
        "Pull performance metrics (spend, impressions, clicks, CTR, CPC, conversions, cost_per_conversion) broken down by day for the requested level.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          level: { type: "string", enum: ["customer", "campaign", "ad_group", "ad"], default: "campaign" },
          resourceId: { type: "string" },
          datePreset: {
            type: "string",
            enum: [
              "TODAY",
              "YESTERDAY",
              "LAST_7_DAYS",
              "LAST_14_DAYS",
              "LAST_30_DAYS",
              "THIS_MONTH",
              "LAST_MONTH",
            ],
            default: "LAST_7_DAYS",
          },
        },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.search,
      displayName: "Google GAQL Search",
      description:
        "Run a raw Google Ads Query Language (GAQL) query. Use this for advanced read operations not covered by the other tools. Mutate operations are NOT allowed here.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          query: { type: "string", description: "GAQL query string. Must be a SELECT statement." },
          limit: { type: "number", minimum: 1, maximum: 10000, default: 1000 },
        },
        required: ["customerId", "query"],
      },
    },
  ],
};

export default manifest;
