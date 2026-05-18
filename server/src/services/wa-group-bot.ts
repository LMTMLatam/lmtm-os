import type { Db } from "@paperclipai/db";
import { waGroupMessages, waGroupSummaries, waBotConfig } from "@paperclipai/db";
import { desc, gte, eq, and } from "drizzle-orm";

const SESSION_ID = "lmtm";

function baseUrl() {
  return (process.env.OPENWA_URL ?? "").replace(/\/$/, "");
}

function headers() {
  const key = process.env.OPENWA_API_KEY ?? "";
  return { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) };
}

type OurStatus = "disconnected" | "connecting" | "connected";

function mapStatus(s: string | undefined): OurStatus {
  switch ((s ?? "").toUpperCase()) {
    case "CONNECTED": return "connected";
    case "INITIALIZING":
    case "SCAN_QR":
    case "CONNECTING":
    case "AUTHENTICATED": return "connecting";
    default: return "disconnected";
  }
}

let db: Db | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;
let cachedStatus: OurStatus = "disconnected";
let cachedPhone: string | null = null;
let cachedQr: string | null = null;

// --- OpenWA HTTP helpers ---

async function owGet(path: string) {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`OpenWA ${path} → ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function owPost(path: string, body?: unknown) {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, { method: "POST", headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWA POST ${path} → ${res.status} ${text}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function owDelete(path: string) {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error(`OpenWA DELETE ${path} → ${res.status}`);
}

// --- Summarization (unchanged) ---

async function summarizeGroup(groupJid: string, groupName: string | null, messages: { senderName: string | null; body: string; timestamp: Date }[]) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const baseUrl2 = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";
  if (!apiKey || messages.length === 0) return null;

  const transcript = messages.map((m) => `${m.senderName ?? "Desconocido"}: ${m.body}`).join("\n");

  const r = await fetch(`${baseUrl2}/text/chatcompletion_v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "Sos un asistente que resume conversaciones de grupos de WhatsApp para equipos de agencia. Generá un resumen conciso en español rioplatense con: temas tratados, decisiones tomadas, tareas mencionadas y puntos pendientes. Máximo 300 palabras.",
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

export async function runDailySummary() {
  if (!db || cachedStatus !== "connected") return;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.select().from(waGroupMessages).where(gte(waGroupMessages.timestamp, since)).orderBy(waGroupMessages.timestamp);

  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byGroup.has(row.groupJid)) byGroup.set(row.groupJid, []);
    byGroup.get(row.groupJid)!.push(row);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [groupJid, msgs] of byGroup) {
    const groupName = msgs[0].groupName;
    const summary = await summarizeGroup(groupJid, groupName, msgs.map((m) => ({ senderName: m.senderName, body: m.body, timestamp: m.timestamp })));
    if (!summary) continue;

    await db.insert(waGroupSummaries).values({ groupJid, groupName, summaryDate: today, content: summary, messageCount: msgs.length })
      .onConflictDoUpdate({ target: [waGroupSummaries.groupJid, waGroupSummaries.summaryDate], set: { content: summary, messageCount: msgs.length } });

    try {
      const text = `📊 *Resumen del día ${today}*\nGrupo: ${groupName ?? groupJid}\n\n${summary}`;
      await owPost(`/api/sessions/${SESSION_ID}/messages/send-text`, { chatId: groupJid, text });
      await db.update(waGroupSummaries).set({ sentAt: new Date() })
        .where(and(eq(waGroupSummaries.groupJid, groupJid), eq(waGroupSummaries.summaryDate, today)));
    } catch { /* noop */ }
  }
}

function scheduleSummary(hour: number) {
  if (summaryTimer) clearInterval(summaryTimer);
  summaryTimer = setInterval(() => {
    const now = new Date();
    if (now.getHours() === hour && now.getMinutes() === 0) runDailySummary().catch(() => {});
  }, 60_000);
}

// --- Webhook handler (called from route) ---

