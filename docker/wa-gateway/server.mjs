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
import postgres from "postgres";
import makeWASocket, {
  useMultiFileAuthState,
  initAuthCreds,
  BufferJSON,
  proto,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const PORT = parseInt(process.env.WA_GATEWAY_PORT || process.env.API_PORT || "8080", 10);
const API_KEY = process.env.OPENWA_API_KEY || "";
const SESSION_NAME = process.env.WA_AUTOMATE_SESSION_ID || "lmtm";
const SESSION_DIR = process.env.SESSION_DATA_PATH || "/app/data/wa-session";
const DATABASE_URL = process.env.DATABASE_URL || "";
const log = pino({ level: process.env.WA_GATEWAY_LOG_LEVEL || "info" });

// ── Postgres-backed Baileys auth state ────────────────────────────────────────
// Persists creds + signal keys in `wa_session_state` so the WhatsApp link
// survives container redeploys (the ephemeral filesystem does not). Falls back
// to the file-based store when DATABASE_URL is absent (local/dev).
//
// The pg client is a process-wide singleton: startSocket() runs again on every
// Baileys reconnect, so opening a fresh client per call would leak pooler
// connections over time. We open once and reuse it.
let sharedSql = null;
function getSql() {
  if (!sharedSql && DATABASE_URL) sharedSql = postgres(DATABASE_URL, { max: 1, onnotice: () => {}, prepare: false });
  return sharedSql;
}

async function usePostgresAuthState(sql, sessionName) {
  await sql`
    CREATE TABLE IF NOT EXISTS wa_session_state (
      session text NOT NULL,
      key text NOT NULL,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (session, key)
    )`;

  const read = async (key) => {
    const rows = await sql`SELECT value FROM wa_session_state WHERE session=${sessionName} AND key=${key}`;
    if (!rows.length) return null;
    return JSON.parse(JSON.stringify(rows[0].value), BufferJSON.reviver);
  };
  const write = async (key, value) => {
    const data = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await sql`
      INSERT INTO wa_session_state (session, key, value) VALUES (${sessionName}, ${key}, ${data})
      ON CONFLICT (session, key) DO UPDATE SET value = excluded.value, updated_at = now()`;
  };
  const del = async (key) => {
    await sql`DELETE FROM wa_session_state WHERE session=${sessionName} AND key=${key}`;
  };

  const creds = (await read("creds")) || initAuthCreds();

  return {
    clearAll: async () => { await sql`DELETE FROM wa_session_state WHERE session=${sessionName}`; },
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          await Promise.all(ids.map(async (id) => {
            let value = await read(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            result[id] = value;
          }));
          return result;
        },
        set: async (data) => {
          const ops = [];
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              const key = `${type}-${id}`;
              ops.push(value ? write(key, value) : del(key));
            }
          }
          await Promise.all(ops);
        },
      },
    },
    saveCreds: () => write("creds", creds),
  };
}

let pgAuth = null; // holds { clearAll } when using Postgres persistence

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
    let state, saveCreds;
    const sql = getSql();
    if (sql) {
      try {
        const pg = await usePostgresAuthState(sql, SESSION_NAME);
        pgAuth = { clearAll: pg.clearAll };
        state = pg.state;
        saveCreds = pg.saveCreds;
        log.info("auth state: Postgres (persistent across redeploys)");
      } catch (e) {
        log.warn(`Postgres auth state failed (${e?.message || e}); falling back to file store`);
      }
    }
    if (!state) {
      const fileAuth = await useMultiFileAuthState(SESSION_DIR);
      state = fileAuth.state;
      saveCreds = fileAuth.saveCreds;
      log.info("auth state: file store (ephemeral)");
    }
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
          try { await pgAuth?.clearAll?.(); } catch { /* noop */ }
          setStatus("DISCONNECTED");
          // Re-create a fresh session so a new QR is generated for re-linking.
          if (session.exists) setTimeout(() => startSocket().catch((e) => log.error(e)), 2000);
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
          const gName = await groupName(jid);
          emit("message.received", {
            isGroup: true,
            from: jid,
            body,
            contact: { pushName: m.pushName ?? null },
            groupName: gName,
            chatName: gName,
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
  // Wipe persisted creds so the next start shows a fresh QR.
  try { await pgAuth?.clearAll?.(); } catch { /* noop */ }
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
