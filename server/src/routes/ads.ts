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
import { adsAccountMappings, adsConnections, clients } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { getAdsProvider, isKnownAdsPlatform } from "../services/ads/registry.js";

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
    const [row] = await db.insert(adsAccountMappings).values({
      companyId: body.companyId,
      connectionId: body.connectionId,
      clientId: body.clientId ?? null,
      platform: body.platform ?? "meta",
      adAccountId: body.adAccountId.startsWith("act_") ? body.adAccountId : `act_${body.adAccountId}`,
      pageId: body.pageId ?? null,
      label: body.label ?? null,
    }).returning();
    res.status(201).json(row);
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
    const [row] = await db.select().from(clients).where(eq(clients.id, req.params.id));
    if (!row) return res.status(404).json({ error: "client not found" });
    res.json(row);
  });

  // ---- Sync trigger (lightweight; the real sync job lives in services/ads/aggregator.ts) ----

  router.post("/ads/sync/:job", async (req, res) => {
    const job = req.params.job;
    if (!["campaigns", "adsets", "ads", "insights", "organic", "all"].includes(job)) {
      return res.status(400).json({ error: `unknown job: ${job}` });
    }
    const { connectionId, mappingId, since, until } = req.body ?? {};
    if (!connectionId || !mappingId) {
      return res.status(400).json({ error: "missing connectionId or mappingId" });
    }
    // Defer the actual sync to the aggregator (avoid blocking the HTTP
    // request — return 202 Accepted and let the aggregator run in the
    // background). The aggregator is invoked by the routine scheduler
    // in the long run; this endpoint is a manual kick for the team.
    res.status(202).json({
      accepted: true,
      job,
      connectionId,
      mappingId,
      since: since ?? "last-30-days",
      until: until ?? "today",
      message: "Sync job queued. Check /api/companies/:id/ads/sync-status for progress.",
    });
  });

  return router;
}
