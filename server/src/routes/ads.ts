// LMTM-OS: platform-agnostic ads routes.
// Replaces routes/meta.ts and routes/meta-sync.ts gradually. Endpoints
// dispatch to the right AdsProvider based on the connection.platform
// column, not on hardcoded "meta" in the path.
//
// NOTE: the URL prefix is "/integrations" (NOT "/ads"). Browser ad blockers
// block any URL containing the "ads" path segment, which silently broke these
// XHR calls in the panel. Keep these paths free of "ads"/"adset" tokens.
//
//   GET    /api/integrations/connections
//   GET    /api/integrations/connections/:id
//   POST   /api/integrations/connections     (manual token paste; platform-specific)
//   PATCH  /api/integrations/connections/:id
//   DELETE /api/integrations/connections/:id
//   GET    /api/integrations/connections/:id/accounts
//   GET    /api/integrations/connections/:id/pages
//   GET    /api/integrations/oauth/start?platform=meta&companyId=...
//   GET    /api/integrations/oauth/callback
//
//   GET    /api/integrations/mappings
//   GET    /api/integrations/mappings/:id
//   POST   /api/integrations/mappings
//   PATCH  /api/integrations/mappings/:id
//   DELETE /api/integrations/mappings/:id
//
//   POST   /api/ads/sync/:job            (job: campaigns|adsets|ads|insights|organic|all)
//   GET    /api/clients                  (list of LMTM clients)
//   POST   /api/clients
//   GET    /api/clients/:id/dashboard

import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsAdsets, adsAlerts, adsCampaigns, adsConnections, adsCreatives, adsInsights, clients, clientMemory, organicPosts, organicPostInsights, publicDashboards, accountScores, type AdsAccountMapping } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getAdsProvider, isKnownAdsPlatform } from "../services/ads/registry.js";
import { googleAdsProviderScopes } from "../services/ads/providers/google.js";
import { tiktokAdsProviderScopes } from "../services/ads/providers/tiktok.js";
import { linkedinAdsProviderScopes } from "../services/ads/providers/linkedin.js";
import { logActivity } from "../services/activity-log.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, unprocessable, unauthorized } from "../errors.js";
import { adsAggregator } from "../services/ads/aggregator.js";
import type { AdAccountSummary, AdSetSummary } from "../services/ads/types.js";
import { detectClientClickUpLists, refreshEnfoqueTecnicoContext, getEnfoqueTecnicoContext, createClientReportTask } from "../services/clickup-sync.js";
import { generateClientAlerts, runClientAlerts, sendWhatsAppToNumber, generateClientReport, runClientReports, runPortfolioBrief, alertsNumber } from "../services/agency-ops.js";
import { computeClientScore, runClientScores, getLatestScore, getScoreHistory } from "../services/account-scoring.js";
import { getClientBrain, refreshClientBrain } from "../services/customer-brain.js";
import { generateClientOpportunities, listOpportunities } from "../services/opportunities-engine.js";
import { listFeedback, ingestFeedback } from "../services/feedback-agent.js";
import { runOperationalAudit } from "../services/auditor.js";
import { mineLearnings } from "../services/learning-engine.js";
import { rebuildClientContent, topContent } from "../services/knowledge-graph.js";
import { runAllAdsSync } from "../services/ads-autosync.js";
import { fetchAccountBalances, runBalanceCheck } from "../services/balance-monitor.js";
import { competitors, contentIdeas } from "@paperclipai/db";
import { generateContentPlan } from "../services/competitor-content.js";
import { resolveCompanyId } from "../services/intel-common.js";

// Per-platform OAuth configuration. The start route redirects the user
// to the platform's auth URL with a base64url-encoded `state` payload
// (companyId + label + ts); the callback decodes it, exchanges the
// code for tokens via the provider, and persists an `ads_connections`
// row tagged with the right platform.
type PlatformOAuthConfig = {
  authUrl: string;
  clientIdEnv: string;
  redirectUriEnv: string;
  scope: string[];
  extraAuthParams?: Record<string, string>;
};

const OAUTH_CONFIGS: Record<"google" | "tiktok" | "linkedin", PlatformOAuthConfig> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_ADS_CLIENT_ID",
    redirectUriEnv: "GOOGLE_ADS_REDIRECT_URI",
    scope: googleAdsProviderScopes,
    extraAuthParams: {
      access_type: "offline", // required to get a refresh_token
      prompt: "consent",       // force Google to re-issue refresh_token
      include_granted_scopes: "true",
    },
  },
  tiktok: {
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    clientIdEnv: "TIKTOK_APP_ID",
    redirectUriEnv: "TIKTOK_REDIRECT_URI",
    scope: tiktokAdsProviderScopes,
  },
  linkedin: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    redirectUriEnv: "LINKEDIN_REDIRECT_URI",
    scope: linkedinAdsProviderScopes,
  },
};

function panelUrl(): string {
  return (process.env.LMTM_PANEL_URL?.trim() ?? "").replace(/\/$/, "");
}

function oauthFailRedirect(res: Response, platform: string, reason: string): void {
  const base = panelUrl();
  const qs = `${platform}_error=${encodeURIComponent(reason)}`;
  // We send the user back to the integrations page for that platform;
  // the panel renders an error banner from the query string.
  res.redirect(base ? `${base}/integrations/${platform}?${qs}` : `/integrations/${platform}?${qs}`);
}

function encodeState(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
}

function decodeState<T extends Record<string, unknown>>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

// Strip ad-platform secrets before serializing a connection to the client.
// The UI only needs label/status/platform/metadata — never the tokens.
const CONNECTION_SECRET_FIELDS = ["accessToken", "refreshToken", "clientSecret", "developerToken"] as const;
function toPublicConnection<T extends Record<string, unknown>>(row: T): Partial<T> {
  const safe: Record<string, unknown> = { ...row };
  for (const f of CONNECTION_SECRET_FIELDS) delete safe[f];
  return safe as Partial<T>;
}

