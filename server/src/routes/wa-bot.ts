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
  getWaGroupsForClient,
  getWaPublicHealth,
  tickWaBotKeepalive,
  ensurePairingForUi,
} from "../services/wa-group-bot.js";
import { execFileSync } from "node:child_process";
import { unauthorized } from "../errors.js";

export function waBotRoutes(db: Db) {
  const router = Router({ mergeParams: true });

  // Auth boundary: every operator/UI endpoint requires an authenticated actor.
  // Exceptions (called by machines, not the dashboard):
  //   /public-health, /keepalive → external monitors / GHA cron
  //   /webhook                   → posted by the WhatsApp gateway itself
  const PUBLIC_WA_PATHS = ["/public-health", "/keepalive", "/webhook"];
  router.use((req, _res, next) => {
    if (PUBLIC_WA_PATHS.some((p) => req.path.endsWith(p))) return next();
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    next();
  });

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

  // Diagnostics: surface runtime info (processes, ports, openwa log tail)
  // so we can debug OpenWA from outside the container (no SSH in Render
  // starter plan).
  router.get("/diagnostics", async (_req, res) => {
    const out: Record<string, unknown> = {
      ts: new Date().toISOString(),
      env: {
        OPENWA_URL: process.env.OPENWA_URL ?? null,
        OPENWA_PORT: process.env.OPENWA_PORT ?? null,
        ENGINE_TYPE: process.env.ENGINE_TYPE ?? null,
        OPENWA_API_KEY_set: Boolean(process.env.OPENWA_API_KEY),
        PAPERCLIP_AUTH_PUBLIC_BASE_URL: process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ?? null,
      },
      processes: null,
      openwa_log_tail: null,
      listening_ports: null,
      errors: [],
    };
    try {
      out.processes = execFileSync("ps", ["-eo", "pid,ppid,etime,comm,args", "--sort=-etime"], {
        timeout: 5000, encoding: "utf8",
      }).toString().split("\n").slice(0, 40);
    } catch (e) { (out.errors as string[]).push("ps: " + String(e)); }
    try {
      out.wa_gateway_log_tail = execFileSync("tail", ["-n", "80", "/tmp/wa-gateway.log"], {
        timeout: 5000, encoding: "utf8",
      }).toString();
    } catch (e) { (out.errors as string[]).push("wa-gateway.log: " + String(e)); }
    try {
      out.openwa_log_tail = execFileSync("tail", ["-n", "60", "/tmp/openwa.log"], {
        timeout: 5000, encoding: "utf8",
      }).toString();
    } catch (e) { (out.errors as string[]).push("openwa.log: " + String(e)); }
    try {
      out.openwa_build_log_tail = execFileSync("tail", ["-n", "120", "/tmp/openwa-build.log"], {
        timeout: 5000, encoding: "utf8",
      }).toString();
    } catch (e) { (out.errors as string[]).push("openwa-build.log: " + String(e)); }
    try {
      out.tmp_files = execFileSync("ls", ["-la", "/tmp/"], { timeout: 5000, encoding: "utf8" }).toString();
    } catch { /* noop */ }
    try {
      out.openwa_dist_files = execFileSync("ls", ["-la", "/app/openwa/"], { timeout: 5000, encoding: "utf8" }).toString();
    } catch { /* noop */ }
    try {
      out.listening_ports = execFileSync(
        "sh", ["-c", "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo 'no ss/netstat'"],
        { timeout: 5000, encoding: "utf8" },
      ).toString();
    } catch (e) { (out.errors as string[]).push("ports: " + String(e)); }
    res.json(out);
  });

  // The WhatsApp section polls this while open. Opening the section is what
  // triggers pairing (and thus QR generation) — nothing generates a QR in the
  // background. If disconnected, kick off an on-demand pairing session.
  router.get("/status", async (_req, res) => {
    let status = getWaBotStatus();
    if (status.status === "disconnected") {
      await ensurePairingForUi();
      status = getWaBotStatus();
    }
    if (status.status === "connecting" && !status.qr) {
      const { qr } = await fetchQr();
      return res.json({ ...status, qr });
    }
    res.json(status);
  });

  router.get("/qr", async (_req, res) => {
    if (getWaBotStatus().status === "disconnected") await ensurePairingForUi();
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

  // WhatsApp groups mapped to a client + their summaries (per-client section).
  router.get("/clients/:clientId/groups", async (req, res) => {
    const data = await getWaGroupsForClient(db, req.params.clientId as string);
    res.json(data);
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


