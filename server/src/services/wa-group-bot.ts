import type { Db } from "@paperclipai/db";
import {
  waGroupMessages,
  waGroupSummaries,
  waBotConfig,
  waGroupConfig,
  waDailyDigests,
} from "@paperclipai/db";
import { desc, gte, eq, and, sql } from "drizzle-orm";
import { upsertMemory } from "./customer-brain.js";
import { resolveCompanyId } from "./intel-common.js";

const SESSION_ID = "lmtm";

function baseUrl() {
  return (process.env.OPENWA_URL ?? "").replace(/\/$/, "");
}

function headers() {
  const key = process.env.OPENWA_API_KEY ?? "";
  return { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) };
}

type OurStatus = "disconnected" | "connecting" | "connected";
type DeliveryMode = "group" | "email" | "clickup" | "n8n" | "none" | "all";
type SummaryTone = "rio_platense" | "formal" | "concise";

interface GroupCfg {
  enabled: boolean;
  inactivityMinutes: number;
  minMessages: number;
  deliveryMode: DeliveryMode;
  deliveryTarget: string | null;
  summaryTone: SummaryTone;
  groupName: string | null;
  clientId: string | null;
}

const DEFAULT_CFG: GroupCfg = {
  enabled: true,
  inactivityMinutes: 60, // resumir tras 1h de inactividad (configurable por grupo)
  minMessages: 3,
  deliveryMode: "none", // solo al panel por defecto (no re-postear al grupo)
  deliveryTarget: null,
  summaryTone: "rio_platense",
  groupName: null,
  clientId: null,
};

function mapStatus(s: string | undefined): OurStatus {
  switch ((s ?? "").toUpperCase()) {
    case "CONNECTED":
    case "READY": return "connected";
    case "INITIALIZING":
    case "SCAN_QR":
    case "CONNECTING":
    case "AUTHENTICATED": return "connecting";
    default: return "disconnected";
  }
}

let db: Db | null = null;
let cachedStatus: OurStatus = "disconnected";
let cachedPhone: string | null = null;
let cachedQr: string | null = null;
let inactivityMs = 30 * 60 * 1000;
let sessionRef = SESSION_ID;
let qrPollTimer: ReturnType<typeof setTimeout> | null = null;
let dailyDigestTimer: ReturnType<typeof setTimeout> | null = null;

const groupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const groupLastSummaryAt = new Map<string, Date>();

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

// --- Group config ---

async function getGroupCfg(groupJid: string): Promise<GroupCfg> {
  if (!db) return DEFAULT_CFG;
  try {
    const rows = await db.select().from(waGroupConfig).where(eq(waGroupConfig.groupJid, groupJid)).limit(1);
    if (rows.length === 0) return DEFAULT_CFG;
    const r = rows[0];
    return {
      enabled: r.enabled ?? true,
      inactivityMinutes: r.inactivityMinutes ?? 30,
      minMessages: r.minMessages ?? 3,
      // Default to "none" (panel only, NO re-posting into the group) to match
      // DEFAULT_CFG. The old "group" fallback caused summaries to be posted back
      // into the WhatsApp group when delivery_mode was null/unset.
      deliveryMode: (r.deliveryMode as DeliveryMode) ?? "none",
      deliveryTarget: r.deliveryTarget ?? null,
      summaryTone: (r.summaryTone as SummaryTone) ?? "rio_platense",
      groupName: r.groupName ?? null,
      clientId: r.clientId ?? null,
    };
  } catch {
    return DEFAULT_CFG;
  }
}

