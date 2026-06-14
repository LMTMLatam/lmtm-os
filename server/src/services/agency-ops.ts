// LMTM-OS: agency operations — proactive agent loops.
//
// Turns the agent roster from "ask and they answer" into "always-on ops":
//   - Per-client WhatsApp alerting on ad performance (this file, Phase 1).
//   - Weekly client reports + cross-client portfolio brief (later phases).
//
// All delivery goes through the lean WhatsApp gateway (see docker/wa-gateway):
// POST ${OPENWA_URL}/api/sessions/${SESSION}/messages/send-text { chatId, text }.

import type { Db } from "@paperclipai/db";
import { adsInsights, adsAlerts, clients } from "@paperclipai/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

const SESSION = process.env.WA_AUTOMATE_SESSION_ID || "lmtm";

function gatewayBase(): string {
  return (process.env.OPENWA_URL ?? "").replace(/\/$/, "");
}

/** Normalize a human-entered phone into a WhatsApp JID: digits + @s.whatsapp.net. */
export function toWhatsAppJid(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null; // not a plausible number
  return `${digits}@s.whatsapp.net`;
}

/** Low-level: send a text to a WhatsApp number (or JID) via the gateway. */
export async function sendWhatsAppToNumber(numberOrJid: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const base = gatewayBase();
  if (!base) return { ok: false, error: "OPENWA_URL not configured" };
  const chatId = numberOrJid.includes("@") ? numberOrJid : toWhatsAppJid(numberOrJid);
  if (!chatId) return { ok: false, error: "invalid phone number" };
  try {
    const res = await fetch(`${base}/api/sessions/${SESSION}/messages/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.OPENWA_API_KEY ? { "X-API-Key": process.env.OPENWA_API_KEY } : {}) },
      body: JSON.stringify({ chatId, text }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `gateway ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read a client's configured alert number from metadata and send. */
export async function notifyClientWhatsApp(db: Db, clientId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { ok: false, error: "client not found" };
  const number = (client.metadata as { notifyWhatsapp?: string } | null)?.notifyWhatsapp?.trim();
  if (!number) return { ok: false, error: "client has no notifyWhatsapp configured" };
  return sendWhatsAppToNumber(number, text);
}

// ── Alert engine ──────────────────────────────────────────────────────────────

export interface ComputedAlert {
  severity: "info" | "warn" | "critical";
  title: string;
  description: string;
  metric: string;
  currentValue: number | null;
  thresholdValue: number | null;
  recommendation: string;
}

type Agg = { spend: number; impressions: number; clicks: number; leads: number; reach: number };

function n(v: unknown): number {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10);

async function aggInsights(db: Db, clientId: string, sinceISO: string, untilISO: string): Promise<Agg> {
  const [row] = await db
    .select({
      spend: sql<string>`COALESCE(SUM(${adsInsights.spend}), 0)`,
      impressions: sql<string>`COALESCE(SUM(${adsInsights.impressions}), 0)`,
      clicks: sql<string>`COALESCE(SUM(${adsInsights.clicks}), 0)`,
      leads: sql<string>`COALESCE(SUM(${adsInsights.leads}), 0)`,
      reach: sql<string>`COALESCE(SUM(${adsInsights.reach}), 0)`,
    })
    .from(adsInsights)
    .where(and(eq(adsInsights.clientId, clientId), gte(adsInsights.date, sinceISO), lte(adsInsights.date, untilISO)));
  return { spend: n(row?.spend), impressions: n(row?.impressions), clicks: n(row?.clicks), leads: n(row?.leads), reach: n(row?.reach) };
}

/** Compute performance alerts for a client from the last 7 days of insights. */
export async function generateClientAlerts(db: Db, clientId: string): Promise<ComputedAlert[]> {
  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));
  const last7 = await aggInsights(db, clientId, d(7), d(0));
  const prev7 = await aggInsights(db, clientId, d(14), d(8));
  const last2 = await aggInsights(db, clientId, d(2), d(0));
  const prev5 = await aggInsights(db, clientId, d(7), d(3));

  const alerts: ComputedAlert[] = [];
  if (last7.impressions < 100) return alerts; // not enough signal to judge

  const ctr = last7.impressions > 0 ? (last7.clicks / last7.impressions) * 100 : 0;
  if (last7.impressions >= 500 && ctr < 1) {
    alerts.push({
      severity: "warn", title: "CTR bajo", metric: "ctr", currentValue: Number(ctr.toFixed(2)), thresholdValue: 1,
      description: `El CTR de los últimos 7 días es ${ctr.toFixed(2)}% (bajo el 1%).`,
      recommendation: "Revisar creatividades y segmentación; testear nuevos hooks/ángulos.",
    });
  }

  if (last7.spend > 0 && last7.impressions >= 1000 && last7.leads === 0) {
    alerts.push({
      severity: "critical", title: "Gasto sin conversiones", metric: "leads", currentValue: 0, thresholdValue: 1,
      description: `Se gastó $${Math.round(last7.spend)} en 7 días sin generar leads/conversiones.`,
      recommendation: "Pausar o revisar la campaña: verificar tracking, oferta y página de destino.",
    });
  }

  if (last2.spend === 0 && prev5.spend > 0) {
    alerts.push({
      severity: "warn", title: "Sin actividad reciente", metric: "spend", currentValue: 0, thresholdValue: null,
      description: "No hubo gasto en los últimos 2 días pero sí en los días previos. ¿Campañas detenidas o sin presupuesto?",
      recommendation: "Verificar estado de campañas, presupuesto y método de pago.",
    });
  }

  const cpl7 = last7.leads > 0 ? last7.spend / last7.leads : null;
  const cplPrev = prev7.leads > 0 ? prev7.spend / prev7.leads : null;
  if (cpl7 !== null && cplPrev !== null && cplPrev > 0 && cpl7 > cplPrev * 1.5) {
    alerts.push({
      severity: "warn", title: "Costo por lead en alza", metric: "cpl", currentValue: Number(cpl7.toFixed(2)), thresholdValue: Number((cplPrev * 1.5).toFixed(2)),
      description: `El CPL subió a $${cpl7.toFixed(0)} vs $${cplPrev.toFixed(0)} de la semana anterior (+${Math.round((cpl7 / cplPrev - 1) * 100)}%).`,
      recommendation: "Revisar fatiga de creatividades y competencia en la subasta; refrescar anuncios.",
    });
  }

  return alerts;
}

/** Resolve the companyId for a client via its insights rows (alerts table needs it). */
async function clientCompanyId(db: Db, clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ companyId: adsInsights.companyId })
    .from(adsInsights)
    .where(eq(adsInsights.clientId, clientId))
    .limit(1);
  return row?.companyId ?? null;
}

