import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertAuthenticated } from "./authz.js";
import {
  syncCampaigns, syncAdsets, syncAds, syncAdsInsights,
  syncPagePosts, getDashboardData,
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

  return router;
}
