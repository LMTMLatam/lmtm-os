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
  const router = Router({ mergeParams: true });

  router.get("/status", (_req, res) => {
    res.json(getWaBotStatus());
  });

  router.get("/qr", async (_req, res) => {
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

  router.post("/start", async (_req, res) => {
    const result = await startWaBot();
    res.json(result);
  });

  router.post("/stop", async (_req, res) => {
    const result = await stopWaBot();
    res.json(result);
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
    const { summaryHour } = req.body as { summaryHour?: number };
    const result = await updateWaBotConfig(db, { summaryHour });
    res.json(result);
  });

  router.get("/debug-import", async (_req, res) => {
    try {
      const mod = await import("@whiskeysockets/baileys") as Record<string, unknown>;
      const keys = Object.keys(mod);
      const defKeys = mod.default ? Object.keys(mod.default as object) : [];
      res.json({ keys: keys.slice(0, 20), defKeys: defKeys.slice(0, 20), hasDefault: "default" in mod, hasMakeWASocket: "makeWASocket" in mod });
    } catch (e) {
      res.json({ error: String(e) });
    }
  });

  return router;
}