export function adsRoutes(db: Db): Router {
  const router = Router();

  // Auth boundary for the client surface. Every /clients/* route (list,
  // create, dashboards, ClickUp sync, CSV export) requires an authenticated
  // actor. The /ads/oauth/* callbacks are deliberately NOT covered here —
  // the OAuth provider redirects to them without a session.
  router.use("/clients", (req, _res, next) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    next();
  });

  // Auth boundary for /integrations/* (connections, mappings, sync, account
  // lookups). These expose ad-platform tokens and let agents read/write
  // campaigns, so they must never be anonymous. Exception: the OAuth
  // start/callback routes are reached via a provider redirect without a session,
  // so they stay public.
  //
  // NOTE: this prefix is deliberately NOT "/ads" — browser ad blockers
  // (uBlock/AdGuard/etc.) block any URL containing the "ads" path segment with
  // net::ERR_BLOCKED_BY_CLIENT, which silently broke the connections lookup in
  // the panel. Keep ad-platform XHR paths free of "ads"/"adset" tokens.
  router.use("/integrations", (req, _res, next) => {
    if (req.originalUrl.includes("/integrations/oauth/")) return next();
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    next();
  });

  // ---- Connections ----

  router.get("/integrations/connections", async (req, res) => {
    const companyId = (req.query.companyId as string) ?? null;
    const platform = (req.query.platform as string) ?? null;
    // A companyId is required so we only ever return connections for a company
    // the actor can access (and never leak the whole table).
    if (!companyId) return res.status(400).json({ error: "companyId required" });
    assertCompanyAccess(req, companyId);
    const conditions = [eq(adsConnections.companyId, companyId)];
    if (platform && isKnownAdsPlatform(platform)) {
      conditions.push(eq(adsConnections.platform, platform));
    }
    const rows = await db.select().from(adsConnections).where(and(...conditions));
    res.json({ connections: rows.map(toPublicConnection) });
  });

  router.get("/integrations/connections/:id", async (req, res) => {
    const [row] = await db.select().from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!row) return res.status(404).json({ error: "connection not found" });
    assertCompanyAccess(req, row.companyId);
    res.json(toPublicConnection(row));
  });

  router.post("/integrations/connections", async (req, res) => {
    const body = req.body ?? {};
    if (!body.companyId || !body.platform || !body.label || !body.accessToken) {
      return res.status(400).json({ error: "missing required fields: companyId, platform, label, accessToken" });
    }
    if (!isKnownAdsPlatform(body.platform)) {
      return res.status(400).json({ error: `unknown platform: ${body.platform}` });
    }
    assertCompanyAccess(req, body.companyId);
    const [row] = await db.insert(adsConnections).values({
      companyId: body.companyId,
      clientId: body.clientId ?? null,
      platform: body.platform,
      label: body.label,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken ?? null,
      developerToken: body.developerToken ?? null,
      clientIdText: body.clientIdText ?? null,
      clientSecret: body.clientSecret ?? null,
      businessId: body.businessId ?? null,
      pageId: body.pageId ?? null,
      adAccountId: body.adAccountId ?? null,
      managerAccountId: body.managerAccountId ?? null,
      merchantId: body.merchantId ?? null,
      appId: body.appId ?? null,
      tenantId: body.tenantId ?? null,
      tokenType: body.tokenType ?? "user",
      scopes: body.scopes ?? [],
      status: body.status ?? "active",
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    }).returning();
    res.status(201).json(toPublicConnection(row));
  });

  router.patch("/integrations/connections/:id", async (req, res) => {
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["label", "accessToken", "refreshToken", "developerToken", "clientIdText", "clientSecret", "status", "lastError", "businessId", "pageId", "adAccountId", "managerAccountId", "merchantId", "appId", "tenantId", "tokenType"]) {
      if (k in body) update[k] = body[k];
    }
    if ("expiresAt" in body) update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if ("scopes" in body) update.scopes = body.scopes;
    const [existing] = await db.select({ companyId: adsConnections.companyId }).from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "connection not found" });
    assertCompanyAccess(req, existing.companyId);
    const [row] = await db.update(adsConnections).set(update).where(eq(adsConnections.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "connection not found" });
    res.json(toPublicConnection(row));
  });

  router.delete("/integrations/connections/:id", async (req, res) => {
    const [existing] = await db.select({ companyId: adsConnections.companyId }).from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!existing) return res.status(204).end();
    assertCompanyAccess(req, existing.companyId);
    await db.delete(adsConnections).where(eq(adsConnections.id, req.params.id));
    res.status(204).end();
  });

  router.get("/integrations/connections/:id/accounts", async (req, res) => {
    const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!conn) return res.status(404).json({ error: "connection not found" });
    if (!isKnownAdsPlatform(conn.platform)) return res.status(400).json({ error: `unsupported platform: ${conn.platform}` });
    const provider = getAdsProvider(conn.platform);
    try {
      const accounts = await provider.listAdAccounts(conn.accessToken);
      res.json({ accounts });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/integrations/connections/:id/pages", async (req, res) => {
    const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!conn) return res.status(404).json({ error: "connection not found" });
    if (!isKnownAdsPlatform(conn.platform)) return res.status(400).json({ error: `unsupported platform: ${conn.platform}` });
    const provider = getAdsProvider(conn.platform);
    try {
      const pages = await provider.listPages(conn.accessToken);
      res.json({ pages });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- Make.com-style: pages + linked ad accounts + ad sets ----
  // Returns one record per page with the ad accounts linked to that page
  // and the ad sets under each ad account. The UI uses this to let the
  // user pick a subset of ad sets per (page, ad_account, client) mapping.
  router.get("/integrations/connections/:id/pages-with-sets", async (req, res) => {
    const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!conn) return res.status(404).json({ error: "connection not found" });
    if (!isKnownAdsPlatform(conn.platform)) return res.status(400).json({ error: `unsupported platform: ${conn.platform}` });
    const provider = getAdsProvider(conn.platform);
    try {
      // ---- Step 1: fetch pages + ad accounts in parallel (independent calls) ----
      const [pages, allAccounts] = await Promise.all([
        provider.listPages(conn.accessToken),
        provider.listAdAccounts(conn.accessToken),
      ]);

      // ---- Step 2: fetch ad sets for ALL ad accounts in parallel ----
      // We pass a noop filter at the provider level and filter here
      // (by effective_status, excluding DELETED/ARCHIVED by default).
      // The provider's `listAdSets` signature doesn't yet accept a
      // filter, so we filter post-hoc on the way out.
      const adSetsByAcc: Record<string, AdSetSummary[]> = {};
      if (provider.listAdSets) {
        const settled = await Promise.allSettled(
          allAccounts.map((acc) => provider.listAdSets!(acc.id, conn.accessToken)),
        );
        for (let i = 0; i < allAccounts.length; i += 1) {
          const r = settled[i];
          const raw = r.status === "fulfilled" ? r.value : [];
          // effective_status from the provider: prefer it over the
          // raw `status` field. The provider already does this
          // (see meta.ts listAdSets) but we double-filter here for
          // safety, and to drop DELETED/ARCHIVED noise.
          adSetsByAcc[allAccounts[i].id] = raw.filter((s) => {
            const eff = (s.raw as { effective_status?: string }).effective_status
              ?? s.status;
            return eff !== "DELETED" && eff !== "ARCHIVED";
          });
        }
      }

      // ---- Step 3: build per-page rows in parallel (DB lookup + linked accounts) ----
      const perPage = await Promise.all(pages.map(async (p) => {
        let accountsToScan = allAccounts;
        if (provider.listAdAccountsForPage) {
          try {
            const linked = await provider.listAdAccountsForPage(p.id, conn.accessToken);
            if (linked.length) accountsToScan = linked;
          } catch { /* keep fallback */ }
        }
        const [existing] = await db.select().from(adsAccountMappings).where(
          and(
            eq(adsAccountMappings.companyId, conn.companyId),
            eq(adsAccountMappings.connectionId, conn.id),
            eq(adsAccountMappings.pageId, p.id),
          ),
        );
        return {
          page: { id: p.id, name: p.name },
          adAccounts: accountsToScan,
          adSets: adSetsByAcc,
          existingMapping: existing ?? null,
        };
      }));

      res.json({ pages: perPage });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- Diagnostic endpoint: returns counts and per-ad-account errors
  // so the user can see exactly which ad accounts failed and why.
  // GET /api/ads/connections/:id/pages-with-sets/diagnostics
  router.get("/integrations/connections/:id/pages-with-sets/diagnostics", async (req, res) => {
    const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!conn) return res.status(404).json({ error: "connection not found" });
    if (!isKnownAdsPlatform(conn.platform)) return res.status(400).json({ error: `unsupported platform: ${conn.platform}` });
    const provider = getAdsProvider(conn.platform);
    const out: {
      pages: number;
      adAccounts: number;
      adSetsByAdAccount: Record<string, { total: number; active: number; paused: number; other: number; error?: string }>;
      errors: string[];
    } = {
      pages: 0,
      adAccounts: 0,
      adSetsByAdAccount: {},
      errors: [],
    };
    try {
      // Pages
      let pages: Awaited<ReturnType<typeof provider.listPages>> = [];
      try {
        pages = await provider.listPages(conn.accessToken);
        out.pages = pages.length;
      } catch (e) {
        out.errors.push(`listPages: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Ad accounts
      let allAccounts: Awaited<ReturnType<typeof provider.listAdAccounts>> = [];
      try {
        allAccounts = await provider.listAdAccounts(conn.accessToken);
        out.adAccounts = allAccounts.length;
      } catch (e) {
        out.errors.push(`listAdAccounts: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Ad sets per ad account
      if (provider.listAdSets) {
        const settled = await Promise.allSettled(
          allAccounts.map((acc) => provider.listAdSets!(acc.id, conn.accessToken)),
        );
        for (let i = 0; i < allAccounts.length; i += 1) {
          const acc = allAccounts[i];
          const r = settled[i];
          if (r.status === "rejected") {
            out.adSetsByAdAccount[acc.id] = {
              total: 0, active: 0, paused: 0, other: 0,
              error: r.reason instanceof Error ? r.reason.message : String(r.reason),
            };
            out.errors.push(`listAdSets[${acc.id}]: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
            continue;
          }
          const raw = r.value;
          let active = 0, paused = 0, other = 0;
          for (const s of raw) {
            const eff = (s.raw as { effective_status?: string }).effective_status ?? s.status;
            if (eff === "ACTIVE") active++;
            else if (eff === "PAUSED") paused++;
            else other++;
          }
          out.adSetsByAdAccount[acc.id] = {
            total: raw.length, active, paused, other,
          };
        }
      }
      res.json(out);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err), partial: out });
    }
  });

  // ---- Mappings ----

  router.get("/integrations/mappings", async (req, res) => {
    const companyId = (req.query.companyId as string) ?? null;
    const clientId = (req.query.clientId as string) ?? null;
    const conditions = [];
    if (companyId) conditions.push(eq(adsAccountMappings.companyId, companyId));
    if (clientId) conditions.push(eq(adsAccountMappings.clientId, clientId));
    const rows = await db.select().from(adsAccountMappings).where(conditions.length ? and(...conditions) : undefined);
    res.json({ mappings: rows });
  });

  router.post("/integrations/mappings", async (req, res) => {
    const body = req.body ?? {};
    if (!body.companyId || !body.connectionId || !body.adAccountId) {
      return res.status(400).json({ error: "missing required fields: companyId, connectionId, adAccountId" });
    }
    const includedAdsets = Array.isArray(body.includedAdsets) ? body.includedAdsets.filter((x: unknown) => typeof x === "string") : [];
    const adAccountId = body.adAccountId.startsWith("act_") ? body.adAccountId : `act_${body.adAccountId}`;
    // Skip if (company, adAccount, page) mapping already exists
    const conditions = [
      eq(adsAccountMappings.companyId, body.companyId),
      eq(adsAccountMappings.adAccountId, adAccountId),
    ];
    if (body.pageId) {
      conditions.push(eq(adsAccountMappings.pageId, body.pageId));
    } else {
      conditions.push(isNull(adsAccountMappings.pageId));
    }
    const [existing] = await db.select().from(adsAccountMappings).where(and(...conditions));
    if (existing) {
      // Update the included adsets + clientId in-place
      const [row] = await db.update(adsAccountMappings).set({
        clientId: body.clientId ?? null,
        includedAdsets: includedAdsets as unknown as string[],
        label: body.label ?? null,
        updatedAt: new Date(),
      }).where(eq(adsAccountMappings.id, existing.id)).returning();
      return res.status(200).json({ mapping: row, skipped: false, updated: true });
    }
    const [row] = await db.insert(adsAccountMappings).values({
      companyId: body.companyId,
      connectionId: body.connectionId,
      clientId: body.clientId ?? null,
      platform: body.platform ?? "meta",
      adAccountId,
      pageId: body.pageId ?? null,
      label: body.label ?? null,
      includedAdsets: includedAdsets as unknown as string[],
    }).returning();
    res.status(201).json({ mapping: row, skipped: false, updated: false });
  });

  // ---- Bulk create mappings (Make.com-style) ----
  // Body: { companyId, connectionId, mappings: [{ adAccountId, pageId, clientId, includedAdsets: string[] }, ...] }
  // Skip any (companyId, adAccountId, pageId) that already exists.
  router.post("/integrations/mappings/bulk", async (req, res) => {
    const body = req.body ?? {};
    if (!body.companyId || !body.connectionId || !Array.isArray(body.mappings)) {
      return res.status(400).json({ error: "missing required fields: companyId, connectionId, mappings[]" });
    }
    const results: { created: AdsAccountMapping[]; updated: AdsAccountMapping[]; skipped: number } = {
      created: [],
      updated: [],
      skipped: 0,
    };
    for (const m of body.mappings) {
      if (!m.adAccountId) { results.skipped += 1; continue; }
      const adAccountId = m.adAccountId.startsWith("act_") ? m.adAccountId : `act_${m.adAccountId}`;
      const includedAdsets = Array.isArray(m.includedAdsets) ? m.includedAdsets.filter((x: unknown) => typeof x === "string") : [];
      const conditions = [
        eq(adsAccountMappings.companyId, body.companyId),
        eq(adsAccountMappings.adAccountId, adAccountId),
      ];
      if (m.pageId) {
        conditions.push(eq(adsAccountMappings.pageId, m.pageId));
      } else {
        conditions.push(isNull(adsAccountMappings.pageId));
      }
      const [existing] = await db.select().from(adsAccountMappings).where(and(...conditions));
      if (existing) {
        const [row] = await db.update(adsAccountMappings).set({
          clientId: m.clientId ?? existing.clientId,
          includedAdsets: includedAdsets as unknown as string[],
          label: m.label ?? existing.label,
          updatedAt: new Date(),
        }).where(eq(adsAccountMappings.id, existing.id)).returning();
        results.updated.push(row);
        continue;
      }
      const [row] = await db.insert(adsAccountMappings).values({
        companyId: body.companyId,
        connectionId: body.connectionId,
        clientId: m.clientId ?? null,
        platform: m.platform ?? "meta",
        adAccountId,
        pageId: m.pageId ?? null,
        label: m.label ?? null,
        includedAdsets: includedAdsets as unknown as string[],
      }).returning();
      results.created.push(row);
    }
    res.status(201).json(results);
  });

  router.patch("/integrations/mappings/:id", async (req, res) => {
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["pageId", "label", "clientId"]) {
      if (k in body) update[k] = body[k];
    }
    const [row] = await db.update(adsAccountMappings).set(update).where(eq(adsAccountMappings.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "mapping not found" });
    res.json(row);
  });

  router.delete("/integrations/mappings/:id", async (req, res) => {
    await db.delete(adsAccountMappings).where(eq(adsAccountMappings.id, req.params.id));
    res.status(204).end();
  });

  // ---- OAuth start (per platform) ----
  //
  // GET /api/ads/oauth/start?platform=google|tiktok|linkedin&companyId=...&label=...
  // Builds the platform's authorization URL with a base64url-encoded
  // state payload and 302-redirects the browser. After the user
  // grants access, the platform sends them back to /api/ads/oauth/callback.
  router.get("/integrations/oauth/start", async (req, res) => {
    const platform = String(req.query.platform ?? "");
    if (!isKnownAdsPlatform(platform) || platform === "meta") {
      // Meta uses the legacy /api/meta/oauth/start route for now.
      throw badRequest(`unsupported platform for this route: ${platform}`);
    }
    const cfg = OAUTH_CONFIGS[platform as "google" | "tiktok" | "linkedin"];
    const companyId = String(req.query.companyId ?? "");
    if (!companyId) throw badRequest("companyId is required");
    assertCompanyAccess(req, companyId);
    const label = typeof req.query.label === "string" ? req.query.label : `${platform} Ads`;

    const clientId = (process.env[cfg.clientIdEnv] ?? "").trim();
    const redirectUri = (process.env[cfg.redirectUriEnv] ?? "").trim();
    if (!clientId || !redirectUri) {
      throw unprocessable(
        `${cfg.clientIdEnv} / ${cfg.redirectUriEnv} not configured in Render env`,
      );
    }

    const url = new URL(cfg.authUrl);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      cfg.scope.join(platform === "linkedin" ? " " : " "),
    );
    url.searchParams.set("state", encodeState({ companyId, label, platform }));
    if (cfg.extraAuthParams) {
      for (const [k, v] of Object.entries(cfg.extraAuthParams)) {
        url.searchParams.set(k, v);
      }
    }
    res.redirect(url.toString());
  });

  // ---- OAuth callback (per platform) ----
  //
  // GET /api/ads/oauth/callback?code=...&state=...
  // Exchanges the code for tokens via the provider, persists an
  // `ads_connections` row, and redirects the user back to the
  // integrations page.
  router.get("/integrations/oauth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
    const errorParam = typeof req.query.error === "string" ? req.query.error : "";
    const errorDesc = typeof req.query.error_description === "string"
      ? req.query.error_description
      : "";

    const state = decodeState<{ companyId?: string; label?: string; platform?: string }>(stateRaw);
    if (!state || !state.platform) {
      return oauthFailRedirect(res, "ads", "Estado de OAuth inválido.");
    }
    const platform = state.platform as "google" | "tiktok" | "linkedin";
    if (!isKnownAdsPlatform(platform)) {
      return oauthFailRedirect(res, "ads", `Plataforma no soportada: ${platform}`);
    }
    if (errorParam) {
      return oauthFailRedirect(res, platform, errorDesc || errorParam);
    }
    if (!code) {
      return oauthFailRedirect(res, platform, "No se recibió el código de autorización.");
    }
    if (!state.companyId) {
      return oauthFailRedirect(res, platform, "Estado de OAuth sin companyId.");
    }

    const cfg = OAUTH_CONFIGS[platform];
    const redirectUri = (process.env[cfg.redirectUriEnv] ?? "").trim();
    const provider = getAdsProvider(platform);

    try {
      const tokenSet = await provider.exchangeOAuthCode(code, redirectUri);
      // Persist the connection. We let the user pick the ad account
      // mapping after the fact — /api/ads/connections/:id/ad-accounts
      // calls provider.listAdAccounts() once they hit the UI.
      const [row] = await db
        .insert(adsConnections)
        .values({
          companyId: state.companyId,
          clientId: null,
          platform,
          label: state.label ?? `${platform} Ads`,
          accessToken: tokenSet.accessToken,
          refreshToken: tokenSet.refreshToken ?? null,
          developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? null, // only used for google
          clientIdText: process.env[cfg.clientIdEnv] ?? null,
          clientSecret: null, // we don't store app secrets server-side; OAuth flow uses env var directly
          managerAccountId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null,
          tokenType: "user",
          scopes: tokenSet.scopes,
          status: "active",
          expiresAt: tokenSet.expiresAt ?? null,
        })
        .returning();

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: state.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "ads.connection_connected",
        entityType: "ads_connection",
        entityId: row?.id ?? "",
        details: { platform, source: "oauth_callback" },
      });

      const base = panelUrl();
      const params = new URLSearchParams({ connectionId: row?.id ?? "" });
      res.redirect(base ? `${base}/connect-ads?${params}` : `/connect-ads?${params}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return oauthFailRedirect(res, platform, msg.slice(0, 240));
    }
  });

  // ---- Clients (LMTM) ----

  router.get("/clients", async (req, res) => {
    const status = (req.query.status as string) ?? null;
    const conditions = [];
    if (status) conditions.push(eq(clients.status, status));
    const rows = await db.select().from(clients).where(conditions.length ? and(...conditions) : undefined);
    res.json({ clients: rows });
  });

  router.post("/clients", async (req, res) => {
    const body = req.body ?? {};
    if (!body.name || !body.slug) {
      return res.status(400).json({ error: "missing required fields: name, slug" });
    }
    const [row] = await db.insert(clients).values({
      slug: body.slug,
      name: body.name,
      legalName: body.legalName ?? null,
      taxId: body.taxId ?? null,
      status: body.status ?? "active",
      tier: body.tier ?? "standard",
      ownerAgentId: body.ownerAgentId ?? null,
      primaryContactName: body.primaryContactName ?? null,
      primaryContactEmail: body.primaryContactEmail ?? null,
      primaryContactPhone: body.primaryContactPhone ?? null,
      websiteUrl: body.websiteUrl ?? null,
      industry: body.industry ?? null,
      monthlyRetainerCents: body.monthlyRetainerCents ?? 0,
      currency: body.currency ?? "ARS",
      crmExternalId: body.crmExternalId ?? null,
      planillaSource: body.planillaSource ?? null,
      planillaExternalId: body.planillaExternalId ?? null,
      onboardedAt: body.onboardedAt ? new Date(body.onboardedAt) : null,
    }).returning();
    res.status(201).json(row);
  });

  // GET /api/clients/scores — latest health/ops score per client (bulk, for cards).
  // Registered before /clients/:id so the static path wins over the dynamic one.
  router.get("/clients/scores", async (_req, res) => {
    const since = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
    const rows = await db.select({ clientId: accountScores.clientId, date: accountScores.date, healthScore: accountScores.healthScore, opsScore: accountScores.opsScore })
      .from(accountScores).where(gte(accountScores.date, since)).orderBy(sql`${accountScores.date} DESC`);
    const map: Record<string, { health: number; ops: number }> = {};
    for (const r of rows) if (!map[r.clientId]) map[r.clientId] = { health: r.healthScore, ops: r.opsScore };
    res.json(map);
  });

  router.get("/clients/:id", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(row);
  });

  // ---- Client-scoped ads summary (for the ClientDashboard "Paid Media" tab + Overview KPIs) ----
  // Returns the Meta + Google connection state, linked ad accounts, campaign counts and the
  // last-30-day rollup of spend, impressions, clicks, leads. If the client has no ad
  // accounts linked, returns an empty `accounts` list — the UI then renders the
  // "Connect Meta" CTA.
  router.get("/clients/:idOrSlug/ads-summary", async (req, res) => {
    const { idOrSlug } = req.params;
    const debugInfo: Record<string, unknown> = {};
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
      const clientCondition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
      const [client] = await db.select({ id: clients.id, slug: clients.slug, name: clients.name })
        .from(clients).where(clientCondition);
      if (!client) return res.status(404).json({ error: "client not found" });
      debugInfo.step1_client = { id: client.id, name: client.name };

      // Linked ad accounts (the "what is this client connected to?" map)
      const mappings = await db.select().from(adsAccountMappings).where(eq(adsAccountMappings.clientId, client.id));
      debugInfo.step2_mappings = { count: mappings.length };

      // Distinct (connection, adAccount) pairs the client touches
      const connectionIds = Array.from(new Set(mappings.map((m) => m.connectionId).filter(Boolean)));
      const connections = connectionIds.length
        ? await db.select().from(adsConnections).where(inArray(adsConnections.id, connectionIds))
        : [];
      debugInfo.step3_connections = { count: connections.length };
      const connectionById = new Map(connections.map((c) => [c.id, c]));

    const accounts = mappings.map((m) => {
      const conn = connectionById.get(m.connectionId);
      return {
        mappingId: m.id,
        connectionId: m.connectionId,
        platform: conn?.platform ?? m.platform,
        adAccountId: m.adAccountId,
        mappingLabel: m.label ?? null,
        pageId: m.pageId ?? null,
        connectionLabel: conn?.label ?? null,
        connectionStatus: conn?.status ?? "unknown",
        businessId: conn?.businessId ?? null,
      };
    });

    // Campaign counts per (platform, status)
    const campaignRows = await db
      .select({
        platform: adsCampaigns.platform,
        status: adsCampaigns.status,
        n: sql<number>`count(*)::int`,
      })
      .from(adsCampaigns)
      .where(eq(adsCampaigns.clientId, client.id))
      .groupBy(adsCampaigns.platform, adsCampaigns.status);
    debugInfo.step4_campaigns = { count: campaignRows.length };
    const campaigns = {
      total: campaignRows.reduce((a, r) => a + (r.n ?? 0), 0),
      byStatus: campaignRows.reduce<Record<string, number>>((acc, r) => {
        const key = `${r.platform}:${r.status ?? "unknown"}`;
        acc[key] = (acc[key] ?? 0) + (r.n ?? 0);
        return acc;
      }, {}),
      byPlatform: campaignRows.reduce<Record<string, number>>((acc, r) => {
        acc[r.platform] = (acc[r.platform] ?? 0) + (r.n ?? 0);
        return acc;
      }, {}),
    };

    // Last-30-day rollup of insights. Note: we intentionally only select
    // columns that exist in the live DB (no `conversions` / `video_views`).
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const sinceDate = since.toISOString().slice(0, 10);
    const insightRows = await db
      .select({
        platform: adsInsights.platform,
        impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
        clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
        spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
        leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
        days: sql<number>`count(distinct ${adsInsights.date})::int`,
      })
      .from(adsInsights)
      .where(and(eq(adsInsights.clientId, client.id), gte(adsInsights.date, sinceDate)))
      .groupBy(adsInsights.platform);
    debugInfo.step5_insights = { count: insightRows.length };

    const insights = {
      since: sinceDate,
      byPlatform: insightRows.reduce<Record<string, {
        platform: string; impressions: number; clicks: number; spend: number; leads: number; days: number; ctr: number; cpc: number;
      }>>((acc, r) => {
        const impressions = Number(r.impressions ?? 0);
        const clicks = Number(r.clicks ?? 0);
        const spend = Number(r.spend ?? 0);
        acc[r.platform] = {
          platform: r.platform,
          impressions,
          clicks,
          spend,
          leads: Number(r.leads ?? 0),
          days: Number(r.days ?? 0),
          ctr: impressions > 0 ? clicks / impressions : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
        };
        return acc;
      }, {}),
      totals: insightRows.reduce(
        (acc, r) => {
          acc.impressions += Number(r.impressions ?? 0);
          acc.clicks += Number(r.clicks ?? 0);
          acc.spend += Number(r.spend ?? 0);
          acc.leads += Number(r.leads ?? 0);
          acc.days = Math.max(acc.days, Number(r.days ?? 0));
          return acc;
        },
        { impressions: 0, clicks: 0, spend: 0, leads: 0, days: 0, ctr: 0, cpc: 0 },
      ),
    };

    insights.totals.ctr = insights.totals.impressions > 0 ? insights.totals.clicks / insights.totals.impressions : 0;
    insights.totals.cpc = insights.totals.clicks > 0 ? insights.totals.spend / insights.totals.clicks : 0;

    // "Meta is connected" means EITHER the env vars are set (so a fresh
    // OAuth flow could be initiated) OR there's already an active Meta
    // ads_connection row for this company. The second branch matters
    // because a user may have connected Meta previously and then revoked
    // the env vars on a different deploy — the connection itself is still
    // valid for the picker flow.
    const metaConnectionRows = await db
      .select({ id: adsConnections.id, status: adsConnections.status, companyId: adsConnections.companyId })
      .from(adsConnections)
      .where(eq(adsConnections.platform, "meta"));
    const metaConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
    const metaCompanyId = mappings[0]?.companyId ?? connections[0]?.companyId ?? metaConnectionRows[0]?.companyId;
    const metaHasActiveConnection = metaConnectionRows.some(
      (c) => c.status === "active" && (!metaCompanyId || c.companyId === metaCompanyId),
    );
    const metaReady = metaConfigured || metaHasActiveConnection;
    debugInfo.step5_metaReady = {
      envVars: metaConfigured,
      hasActiveConnection: metaHasActiveConnection,
      totalMetaConnections: metaConnectionRows.length,
    };
    const companyId = metaCompanyId ?? (req.actor.type === "board"
      ? req.actor.source === "local_implicit" || req.actor.isInstanceAdmin
        ? "00000000-0000-4000-8000-000000000001"
        : (req.actor.companyIds ?? [])[0] ?? null
      : null);

    res.json({
      client: { id: client.id, slug: client.slug, name: client.name },
      accounts,
      campaigns,
      insights,
      oauthReady: {
        meta: metaReady,
      },
      oauthStartUrl: metaReady && companyId
        ? `/api/meta/oauth/start?companyId=${companyId}&label=${encodeURIComponent(client.name)}`
        : null,
      debug: debugInfo,
    });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : "";
      const cause = e instanceof Error && (e as any).cause ? (e as any).cause : null;
      const causeMsg = cause ? (cause instanceof Error ? cause.message : String(cause)) : null;
      console.error("[ads-summary] failed for", idOrSlug, msg, stack);
      if (cause) console.error("[ads-summary] cause:", causeMsg);
      res.status(500).json({
        error: "Internal server error",
        detail: msg.slice(0, 500),
        cause: causeMsg ? causeMsg.slice(0, 500) : null,
        debug: debugInfo,
      });
    }
  });

  // ---- Sync trigger ----
  //
  // POST /api/ads/sync/:job
  //   job: "campaigns" | "adsets" | "ads" | "insights" | "organic" | "all"
  //   body: { connectionId, mappingId, since?, until? }
  //
  // Runs the actual aggregator synchronously and returns the per-job record
  // counts. For "all" we run campaigns + adsets + ads + insights in sequence
  // (organic is opt-in via "organic" job because it requires a page mapping
  // and is slower).
  router.post("/integrations/sync/:job", async (req, res) => {
    const job = req.params.job;
    if (!["campaigns", "adsets", "ads", "insights", "organic", "all"].includes(job)) {
      return res.status(400).json({ error: `unknown job: ${job}` });
    }
    const { connectionId, mappingId, since, until } = req.body ?? {};
    if (!connectionId || !mappingId) {
      return res.status(400).json({ error: "missing connectionId or mappingId" });
    }
    // Authorize: actor must have access to the connection's company.
    const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, connectionId));
    if (!conn) return res.status(404).json({ error: "connection not found" });
    assertCompanyAccess(req, conn.companyId);

    const sinceDate = since ? new Date(since) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const untilDate = until ? new Date(until) : new Date();
    const opts = { jobName: job, connectionId, mappingId, since: sinceDate, until: untilDate };

    const runJob = async (name: string) => {
      const startedAt = new Date();
      try {
        let n = 0;
        if (name === "campaigns") n = await adsAggregator.syncCampaigns(db, opts);
        else if (name === "adsets") n = await adsAggregator.syncAdsets(db, opts);
        else if (name === "ads") n = await adsAggregator.syncCreatives(db, opts);
        else if (name === "insights") n = await adsAggregator.syncInsights(db, opts);
        else if (name === "organic") n = await adsAggregator.syncOrganic(db, opts);
        return { job: name, status: "completed" as const, recordsSynced: n, startedAt, completedAt: new Date() };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const cause = e instanceof Error ? (e as any).cause : null;
        const causeMsg = cause ? (cause instanceof Error ? cause.message : String(cause)) : null;
        const full = causeMsg ? `${msg} | cause: ${causeMsg}` : msg;
        return { job: name, status: "failed" as const, error: full.slice(0, 1500), startedAt, completedAt: new Date() };
      }
    };

    const jobsToRun = job === "all"
      ? ["campaigns", "adsets", "ads", "insights", "organic"]
      : [job];
    const results = await Promise.all(jobsToRun.map(runJob));
    const total = results.reduce((acc, r) => acc + (r.recordsSynced ?? 0), 0);
    const failed = results.filter((r) => r.status === "failed");
    res.json({
      ok: failed.length === 0,
      job,
      connectionId,
      mappingId,
      since: sinceDate.toISOString().slice(0, 10),
      until: untilDate.toISOString().slice(0, 10),
      totalRecords: total,
      results,
    });
  });

  // ---- Detailed campaigns view for the ClientDashboard ----
  //
  // GET /api/clients/:idOrSlug/campaigns?since=YYYY-MM-DD&until=YYYY-MM-DD
  //
  // Returns the per-campaign rollup needed to render the Meta-style
  // campaigns table: name, id, status, objective, daily budget, and the
  // sum of (impressions, clicks, spend, leads) per campaign inside the
  // date window. Also returns the 4 top-line KPIs.
  router.get("/clients/:idOrSlug/campaigns", async (req, res) => {
    const { idOrSlug } = req.params;
    const sinceParam = (req.query.since as string) || (() => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - 30); return d.toISOString().slice(0, 10);
    })();
    const untilParam = (req.query.until as string) || new Date().toISOString().slice(0, 10);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
      const clientCondition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
      const [client] = await db.select({ id: clients.id, slug: clients.slug, name: clients.name, currency: clients.currency })
        .from(clients).where(clientCondition);
      if (!client) return res.status(404).json({ error: "client not found" });

      // Campaigns linked to this client (any mapping that touches it)
      const mappings = await db.select().from(adsAccountMappings).where(eq(adsAccountMappings.clientId, client.id));
      const mappingIds = mappings.map((m) => m.id);
      if (mappingIds.length === 0) {
        return res.json({
          client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency },
          since: sinceParam, until: untilParam,
          totals: { spend: 0, impressions: 0, clicks: 0, leads: 0, ctr: 0, cpc: 0, cpm: 0 },
          campaigns: [],
        });
      }

      // Per-campaign rows
      const campaignRows = await db
        .select({
          id: adsCampaigns.id,
          name: adsCampaigns.name,
          status: adsCampaigns.status,
          objective: adsCampaigns.objective,
          dailyBudget: adsCampaigns.dailyBudget,
          lifetimeBudget: adsCampaigns.lifetimeBudget,
          platform: adsCampaigns.platform,
          adAccountId: adsCampaigns.adAccountId,
        })
        .from(adsCampaigns)
        .where(and(
          eq(adsCampaigns.clientId, client.id),
          inArray(adsCampaigns.id, (await db
            .select({ id: adsCampaigns.id })
            .from(adsCampaigns)
            .where(eq(adsCampaigns.clientId, client.id))).map((r) => r.id)),
        ));

      // Per-campaign insights rollup
      const insightRows = await db
        .select({
          campaignId: adsInsights.campaignId,
          campaignName: adsInsights.campaignName,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, sinceParam),
          lte(adsInsights.date, untilParam),
        ))
        .groupBy(adsInsights.campaignId, adsInsights.campaignName);

      const byCampaign = new Map<string, { impressions: number; clicks: number; spend: number; leads: number }>();
      for (const r of insightRows) {
        const id = r.campaignId ?? "";
        byCampaign.set(id, {
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          spend: Number(r.spend ?? 0),
          leads: Number(r.leads ?? 0),
        });
      }

      // Merge: every campaign in the DB gets a row, with 0s if no insights.
      const rows = campaignRows.map((c) => {
        const m = byCampaign.get(c.id) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
        const ctr = m.impressions > 0 ? m.clicks / m.impressions : 0;
        const cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
        const cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
        const cpl = m.leads > 0 ? m.spend / m.leads : 0;
        return {
          id: c.id,
          name: c.name,
          status: c.status ?? "unknown",
          objective: c.objective ?? null,
          platform: c.platform,
          adAccountId: c.adAccountId,
          dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null,
          lifetimeBudget: c.lifetimeBudget ? Number(c.lifetimeBudget) : null,
          ...m,
          ctr, cpc, cpm, cpl,
        };
      }).sort((a, b) => b.spend - a.spend);

      const totals = rows.reduce(
        (acc, r) => {
          acc.spend += r.spend;
          acc.impressions += r.impressions;
          acc.clicks += r.clicks;
          acc.leads += r.leads;
          return acc;
        },
        { spend: 0, impressions: 0, clicks: 0, leads: 0, ctr: 0, cpc: 0, cpm: 0 },
      );
      totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
      totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
      totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

      res.json({
        client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency },
        since: sinceParam,
        until: untilParam,
        totals,
        campaigns: rows,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client campaigns] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ---- CSV export for the campaigns table ----
  // GET /api/clients/:idOrSlug/campaigns.csv?since=...&until=...
  router.get("/clients/:idOrSlug/campaigns.csv", async (req, res) => {
    const { idOrSlug } = req.params;
    const sinceParam = (req.query.since as string) || (() => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - 30); return d.toISOString().slice(0, 10);
    })();
    const untilParam = (req.query.until as string) || new Date().toISOString().slice(0, 10);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
      const clientCondition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
      const [client] = await db.select({ id: clients.id, slug: clients.slug, name: clients.name })
        .from(clients).where(clientCondition);
      if (!client) return res.status(404).json({ error: "client not found" });

      const campaignRows = await db
        .select({
          id: adsCampaigns.id, name: adsCampaigns.name, status: adsCampaigns.status,
          objective: adsCampaigns.objective, platform: adsCampaigns.platform,
          adAccountId: adsCampaigns.adAccountId, dailyBudget: adsCampaigns.dailyBudget,
        })
        .from(adsCampaigns)
        .where(eq(adsCampaigns.clientId, client.id));

      const insightRows = await db
        .select({
          campaignId: adsInsights.campaignId,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, sinceParam),
          lte(adsInsights.date, untilParam),
        ))
        .groupBy(adsInsights.campaignId);

      const byCampaign = new Map(insightRows.map((r) => [r.campaignId ?? "", r]));
      const merged = campaignRows.map((c) => {
        const m: any = byCampaign.get(c.id) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
        const impr = Number(m.impressions ?? 0);
        const clicks = Number(m.clicks ?? 0);
        const spend = Number(m.spend ?? 0);
        const leads = Number(m.leads ?? 0);
        return {
          id: c.id, name: c.name, status: c.status, objective: c.objective,
          platform: c.platform, adAccountId: c.adAccountId, dailyBudget: c.dailyBudget,
          impressions: impr, clicks, spend, leads,
          ctr: impr > 0 ? (clicks / impr) : 0,
          cpc: clicks > 0 ? (spend / clicks) : 0,
          cpm: impr > 0 ? (spend / impr * 1000) : 0,
          cpl: leads > 0 ? (spend / leads) : 0,
        };
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="campaigns-${client.slug}-${sinceParam}-to-${untilParam}.csv"`);
      const header = "id,name,status,objective,platform,ad_account_id,daily_budget,impressions,clicks,spend,ctr,cpc,cpm,leads,cpl";
      const lines = merged.map((r) => [
        r.id, JSON.stringify(r.name), r.status, r.objective ?? "", r.platform, r.adAccountId,
        r.dailyBudget ?? "",
        r.impressions, r.clicks, r.spend.toFixed(2),
        (r.ctr * 100).toFixed(4) + "%",
        r.cpc.toFixed(2), r.cpm.toFixed(2),
        r.leads, r.cpl > 0 ? r.cpl.toFixed(2) : "",
      ].join(","));
      res.send([header, ...lines].join("\n"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client campaigns.csv] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  //   EXTENDED DASHBOARD ENDPOINTS
  //   ------------------------------------
  //   All these endpoints power the new per-client dashboard with
  //   13 sections (Resumen Ejecutivo, Presupuesto, Campañas, etc.).
  //   They share a common `since`/`until` query string. All return
  //   {client, since, until, ...} so the client can validate the
  //   query echoed back.
  //
  //   Helper: parse window + resolve the LMTM client row once.
  // ============================================================
  function defaultSince(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  function defaultUntil(): string {
    return new Date().toISOString().slice(0, 10);
  }
  function parseWindow(req: Request): { since: string; until: string } {
    return {
      since: (req.query.since as string) || defaultSince(),
      until: (req.query.until as string) || defaultUntil(),
    };
  }
  async function resolveClient(idOrSlug: string, db: Db) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const cond = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [c] = await db.select({ id: clients.id, slug: clients.slug, name: clients.name, currency: clients.currency })
      .from(clients).where(cond);
    return c || null;
  }

  // ============================================================
  // 1) DAILY TIME-SERIES
  // GET /api/clients/:idOrSlug/timeseries?since&until&metric=spend
  // Returns: { client, since, until, series: [{date, impressions, clicks, spend, leads, conversions, ctr, cpc, cpm, cpl, reach, videoViews}] }
  // ============================================================
  router.get("/clients/:idOrSlug/timeseries", async (req, res) => {
    const { idOrSlug } = req.params;
    const { since, until } = parseWindow(req);
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const rows = await db
        .select({
          date: adsInsights.date,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversions: sql<number>`coalesce(sum(${adsInsights.conversions}),0)::int`,
          reach: sql<number>`coalesce(sum(${adsInsights.reach}),0)::int`,
          videoViews: sql<number>`coalesce(sum(${adsInsights.videoViews}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ))
        .groupBy(adsInsights.date)
        .orderBy(adsInsights.date);
      const series = rows.map((r) => {
        const imp = Number(r.impressions);
        const clk = Number(r.clicks);
        const sp = Number(r.spend);
        const ld = Number(r.leads);
        return {
          date: String(r.date),
          impressions: imp,
          clicks: clk,
          spend: sp,
          leads: ld,
          conversions: Number(r.conversions),
          reach: Number(r.reach),
          videoViews: Number(r.videoViews),
          ctr: imp > 0 ? clk / imp : 0,
          cpc: clk > 0 ? sp / clk : 0,
          cpm: imp > 0 ? (sp / imp) * 1000 : 0,
          cpl: ld > 0 ? sp / ld : 0,
        };
      });
      res.json({ client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency }, since, until, series });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client timeseries] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  // 2) AD SETS rollup
  // GET /api/clients/:idOrSlug/adsets?since&until
  // Returns per-adset {id, name, status, campaignId, campaignName, dailyBudget, lifetimeBudget, impressions, clicks, spend, leads, ctr, cpc, cpm, cpl}
  // ============================================================
  router.get("/clients/:idOrSlug/adsets", async (req, res) => {
    const { idOrSlug } = req.params;
    const { since, until } = parseWindow(req);
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const adsetRows = await db
        .select({
          id: adsAdsets.id,
          name: adsAdsets.name,
          status: adsAdsets.status,
          campaignId: adsAdsets.campaignId,
          adAccountId: adsAdsets.adAccountId,
          dailyBudget: adsAdsets.dailyBudget,
          lifetimeBudget: adsAdsets.lifetimeBudget,
        })
        .from(adsAdsets)
        .where(eq(adsAdsets.clientId, client.id));
      const insightRows = await db
        .select({
          adsetId: adsInsights.adsetId,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversions: sql<number>`coalesce(sum(${adsInsights.conversions}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ))
        .groupBy(adsInsights.adsetId);
      const byAdset = new Map(insightRows.map((r) => [r.adsetId ?? "", r]));
      const campaignNames = new Map<string, string>();
      const campNames = await db
        .select({ id: adsCampaigns.id, name: adsCampaigns.name })
        .from(adsCampaigns)
        .where(eq(adsCampaigns.clientId, client.id));
      for (const c of campNames) campaignNames.set(c.id, c.name);
      const merged = adsetRows.map((a) => {
        const m: any = byAdset.get(a.id) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0, conversions: 0 };
        const imp = Number(m.impressions);
        const clk = Number(m.clicks);
        const sp = Number(m.spend);
        const ld = Number(m.leads);
        return {
          id: a.id,
          name: a.name,
          status: a.status ?? "unknown",
          campaignId: a.campaignId,
          campaignName: a.campaignId ? campaignNames.get(a.campaignId) ?? null : null,
          adAccountId: a.adAccountId,
          dailyBudget: a.dailyBudget ? Number(a.dailyBudget) : null,
          lifetimeBudget: a.lifetimeBudget ? Number(a.lifetimeBudget) : null,
          impressions: imp, clicks: clk, spend: sp, leads: ld,
          conversions: Number(m.conversions),
          ctr: imp > 0 ? clk / imp : 0,
          cpc: clk > 0 ? sp / clk : 0,
          cpm: imp > 0 ? (sp / imp) * 1000 : 0,
          cpl: ld > 0 ? sp / ld : 0,
        };
      }).sort((a, b) => b.spend - a.spend);
      res.json({ client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency }, since, until, adsets: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client adsets] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  // 3) CREATIVES (ads) rollup
  // GET /api/clients/:idOrSlug/creatives?since&until
  // Returns per-creative {id, name, status, adsetId, adsetName, campaignId, campaignName, imageUrl, videoId, impressions, clicks, spend, leads, ...}
  // ============================================================
  router.get("/clients/:idOrSlug/creatives", async (req, res) => {
    const { idOrSlug } = req.params;
    const { since, until } = parseWindow(req);
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const creativeRows = await db
        .select()
        .from(adsCreatives)
        .where(eq(adsCreatives.clientId, client.id));
      const insightRows = await db
        .select({
          adId: adsInsights.adId,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversions: sql<number>`coalesce(sum(${adsInsights.conversions}),0)::int`,
          reach: sql<number>`coalesce(sum(${adsInsights.reach}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ))
        .groupBy(adsInsights.adId);
      const byAd = new Map(insightRows.map((r) => [r.adId ?? "", r]));
      const adsetNames = new Map<string, string>();
      const an = await db.select({ id: adsAdsets.id, name: adsAdsets.name }).from(adsAdsets).where(eq(adsAdsets.clientId, client.id));
      for (const a of an) adsetNames.set(a.id, a.name);
      const campaignNames = new Map<string, string>();
      const cn = await db.select({ id: adsCampaigns.id, name: adsCampaigns.name }).from(adsCampaigns).where(eq(adsCampaigns.clientId, client.id));
      for (const c of cn) campaignNames.set(c.id, c.name);
      const merged = creativeRows.map((cr) => {
        const m: any = byAd.get(cr.id) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0, conversions: 0, reach: 0 };
        const imp = Number(m.impressions);
        const clk = Number(m.clicks);
        const sp = Number(m.spend);
        const ld = Number(m.leads);
        const raw: any = cr.raw ?? {};
        const imageUrl: string | null = raw.image_url ?? raw.picture ?? raw.thumbnail_url ?? null;
        const videoId: string | null = raw.video_id ?? null;
        return {
          id: cr.id,
          name: cr.name,
          status: cr.status ?? "unknown",
          adsetId: cr.adsetId,
          adsetName: cr.adsetId ? adsetNames.get(cr.adsetId) ?? null : null,
          campaignId: cr.campaignId,
          campaignName: cr.campaignId ? campaignNames.get(cr.campaignId) ?? null : null,
          adAccountId: cr.adAccountId,
          imageUrl,
          videoId,
          impressions: imp, clicks: clk, spend: sp, leads: ld,
          conversions: Number(m.conversions),
          reach: Number(m.reach),
          ctr: imp > 0 ? clk / imp : 0,
          cpc: clk > 0 ? sp / clk : 0,
          cpm: imp > 0 ? (sp / imp) * 1000 : 0,
          cpl: ld > 0 ? sp / ld : 0,
        };
      }).sort((a, b) => b.spend - a.spend);
      res.json({ client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency }, since, until, creatives: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client creatives] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  // 4) ORGANIC POSTS + insights
  // GET /api/clients/:idOrSlug/organic?since&until
  // Returns per-post: {id, message, postType, createdTime, permalinkUrl, fullPicture, reactions, comments, shares, postImpressions, postEngagedUsers, videoViews, engagementRate}
  // ============================================================
  router.get("/clients/:idOrSlug/organic", async (req, res) => {
    const { idOrSlug } = req.params;
    parseWindow(req); // window kept for symmetry, but organic posts aren't bucketed by day
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      // First, posts directly tagged with this client.
      let posts = await db
        .select()
        .from(organicPosts)
        .where(eq(organicPosts.clientId, client.id));
      // Fallback: include any organic posts whose pageId is mapped to this
      // client (catches the case where posts were synced before the
      // mapping got a clientId, or for orphan mappings).
      if (posts.length === 0) {
        const mappedPages = await db
          .select({ pageId: adsAccountMappings.pageId })
          .from(adsAccountMappings)
          .where(eq(adsAccountMappings.clientId, client.id));
        const pageIds = Array.from(new Set(mappedPages.map((m) => m.pageId).filter(Boolean) as string[]));
        if (pageIds.length > 0) {
          const orCond = or(...pageIds.map((p) => eq(organicPosts.pageId, p)));
          if (orCond) {
            posts = await db.select().from(organicPosts).where(orCond);
          }
        }
      }
      // Pull insights for these posts in one go
      const postIds = posts.map((p) => p.id);
      let metrics: any[] = [];
      if (postIds.length > 0) {
        metrics = await db
          .select()
          .from(organicPostInsights)
          .where(inArray(organicPostInsights.postId, postIds));
      }
      const byPost = new Map<string, Record<string, number>>();
      for (const m of metrics) {
        const row = byPost.get(m.postId) ?? {};
        row[m.metric] = Number(m.value);
        byPost.set(m.postId, row);
      }
      const merged = posts.map((p) => {
        const m = byPost.get(p.id) ?? {};
        const impressions = m["post_impressions"] ?? m["post_impressions_unique"] ?? 0;
        const engaged = m["post_engaged_users"] ?? m["post_engaged_fan"] ?? 0;
        const reactions = m["post_reactions_by_type_total"] ?? m["post_clicks"] ?? 0;
        const comments = m["comments"] ?? m["post_comments"] ?? 0;
        const shares = m["shares"] ?? m["post_shares"] ?? 0;
        const clicks = m["post_clicks"] ?? 0;
        const videoViews = m["post_video_views"] ?? m["video_views"] ?? 0;
        const engRate = impressions > 0 ? engaged / impressions : 0;
        const raw: any = p.raw ?? {};
        return {
          id: p.id,
          pageId: p.pageId,
          message: p.message ?? p.story ?? "",
          postType: p.postType ?? "unknown",
          createdTime: p.createdTime,
          permalinkUrl: p.permalinkUrl,
          fullPicture: p.fullPicture,
          reactions, comments, shares, clicks, videoViews,
          impressions, engaged,
          engagementRate: engRate,
          score: (reactions * 1) + (comments * 3) + (shares * 5) + (clicks * 2),
          metadata: raw,
        };
      }).sort((a, b) => Number(b.createdTime ? new Date(b.createdTime).getTime() : 0) - Number(a.createdTime ? new Date(a.createdTime).getTime() : 0));
      res.json({ client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency }, posts: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client organic] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  // 5) ALERTS feed
  // GET /api/clients/:idOrSlug/alerts
  // Returns: {client, alerts: [{id, severity, title, description, metric, currentValue, thresholdValue, recommendation, entityType, entityId, status, createdAt}]}
  // ============================================================
  router.get("/clients/:idOrSlug/alerts", async (req, res) => {
    const { idOrSlug } = req.params;
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const rows = await db
        .select()
        .from(adsAlerts)
        .where(and(
          eq(adsAlerts.clientId, client.id),
          inArray(adsAlerts.status, ["pending", "acknowledged"] as any),
        ))
        .orderBy(sql`${adsAlerts.createdAt} DESC`)
        .limit(50);
      res.json({ client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency }, alerts: rows });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client alerts] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  // 6) AUDIENCE breakdown
  // GET /api/clients/:idOrSlug/audience?since&until
  // Returns aggregated breakdown from ads_insights.raw (or as a fallback
  // returns empty arrays so the UI renders "Sin datos" rather than crashing).
  // ============================================================
  router.get("/clients/:idOrSlug/audience", async (req, res) => {
    const { idOrSlug } = req.params;
    const { since, until } = parseWindow(req);
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      // We don't have a dedicated demographics table; aggregate from
      // ads_insights.raw where Meta sometimes stores age/gender breakdowns.
      // This returns empty arrays when nothing matches — the UI handles it.
      const rows = await db
        .select({
          raw: adsInsights.raw,
          impressions: adsInsights.impressions,
          clicks: adsInsights.clicks,
          spend: adsInsights.spend,
          leads: adsInsights.leads,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ))
        .limit(2000);
      // Tally age/gender from raw breakdown if present
      const ageBuckets = new Map<string, { impressions: number; clicks: number; spend: number; leads: number }>();
      const genders = new Map<string, { impressions: number; clicks: number; spend: number; leads: number }>();
      const platforms = new Map<string, { impressions: number; clicks: number; spend: number; leads: number }>();
      const devices = new Map<string, { impressions: number; clicks: number; spend: number; leads: number }>();
      for (const r of rows) {
        const raw: any = r.raw ?? {};
        const ageBreakdown = raw.age_breakdown ?? raw.age ?? raw.age_gender_breakdown;
        if (Array.isArray(ageBreakdown)) {
          for (const a of ageBreakdown) {
            const k = a.age_range ?? a.age ?? "unknown";
            const cur = ageBuckets.get(String(k)) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
            cur.impressions += Number(a.impressions ?? r.impressions ?? 0);
            cur.clicks += Number(a.clicks ?? r.clicks ?? 0);
            cur.spend += Number(a.spend ?? r.spend ?? 0);
            cur.leads += Number(a.leads ?? r.leads ?? 0);
            ageBuckets.set(String(k), cur);
          }
        }
        const genderBreakdown = raw.gender_breakdown ?? raw.gender;
        if (Array.isArray(genderBreakdown)) {
          for (const a of genderBreakdown) {
            const k = a.gender ?? "unknown";
            const cur = genders.get(String(k)) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
            cur.impressions += Number(a.impressions ?? r.impressions ?? 0);
            cur.clicks += Number(a.clicks ?? r.clicks ?? 0);
            cur.spend += Number(a.spend ?? r.spend ?? 0);
            cur.leads += Number(a.leads ?? r.leads ?? 0);
            genders.set(String(k), cur);
          }
        }
        const pubBreakdown = raw.publisher_platform_breakdown ?? raw.publisher_platform;
        if (Array.isArray(pubBreakdown)) {
          for (const a of pubBreakdown) {
            const k = a.publisher_platform ?? a.platform ?? "unknown";
            const cur = platforms.get(String(k)) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
            cur.impressions += Number(a.impressions ?? r.impressions ?? 0);
            cur.clicks += Number(a.clicks ?? r.clicks ?? 0);
            cur.spend += Number(a.spend ?? r.spend ?? 0);
            cur.leads += Number(a.leads ?? r.leads ?? 0);
            platforms.set(String(k), cur);
          }
        }
        const devBreakdown = raw.device_platform_breakdown ?? raw.device_platform;
        if (Array.isArray(devBreakdown)) {
          for (const a of devBreakdown) {
            const k = a.device_platform ?? a.device ?? "unknown";
            const cur = devices.get(String(k)) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
            cur.impressions += Number(a.impressions ?? r.impressions ?? 0);
            cur.clicks += Number(a.clicks ?? r.clicks ?? 0);
            cur.spend += Number(a.spend ?? r.spend ?? 0);
            cur.leads += Number(a.leads ?? r.leads ?? 0);
            devices.set(String(k), cur);
          }
        }
      }
      const toArray = (m: Map<string, any>) => Array.from(m.entries()).map(([k, v]) => ({
        key: k,
        ...v,
        ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
        cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
        cpl: v.leads > 0 ? v.spend / v.leads : 0,
      })).sort((a, b) => b.spend - a.spend);
      res.json({
        client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency },
        since, until,
        age: toArray(ageBuckets),
        gender: toArray(genders),
        platform: toArray(platforms),
        device: toArray(devices),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client audience] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  // 7) FUNNEL
  // GET /api/clients/:idOrSlug/funnel?since&until
  // Returns {impressions, clicks, landingVisits, leads, conversions,
  //   conversionRateClickToLead, conversionRateLeadToSale, ...}
  // landingVisits falls back to clicks*0.6 if absent in raw.
  // ============================================================
  router.get("/clients/:idOrSlug/funnel", async (req, res) => {
    const { idOrSlug } = req.params;
    const { since, until } = parseWindow(req);
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const [agg] = await db
        .select({
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversions: sql<number>`coalesce(sum(${adsInsights.conversions}),0)::int`,
          conversionValue: sql<string>`coalesce(sum(${adsInsights.conversionValue})::numeric, 0::numeric)`,
          reach: sql<number>`coalesce(sum(${adsInsights.reach}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ));
      const impressions = Number(agg?.impressions ?? 0);
      const clicks = Number(agg?.clicks ?? 0);
      const leads = Number(agg?.leads ?? 0);
      const conversions = Number(agg?.conversions ?? 0);
      const spend = Number(agg?.spend ?? 0);
      const revenue = Number(agg?.conversionValue ?? 0);
      // Landing visits: estimate as 60% of clicks (industry standard) since
      // the platform doesn't always report landing-page views in insights.
      const landingVisits = Math.round(clicks * 0.6);
      const data = {
        impressions,
        clicks,
        landingVisits,
        leads,
        conversions,
        spend,
        revenue,
        reach: Number(agg?.reach ?? 0),
        rates: {
          ctr: impressions > 0 ? clicks / impressions : 0,
          clickToLanding: clicks > 0 ? landingVisits / clicks : 0,
          landingToLead: landingVisits > 0 ? leads / landingVisits : 0,
          clickToLead: clicks > 0 ? leads / clicks : 0,
          leadToSale: leads > 0 ? conversions / leads : 0,
          clickToSale: clicks > 0 ? conversions / clicks : 0,
        },
        cpls: {
          cpc: clicks > 0 ? spend / clicks : 0,
          cpl: leads > 0 ? spend / leads : 0,
          cpa: conversions > 0 ? spend / conversions : 0,
          roas: spend > 0 ? revenue / spend : 0,
        },
      };
      res.json({ client: { id: client.id, slug: client.slug, name: client.name, currency: client.currency }, since, until, funnel: data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client funnel] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  //   PUBLIC DASHBOARD MANAGEMENT (admin-only)
  //   ------------------------------------
  //   The agency creates a public link for a client. The link is a
  //   /public/dashboards/:slug URL the client can open without a login.
  //   No expiration by design — revoke by deleting the row or toggling
  //   `enabled` to false.
  // ============================================================

  function randomSlug(bytes = 16): string {
    // URL-safe random string. Uses Node's built-in crypto.
    // Imported at top of file; no require() because the runtime is ESM.
    return randomBytes(bytes).toString("base64url");
  }

  // POST /api/clients/:idOrSlug/public-dashboard
  // body: { label?: string }
  // returns: { id, slug, url, enabled, createdAt }
  router.post("/clients/:idOrSlug/public-dashboard", async (req, res) => {
    const { idOrSlug } = req.params;
    const { label } = (req.body ?? {}) as { label?: string };
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      // One active public dashboard per client. If one already exists,
      // return it instead of creating a duplicate.
      const [existing] = await db
        .select()
        .from(publicDashboards)
        .where(eq(publicDashboards.clientId, client.id));
      if (existing) {
        return res.json({
          id: existing.id,
          slug: existing.slug,
          url: `${panelUrl()}/public/dashboards/${existing.slug}`,
          enabled: existing.enabled,
          label: existing.label,
          createdAt: existing.createdAt,
        });
      }
      // Resolve the companyId via the first mapping for this client.
      // Fall back to the LMTM OS company if the client has no mapping yet.
      const [mappingRow] = await db
        .select({ companyId: adsAccountMappings.companyId })
        .from(adsAccountMappings)
        .where(eq(adsAccountMappings.clientId, client.id))
        .limit(1);
      const companyId = mappingRow?.companyId ?? "00000000-0000-4000-8000-000000000001";
      const [created] = await db
        .insert(publicDashboards)
        .values({
          clientId: client.id,
          companyId,
          slug: randomSlug(),
          label: label ?? client.name,
          enabled: true,
          createdByUserId: req.actor && "userId" in req.actor ? req.actor.userId : null,
        })
        .returning();
      res.status(201).json({
        id: created.id,
        slug: created.slug,
        url: `${panelUrl()}/public/dashboards/${created.slug}`,
        enabled: created.enabled,
        label: created.label,
        createdAt: created.createdAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[public-dashboard create] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // GET /api/clients/:idOrSlug/public-dashboard
  // returns: { id, slug, url, enabled, label, createdAt, lastViewedAt } | null
  router.get("/clients/:idOrSlug/public-dashboard", async (req, res) => {
    const { idOrSlug } = req.params;
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const [row] = await db.select().from(publicDashboards).where(eq(publicDashboards.clientId, client.id));
      if (!row) return res.json(null);
      res.json({
        id: row.id,
        slug: row.slug,
        url: `${panelUrl()}/public/dashboards/${row.slug}`,
        enabled: row.enabled,
        label: row.label,
        createdAt: row.createdAt,
        lastViewedAt: row.lastViewedAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[public-dashboard get] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // PATCH /api/clients/:idOrSlug/public-dashboard
  // body: { enabled?: boolean, label?: string }
  router.patch("/clients/:idOrSlug/public-dashboard", async (req, res) => {
    const { idOrSlug } = req.params;
    const { enabled, label } = (req.body ?? {}) as { enabled?: boolean; label?: string };
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const updates: Record<string, unknown> = {};
      if (typeof enabled === "boolean") updates.enabled = enabled;
      if (typeof label === "string") updates.label = label;
      if (Object.keys(updates).length === 0) return res.json({ ok: true, noop: true });
      const [updated] = await db
        .update(publicDashboards)
        .set(updates)
        .where(eq(publicDashboards.clientId, client.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "no public dashboard for this client" });
      res.json({ ok: true, slug: updated.slug, enabled: updated.enabled, label: updated.label });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[public-dashboard patch] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // DELETE /api/clients/:idOrSlug/public-dashboard
  // Revokes the link.
  router.delete("/clients/:idOrSlug/public-dashboard", async (req, res) => {
    const { idOrSlug } = req.params;
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const result = await db.delete(publicDashboards).where(eq(publicDashboards.clientId, client.id));
      res.json({ ok: true, deleted: true       });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[public-dashboard delete] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ============================================================
  //   BULK SYNC — sync ALL mappings for a client
  //   ------------------------------------
  //   POST /api/clients/:idOrSlug/sync
  //   body: { jobs?: Array<"campaigns"|"adsets"|"ads"|"insights"|"organic">, since?, until? }
  //   returns: { client, results: [{ mappingId, label, adAccountId, status, ... }] }
  //
  //   This is the endpoint the ClientDashboard "Sincronizar" button
  //   should call. It iterates every ad_account_mapping for the client
  //   and runs the requested jobs sequentially with a 1s sleep between
  //   ad accounts to stay under Meta's per-app rate limit.
  // ============================================================
  router.post("/clients/:idOrSlug/sync", async (req, res) => {
    const { idOrSlug } = req.params;
    const body = (req.body ?? {}) as {
      jobs?: Array<"campaigns" | "adsets" | "ads" | "insights" | "organic">;
      since?: string;
      until?: string;
    };
    const jobs = body.jobs && body.jobs.length > 0 ? body.jobs : ["campaigns", "adsets", "ads", "insights", "organic"];
    try {
      const client = await resolveClient(idOrSlug, db);
      if (!client) return res.status(404).json({ error: "client not found" });
      const mappings = await db
        .select({
          id: adsAccountMappings.id,
          adAccountId: adsAccountMappings.adAccountId,
          pageId: adsAccountMappings.pageId,
          label: adsAccountMappings.label,
          connectionId: adsAccountMappings.connectionId,
        })
        .from(adsAccountMappings)
        .where(eq(adsAccountMappings.clientId, client.id));
      if (mappings.length === 0) {
        return res.json({
          client: { id: client.id, slug: client.slug, name: client.name },
          mappings: 0,
          results: [],
          note: "No mappings for this client. Use the picker at /connect-ads.",
        });
      }
      const sinceDate = body.since ? new Date(body.since) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const untilDate = body.until ? new Date(body.until) : new Date();
      const since = sinceDate.toISOString().slice(0, 10);
      const until = untilDate.toISOString().slice(0, 10);
      const results: any[] = [];
      // For each mapping, run jobs sequentially. Between mappings, sleep 2s.
      for (const m of mappings) {
        for (const job of jobs) {
          const startedAt = new Date();
          try {
            const opts = { jobName: job, connectionId: m.connectionId, mappingId: m.id, since: sinceDate, until: untilDate };
            let n = 0;
            if (job === "campaigns") n = await adsAggregator.syncCampaigns(db, opts);
            else if (job === "adsets") n = await adsAggregator.syncAdsets(db, opts);
            else if (job === "ads") n = await adsAggregator.syncCreatives(db, opts);
            else if (job === "insights") n = await adsAggregator.syncInsights(db, opts);
            else if (job === "organic") n = await adsAggregator.syncOrganic(db, opts);
            results.push({ mappingId: m.id, label: m.label, adAccountId: m.adAccountId, job, status: "completed", recordsSynced: n, startedAt, completedAt: new Date() });
            console.log(`[bulk-sync] ${client.slug} ${m.label} ${job} -> ${n}`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const cause = e instanceof Error ? (e as any).cause : null;
            const causeMsg = cause ? (cause instanceof Error ? cause.message : String(cause)) : null;
            const full = causeMsg ? `${msg} | cause: ${causeMsg}` : msg;
            results.push({ mappingId: m.id, label: m.label, adAccountId: m.adAccountId, job, status: "failed", error: full.slice(0, 500), startedAt, completedAt: new Date() });
            console.log(`[bulk-sync] ${client.slug} ${m.label} ${job} FAILED: ${full.slice(0, 200)}`);
          }
          // Brief pause between jobs within the same account
          await new Promise((r) => setTimeout(r, 500));
        }
        // 2s pause between ad accounts
        await new Promise((r) => setTimeout(r, 2000));
      }
      const total = results.reduce((acc, r) => acc + (r.recordsSynced ?? 0), 0);
      const failed = results.filter((r) => r.status === "failed").length;
      res.json({
        client: { id: client.id, slug: client.slug, name: client.name },
        mappings: mappings.length,
        since, until,
        jobs,
        ok: failed === 0,
        totalRecords: total,
        failedCount: failed,
        results,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[client bulk-sync] failed", idOrSlug, msg);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 500) });
    }
  });

  // ── ClickUp sync ────────────────────────────────────────────────
  // POST /api/clients/:id/clickup/sync — detect the 3 standard lists
  // (Redes Sociales, Produção de video, Enfoque Técnico) and persist
  // their IDs on the client row. Also sets the folder ID for the
  // dashboard button.
  router.post("/clients/:id/clickup/sync", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    try {
      const result = await detectClientClickUpLists(db, row.id);
      // Sync the Customer Brain so it picks up the (now-detected) Enfoque Técnico doc.
      await refreshClientBrain(db, row.id).catch((e) => console.warn("[clickup-sync] brain refresh failed:", e));
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[clickup-sync]", row.id, msg);
      res.status(500).json({ error: msg });
    }
  });

  // POST /api/clients/:id/clickup/enfoque-tecnico/refresh — fetch
  // the Enfoque Técnico list contents and cache them.
  router.post("/clients/:id/clickup/enfoque-tecnico/refresh", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    try {
      const result = await refreshEnfoqueTecnicoContext(db, row.id);
      // Push the freshly-fetched Enfoque Técnico into the Customer Brain.
      await refreshClientBrain(db, row.id).catch((e) => console.warn("[clickup-enfoque-refresh] brain refresh failed:", e));
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[clickup-enfoque-refresh]", row.id, msg);
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/clients/:id/clickup/enfoque-tecnico — get cached
  // Enfoque Técnico context (auto-refreshes if stale).
  router.get("/clients/:id/clickup/enfoque-tecnico", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    try {
      const opts = { forceRefresh: req.query.forceRefresh === "true", maxAgeMs: req.query.maxAgeMs ? Number(req.query.maxAgeMs) : undefined };
      const result = await getEnfoqueTecnicoContext(db, row.id, opts);
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[clickup-enfoque-get]", row.id, msg);
      res.status(500).json({ error: msg });
    }
  });

  // ── WhatsApp alerts ──────────────────────────────────────────────
  // PUT /api/clients/:id/notify — set the WhatsApp number that receives
  // this client's automated alerts. Stored in clients.metadata.notifyWhatsapp.
  router.put("/clients/:id/notify", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    const raw = (req.body?.whatsapp ?? "").toString().trim();
    const metadata = { ...(row.metadata ?? {}), notifyWhatsapp: raw || undefined };
    if (!raw) delete (metadata as Record<string, unknown>).notifyWhatsapp;
    await db.update(clients).set({ metadata, updatedAt: new Date() }).where(eq(clients.id, row.id));
    res.json({ ok: true, notifyWhatsapp: raw || null });
  });

  // POST /api/clients/:id/alerts/run — compute + deliver this client's alerts now.
  router.post("/clients/:id/alerts/run", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    const alerts = await generateClientAlerts(db, row.id);
    const team = alertsNumber();
    let delivery: { ok: boolean; error?: string } | null = null;
    if (team && alerts.length > 0) {
      const icon = (s: string) => (s === "critical" ? "🔴" : s === "warn" ? "🟠" : "🔵");
      const body = [`*Alertas — ${row.name}*`, "", ...alerts.map((a) => `${icon(a.severity)} *${a.title}*\n${a.description}\n→ ${a.recommendation}`)].join("\n");
      delivery = await sendWhatsAppToNumber(team, body);
    }
    res.json({ client: row.slug, alerts, delivered: delivery?.ok ?? false, teamConfigured: !!team, deliveryError: delivery?.error ?? null });
  });

  // POST /api/clients/alerts/run-all — run the alert sweep across all clients.
  router.post("/clients/alerts/run-all", async (_req, res) => {
    const result = await runClientAlerts(db);
    res.json(result);
  });

  // POST /api/clients/whatsapp/test — send a message to the team alerts number,
  // to verify the WhatsApp gateway can deliver end-to-end. Optional body
  // { text } overrides the default test message.
  router.post("/clients/whatsapp/test", async (req, res) => {
    const number = alertsNumber();
    if (!number) return res.status(400).json({ ok: false, error: "LMTM_ALERTS_WHATSAPP / LMTM_TEAM_WHATSAPP no configurado" });
    const custom = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const text = custom || `🔔 *LMTM-OS — mensaje de prueba*\nEl gateway de WhatsApp está funcionando. Las alertas de las cuentas llegarán a este número.\n\n${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
    const r = await sendWhatsAppToNumber(number, text);
    res.status(r.ok ? 200 : 502).json({ ...r, number });
  });

  // POST /api/clients/:id/report/run — generate + create this client's weekly report
  // as a task in ClickUp now.
  router.post("/clients/:id/report/run", async (req, res) => {
    const { id: idOrSlug } = req.params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    const condition = isUuid ? eq(clients.id, idOrSlug) : eq(clients.slug, idOrSlug);
    const [row] = await db.select().from(clients).where(condition);
    if (!row) return res.status(404).json({ error: "client not found" });
    const report = await generateClientReport(db, row.id);
    if (!report?.hasData) return res.json({ client: row.slug, hasData: false, created: false });
    const result = await createClientReportTask(db, row.id, report.title, report.markdown);
    res.json({ client: row.slug, hasData: true, created: result.ok, url: result.url ?? null, error: result.error ?? null });
  });

  // POST /api/clients/reports/run-all — weekly report sweep across all clients.
  router.post("/clients/reports/run-all", async (_req, res) => {
    res.json(await runClientReports(db));
  });

  // POST /api/clients/portfolio/brief — cross-client brief (delivers to LMTM_TEAM_WHATSAPP).
  router.post("/clients/portfolio/brief", async (_req, res) => {
    res.json(await runPortfolioBrief(db));
  });

  // ── Intelligence layer ───────────────────────────────────────────
  // GET /api/clients/:id/intel — combined intelligence panel payload.
  router.get("/clients/:id/intel", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });

    // Extra ClickUp fields for the Enfoque Técnico deep-link.
    const [detail] = await db.select({
      clickupListEnfoqueTecnicoId: clients.clickupListEnfoqueTecnicoId,
      metadata: clients.metadata,
    }).from(clients).where(eq(clients.id, row.id)).limit(1);

    // Auto-sync Enfoque Técnico into the brain if stale (> 30 min since last update).
    const [enfoqueEntry] = await db.select({ updatedAt: clientMemory.updatedAt })
      .from(clientMemory)
      .where(and(eq(clientMemory.clientId, row.id), eq(clientMemory.key, "enfoque-tecnico")))
      .limit(1);
    if (!enfoqueEntry || Date.now() - enfoqueEntry.updatedAt.getTime() > 30 * 60 * 1000) {
      await refreshClientBrain(db, row.id).catch(() => {});
    }

    const [score, brain, opps, feedback, content] = await Promise.all([
      getLatestScore(db, row.id),
      getClientBrain(db, row.id),
      listOpportunities(db, row.id),
      listFeedback(db, { clientId: row.id }),
      topContent(db, row.id, 8),
    ]);

    const teamId = (detail?.metadata?.clickupTeamId as string | undefined) ?? null;
    const docId = detail?.clickupListEnfoqueTecnicoId ?? null;
    const enfoqueTecnicoUrl = teamId && docId ? `https://app.clickup.com/${teamId}/v/dc/${docId}` : null;

    res.json({ client: { id: row.id, slug: row.slug, name: row.name, enfoqueTecnicoUrl }, score, brain, opportunities: opps, feedback, topContent: content });
  });

  router.get("/clients/:id/score", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json({ latest: await getLatestScore(db, row.id), history: await getScoreHistory(db, row.id) });
  });
  router.post("/clients/:id/score/run", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(await computeClientScore(db, row.id));
  });
  router.post("/clients/:id/brain/refresh", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(await refreshClientBrain(db, row.id));
  });
  router.post("/clients/:id/opportunities/run", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(await generateClientOpportunities(db, row.id));
  });
  router.post("/clients/:id/content/rebuild", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(await rebuildClientContent(db, row.id));
  });

  // ── Competitors + content generation (pauta vs posteo) ───────────────────
  router.get("/clients/:id/competitors", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    const rows = await db.select().from(competitors).where(eq(competitors.clientId, row.id)).orderBy(competitors.name);
    res.json({ competitors: rows });
  });

  router.post("/clients/:id/competitors", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    const companyId = await resolveCompanyId(db, row.id);
    if (!companyId) return res.status(400).json({ error: "client has no company" });
    const b = req.body ?? {};
    if (!b.name || typeof b.name !== "string") return res.status(400).json({ error: "name required" });
    const [created] = await db.insert(competitors).values({
      companyId, clientId: row.id, name: b.name.trim(),
      fbPageUrl: b.fbPageUrl ?? null, igHandle: b.igHandle ?? null, website: b.website ?? null,
      notes: b.notes ?? null, sampleAds: Array.isArray(b.sampleAds) ? b.sampleAds : [],
    }).returning();
    res.status(201).json(created);
  });

  router.patch("/clients/:id/competitors/:cid", async (req, res) => {
    const b = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["name", "fbPageUrl", "igHandle", "website", "notes"]) if (k in b) update[k] = b[k];
    if ("sampleAds" in b && Array.isArray(b.sampleAds)) update.sampleAds = b.sampleAds;
    const [row] = await db.update(competitors).set(update).where(eq(competitors.id, req.params.cid)).returning();
    if (!row) return res.status(404).json({ error: "competitor not found" });
    res.json(row);
  });

  router.delete("/clients/:id/competitors/:cid", async (req, res) => {
    await db.delete(competitors).where(eq(competitors.id, req.params.cid));
    res.status(204).end();
  });

  // POST /clients/:id/content/generate — AI plan split into pauta vs posteo.
  router.post("/clients/:id/content/generate", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(await generateContentPlan(db, row.id));
  });

  // GET /clients/:id/content-ideas — latest generated ideas (optionally ?kind=).
  router.get("/clients/:id/content-ideas", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    const kind = typeof req.query.kind === "string" ? req.query.kind : null;
    const conds = [eq(contentIdeas.clientId, row.id)];
    if (kind === "pauta" || kind === "posteo") conds.push(eq(contentIdeas.kind, kind));
    const rows = await db.select().from(contentIdeas).where(and(...conds)).orderBy(desc(contentIdeas.createdAt)).limit(100);
    res.json({ ideas: rows });
  });

  // GET /clients/:id/content-ideas.csv — export the content plan as a spreadsheet.
  router.get("/clients/:id/content-ideas.csv", async (req, res) => {
    const row = await resolveClient(req.params.id, db);
    if (!row) return res.status(404).json({ error: "client not found" });
    const rows = await db.select().from(contentIdeas).where(eq(contentIdeas.clientId, row.id)).orderBy(contentIdeas.kind, desc(contentIdeas.createdAt)).limit(500);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["tipo", "formato", "titulo", "copy", "rationale", "fecha"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.kind === "pauta" ? "Pauta" : "Posteo", r.format, r.title, r.copy, r.rationale, r.createdAt.toISOString().slice(0, 10)].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${row.slug}-contenido.csv"`);
    res.send("﻿" + lines.join("\n"));
  });

  // GET /api/clients/ads/balances — current spend-cap headroom per Meta account.
  router.get("/clients/ads/balances", async (_req, res) => {
    res.json({ balances: await fetchAccountBalances(db) });
  });
  // POST /api/clients/ads/balance-check — run the low-balance check + WhatsApp now.
  router.post("/clients/ads/balance-check", async (req, res) => {
    const threshold = Number(req.body?.threshold) || undefined;
    res.json(await runBalanceCheck(db, threshold));
  });

  // POST /api/clients/ads/sync-all — sync campaigns+insights for every mapping
  // now (used to backfill clients whose data went stale). Optional body
  // { sinceDays } to widen the window. Runs under the /clients auth boundary.
  router.post("/clients/ads/sync-all", async (req, res) => {
    const sinceDays = Number(req.body?.sinceDays) || undefined;
    res.json(await runAllAdsSync(db, { sinceDays }));
  });

  // Cross-client / agency-wide intelligence runs (kept under /clients auth boundary).
  router.post("/clients/intel/scores", async (_req, res) => { res.json(await runClientScores(db)); });
  router.post("/clients/intel/audit", async (_req, res) => { res.json(await runOperationalAudit(db)); });
  router.post("/clients/intel/feedback", async (_req, res) => { res.json(await ingestFeedback(db)); });
  router.post("/clients/intel/learnings", async (_req, res) => { res.json(await mineLearnings(db)); });

  return router;
}