export async function handleWebhook(payload: Record<string, unknown>) {
  const event = payload.event as string | undefined;
  const data = (payload.data ?? {}) as Record<string, unknown>;

  if (event === "session.status") {
    const newStatus = mapStatus(data.status as string);
    cachedStatus = newStatus;
    if (newStatus !== "connecting") cachedQr = null;
    if (newStatus === "connected") {
      cachedPhone = (data.phone as string | null) ?? null;
      if (db) await db.update(waBotConfig).set({ status: "connected", connectedPhone: cachedPhone, lastQr: null, updatedAt: new Date() }).catch(() => {});
    } else {
      if (db) await db.update(waBotConfig).set({ status: newStatus, updatedAt: new Date() }).catch(() => {});
    }
  }

  if (event === "session.qr") {
    cachedQr = (data.qrCode as string | null) ?? null;
    cachedStatus = "connecting";
    if (db) await db.update(waBotConfig).set({ lastQr: cachedQr, status: "connecting", updatedAt: new Date() }).catch(() => {});
  }

  if (event === "session.disconnected") {
    cachedStatus = "disconnected";
    cachedQr = null;
    if (db) await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() }).catch(() => {});
  }

  if (event === "message.received") {
    const isGroup = data.isGroup as boolean | undefined;
    if (!isGroup || !db) return;

    const groupJid = data.from as string;
    const body = (data.body as string | undefined) ?? "";
    if (!body) return;

    const contact = (data.contact ?? {}) as Record<string, unknown>;
    const senderName = (contact.pushName as string | null) ?? (contact.name as string | null) ?? null;
    const ts = data.timestamp ? new Date(data.timestamp as string) : new Date();

    await db.insert(waGroupMessages).values({
      groupJid,
      groupName: null,
      senderJid: (data.id as string | null) ?? "unknown",
      senderName,
      body,
      timestamp: ts,
    }).catch(() => {});
  }
}

// --- Public API ---

export async function initWaBot(database: Db) {
  db = database;

  const existing = await db.select().from(waBotConfig).limit(1);
  if (existing.length === 0) {
    await db.insert(waBotConfig).values({});
  } else {
    await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() });
  }

  const config = (await db.select().from(waBotConfig).limit(1))[0];
  scheduleSummary(config?.summaryHour ?? 20);

  if (!baseUrl()) {
    console.warn("[wa-bot] OPENWA_URL not set — WA bot disabled");
  }
}

export async function startWaBot() {
  if (!baseUrl()) return { error: "OPENWA_URL not configured" };
  try {
    const res = await owPost(`/api/sessions/${SESSION_ID}/start`);
    cachedStatus = "connecting";
    if (db) await db.update(waBotConfig).set({ status: "connecting", updatedAt: new Date() }).catch(() => {});
    return { ok: true, data: res };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function stopWaBot() {
  if (baseUrl()) {
    try { await owDelete(`/api/sessions/${SESSION_ID}`); } catch { /* noop */ }
  }
  cachedStatus = "disconnected";
  cachedQr = null;
  if (db) await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() }).catch(() => {});
  return { ok: true };
}

export function getWaBotStatus() {
  return { status: cachedStatus, connectedPhone: cachedPhone, qr: cachedQr, baileysAvailable: !!baseUrl() };
}

export async function fetchQr(): Promise<{ qr: string | null; status: OurStatus }> {
  if (!baseUrl()) return { qr: null, status: "disconnected" };
  try {
    const res = await owGet(`/api/sessions/${SESSION_ID}/qr`);
    const d = (res.data ?? {}) as Record<string, unknown>;
    const qr = (d.qrCode ?? d.image ?? null) as string | null;
    if (qr) cachedQr = qr;
    return { qr, status: cachedStatus };
  } catch {
    return { qr: cachedQr, status: cachedStatus };
  }
}

export async function getWaBotGroups(database: Db) {
  return database
    .select({ groupJid: waGroupMessages.groupJid, groupName: waGroupMessages.groupName })
    .from(waGroupMessages)
    .groupBy(waGroupMessages.groupJid, waGroupMessages.groupName);
}

export async function getGroupMessages(database: Db, groupJid: string, since?: Date) {
  const cond = since
    ? and(eq(waGroupMessages.groupJid, groupJid), gte(waGroupMessages.timestamp, since))
    : eq(waGroupMessages.groupJid, groupJid);
  return database.select().from(waGroupMessages).where(cond).orderBy(desc(waGroupMessages.timestamp)).limit(200);
}

export async function getGroupSummaries(database: Db, groupJid: string) {
  return database.select().from(waGroupSummaries).where(eq(waGroupSummaries.groupJid, groupJid)).orderBy(desc(waGroupSummaries.summaryDate)).limit(30);
}

export async function updateWaBotConfig(database: Db, opts: { summaryHour?: number }) {
  await database.update(waBotConfig).set({ ...opts, updatedAt: new Date() });
  if (opts.summaryHour !== undefined) scheduleSummary(opts.summaryHour);
  return { ok: true };
}