async function upsertGroupCfg(groupJid: string, patch: Partial<GroupCfg>) {
  if (!db) return;
  const now = new Date();
  const existing = await db.select().from(waGroupConfig).where(eq(waGroupConfig.groupJid, groupJid)).limit(1);
  if (existing.length === 0) {
    await db.insert(waGroupConfig).values({
      groupJid,
      groupName: patch.groupName ?? null,
      enabled: patch.enabled ?? true,
      inactivityMinutes: patch.inactivityMinutes ?? 30,
      minMessages: patch.minMessages ?? 3,
      deliveryMode: patch.deliveryMode ?? "none",
      deliveryTarget: patch.deliveryTarget ?? null,
      summaryTone: patch.summaryTone ?? "rio_platense",
      clientId: patch.clientId ?? null,
      updatedAt: now,
    }).catch(() => {});
  } else {
    const update: Record<string, unknown> = { updatedAt: now };
    if (patch.groupName !== undefined) update.groupName = patch.groupName;
    if (patch.enabled !== undefined) update.enabled = patch.enabled;
    if (patch.inactivityMinutes !== undefined) update.inactivityMinutes = patch.inactivityMinutes;
    if (patch.minMessages !== undefined) update.minMessages = patch.minMessages;
    if (patch.deliveryMode !== undefined) update.deliveryMode = patch.deliveryMode;
    if (patch.deliveryTarget !== undefined) update.deliveryTarget = patch.deliveryTarget;
    if (patch.summaryTone !== undefined) update.summaryTone = patch.summaryTone;
    if (patch.clientId !== undefined) update.clientId = patch.clientId;
    await db.update(waGroupConfig).set(update).where(eq(waGroupConfig.groupJid, groupJid)).catch(() => {});
  }
}

// --- AI summarization ---

function buildSystemPrompt(tone: SummaryTone): string {
  const base = "Sos un asistente que resume conversaciones de grupos de WhatsApp para equipos de agencia. Generá un resumen conciso";
  const tones: Record<SummaryTone, string> = {
    rio_platense: "en español rioplatense (vos, tenés, querés). Tono profesional, cercano y claro.",
    formal: "en español formal (usted). Tono corporativo, sin jerga.",
    concise: "en bullets muy cortos, sin frases hechas. Sin españolismos regionales.",
  };
  return `${base} ${tones[tone]} con esta estructura:\n- Temas tratados\n- Decisiones tomadas\n- Tareas mencionadas (con responsable si se identifica)\n- Puntos pendientes / abiertos\nSi algo no quedó claro, decí 'no quedó claro' en lugar de inventar. Máximo 300 palabras.`;
}

async function callAnthropic(systemPrompt: string, userContent: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (r.ok) {
      const data = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find(c => c.type === "text")?.text ?? "";
      return text.trim() || null;
    }
  } catch { /* fall through */ }
  return null;
}

async function callOpenAI(systemPrompt: string, userContent: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (r.ok) {
      const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content ?? "";
      return text.trim() || null;
    }
  } catch { /* noop */ }
  return null;
}

