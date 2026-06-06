// LMTM-OS: platform-agnostic ads routes.
// Replaces routes/meta.ts and routes/meta-sync.ts gradually. Endpoints
// dispatch to the right AdsProvider based on the connection.platform
// column, not on hardcoded "meta" in the path.
//
//   GET    /api/ads/connections
//   GET    /api/ads/connections/:id
//   POST   /api/ads/connections          (manual token paste; platform-specific)
//   PATCH  /api/ads/connections/:id
//   DELETE /api/ads/connections/:id
//   GET    /api/ads/connections/:id/ad-accounts
//   GET    /api/ads/connections/:id/pages
//   GET    /api/ads/oauth/start?platform=meta&companyId=...
//   GET    /api/ads/oauth/callback
//
//   GET    /api/ads/mappings
//   GET    /api/ads/mappings/:id
//   POST   /api/ads/mappings
//   PATCH  /api/ads/mappings/:id
//   DELETE /api/ads/mappings/:id
//
//   POST   /api/ads/sync/:job            (job: campaigns|adsets|ads|insights|organic|all)
//   GET    /api/clients                  (list of LMTM clients)
//   POST   /api/clients
//   GET    /api/clients/:id/dashboard

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsCampaigns, adsConnections, adsInsights, clients, type AdsAccountMapping } from "@paperclipai/db";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getAdsProvider, isKnownAdsPlatform } from "../services/ads/registry.js";
import { googleAdsProviderScopes } from "../services/ads/providers/google.js";
import { tiktokAdsProviderScopes } from "../services/ads/providers/tiktok.js";
import { linkedinAdsProviderScopes } from "../services/ads/providers/linkedin.js";
import { logActivity } from "../services/activity-log.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, unprocessable } from "../errors.js";
import { adsAggregator } from "../services/ads/aggregator.js";
import type { AdAccountSummary, AdSetSummary } from "../services/ads/types.js";

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

export function adsRoutes(db: Db): Router {
  const router = Router();

  // ---- Connections ----

  router.get("/ads/connections", async (req, res) => {
    const companyId = (req.query.companyId as string) ?? null;
    const platform = (req.query.platform as string) ?? null;
    const conditions = [];
    if (companyId) conditions.push(eq(adsConnections.companyId, companyId));
    if (platform && isKnownAdsPlatform(platform)) {
      conditions.push(eq(adsConnections.platform, platform));
    }
    const rows = await db.select().from(adsConnections).where(conditions.length ? and(...conditions) : undefined);
    res.json({ connections: rows });
  });

  router.get("/ads/connections/:id", async (req, res) => {
    const [row] = await db.select().from(adsConnections).where(eq(adsConnections.id, req.params.id));
    if (!row) return res.status(404).json({ error: "connection not found" });
    res.json(row);
  });

  router.post("/ads/connections", async (req, res) => {
    const body = req.body ?? {};
    if (!body.companyId || !body.platform || !body.label || !body.accessToken) {
      return res.status(400).json({ error: "missing required fields: companyId, platform, label, accessToken" });
    }
    if (!isKnownAdsPlatform(body.platform)) {
      return res.status(400).json({ error: `unknown platform: ${body.platform}` });
    }
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
    res.status(201).json(row);
  });

  router.patch("/ads/connections/:id", async (req, res) => {
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["label", "accessToken", "refreshToken", "developerToken", "clientIdText", "clientSecret", "status", "lastError", "businessId", "pageId", "adAccountId", "managerAccountId", "merchantId", "appId", "tenantId", "tokenType"]) {
      if (k in body) update[k] = body[k];
    }
    if ("expiresAt" in body) update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if ("scopes" in body) update.scopes = body.scopes;
    const [row] = await db.update(adsConnections).set(update).where(eq(adsConnections.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "connection not found" });
    res.json(row);
  });

  router.delete("/ads/connections/:id", async (req, res) => {
    await db.delete(adsConnections).where(eq(adsConnections.id, req.params.id));
    res.status(204).end();
  });

  router.get("/ads/connections/:id/ad-accounts", async (req, res) => {
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

  router.get("/ads/connections/:id/pages", async (req, res) => {
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
  router.get("/ads/connections/:id/pages-with-adsets", async (req, res) => {
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
      const adSetsByAcc: Record<string, AdSetSummary[]> = {};
      if (provider.listAdSets) {
        const settled = await Promise.allSettled(
          allAccounts.map((acc) => provider.listAdSets!(acc.id, conn.accessToken)),
        );
        for (let i = 0; i < allAccounts.length; i += 1) {
          const r = settled[i];
          adSetsByAcc[allAccounts[i].id] = r.status === "fulfilled" ? r.value : [];
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

  // ---- Mappings ----

  router.get("/ads/mappings", async (req, res) => {
    const companyId = (req.query.companyId as string) ?? null;
    const clientId = (req.query.clientId as string) ?? null;
    const conditions = [];
    if (companyId) conditions.push(eq(adsAccountMappings.companyId, companyId));
    if (clientId) conditions.push(eq(adsAccountMappings.clientId, clientId));
    const rows = await db.select().from(adsAccountMappings).where(conditions.length ? and(...conditions) : undefined);
    res.json({ mappings: rows });
  });

  router.post("/ads/mappings", async (req, res) => {
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
  router.post("/ads/mappings/bulk", async (req, res) => {
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

  router.patch("/ads/mappings/:id", async (req, res) => {
    const body = req.body ?? {};
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["pageId", "label", "clientId"]) {
      if (k in body) update[k] = body[k];
    }
    const [row] = await db.update(adsAccountMappings).set(update).where(eq(adsAccountMappings.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "mapping not found" });
    res.json(row);
  });

  router.delete("/ads/mappings/:id", async (req, res) => {
    await db.delete(adsAccountMappings).where(eq(adsAccountMappings.id, req.params.id));
    res.status(204).end();
  });

  // ---- OAuth start (per platform) ----
  //
  // GET /api/ads/oauth/start?platform=google|tiktok|linkedin&companyId=...&label=...
  // Builds the platform's authorization URL with a base64url-encoded
  // state payload and 302-redirects the browser. After the user
  // grants access, the platform sends them back to /api/ads/oauth/callback.
  router.get("/ads/oauth/start", async (req, res) => {
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
  router.get("/ads/oauth/callback", async (req, res) => {
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

    const metaConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
    const companyId =
      connections[0]?.companyId ??
      mappings[0]?.companyId ??
      (req.actor.type === "board"
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
        meta: metaConfigured,
      },
      oauthStartUrl: metaConfigured && companyId
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
  router.post("/ads/sync/:job", async (req, res) => {
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
        return { job: name, status: "failed" as const, error: msg.slice(0, 300), startedAt, completedAt: new Date() };
      }
    };

    const jobsToRun = job === "all"
      ? ["campaigns", "adsets", "ads", "insights"]
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

  return router;
}
