import { Router } from "express";
import QRCode from "qrcode";
import type { Db } from "@paperclipai/db";
import {
  startWaBot,
  stopWaBot,
  getWaBotStatus,
  getWaBotGroups,
  getGroupMessages,
  getGroupSummaries,
  updateWaBotConfig,
  runDailySummary,
} from "../services/wa-group-bot.js";

export function waBotRoutes(db: Db) {
  const router = Router();

  // GET /wa-bot/status
  router.get("/wa-bot/status", (_req, res) => {
    res.json(getWaBotStatus());
  });

  // GET /wa-bot/qr — returns QR as PNG base64 data URL
  router.get("/wa-bot/qr", async (_req, res) => {
    const { qr, status } = getWaBotStatus();
    if (status === "connected") return res.json({ connected: true });
    if (!qr) return res.json({ qr: null, status });
    try {
      const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      return res.json({ qr: dataUrl, status });
    } catch {
      return res.json({ qr, status });
    }
  });

  // POST /wa-bot/start
  router.post("/wa-bot/start", async (_req, res) => {
    const result = await startWaBot();
    res.json(result);
  });

  // POST /wa-bot/stop
  router.post("/wa-bot/stop", async (_req, res) => {
    const result = await stopWaBot();
    res.json(result);
  });

  // GET /wa-bot/groups
  router.get("/wa-bot/groups", async (_req, res) => {
    const groups = await getWaBotGroups(db);
    res.json(groups);
  });

  // GET /wa-bot/groups/:jid/messages
  router.get("/wa-bot/groups/:jid/messages", async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const msgs = await getGroupMessages(db, jid, since);
    res.json(msgs);
  });

  // GET /wa-bot/groups/:jid/summaries
  router.get("/wa-bot/groups/:jid/summaries", async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const summaries = await getGroupSummaries(db, jid);
    res.json(summaries);
  });

  // POST /wa-bot/summary/run — trigger summary now (for testing)
  router.post("/wa-bot/summary/run", async (_req, res) => {
    try {
      await runDailySummary();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /wa-bot/config
  router.patch("/wa-bot/config", async (req, res) => {
    const { summaryHour } = req.body as { summaryHour?: number };
    const result = await updateWaBotConfig(db, { summaryHour });
    res.json(result);
  });

  return router;
}