async function callMinimax(systemPrompt: string, userContent: string): Promise<string | null> {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) return null;
  try {
    const base = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
    const r = await fetch(`${base}/text/chatcompletion_v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL ?? "MiniMax-M3",
        max_tokens: 1024,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (r.ok) {
      const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data?.choices?.[0]?.message?.content ?? "";
      return raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim() || null;
    }
  } catch { /* noop */ }
  return null;
}

async function summarizeGroup(
  groupJid: string,
  groupName: string | null,
  messages: { senderName: string | null; body: string; timestamp: Date }[],
  tone: SummaryTone = "rio_platense",
): Promise<string | null> {
  if (messages.length === 0) return null;
  const transcript = messages.map((m) => `${m.senderName ?? "Desconocido"}: ${m.body}`).join("\n");
  const systemPrompt = buildSystemPrompt(tone);
  const userContent = `Grupo: ${groupName ?? groupJid}\n\nConversación:\n${transcript.slice(0, 8000)}`;

  return (
    (await callAnthropic(systemPrompt, userContent)) ??
    (await callOpenAI(systemPrompt, userContent)) ??
    (await callMinimax(systemPrompt, userContent))
  );
}

// --- Delivery ---

async function deliverSummary(
  groupJid: string,
  groupName: string | null,
  summary: string,
  messageCount: number,
  mode: DeliveryMode,
  target: string | null,
): Promise<{ delivered: string[] }> {
  const delivered: string[] = [];
  const text = `📊 *Resumen de conversación*\nGrupo: ${groupName ?? groupJid}\nMensajes: ${messageCount}\n\n${summary}`;

  if (mode === "all" || mode === "group") {
    try {
      await owPost(`/api/sessions/${SESSION_ID}/messages/send-text`, { chatId: groupJid, text });
      delivered.push("group");
    } catch { /* noop */ }
  }

  if ((mode === "all" || mode === "n8n") && target) {
    try {
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupJid, groupName, summary, messageCount, source: "lmtm-wa-bot" }),
      });
      if (r.ok) delivered.push("n8n");
    } catch { /* noop */ }
  }

  // email/clickup: n8n webhook can dispatch to those — same path
  if ((mode === "all" || mode === "email" || mode === "clickup") && target) {
    try {
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupJid, groupName, summary, messageCount, channel: mode, source: "lmtm-wa-bot" }),
      });
      if (r.ok) delivered.push(mode);
    } catch { /* noop */ }
  }

  return { delivered };
}

// --- Per-group inactivity-triggered summary ---

async function runGroupSummary(groupJid: string, groupName: string | null) {
  if (!db || cachedStatus !== "connected") return;

  const cfg = await getGroupCfg(groupJid);
  if (!cfg.enabled) return;

  const lastRows = await db
    .select({ createdAt: waGroupSummaries.createdAt })
    .from(waGroupSummaries)
    .where(eq(waGroupSummaries.groupJid, groupJid))
    .orderBy(desc(waGroupSummaries.createdAt))
    .limit(1);

  const since = lastRows.length > 0
    ? lastRows[0].createdAt
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const messages = await db
    .select()
    .from(waGroupMessages)
    .where(and(eq(waGroupMessages.groupJid, groupJid), gte(waGroupMessages.timestamp, since)))
    .orderBy(waGroupMessages.timestamp);

  if (messages.length < cfg.minMessages) return;

  const summary = await summarizeGroup(
    groupJid,
    cfg.groupName ?? groupName,
    messages.map((m) => ({ senderName: m.senderName, body: m.body, timestamp: m.timestamp })),
    cfg.summaryTone,
  );
  if (!summary) return;

  const summaryDate = new Date().toISOString();
  const [inserted] = await db
    .insert(waGroupSummaries)
    .values({ groupJid, groupName: cfg.groupName ?? groupName, summaryDate, content: summary, messageCount: messages.length })
    .returning({ id: waGroupSummaries.id });

  // Persist name if we learned it
  if (cfg.groupName === null && groupName !== null) {
    await upsertGroupCfg(groupJid, { groupName });
  }

  // If this group is mapped to a client, feed the summary into the client's
  // living memory so it surfaces as client context (and self-learning).
  if (cfg.clientId) {
    try {
      const companyId = await resolveCompanyId(db, cfg.clientId);
      if (companyId) {
        await upsertMemory(db, {
          companyId,
          clientId: cfg.clientId,
          kind: "event",
          key: `wa-summary-${summaryDate.slice(0, 10)}`,
          content: `Resumen WhatsApp (${cfg.groupName ?? groupName ?? "grupo"}): ${summary.slice(0, 600)}`,
          source: "wa-group-bot",
        });
      }
    } catch { /* noop */ }
  }

  const result = await deliverSummary(
    groupJid,
    cfg.groupName ?? groupName,
    summary,
    messages.length,
    cfg.deliveryMode,
    cfg.deliveryTarget,
  );

  if (inserted && result.delivered.length > 0) {
    await db.update(waGroupSummaries).set({ sentAt: new Date() }).where(eq(waGroupSummaries.id, inserted.id));
  }
  groupLastSummaryAt.set(groupJid, new Date());
}

function resetGroupTimer(groupJid: string, groupName: string | null, minutes: number) {
  const existing = groupTimers.get(groupJid);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    groupTimers.delete(groupJid);
    runGroupSummary(groupJid, groupName).catch(() => {});
  }, minutes * 60 * 1000);

  groupTimers.set(groupJid, timer);
}

// --- Daily digest (aggregate all groups) ---

export async function runDailyDigest(targetDate?: string): Promise<{ ok: boolean; skipped?: string }> {
  if (!db) return { ok: false };
  const date = targetDate ?? new Date().toISOString().slice(0, 10);

  const existing = await db.select().from(waDailyDigests).where(eq(waDailyDigests.digestDate, date)).limit(1);
  if (existing.length > 0 && existing[0].sentAt) {
    return { ok: true, skipped: "already-sent" };
  }

  const dayStart = new Date(date + "T00:00:00Z");
  const dayEnd = new Date(date + "T23:59:59Z");

  const summaries = await db
    .select()
    .from(waGroupSummaries)
    .where(and(gte(waGroupSummaries.createdAt, dayStart), sql`${waGroupSummaries.createdAt} <= ${dayEnd}`))
    .orderBy(waGroupSummaries.createdAt);

  if (summaries.length === 0) {
    return { ok: true, skipped: "no-summaries" };
  }

  const groups = new Set(summaries.map((s) => s.groupJid));
  const allText = summaries.map((s) => `[${s.groupName ?? s.groupJid}]\n${s.content}`).join("\n\n---\n\n");
  const systemPrompt = "Sos un asistente que consolida resúmenes diarios de múltiples grupos de WhatsApp de una agencia. Generá un único digest ejecutivo en español rioplatense con: resumen del día, decisiones clave, tareas surgidas, puntos a escalar. Agrupá por cliente si los grupos lo sugieren. Máximo 500 palabras.";
  const userContent = `Fecha: ${date}\nGrupos: ${groups.size}\nResúmenes individuales:\n\n${allText.slice(0, 12000)}`;

  const digest =
    (await callAnthropic(systemPrompt, userContent)) ??
    (await callOpenAI(systemPrompt, userContent)) ??
    (await callMinimax(systemPrompt, userContent));

  if (!digest) return { ok: false };

  // Pick a delivery target from any group config that has email/n8n, or use global
  const globalCfg = (await db.select().from(waBotConfig).limit(1))[0];
  const destination = globalCfg?.summaryDestination ?? "ceo-inbox";
  const target = process.env.WA_DAILY_DIGEST_TARGET ?? null;

  const [inserted] = await db
    .insert(waDailyDigests)
    .values({
      digestDate: date,
      content: digest,
      groupsCount: groups.size,
      summariesCount: summaries.length,
      sentTo: destination,
    })
    .onConflictDoNothing()
    .returning({ id: waDailyDigests.id });

  if (inserted && target) {
    try {
      const r = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, digest, groups: groups.size, summaries: summaries.length, source: "lmtm-wa-bot-daily" }),
      });
      if (r.ok) {
        await db.update(waDailyDigests).set({ sentAt: new Date() }).where(eq(waDailyDigests.id, inserted.id));
      }
    } catch { /* noop */ }
  }

  return { ok: true };
}

function scheduleDailyDigest() {
  if (dailyDigestTimer) clearTimeout(dailyDigestTimer);
  // Compute ms until next hour
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  const ms = nextHour.getTime() - now.getTime();
  dailyDigestTimer = setTimeout(async () => {
    dailyDigestTimer = null;
    try {
      if (!db) return;
      const cfg = (await db.select().from(waBotConfig).limit(1))[0];
      const targetHour = cfg?.summaryHour ?? 20;
      if (now.getHours() === targetHour) {
        await runDailyDigest();
      }
    } catch { /* noop */ }
    scheduleDailyDigest();
  }, ms);
}

// --- Manual "run now" ---

export async function runDailySummary() {
  if (!db) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(waGroupMessages)
    .where(gte(waGroupMessages.timestamp, since))
    .orderBy(waGroupMessages.timestamp);

  const groups = new Map<string, string | null>();
  for (const row of rows) {
    if (!groups.has(row.groupJid)) groups.set(row.groupJid, row.groupName);
  }

  for (const [groupJid, groupName] of groups) {
    await runGroupSummary(groupJid, groupName).catch(() => {});
  }
}

// --- Webhook handler ---

export async function handleWebhook(payload: Record<string, unknown>) {
  const event = payload.event as string | undefined;
  const data = (payload.data ?? {}) as Record<string, unknown>;

  if (event === "session.status") {
    const newStatus = mapStatus(data.status as string);
    cachedStatus = newStatus;
    if (newStatus !== "connecting") cachedQr = null;
    if (newStatus === "connected") {
      // OpenWA sends phoneNumber in session.status payload
      cachedPhone = (data.phoneNumber as string | null) ?? (data.phone as string | null) ?? null;
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
    const groupName = (data.groupName ?? data.chatName ?? null) as string | null;
    const rawTs = data.timestamp;
    const ts = rawTs
      ? (typeof rawTs === "number" ? new Date((rawTs as number) * 1000) : new Date(rawTs as string))
      : new Date();

    await db.insert(waGroupMessages).values({
      groupJid,
      groupName,
      senderJid: (data.id as string | null) ?? "unknown",
      senderName,
      body,
      timestamp: ts,
    }).catch(() => {});

    // Persist group name if we learned it
    if (groupName) {
      const cfg = await getGroupCfg(groupJid);
      if (!cfg.groupName) await upsertGroupCfg(groupJid, { groupName });
    }

    // Check if this group is enabled
    const cfg = await getGroupCfg(groupJid);
    if (!cfg.enabled) return;

    resetGroupTimer(groupJid, groupName, cfg.inactivityMinutes);
  }
}

// --- Public API ---

let lastAutoStartAt: Date | null = null;
let lastAutoStartError: string | null = null;
let autoStartAttempts = 0;
// Tracks whether this session has ever paired (creds exist). Used to decide
// whether to silently auto-reconnect (restore) vs. wait for the operator to
// open the WhatsApp section to pair. We never generate a QR in the background.
let wasEverConnected = false;

async function ensureSessionRunning(withQr = true): Promise<{ ok: boolean; error?: string }> {
  if (!baseUrl()) return { ok: false, error: "OPENWA_URL not set" };
  if (cachedStatus === "connected") return { ok: true };
  if (lastAutoStartAt) {
    const since = Date.now() - lastAutoStartAt.getTime();
    if (since < 30_000) return { ok: false, error: `cooldown (${Math.round(since / 1000)}s since last attempt)` };
  }
  lastAutoStartAt = new Date();
  autoStartAttempts++;
  console.log(`[wa-bot] ensureSessionRunning → attempt #${autoStartAttempts} (withQr=${withQr})`);
  const result = await startWaBot(withQr);
  if (result.error) {
    lastAutoStartError = result.error;
    return { ok: false, error: result.error };
  }
  lastAutoStartError = null;
  return { ok: true };
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  // 60s base, exponential up to 5 min
  const delay = Math.min(60_000 * Math.pow(2, Math.min(autoStartAttempts, 5)), 5 * 60_000);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    const r = await ensureSessionRunning();
    if (!r.ok) {
      console.log(`[wa-bot] reconnect failed: ${r.error} — retrying in ${delay}ms`);
      scheduleReconnect();
    } else {
      autoStartAttempts = 0;
    }
  }, delay);
}

