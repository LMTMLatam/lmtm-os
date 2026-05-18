import type { Db } from "@paperclipai/db";
import { waGroupMessages, waGroupSummaries, waBotConfig } from "@paperclipai/db";
import { desc, gte, eq, and } from "drizzle-orm";

interface BaileysModule {
  default: {
    makeWASocket: (config: Record<string, unknown>) => WASocket;
    useMultiFileAuthState: (path: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
    DisconnectReason: Record<string, number>;
    fetchLatestBaileysVersion: () => Promise<{ version: number[] }>;
    makeCacheableSignalKeyStore: (store: unknown, logger: unknown) => unknown;
    proto: { WebMessageInfo: { fromObject: (m: unknown) => unknown } };
    downloadMediaMessage: (msg: unknown, format: string) => Promise<Buffer>;
    jidNormalizedUser: (jid: string) => string;
  };
}

interface WASocket {
  ev: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  sendMessage: (jid: string, content: Record<string, unknown>) => Promise<unknown>;
  logout: () => Promise<void>;
  end: (error?: Error) => void;
  ws: { readyState: number };
  authState: { creds: unknown };
}

interface WAMessage {
  key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null };
  message?: { conversation?: string | null; extendedTextMessage?: { text?: string | null } | null } | null;
  pushName?: string | null;
  messageTimestamp?: number | string | { toNumber: () => number } | null;
}

let sock: WASocket | null = null;
let db: Db | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;
let currentQr: string | null = null;
let status: "disconnected" | "connecting" | "connected" = "disconnected";
let connectedPhone: string | null = null;
let baileysAvailable = false;
let baileys: BaileysModule["default"] | null = null;

const AUTH_DIR = "/tmp/wa-auth";

async function loadBaileys() {
  try {
    // Dynamic import so server starts even if baileys not installed
    const mod = await import("@whiskeysockets/baileys") as unknown as BaileysModule;
    baileys = mod.default;
    baileysAvailable = true;
  } catch {
    baileysAvailable = false;
  }
}

async function summarizeGroup(groupJid: string, groupName: string | null, messages: { senderName: string | null; body: string; timestamp: Date }[]) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";
  if (!apiKey || messages.length === 0) return null;

  const transcript = messages
    .map((m) => `${m.senderName ?? "Desconocido"}: ${m.body}`)
    .join("\n");

  const r = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "Sos un asistente que resume conversaciones de grupos de WhatsApp para equipos de agencia. Generá un resumen conciso en español rioplatense con: temas tratados, decisiones tomadas, tareas mencionadas y puntos pendientes. Máximo 300 palabras.",
        },
        {
          role: "user",
          content: `Grupo: ${groupName ?? groupJid}\n\nConversación del día:\n${transcript.slice(0, 8000)}`,
        },
      ],
    }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim() || null;
}

async function runDailySummary() {
  if (!db || !sock || status !== "connected") return;

  // Get all groups that have messages in the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(waGroupMessages)
    .where(gte(waGroupMessages.timestamp, since))
    .orderBy(waGroupMessages.timestamp);

  // Group by groupJid
  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byGroup.has(row.groupJid)) byGroup.set(row.groupJid, []);
    byGroup.get(row.groupJid)!.push(row);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [groupJid, msgs] of byGroup) {
    const groupName = msgs[0].groupName;
    const summary = await summarizeGroup(
      groupJid,
      groupName,
      msgs.map((m) => ({ senderName: m.senderName, body: m.body, timestamp: m.timestamp })),
    );
    if (!summary) continue;

    // Upsert summary
    await db
      .insert(waGroupSummaries)
      .values({ groupJid, groupName, summaryDate: today, content: summary, messageCount: msgs.length })
      .onConflictDoUpdate({
        target: [waGroupSummaries.groupJid, waGroupSummaries.summaryDate],
        set: { content: summary, messageCount: msgs.length },
      });

    // Send back to group
    try {
      const text = `📊 *Resumen del día ${today}*\nGrupo: ${groupName ?? groupJid}\n\n${summary}`;
      await sock.sendMessage(groupJid, { text });
      await db
        .update(waGroupSummaries)
        .set({ sentAt: new Date() })
        .where(and(eq(waGroupSummaries.groupJid, groupJid), eq(waGroupSummaries.summaryDate, today)));
    } catch { /* noop */ }
  }
}

function scheduleSummary(hour: number) {
  if (summaryTimer) clearInterval(summaryTimer);
  // Check every minute if it's time for the daily summary
  summaryTimer = setInterval(() => {
    const now = new Date();
    if (now.getHours() === hour && now.getMinutes() === 0) {
      runDailySummary().catch(() => {});
    }
  }, 60_000);
}

