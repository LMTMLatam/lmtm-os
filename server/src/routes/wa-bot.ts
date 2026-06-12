import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  startWaBot,
  stopWaBot,
  getWaBotStatus,
  fetchQr,
  handleWebhook,
  getWaBotGroups,
  getGroupMessages,
  getGroupSummaries,
  updateWaBotConfig,
  runDailySummary,
  runDailyDigest,
  getWaGroupConfig,
  listWaGroupConfigs,
  setWaGroupConfig,
  getWaPublicHealth,
  tickWaBotKeepalive,
} from "../services/wa-group-bot.js";

export function waBotRoutes(db: Db) {
  const router = Router({ mergeParams: true });

  // Public health endpoint — no auth. Used by GitHub Actions and external monitors.
  router.get("/public-health", async (_req, res) => {
    const h = await getWaPublicHealth();
    const healthy = h.openwa.configured ? h.openwa.reachable : true;
    res.status(healthy ? 200 : 503).json(h);
  });

  // Public keepalive trigger — no auth, idempotent. GHA cron can hit this.
  router.post("/keepalive", async (_req, res) => {
    await tickWaBotKeepalive();
    const h = await getWaPublicHealth();
    res.json(h);
  });

  router.get("/status", async (_req, res) => {
    const status = getWaBotStatus();
    if (status.status === "connecting" && !status.qr) {
      const { qr } = await fetchQr();
      return res.json({ ...status, qr });
    }
    res.json(status);
  });

  router.get("/qr", async (_req, res) => {
    const result = await fetchQr();
    if (result.status === "connected") return res.json({ connected: true });
    return res.json({ qr: result.qr, status: result.status });
  });

  router.post("/start", async (_req, res) => {
    const result = await startWaBot();
    res.json(result);
  });

  router.post("/stop", async (_req, res) => {
    const result = await stopWaBot();
    res.json(result);
  });

  router.post("/webhook", async (req, res) => {
    res.json({ ok: true });
    await handleWebhook(req.body as Record<string, unknown>).catch(() => {});
  });

  router.get("/groups", async (_req, res) => {
    const groups = await getWaBotGroups(db);
    res.json(groups);
  });

  router.get("/groups/configs", async (_req, res) => {
    const configs = await listWaGroupConfigs(db);
    res.json(configs);
  });

  router.get("/groups/:jid/config", async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const cfg = await getWaGroupConfig(db, jid);
    res.json({ groupJid: jid, ...cfg });
  });

  router.put("/groups/:jid/config", async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const body = req.body as Record<string, unknown>;
    const cfg = await setWaGroupConfig(db, jid, body);
    res.json({ groupJid: jid, ...cfg });
  });

  router.get("/groups/:jid/messages", async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const msgs = await getGroupMessages(db, jid, since);
    res.json(msgs);
  });

  router.get("/groups/:jid/summaries", async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const summaries = await getGroupSummaries(db, jid);
    res.json(summaries);
  });

  router.post("/summary/run", async (_req, res) => {
    try {
      await runDailySummary();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.post("/digest/run", async (req, res) => {
    try {
      const date = req.body?.date as string | undefined;
      const result = await runDailyDigest(date);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.patch("/config", async (req, res) => {
    const { inactivityMinutes, summaryHour, summaryDestination } = req.body as {
      inactivityMinutes?: number;
      summaryHour?: number;
      summaryDestination?: string;
    };
    const result = await updateWaBotConfig(db, { inactivityMinutes, summaryHour, summaryDestination });
    res.json(result);
  });

  return router;
}