export async function tickWaBotKeepalive() {
  if (!baseUrl()) return;
  // Only auto-reconnect a session that was already paired (silent restore, no
  // QR). For a never-paired session we do nothing — the QR is only generated
  // on demand when the operator opens the WhatsApp section.
  if (cachedStatus !== "connected" && wasEverConnected) {
    const r = await ensureSessionRunning(false);
    if (!r.ok && !reconnectTimer) scheduleReconnect();
  }
}

/**
 * Called on demand when the operator opens the WhatsApp section (via the
 * /status or /qr endpoints). Starts a pairing session WITH QR generation.
 * This is the only path that produces a QR.
 */
export async function ensurePairingForUi(): Promise<void> {
  if (!baseUrl() || cachedStatus === "connected") return;
  if (qrPollTimer) return; // a pairing poll is already running
  await ensureSessionRunning(true).catch(() => {});
}

export async function initWaBot(database: Db) {
  db = database;

  const existing = await db.select().from(waBotConfig).limit(1);
  if (existing.length === 0) {
    await db.insert(waBotConfig).values({});
  } else {
    await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() });
  }

  const config = (await db.select().from(waBotConfig).limit(1))[0];
  inactivityMs = (config?.summaryHour ?? 30) * 60 * 1000;
  inactivityMs = 30 * 60 * 1000;

  if (!baseUrl()) {
    console.warn("[wa-bot] OPENWA_URL not set — WA bot disabled");
  } else {
    // On boot, attempt a SILENT restore (no QR): if the gateway has persisted
    // creds it reconnects within a few seconds; if not, we tear the session
    // down so it doesn't sit churning QRs in the background. A fresh QR is
    // only generated on demand when the operator opens the WhatsApp section.
    setTimeout(() => {
      ensureSessionRunning(false)
        .then(async () => {
          // Give the gateway time to restore creds and report "connected".
          // A cold container after a redeploy can need a while to re-sync, so
          // wait generously. Only tear the session down if the gateway is
          // showing a QR ("qr") — i.e. there are NO persisted creds to restore,
          // so it would otherwise churn QRs in the background. If it has creds
          // (connecting/connected) we KEEP it running so alerts can send and
          // the link survives without the operator re-opening the UI.
          setTimeout(() => {
            if (cachedStatus === "connected") {
              autoStartAttempts = 0;
            } else if (cachedQr !== null) {
              // Gateway is showing a QR → there are NO persisted creds to
              // restore, so it would only churn QRs in the background. Stop it
              // until the operator opens the WhatsApp section.
              console.log("[wa-bot] no paired session to restore — stopping until operator opens WhatsApp section");
              void stopWaBot().catch(() => {});
            }
            // connecting WITHOUT a QR = has creds, still syncing → keep it so
            // alerts can send; keepalive will see it through.
          }, 45_000);
        })
        .catch(() => {});
    }, 2000);
  }

  scheduleDailyDigest();
}

