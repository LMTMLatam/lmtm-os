// LMTM-OS: content publication monitor.
//
// Closes the last mile of the idea→published pipeline. Content is planned in
// each client's ClickUp "Redes Sociales" list (getRedesScheduledContent), but
// nothing flagged when a planned post's date passed WITHOUT it being marked
// published. This scans active clients daily and WhatsApps the team a digest of
// overdue-unpublished content so nothing silently slips.

import type { Db } from "@paperclipai/db";
import { clients, organicPosts, contentIdeas } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { getRedesScheduledContent, getRedesCalendar, type RedesCalendarItem } from "./clickup-sync.js";
import { networkActivity } from "./auditor.js";
import { runMakeHealthCheck } from "./make.js";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";

const DAY = 86_400_000;
const INACTIVITY_ALERT_MS = 72 * 3_600_000; // 72h sin actividad en redes = alerta
const SYNC_STALE_MS = 36 * 3_600_000;       // sync global más viejo que esto → no confiar (evita falsos outages).
                                            // 36h y no 24h: max(syncedAt) solo avanza cuando entra un post NUEVO,
                                            // así que un día tranquilo entre sweeps superaba 24h y salteaba el check.
const DIV_MIN_ITEMS = 4;        // menos piezas planificadas que esto → muestra chica, no juzgamos el mix
const DIV_SKEW = 0.7;           // un formato ≥70% del mix clasificado = concentrado
const DIV_INCOMPLETE = 0.4;     // ≥40% de piezas sin "Tipo de Contenido" = incompleto

/** Onboarding SLA: a client created ≥7 days ago that still has NO scheduled
 *  content, no published organic post, and no generated idea is stalled — the
 *  pipeline never started for them. Returns the stalled clients. */