/**
 * For every active client with a configured notify number: compute alerts,
 * store the new ones (deduped vs the last 24h), and WhatsApp a digest.
 */
export async function runClientAlerts(db: Db): Promise<{ clients: number; alertsSent: number }> {
  const rows = await db.select().from(clients).where(eq(clients.status, "active"));
  let alertsSent = 0;
  let clientsNotified = 0;

  for (const client of rows) {
    const number = (client.metadata as { notifyWhatsapp?: string } | null)?.notifyWhatsapp?.trim();
    if (!number) continue;

    const companyId = await clientCompanyId(db, client.id);
    if (!companyId) continue; // no ad data → nothing to alert on

    const computed = await generateClientAlerts(db, client.id);
    if (computed.length === 0) continue;

    // Dedup: skip alerts whose metric already has a pending row from the last 24h.
    const recent = await db
      .select({ metric: adsAlerts.metric })
      .from(adsAlerts)
      .where(and(
        eq(adsAlerts.clientId, client.id),
        gte(adsAlerts.createdAt, new Date(Date.now() - 24 * 3600 * 1000)),
      ));
    const recentMetrics = new Set(recent.map((r) => r.metric));
    const fresh = computed.filter((a) => !recentMetrics.has(a.metric));
    if (fresh.length === 0) continue;

    await db.insert(adsAlerts).values(fresh.map((a) => ({
      companyId,
      clientId: client.id,
      platform: "meta",
      severity: a.severity,
      title: a.title,
      description: a.description,
      metric: a.metric,
      currentValue: a.currentValue != null ? String(a.currentValue) : null,
      thresholdValue: a.thresholdValue != null ? String(a.thresholdValue) : null,
      recommendation: a.recommendation,
      status: "pending",
    })));

    const icon = (s: string) => (s === "critical" ? "🔴" : s === "warn" ? "🟠" : "🔵");
    const body = [
      `*Alertas — ${client.name}*`,
      "",
      ...fresh.map((a) => `${icon(a.severity)} *${a.title}*\n${a.description}\n→ ${a.recommendation}`),
      "",
      "_LMTM-OS · monitoreo automático_",
    ].join("\n");

    const sent = await sendWhatsAppToNumber(number, body);
    if (sent.ok) { alertsSent += fresh.length; clientsNotified += 1; }
  }

  return { clients: clientsNotified, alertsSent };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let alertsTimer: ReturnType<typeof setInterval> | null = null;

export function initAgencyOps(db: Db): void {
  if (alertsTimer) return;
  const SIX_HOURS = 6 * 3600 * 1000;
  // First run a few minutes after boot, then every 6h.
  setTimeout(() => { runClientAlerts(db).catch((e) => console.warn("[agency-ops] alerts run failed:", e)); }, 5 * 60 * 1000);
  alertsTimer = setInterval(() => {
    runClientAlerts(db).catch((e) => console.warn("[agency-ops] alerts run failed:", e));
  }, SIX_HOURS);
  console.log("[agency-ops] scheduled client alert runs every 6h");
}
