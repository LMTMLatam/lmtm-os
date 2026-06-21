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
import { createClientReportTask, getRedesPostStats, getEnfoqueTecnicoContext } from "./clickup-sync.js";

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

export type Agg = { spend: number; impressions: number; clicks: number; leads: number; reach: number };

function n(v: unknown): number {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
}

export const dayStr = (d: Date) => d.toISOString().slice(0, 10);

export async function aggInsights(db: Db, clientId: string, sinceISO: string, untilISO: string): Promise<Agg> {
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
      severity: "critical", title: "Sin actividad / posible saldo bajo", metric: "spend", currentValue: 0, thresholdValue: null,
      description: "No hubo gasto en los últimos 2 días pero sí en los días previos. Posible saldo agotado, presupuesto consumido, método de pago rechazado o campañas detenidas.",
      recommendation: "Verificar saldo/método de pago de la cuenta, presupuesto y estado de las campañas.",
    });
  }

  // Possible misconfiguration: spend is happening but almost nothing is being
  // delivered (very low impressions for the money spent) — broken targeting,
  // disapproved ads, or tracking/setup issues.
  const cpm7 = last7.impressions > 0 ? (last7.spend / last7.impressions) * 1000 : null;
  if (last7.spend >= 1000 && last7.impressions > 0 && last7.impressions < 500) {
    alerts.push({
      severity: "warn", title: "Cuenta sin entrega (posible mala configuración)", metric: "impressions", currentValue: last7.impressions, thresholdValue: 500,
      description: `Se gastó $${Math.round(last7.spend)} pero solo ${last7.impressions} impresiones en 7 días${cpm7 ? ` (CPM $${Math.round(cpm7)})` : ""}. Entrega anormalmente baja.`,
      recommendation: "Revisar configuración: anuncios rechazados, segmentación demasiado acotada, puja/objetivo mal seteados o problemas de la cuenta.",
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
/** The single internal number that receives ALL client alerts (the agency, not the clients). */
export function alertsNumber(): string {
  return (process.env.LMTM_ALERTS_WHATSAPP ?? process.env.LMTM_TEAM_WHATSAPP ?? "").trim();
}

export async function runClientAlerts(db: Db): Promise<{ clients: number; alertsSent: number; teamConfigured: boolean }> {
  const team = alertsNumber();
  const rows = await db.select().from(clients).where(eq(clients.status, "active"));
  let alertsSent = 0;
  let clientsNotified = 0;

  for (const client of rows) {
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

    // Deliver to the agency's internal number (all clients' alerts → same number).
    // The message names the client so it's clear which account each alert is about.
    if (team) {
      const icon = (s: string) => (s === "critical" ? "🔴" : s === "warn" ? "🟠" : "🔵");
      const body = [
        `*Alertas — ${client.name}*`,
        "",
        ...fresh.map((a) => `${icon(a.severity)} *${a.title}*\n${a.description}\n→ ${a.recommendation}`),
        "",
        "_LMTM-OS · monitoreo automático_",
      ].join("\n");
      const sent = await sendWhatsAppToNumber(team, body);
      if (sent.ok) { alertsSent += fresh.length; clientsNotified += 1; }
    }
  }

  return { clients: clientsNotified, alertsSent, teamConfigured: !!team };
}

// ── AI narrative (MiniMax) ────────────────────────────────────────────────────

export async function aiNarrative(systemPrompt: string, userContent: string): Promise<string | null> {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) return null;
  const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-M2";
  try {
    const r = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
        // MiniMax-M3 is a reasoning model: it spends tokens on internal
        // reasoning before the answer, so a low cap leaves `content` empty
        // (finish_reason: length). Give it enough headroom for reasoning + a
        // full reply, otherwise every narrative/report/content gen falls back.
        max_tokens: 4000,
        temperature: 0.5,
      }),
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; base_resp?: { status_code?: number } };
    if (json.base_resp?.status_code && json.base_resp.status_code !== 0) return null;
    const text = json.choices?.[0]?.message?.content ?? "";
    return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim() || null;
  } catch {
    return null;
  }
}

