// LMTM-OS — minimal Baileys WhatsApp HTTP gateway.
//
// Why this exists: the LMTM-OS server's WhatsApp group bot talks to an
// "OpenWA"-style REST API (sessions + QR + webhooks). The upstream OpenWA
// is a full NestJS app that requires Redis — too heavy for the 512MB Render
// box. This is a lean drop-in: pure Baileys (WebSocket, no browser) + Express,
// implementing exactly the endpoints the bot calls. ~100MB RSS.
//
// API (auth via X-API-Key == OPENWA_API_KEY):
//   GET    /api/sessions                          → [{id,name,status}]
//   POST   /api/sessions  {name, webhook:{url,events}} → {data:{id,name,status}} (201) | 409
//   GET    /api/sessions/:id                       → {data:{id,status,phoneNumber}}
//   GET    /api/sessions/:id/qr                    → {data:{qrCode}}  (PNG data URL)
//   DELETE /api/sessions/:id                       → logout + stop
//   POST   /api/sessions/:id/messages/send-text {chatId,text} → {data:{ok}}
//   GET    /health
//
// Webhooks (POST {event,data} → session.webhookUrl):
//   session.status   data:{status, phoneNumber}
//   session.qr       data:{qrCode}
//   message.received data:{isGroup, from, body, contact:{pushName}, groupName, timestamp, id}

import express from "express";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const PORT = parseInt(process.env.WA_GATEWAY_PORT || process.env.API_PORT || "8080", 10);
const API_KEY = process.env.OPENWA_API_KEY || "";
const SESSION_NAME = process.env.WA_AUTOMATE_SESSION_ID || "lmtm";
const SESSION_DIR = process.env.SESSION_DATA_PATH || "/app/data/wa-session";
const log = pino({ level: process.env.WA_GATEWAY_LOG_LEVEL || "info" });

// ── Single-session state ──────────────────────────────────────────────────────
const session = {
  exists: false,
  status: "DISCONNECTED", // DISCONNECTED | SCAN_QR | CONNECTING | CONNECTED
  qrCode: null,           // PNG data URL
  phoneNumber: null,
  webhookUrl: null,
  sock: null,
  starting: false,
};
const groupNameCache = new Map();

// ── Webhook emitter (fire-and-forget) ─────────────────────────────────────────
function emit(event, data) {
  const url = session.webhookUrl;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, data }),
  }).catch((e) => log.warn(`webhook ${event} failed: ${e?.message || e}`));
}

function setStatus(status, extra = {}) {
  session.status = status;
  emit("session.status", { status, phoneNumber: session.phoneNumber, ...extra });
}

function extractText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ""
  );
}

async function groupName(jid) {
  if (groupNameCache.has(jid)) return groupNameCache.get(jid);
  try {
    const meta = await session.sock.groupMetadata(jid);
    const name = meta?.subject ?? null;
    groupNameCache.set(jid, name);
    return name;
  } catch {
    return null;
  }
}

// ── Baileys lifecycle ─────────────────────────────────────────────────────────
async function startSocket() {
  if (session.starting) return;
  session.starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["LMTM-OS", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    session.sock = sock;
    if (session.status === "DISCONNECTED") setStatus("CONNECTING");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        try {
          session.qrCode = await QRCode.toDataURL(qr);
          session.status = "SCAN_QR";
          emit("session.qr", { qrCode: session.qrCode });
          emit("session.status", { status: "SCAN_QR", phoneNumber: null });
          log.info("QR updated — waiting for scan");
        } catch (e) {
          log.warn(`QR encode failed: ${e?.message || e}`);
        }
      }
      if (connection === "open") {
        session.qrCode = null;
        session.phoneNumber = (sock.user?.id || "").split(":")[0].split("@")[0] || null;
        setStatus("CONNECTED");
        log.info(`connected as ${session.phoneNumber}`);
      } else if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        log.warn(`connection closed (code=${code} loggedOut=${loggedOut})`);
        session.sock = null;
        session.starting = false;
        if (loggedOut) {
          session.phoneNumber = null;
          session.qrCode = null;
          setStatus("DISCONNECTED");
        } else if (session.exists) {
          setStatus("CONNECTING");
          setTimeout(() => startSocket().catch((e) => log.error(e)), 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        try {
          if (!m.message || m.key?.fromMe) continue;
          const jid = m.key?.remoteJid || "";
          if (!jid.endsWith("@g.us")) continue; // group messages only
          const body = extractText(m.message);
          if (!body) continue;
          const ts = typeof m.messageTimestamp === "number"
            ? m.messageTimestamp
            : Number(m.messageTimestamp?.toString?.() ?? Date.now() / 1000);
          emit("message.received", {
            isGroup: true,
            from: jid,
            body,
            contact: { pushName: m.pushName ?? null },
            groupName: await groupName(jid),
            chatName: await groupName(jid),
            timestamp: ts,
            id: m.key?.participant ?? jid,
          });
        } catch (e) {
          log.warn(`message handler error: ${e?.message || e}`);
        }
      }
    });
  } finally {
    session.starting = false;
  }
}

async function stopSocket() {
  session.exists = false;
  try { await session.sock?.logout(); } catch { /* noop */ }
  try { session.sock?.end?.(undefined); } catch { /* noop */ }
  session.sock = null;
  session.status = "DISCONNECTED";
  session.qrCode = null;
  session.phoneNumber = null;
}

// ── HTTP API ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!API_KEY) return next(); // no key configured → open (dev)
  if (req.get("X-API-Key") === API_KEY) return next();
  return res.status(401).json({ error: "invalid api key" });
});

app.get("/health", (_req, res) => res.json({ ok: true, status: session.status }));

app.get("/api/sessions", (_req, res) => {
  res.json(session.exists ? [{ id: SESSION_NAME, name: SESSION_NAME, status: session.status }] : []);
});

app.post("/api/sessions", async (req, res) => {
  const { name, webhook } = req.body || {};
  if (session.exists) {
    // already created — update webhook and report conflict (bot handles 409)
    if (webhook?.url) session.webhookUrl = webhook.url;
    return res.status(409).json({ error: "session exists", data: { id: SESSION_NAME, name: SESSION_NAME, status: session.status } });
  }
  session.exists = true;
  session.webhookUrl = webhook?.url || session.webhookUrl;
  startSocket().catch((e) => log.error(`startSocket: ${e?.message || e}`));
  res.status(201).json({ data: { id: SESSION_NAME, name: name || SESSION_NAME, status: session.status } });
});

app.get("/api/sessions/:id", (_req, res) => {
  res.json({ data: { id: SESSION_NAME, name: SESSION_NAME, status: session.status, phoneNumber: session.phoneNumber } });
});

app.get("/api/sessions/:id/qr", (_req, res) => {
  res.json({ data: { qrCode: session.qrCode }, qrCode: session.qrCode, status: session.status });
});

app.delete("/api/sessions/:id", async (_req, res) => {
  await stopSocket();
  res.json({ data: { ok: true } });
});

app.post("/api/sessions/:id/messages/send-text", async (req, res) => {
  const { chatId, text } = req.body || {};
  if (!chatId || !text) return res.status(400).json({ error: "chatId and text required" });
  if (!session.sock || session.status !== "CONNECTED") return res.status(409).json({ error: "not connected" });
  try {
    await session.sock.sendMessage(chatId, { text });
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, () => log.info(`[wa-gateway] listening on ${PORT} (session=${SESSION_NAME}, dir=${SESSION_DIR})`));
