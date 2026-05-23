import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertAuthenticated } from "./authz.js";
import {
  syncCampaigns, syncAdsets, syncAds, syncAdsInsights,
  syncPagePosts, getDashboardData, getCampaignsData, getAdsetsData,
  getAdsData, getPostsData, getAlerts, updateAlertStatus, evaluateAlerts,
} from "../services/meta-sync.js";

export function metaSyncRoutes(db: Db) {
  const router = Router();

  // POST /api/meta/sync/:job?companyId=&since=&until=
  router.post("/meta/sync/:job", async (req, res) => {
    assertAuthenticated(req);
    const job = req.params.job as string;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;

    try {
      let result: unknown;
      switch (job) {
        case "campaigns":        result = await syncCampaigns(db, companyId); break;
        case "adsets":           result = await syncAdsets(db, companyId); break;
        case "ads":              result = await syncAds(db, companyId); break;
        case "ads-insights":     result = await syncAdsInsights(db, { companyId, since, until }); break;
        case "page-posts":       result = await syncPagePosts(db, companyId); break;
        default: return res.status(400).json({ error: `Unknown job: ${job}` });
      }
      res.json({ ok: true, job, result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/companies/:companyId/meta/dashboard
  router.get("/companies/:companyId/meta/dashboard", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    try {
      const data = await getDashboardData(db, companyId, { since, until });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/companies/:companyId/meta/campaigns
  router.get("/companies/:companyId/meta/campaigns", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    try {
      const data = await getCampaignsData(db, companyId, { since, until });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/companies/:companyId/meta/adsets
  router.get("/companies/:companyId/meta/adsets", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    try {
      const data = await getAdsetsData(db, companyId, { since, until });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/companies/:companyId/meta/ads
  router.get("/companies/:companyId/meta/ads", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    const until = typeof req.query.until === "string" ? req.query.until : undefined;
    try {
      const data = await getAdsData(db, companyId, { since, until });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/companies/:companyId/meta/posts
  router.get("/companies/:companyId/meta/posts", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    try {
      const data = await getPostsData(db, companyId);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/companies/:companyId/meta/alerts
  router.get("/companies/:companyId/meta/alerts", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    try {
      const data = await getAlerts(db, companyId);
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/meta/alerts/:id
  router.patch("/meta/alerts/:id", async (req, res) => {
    assertAuthenticated(req);
    const { id } = req.params;
    const { status } = req.body as { status: string };
    if (!["pending", "seen", "resolved"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    try {
      await updateAlertStatus(db, id, status);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/companies/:companyId/meta/evaluate-alerts
  router.post("/companies/:companyId/meta/evaluate-alerts", async (req, res) => {
    assertAuthenticated(req);
    const companyId = req.params.companyId as string;
    try {
      const result = await evaluateAlerts(db, companyId);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