export async function findStalledOnboarding(db: Db): Promise<Array<{ name: string; ageDays: number }>> {
  const cutoff = new Date(Date.now() - 7 * DAY);
  const rows = await db.select({
    id: clients.id, name: clients.name, createdAt: clients.createdAt,
    posts: sql<number>`(select count(*) from ${organicPosts} p where p.client_id = ${clients.id})`,
    ideas: sql<number>`(select count(*) from ${contentIdeas} ci where ci.client_id = ${clients.id})`,
  }).from(clients).where(and(eq(clients.status, "active"), sql`${clients.createdAt} < ${cutoff}`));
  return rows
    .filter((r) => Number(r.posts) === 0 && Number(r.ideas) === 0)
    .map((r) => ({ name: r.name, ageDays: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / DAY) }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

export interface OverdueItem {
  clientName: string;
  name: string;
  status: string;
  plannedDate: string;
  daysLate: number;
}

/** Find planned content whose date passed but isn't marked published, and
 *  WhatsApp the team a digest. Window: last 7 days (fresh misses only — older
 *  than a week is history, not actionable).
 *
 *  A post is a miss only when it HAS a "Fecha de inicio" (start_date) that
 *  already passed but carries no "mandado a make" tag → its Make trigger date
 *  came and the webhook never fired. Tasks WITHOUT a start_date are ignored on
 *  purpose: per the team, only what they actually schedule gets a start_date;
 *  the rest are ideas, not overdue posts.
 *
 *  Pass { dryRun } to compute without sending any WhatsApp — used by
 *  POST /ops/publication/check?dry=1 to preview what would be sent. */
export async function runPublicationCheck(
  db: Db,
  opts: { dryRun?: boolean } = {},
): Promise<{ clients: number; overdue: OverdueItem[]; stalledOnboarding: number; delivered: boolean }> {
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active"));
  const now = Date.now();
  const overdue: OverdueItem[] = []; // start_date passed, no tag → webhook never fired

  for (const c of rows) {
    // 7 days back → now: only content whose planned date already passed.
    const items = await getRedesScheduledContent(db, c.id, now - 7 * DAY, now).catch(() => null);
    if (!items) continue; // client has no Redes list mapped
    for (const it of items) {
      // The "mandado/enviado a make" tag means the post fired — never flag it.
      if (it.published) continue;
      // Only tasks with a real Fecha de inicio (the Make trigger) that already
      // passed count. No start_date → not scheduled → not our problem.
      if (!it.startDate) continue;
      const fire = new Date(it.startDate).getTime();
      if (fire >= now) continue; // trigger still in the future
      overdue.push({ clientName: c.name, name: it.name, status: it.status, plannedDate: it.startDate, daysLate: Math.floor((now - fire) / DAY) });
    }
  }

  // Only alert on clearly-late items (>=1 full day) to avoid same-day noise.
  const actionable = overdue.filter((o) => o.daysLate >= 1).sort((a, b) => b.daysLate - a.daysLate);
  const team = alertsNumber();
  let delivered = false;

  if (team && actionable.length > 0) {
    const lines = ["*📅 Contenido programado sin publicar*", ""];
    for (const [clientName, its] of groupByClient(actionable)) {
      lines.push(`*${clientName}* (${its.length}):`);
      for (const it of its.slice(0, 5)) lines.push(`  • "${it.name.slice(0, 50)}" — ${it.daysLate}d vencido (${it.status})`);
    }
    lines.push("", "_Estas piezas pasaron su FECHA DE INICIO sin la etiqueta \"mandado a make\" — el webhook no disparó a Make. Revisar el scenario / reprogramar._");
    if (!opts.dryRun) {
      const r = await sendWhatsAppToNumber(team, lines.join("\n"));
      delivered = r.ok;
    }
  }

  // Onboarding SLA: same daily pass, appended as its own section so a client
  // whose pipeline never started doesn't sit silent for weeks (SRP, the
  // dark clients). Only alerts when there's something to say.
  const stalled = await findStalledOnboarding(db).catch(() => []);
  if (team && stalled.length > 0 && !opts.dryRun) {
    const lines = ["*🐢 Clientes sin arrancar (>7 días, sin contenido)*", ""];
    for (const s of stalled.slice(0, 15)) lines.push(`• *${s.name}* — ${s.ageDays}d sin ideas ni posteos`);
    lines.push("", "_Revisar onboarding: mapear Meta, cargar brain, arrancar el pipeline de contenido._");
    await sendWhatsAppToNumber(team, lines.join("\n")).catch(() => {});
  }

  return { clients: rows.length, overdue: actionable, stalledOnboarding: stalled.length, delivered };
}

function groupByClient(items: OverdueItem[]): Map<string, OverdueItem[]> {
  const byClient = new Map<string, OverdueItem[]>();
  for (const o of items) {
    const arr = byClient.get(o.clientName) ?? [];
    arr.push(o);
    byClient.set(o.clientName, arr);
  }
  return byClient;
}

/** Clients whose network shows no post in >72h — an outage worth flagging. But
 *  it only fires when OUR organic sync is fresh: if the sync itself is stalled,
 *  every client would look inactive, so we alert about the SYNC instead of
 *  crying false outages on the clients (see the auditoría-redes lesson). */
export async function runInactivityCheck(
  db: Db,
  opts: { dryRun?: boolean } = {},
): Promise<{ checked: number; inactive: Array<{ name: string; hoursSince: number }>; syncStale: boolean; delivered: boolean }> {
  const now = Date.now();
  const [g] = await db.select({ last: sql<string | null>`max(${organicPosts.syncedAt})` }).from(organicPosts);
  const globalLast = g?.last ? new Date(g.last).getTime() : 0;
  const team = alertsNumber();

  if (!globalLast || now - globalLast > SYNC_STALE_MS) {
    // Sync down/stale → we can't judge client activity. Flag the sync, not the
    // clients (accusing every client of being inactive would be a false outage).
    if (team && !opts.dryRun && globalLast) {
      const h = Math.floor((now - globalLast) / 3_600_000);
      await sendWhatsAppToNumber(team, `*⚠️ Sync de redes detenido*\n\nÚltima sincronización de posteos hace ${h}h. No puedo verificar actividad de clientes hasta que se recupere — revisar la conexión/sync de Meta.`).catch(() => {});
    }
    return { checked: 0, inactive: [], syncStale: true, delivered: false };
  }

  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active"));
  const inactive: Array<{ name: string; hoursSince: number }> = [];
  for (const c of rows) {
    const na = await networkActivity(db, c.id, now - 30 * DAY, now).catch(() => null);
    // Only clients we CAN verify: page connected + data synced + a known last post.
    if (!na || !na.hasPage || !na.everSynced || !na.latestAt) continue;
    const since = now - na.latestAt.getTime();
    if (since <= INACTIVITY_ALERT_MS) continue; // fresh organic post → active
    // Meta's organic API fails per-page (permission #10), so a silent organic
    // feed is NOT proof of inactivity — it's often just a broken read scope.
    // Cross-check OUR own reliable signal: did the client fire anything to Make
    // (the "mandado a make" tag) inside the window? If so they ARE posting; the
    // organic sync just can't see it. Only flag when BOTH signals are silent.
    const recent = await getRedesScheduledContent(db, c.id, now - INACTIVITY_ALERT_MS, now).catch(() => null);
    if ((recent ?? []).some((it) => it.sentToMake)) continue;
    inactive.push({ name: c.name, hoursSince: Math.floor(since / 3_600_000) });
  }
  inactive.sort((a, b) => b.hoursSince - a.hoursSince);

  let delivered = false;
  if (team && inactive.length > 0 && !opts.dryRun) {
    const lines = ["*🔴 Clientes sin actividad en redes (+72h)*", ""];
    for (const it of inactive.slice(0, 20)) lines.push(`• *${it.name}* — ${Math.floor(it.hoursSince / 24)}d ${it.hoursSince % 24}h sin postear`);
    lines.push("", "_Verificar: ¿se cortó la programación, falta contenido, o Make no disparó? Revisar el cliente._");
    const r = await sendWhatsAppToNumber(team, lines.join("\n"));
    delivered = r.ok;
  }
  return { checked: rows.length, inactive, syncStale: false, delivered };
}

/** Normalize ClickUp "Tipo de Contenido" labels into the few buckets the team
 *  actually balances by (reel / carrusel / video / historia / foto·post). */
function normFormat(f: string | null): string | null {
  if (!f) return null;
  const s = f.trim().toLowerCase();
  if (/reel/.test(s)) return "reel";
  if (/carrusel|carousel/.test(s)) return "carrusel";
  if (/story|historia/.test(s)) return "historia";
  if (/video|clip|vivo|live/.test(s)) return "video";
  if (/foto|est[aá]tico|photo|post/.test(s)) return "foto/post";
  return s;
}

/** Weekly content-diversification review. For each client with enough planned
 *  content, checks the FORMAT mix (are we stuck on one format?) and COMPLETENESS
 *  (are the pieces missing their "Tipo de Contenido"?). Flags the ones to
 *  rebalance. Format is the reliable axis today; the pillar axis (valor /
 *  educativo / engagement) needs a dedicated field before we can score it. */
export async function runDiversificationCheck(
  db: Db,
  opts: { dryRun?: boolean } = {},
): Promise<{ reviewed: number; issues: Array<{ name: string; note: string }>; delivered: boolean }> {
  const now = Date.now();
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active"));
  const issues: Array<{ name: string; note: string }> = [];
  let reviewed = 0;
  for (const c of rows) {
    const cal = await getRedesCalendar(db, c.id, now - 30 * DAY, now + 14 * DAY).catch(() => null);
    if (!cal || cal.length < DIV_MIN_ITEMS) continue; // no list / too little to judge
    reviewed += 1;
    const total = cal.length;
    const notes: string[] = [];
    // Two axes the team balances by: formato ("Tipo de Contenido") and
    // objetivo/pilar ("Objetivo del Contenido"). Same rules on each: flag when
    // too concentrated on one value, or when too many pieces leave it blank.
    const axis = (getVal: (i: RedesCalendarItem) => string | null, label: string, norm: (v: string) => string) => {
      const withVal = cal.filter((i) => getVal(i));
      if ((total - withVal.length) / total >= DIV_INCOMPLETE) notes.push(`${total - withVal.length}/${total} sin "${label}"`);
      if (withVal.length < DIV_MIN_ITEMS) return;
      const counts = new Map<string, number>();
      for (const i of withVal) { const v = norm(getVal(i)!); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
      if (counts.size === 0) return;
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (counts.size === 1) notes.push(`un solo ${label === "Tipo de Contenido" ? "formato" : "objetivo"} (${top[0]})`);
      else if (top[1] / withVal.length >= DIV_SKEW) notes.push(`${Math.round((top[1] / withVal.length) * 100)}% ${top[0]}`);
    };
    axis((i) => i.format, "Tipo de Contenido", (v) => normFormat(v) ?? v.trim().toLowerCase());
    axis((i) => i.objective, "Objetivo del Contenido", (v) => v.trim().toLowerCase());
    if (notes.length) issues.push({ name: c.name, note: notes.join("; ") });
  }
  issues.sort((a, b) => a.name.localeCompare(b.name));

  const team = alertsNumber();
  let delivered = false;
  if (team && issues.length > 0 && !opts.dryRun) {
    const lines = ["*🎨 Diversificación de contenido — a revisar*", ""];
    for (const it of issues.slice(0, 25)) lines.push(`• *${it.name}*: ${it.note}`);
    lines.push("", "_Balancear formato (reel/carrusel/video) Y objetivo (engagement/valor/educativo), y completar \"Tipo de Contenido\" / \"Objetivo del Contenido\" donde falte._");
    const r = await sendWhatsAppToNumber(team, lines.join("\n"));
    delivered = r.ok;
  }
  return { reviewed, issues, delivered };
}

let pubTimer: ReturnType<typeof setInterval> | null = null;
let lastPubDay = "";
export function initPublicationMonitor(db: Db): void {
  if (pubTimer) return;
  const tick = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastPubDay) return; // once per day
    lastPubDay = day;
    await runPublicationCheck(db)
      .then((r) => console.log(`[publication-monitor] ${r.overdue.length} sin publicar (webhook no disparó), across ${r.clients} clients, delivered=${r.delivered}`))
      .catch((e) => console.warn("[publication-monitor] run failed:", e));
    await runInactivityCheck(db)
      .then((r) => console.log(`[publication-monitor] inactivity: ${r.inactive.length} clientes +72h, syncStale=${r.syncStale}, checked=${r.checked}`))
      .catch((e) => console.warn("[publication-monitor] inactivity run failed:", e));
    await runMakeHealthCheck(db)
      .then((r) => console.log(`[publication-monitor] make: ${r.issues.length} AutoPoster(s) a revisar (configured=${r.configured}, checked=${r.checked})`))
      .catch((e) => console.warn("[publication-monitor] make run failed:", e));
    if (new Date().getDay() === 1) { // lunes: revisión semanal de diversificación
      await runDiversificationCheck(db)
        .then((r) => console.log(`[publication-monitor] diversification: ${r.issues.length}/${r.reviewed} clientes a revisar`))
        .catch((e) => console.warn("[publication-monitor] diversification run failed:", e));
    }
  };
  setTimeout(() => { void tick(); }, 12 * 60 * 1000); // 12 min after boot
  pubTimer = setInterval(() => { void tick(); }, 4 * 3600 * 1000); // every 4h, fires once/day
  console.log("[publication-monitor] scheduled daily publication check");
}