export async function getWaPublicHealth() {
  let openwaReachable = false;
  let openwaError: string | null = null;
  if (baseUrl()) {
    try {
      const r = await owGet("/api/sessions");
      openwaReachable = Array.isArray(r) || typeof r === "object";
    } catch (e) {
      openwaReachable = false;
      openwaError = e instanceof Error ? e.message : String(e);
    }
  } else {
    openwaError = "OPENWA_URL not configured on LMTM-OS";
  }

  return {
    lmtmOs: { ok: true, ts: new Date().toISOString() },
    openwa: {
      configured: !!baseUrl(),
      url: baseUrl() ? baseUrl().replace(/\/+$/, "") : null,
      reachable: openwaReachable,
      error: openwaError,
    },
    bot: {
      status: cachedStatus,
      connectedPhone: cachedPhone,
      autoStartAttempts,
      lastAutoStartAt: lastAutoStartAt?.toISOString() ?? null,
      lastAutoStartError,
    },
  };
}

async function resolveSessionRef(): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/sessions`, { headers: headers() });
    if (!res.ok) return null;
    const sessions = await res.json().catch(() => []) as Array<{ id?: string; name?: string }>;
    const found = sessions.find((s) => s.name === SESSION_ID);
    return found?.id ?? null;
  } catch {
    return null;
  }
}

export async function startWaBot(withQr = true) {
  if (!baseUrl()) return { error: "OPENWA_URL not configured" };
  try {
    const publicUrl = (process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    const webhookUrl = publicUrl ? `${publicUrl}/api/wa-bot/webhook` : undefined;

    // OpenWA API: POST /api/sessions
    // Body: { name, webhook: { url, events } }
    // Session starts automatically on create; no separate /start call.
    const createRes = await fetch(`${baseUrl()}/api/sessions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: SESSION_ID,
        ...(webhookUrl ? { webhook: { url: webhookUrl, events: ["message.received", "message.ack", "session.status"] } } : {}),
      }),
    });
    const createBody = await createRes.text().catch(() => "");
    console.log(`[wa-bot] session create → ${createRes.status} ${createBody.slice(0, 300)}`);

    let data: { data?: { id?: string } } = {};
    if (createRes.ok) {
      try { data = JSON.parse(createBody); } catch {}
      if (data.data?.id) sessionRef = data.data.id;
    } else if (createRes.status === 409) {
      const uuid = await resolveSessionRef();
      if (uuid) sessionRef = uuid;
    } else {
      return { error: `Session create failed (${createRes.status}): ${createBody.slice(0, 300)}` };
    }

    console.log(`[wa-bot] session ref: ${sessionRef} (auto-started by OpenWA on create)`);
    cachedStatus = "connecting";
    cachedQr = null;
    if (db) await db.update(waBotConfig).set({ status: "connecting", updatedAt: new Date() }).catch(() => {});
    scheduleQrPoll(90, withQr);
    return { ok: true, data: data.data ?? {} };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function stopWaBot() {
  if (baseUrl()) {
    try { await owDelete(`/api/sessions/${sessionRef}`); } catch { /* noop */ }
  }
  for (const timer of groupTimers.values()) clearTimeout(timer);
  groupTimers.clear();
  if (dailyDigestTimer) { clearTimeout(dailyDigestTimer); dailyDigestTimer = null; }
  if (qrPollTimer) { clearTimeout(qrPollTimer); qrPollTimer = null; }
  cachedStatus = "disconnected";
  cachedQr = null;
  if (db) await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() }).catch(() => {});
  return { ok: true };
}

