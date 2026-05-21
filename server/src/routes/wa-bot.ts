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
} from "../services/wa-group-bot.js";

export function waBotRoutes(db: Db) {
  const router = Router({ mergeParams: true });

  router.get("/status", async (_req, res) => {
    const status = getWaBotStatus();
    // Proactively fetch QR from OpenWA while connecting so panel can display it
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

  router.patch("/config", async (req, res) => {
    const { inactivityMinutes } = req.body as { inactivityMinutes?: number };
    const result = await updateWaBotConfig(db, { inactivityMinutes });
    res.json(result);
  });

  return router;
}