function dashboardLink(slug: string): string {
  const base = (process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return base ? `${base}/c/${slug}` : "";
}

const money = (v: number) => "$" + Math.round(v).toLocaleString("es-AR");
const pct = (a: number, b: number) => (b > 0 ? ((a / b - 1) * 100) : 0);

// ── #1 Weekly client report ───────────────────────────────────────────────────

export async function generateClientReport(db: Db, clientId: string): Promise<{ title: string; markdown: string; hasData: boolean } | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return null;
  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));
  const w = await aggInsights(db, clientId, d(7), d(0));
  const prev = await aggInsights(db, clientId, d(14), d(8));

  // Social posts: planned vs published this week (from the ClickUp Redes list).
  const weekAgoMs = today.getTime() - 7 * 86400000;
  const redes = await getRedesPostStats(db, clientId, weekAgoMs, today.getTime() + 86400000).catch(() => null);
  const hasAds = w.impressions > 0 || w.spend > 0;
  const hasRedes = !!redes && redes.total > 0;
  if (!hasAds && !hasRedes) return { title: "", markdown: "", hasData: false };

  const ctr = w.impressions > 0 ? (w.clicks / w.impressions) * 100 : 0;
  const cpl = w.leads > 0 ? w.spend / w.leads : 0;
  const spendDelta = pct(w.spend, prev.spend);
  const leadsDelta = pct(w.leads, prev.leads);

  // Client context (Enfoque Técnico): which networks/strategy the client has,
  // so the analysis can review the week's posts against the defined networks.
  let enfoque = "";
  try {
    const ctx = await getEnfoqueTecnicoContext(db, clientId, { maxAgeMs: 60 * 60 * 1000 });
    enfoque = (ctx.markdown ?? "").trim().slice(0, 1500);
  } catch { /* no context */ }

  const redesSummary = redes
    ? (redes.hasDates && redes.plannedThisWeek > 0
        ? `planeados ${redes.plannedThisWeek}, no realizados ${redes.missed}${redes.missed > 0 ? " (" + redes.missedNames.slice(0, 6).join(", ") + ")" : ""}`
        : `${redes.total} posts en lista, publicados esta semana ${redes.publishedThisWeek}, por estado ${Object.entries(redes.byStatus).map(([s, n]) => s + ":" + n).join(", ")}`)
    : "sin lista de redes";

  const narrative = await aiNarrative(
    "Sos un analista de marketing de LMTM (agencia latinoamericana). Escribí 4-5 oraciones en español rioplatense, claras y accionables. Revisá el desempeño de publicidad Y la actividad en redes sociales (posteos de la semana) considerando las redes y la estrategia definidas en el Enfoque Técnico del cliente. Si faltaron posteos planeados, marcalo. Cerrá con qué hacer la próxima semana. Sin saludos, sin títulos. Nunca inventes números: usá solo los provistos.",
    `Cliente: ${client.name}\n` +
    (enfoque ? `Enfoque Técnico (contexto/redes del cliente):\n${enfoque}\n\n` : "Enfoque Técnico: no cargado.\n\n") +
    `Publicidad 7d: inversión ${money(w.spend)} (previa ${money(prev.spend)}), leads ${w.leads} (previa ${prev.leads}), impresiones ${w.impressions}, CTR ${ctr.toFixed(2)}%, CPL ${w.leads > 0 ? money(cpl) : "s/d"}\n` +
    `Redes esta semana: ${redesSummary}`,
  );
  const link = dashboardLink(client.slug);

  // Redes Sociales section. We adapt to how the client's ClickUp list is set up:
  // if posts carry planned dates we show planned-vs-published (and flag misses);
  // otherwise we show the pipeline by status + posts published this week.
  const redesLines: string[] = [];
  if (redes && redes.total > 0) {
    redesLines.push("", "### Redes Sociales (ClickUp)");
    if (redes.hasDates && redes.plannedThisWeek > 0) {
      const ok = redes.plannedThisWeek - redes.missed;
      redesLines.push(`- **Planeados esta semana:** ${redes.plannedThisWeek} · **Realizados:** ${ok}`);
      if (redes.missed > 0) {
        redesLines.push(`- ⚠️ **No realizados (${redes.missed}):** ${redes.missedNames.slice(0, 10).join(", ")}${redes.missedNames.length > 10 ? "…" : ""}`);
      } else {
        redesLines.push("- ✅ Todos los posts planeados de la semana se realizaron.");
      }
    } else {
      const bd = Object.entries(redes.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}: ${n}`).join(" · ");
      redesLines.push(`- **Posts en la lista:** ${redes.total}${bd ? ` (${bd})` : ""}`);
      redesLines.push(`- **Publicados esta semana:** ${redes.publishedThisWeek}`);
      if (!redes.hasDates) {
        redesLines.push("- _Para medir planeado vs realizado y detectar fallas, cargá una fecha en cada post y un estado “Publicado” en ClickUp._");
      }
    }
  }

  // Standard markdown for the ClickUp task description.
  const adsLines = hasAds ? [
    "_Publicidad — últimos 7 días_",
    "",
    `- **Inversión:** ${money(w.spend)} (${spendDelta >= 0 ? "+" : ""}${spendDelta.toFixed(0)}% vs semana previa)`,
    `- **Leads / conversiones:** ${w.leads} (${leadsDelta >= 0 ? "+" : ""}${leadsDelta.toFixed(0)}%)`,
    `- **Impresiones:** ${w.impressions.toLocaleString("es-AR")} · **Alcance:** ${w.reach.toLocaleString("es-AR")}`,
    `- **CTR:** ${ctr.toFixed(2)}%` + (w.leads > 0 ? ` · **CPL:** ${money(cpl)}` : ""),
  ] : ["_Sin actividad de publicidad esta semana._"];

  const markdown = [
    ...adsLines,
    ...redesLines,
    ...(narrative ? ["", "### Análisis", narrative] : []),
    ...(link ? ["", `[Ver dashboard](${link})`] : []),
    "",
    "_Generado automáticamente por LMTM-OS_",
  ].join("\n");

  const fecha = dayStr(today);
  return { title: `📊 Reporte semanal — ${fecha}`, markdown, hasData: true };
}

export async function runClientReports(db: Db): Promise<{ created: number }> {
  const rows = await db.select().from(clients).where(eq(clients.status, "active"));
  let created = 0;
  for (const client of rows) {
    const report = await generateClientReport(db, client.id);
    if (!report?.hasData) continue;
    const r = await createClientReportTask(db, client.id, report.title, report.markdown);
    if (r.ok) created += 1;
  }
  return { created };
}

// ── #3 Cross-client portfolio brief (for the team) ────────────────────────────

export async function generatePortfolioBrief(db: Db): Promise<string> {
  const rows = await db.select().from(clients).where(eq(clients.status, "active"));
  const today = new Date();
  const d = (back: number) => dayStr(new Date(today.getTime() - back * 86400000));

  const perClient: Array<{ name: string; industry: string | null; spend: number; leads: number; ctr: number; cpl: number }> = [];
  for (const c of rows) {
    const w = await aggInsights(db, c.id, d(7), d(0));
    if (w.impressions === 0 && w.spend === 0) continue;
    const ctr = w.impressions > 0 ? (w.clicks / w.impressions) * 100 : 0;
    const cpl = w.leads > 0 ? w.spend / w.leads : 0;
    perClient.push({ name: c.name, industry: c.industry, spend: w.spend, leads: w.leads, ctr, cpl });
  }
  if (perClient.length === 0) return "Sin datos de campañas en los últimos 7 días.";

  const totalSpend = perClient.reduce((a, x) => a + x.spend, 0);
  const totalLeads = perClient.reduce((a, x) => a + x.leads, 0);
  const withCpl = perClient.filter((x) => x.cpl > 0).sort((a, b) => a.cpl - b.cpl);
  const best = withCpl.slice(0, 3);
  const worst = withCpl.slice(-3).reverse();

  const lines = [
    `*Brief de portfolio — LMTM*`,
    `_Últimos 7 días · ${perClient.length} clientes activos_`,
    "",
    `💰 Inversión total: ${money(totalSpend)} · 🎯 Leads: ${totalLeads}`,
    "",
    "🏆 Mejor CPL:",
    ...best.map((x) => `  • ${x.name}: ${money(x.cpl)} (${x.leads} leads)`),
    "",
    "⚠️ Mayor CPL (revisar):",
    ...worst.map((x) => `  • ${x.name}: ${money(x.cpl)} (${x.leads} leads)`),
  ];

  const narrative = await aiNarrative(
    "Sos el estratega jefe de LMTM. En 3-5 oraciones en español rioplatense, dale al equipo 2-3 conclusiones accionables del portfolio de la semana: qué patrones se ven por industria, qué cuentas atender, qué aprendizajes replicar. Sin títulos. Nunca inventes números.",
    perClient.map((x) => `${x.name} (${x.industry ?? "s/rubro"}): inv ${money(x.spend)}, ${x.leads} leads, CTR ${x.ctr.toFixed(2)}%, CPL ${x.cpl > 0 ? money(x.cpl) : "s/d"}`).join("\n"),
  );
  if (narrative) lines.push("", `🧠 ${narrative}`);
  lines.push("", "_LMTM-OS · inteligencia cross-cliente_");
  return lines.join("\n");
}

export async function runPortfolioBrief(db: Db): Promise<{ delivered: boolean; error?: string; brief: string }> {
  const brief = await generatePortfolioBrief(db);
  const team = (process.env.LMTM_TEAM_WHATSAPP ?? "").trim();
  if (!team) return { delivered: false, error: "LMTM_TEAM_WHATSAPP not configured", brief };
  const r = await sendWhatsAppToNumber(team, brief);
  return { delivered: r.ok, error: r.error, brief };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let alertsTimer: ReturnType<typeof setInterval> | null = null;
let weeklyTimer: ReturnType<typeof setInterval> | null = null;
let lastWeeklyRun = "";

export function initAgencyOps(db: Db): void {
  if (alertsTimer) return;
  const SIX_HOURS = 6 * 3600 * 1000;
  setTimeout(() => { runClientAlerts(db).catch((e) => console.warn("[agency-ops] alerts run failed:", e)); }, 5 * 60 * 1000);
  alertsTimer = setInterval(() => {
    runClientAlerts(db).catch((e) => console.warn("[agency-ops] alerts run failed:", e));
  }, SIX_HOURS);

  // Weekly reports + portfolio brief: checked daily, fires on Mondays.
  const maybeWeekly = async () => {
    const now = new Date();
    const monday = now.getUTCDay() === 1; // Monday
    const wk = `${now.getUTCFullYear()}-${dayStr(now).slice(5, 7)}-${Math.floor(now.getUTCDate() / 7)}`;
    if (!monday || lastWeeklyRun === wk) return;
    lastWeeklyRun = wk;
    await runClientReports(db).catch((e) => console.warn("[agency-ops] reports failed:", e));
    await runPortfolioBrief(db).catch((e) => console.warn("[agency-ops] brief failed:", e));
  };
  weeklyTimer = setInterval(() => { void maybeWeekly(); }, 12 * 3600 * 1000);
  console.log("[agency-ops] scheduled: alerts every 6h, weekly reports+brief on Mondays");
}