export function getWaBotStatus() {
  return { status: cachedStatus, connectedPhone: cachedPhone, qr: cachedQr, openwaAvailable: !!baseUrl() };
}

async function syncSessionStatus() {
  try {
    const res = await owGet(`/api/sessions/${sessionRef}`);
    const r = res as Record<string, unknown>;
    const d = (r.data ?? r) as Record<string, unknown>;
    const rawStatus = (d.status ?? r.status ?? "") as string;
    const newStatus = mapStatus(rawStatus);
    console.log(`[wa-bot] syncStatus → raw: ${rawStatus} mapped: ${newStatus}`);
    if (newStatus === "connected" && cachedStatus !== "connected") {
      cachedStatus = "connected";
      cachedQr = null;
      wasEverConnected = true;
      // OpenWA returns phoneNumber; older code paths used phone/me
      cachedPhone = (d.phoneNumber ?? d.phone ?? d.me ?? null) as string | null;
      if (db) await db.update(waBotConfig).set({ status: "connected", connectedPhone: cachedPhone, lastQr: null, updatedAt: new Date() }).catch(() => {});
    } else if (newStatus === "disconnected" && cachedStatus === "connecting") {
      cachedStatus = "disconnected";
      if (db) await db.update(waBotConfig).set({ status: "disconnected", updatedAt: new Date() }).catch(() => {});
    }
  } catch (e) {
    console.log(`[wa-bot] syncStatus failed: ${e instanceof Error ? e.message : e}`);
  }
}