async function connect() {
  if (!baileysAvailable || !baileys || !db) return;
  status = "connecting";
  currentQr = null;

  let state: unknown, saveCreds: () => Promise<void>;
  try {
    const auth = await baileys.useMultiFileAuthState(AUTH_DIR);
    state = auth.state;
    saveCreds = auth.saveCreds;
  } catch (e) {
    console.error("[wa-bot] useMultiFileAuthState failed:", e);
    status = "disconnected";
    return;
  }

  let version: number[];
  try {
    const v = await baileys.fetchLatestBaileysVersion();
    version = v.version;
  } catch (e) {
    console.warn("[wa-bot] fetchLatestBaileysVersion failed, using fallback:", e);
    version = [2, 3000, 1024768614];
  }

  try {
    sock = baileys.makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["LMTM Bot", "Chrome", "1.0"],
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 30_000,
    });
  } catch (e) {
    console.error("[wa-bot] makeWASocket failed:", e);
    status = "disconnected";
    return;
  }

  sock.ev.on("connection.update", async (update: unknown) => {
    const u = update as { connection?: string; lastDisconnect?: { error?: { output?: { statusCode?: number } } }; qr?: string };
    if (u.qr) {
      currentQr = u.qr;
      await db!.update(waBotConfig).set({ lastQr: u.qr, status: "connecting", updatedAt: new Date() });
    }
    if (u.connection === "open") {
      status = "connected";
      currentQr = null;
      const phone = (state as { creds?: { me?: { id?: string } } })?.creds?.me?.id?.split(":")[0] ?? null;
      connectedPhone = phone;
      await db!.update(waBotConfig).set({ status: "connected", connectedPhone: phone, lastQr: null, updatedAt: new Date() });
    }
    if (u.connection === "close") {
      status = "disconnected";
      const code = u.lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== 401;
      if (shouldReconnect) setTimeout(() => connect(), 5000);
      else await db!.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() });
    }
  });

  sock.ev.on("creds.update", saveCreds!);

  sock.ev.on("messages.upsert", async (upsert: unknown) => {
    const u = upsert as { type?: string; messages?: WAMessage[] };
    if (u.type !== "notify" || !u.messages) return;
    for (const msg of u.messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || !jid.endsWith("@g.us")) continue; // groups only

      const body =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        "";
      if (!body) continue;

      const ts = msg.messageTimestamp
        ? new Date(
            typeof msg.messageTimestamp === "object" && "toNumber" in msg.messageTimestamp
              ? (msg.messageTimestamp as { toNumber: () => number }).toNumber() * 1000
              : Number(msg.messageTimestamp) * 1000,
          )
        : new Date();

      await db!.insert(waGroupMessages).values({
        groupJid: jid,
        groupName: null,
        senderJid: msg.key.id ?? "unknown",
        senderName: msg.pushName ?? null,
        body,
        timestamp: ts,
      });
    }
  });
}

export async function initWaBot(database: Db) {
  db = database;
  await loadBaileys();

  // Ensure config row exists
  const existing = await db.select().from(waBotConfig).limit(1);
  if (existing.length === 0) {
    await db.insert(waBotConfig).values({});
  } else {
    // Reset status on restart
    await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() });
  }

  const config = (await db.select().from(waBotConfig).limit(1))[0];
  scheduleSummary(config?.summaryHour ?? 20);
}

export async function startWaBot() {
  if (!baileysAvailable) return { error: "Baileys not installed. Run: pnpm add @whiskeysockets/baileys" };
  if (status === "connected") return { ok: true, status: "already connected" };
  if (status === "connecting") return { ok: true, status: "already connecting" };
  connect().catch((e) => { console.error("[wa-bot] connect() unhandled:", e); status = "disconnected"; });
  return { ok: true };
}

export async function stopWaBot() {
  if (sock) { try { sock.end(); } catch { /* noop */ } sock = null; }
  status = "disconnected";
  if (db) await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() });
  return { ok: true };
}

export function getWaBotStatus() {
  return { status, connectedPhone, qr: currentQr, baileysAvailable };
}

export async function getWaBotGroups(database: Db) {
  const rows = await database
    .select({ groupJid: waGroupMessages.groupJid, groupName: waGroupMessages.groupName })
    .from(waGroupMessages)
    .groupBy(waGroupMessages.groupJid, waGroupMessages.groupName);
  return rows;
}

export async function getGroupMessages(database: Db, groupJid: string, since?: Date) {
  const cond = since
    ? and(eq(waGroupMessages.groupJid, groupJid), gte(waGroupMessages.timestamp, since))
    : eq(waGroupMessages.groupJid, groupJid);
  return database.select().from(waGroupMessages).where(cond).orderBy(desc(waGroupMessages.timestamp)).limit(200);
}

export async function getGroupSummaries(database: Db, groupJid: string) {
  return database
    .select()
    .from(waGroupSummaries)
    .where(eq(waGroupSummaries.groupJid, groupJid))
    .orderBy(desc(waGroupSummaries.summaryDate))
    .limit(30);
}

export async function updateWaBotConfig(database: Db, opts: { summaryHour?: number }) {
  await database.update(waBotConfig).set({ ...opts, updatedAt: new Date() });
  if (opts.summaryHour !== undefined) scheduleSummary(opts.summaryHour);
  return { ok: true };
}

export { runDailySummary };