// withQr=true → also fetch/refresh the pairing QR each tick (used while the
// operator has the WhatsApp section open). withQr=false → only check status,
// no QR generation (used for silent reconnect of an already-paired session on
// boot/keepalive, so we never churn QRs in the background).
function scheduleQrPoll(attemptsLeft = 90, withQr = true) {
  if (qrPollTimer) clearTimeout(qrPollTimer);
  if (attemptsLeft <= 0 || cachedStatus !== "connecting") return;
  qrPollTimer = setTimeout(async () => {
    qrPollTimer = null;
    if (cachedStatus !== "connecting") return;
    await syncSessionStatus();
    if (cachedStatus !== "connecting") return;
    if (withQr) await fetchQr();
    scheduleQrPoll(attemptsLeft - 1, withQr);
  }, 2000);
}

export async function fetchQr(): Promise<{ qr: string | null; status: OurStatus }> {
  if (!baseUrl()) return { qr: null, status: "disconnected" };
  try {
    const res = await owGet(`/api/sessions/${sessionRef}/qr`);
    const r = res as Record<string, unknown>;
    const d = (r.data ?? {}) as Record<string, unknown>;
    const qr = (r.qrCode ?? r.value ?? r.image ?? d.qrCode ?? d.image ?? d.value ?? null) as string | null;
    console.log(`[wa-bot] fetchQr → keys: ${Object.keys(r).join(",")} qr: ${qr ? "present" : "null"}`);
    if (qr) cachedQr = qr;
    return { qr, status: cachedStatus };
  } catch (e) {
    console.log(`[wa-bot] fetchQr failed: ${e instanceof Error ? e.message : e}`);
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
  return database.select().from(waGroupSummaries).where(eq(waGroupSummaries.groupJid, groupJid)).orderBy(desc(waGroupSummaries.createdAt)).limit(30);
}

export async function updateWaBotConfig(database: Db, opts: { inactivityMinutes?: number; summaryHour?: number; summaryDestination?: string }) {
  await database.update(waBotConfig).set({ ...opts, updatedAt: new Date() });
  if (opts.inactivityMinutes !== undefined) inactivityMs = opts.inactivityMinutes * 60 * 1000;
  return { ok: true };
}

export async function getWaGroupConfig(database: Db, groupJid: string) {
  return getGroupCfg(groupJid);
}

export async function listWaGroupConfigs(database: Db) {
  return database.select().from(waGroupConfig).orderBy(waGroupConfig.groupName);
}

export async function setWaGroupConfig(database: Db, groupJid: string, patch: Partial<GroupCfg>) {
  await upsertGroupCfg(groupJid, patch);
  return getGroupCfg(groupJid);
}

/** WhatsApp groups mapped to a client + their recent summaries. Powers the
 *  per-client WhatsApp section. */
export async function getWaGroupsForClient(database: Db, clientId: string) {
  const configs = await database
    .select()
    .from(waGroupConfig)
    .where(eq(waGroupConfig.clientId, clientId))
    .orderBy(waGroupConfig.groupName);
  const groups = await Promise.all(
    configs.map(async (cfg) => {
      const summaries = await database
        .select({
          id: waGroupSummaries.id,
          summaryDate: waGroupSummaries.summaryDate,
          content: waGroupSummaries.content,
          messageCount: waGroupSummaries.messageCount,
          createdAt: waGroupSummaries.createdAt,
        })
        .from(waGroupSummaries)
        .where(eq(waGroupSummaries.groupJid, cfg.groupJid))
        .orderBy(desc(waGroupSummaries.createdAt))
        .limit(15);
      return {
        groupJid: cfg.groupJid,
        groupName: cfg.groupName,
        enabled: cfg.enabled,
        summaries,
      };
    }),
  );
  return { groups };
}
