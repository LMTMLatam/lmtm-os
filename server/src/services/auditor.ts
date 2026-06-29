// LMTM-OS: operational auditor (#3).
// Daily check of operational health per client. The boss does NOT want a parrot
// of ClickUp's task statuses — he wants to know whether what was supposed to be
// posted is *actually showing up on the client's social network*. So for each
// client we cross-check the planned/published intent (ClickUp "Redes Sociales"
// list) against the REAL published posts we sync from Meta (organic_posts), and
// flag discrepancies (marked-published-but-not-on-network, planned-but-missing,
// no-network-connected-to-verify). The same digest also folds in the low-balance
// alert (so the team gets one report, not three) and upcoming key dates.

import type { Db } from "@paperclipai/db";
import { organicPosts, adsAccountMappings } from "@paperclipai/db";
import { and, eq, or, inArray, gte, lte } from "drizzle-orm";
import { getRedesPostStats } from "./clickup-sync.js";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";
import { activeClients } from "./intel-common.js";
import { fetchAccountBalances, type BalanceInfo } from "./balance-monitor.js";

export interface AuditFinding {
  client: string;
  severity: "ok" | "info" | "warn";
  text: string;
}

interface NetworkActivity {
  hasPage: boolean;       // the client has at least one Meta page connected
  count: number;          // real posts published on the network in the window
  everSynced: boolean;    // we have ANY organic post ever for this client/page
  latestAt: Date | null;
}

/**
 * Count the posts ACTUALLY published on the client's network (organic_posts,
 * synced from Meta) inside the window. We match by clientId when the mapping
 * carried it, and also by the client's mapped pageId(s) as a fallback (the
 * same page can be mapped to a client without clientId stamped on every row).
 */
async function networkActivity(
  db: Db,
  clientId: string,
  sinceMs: number,
  untilMs: number,
): Promise<NetworkActivity> {
  const maps = await db
    .select({ pageId: adsAccountMappings.pageId })
    .from(adsAccountMappings)
    .where(eq(adsAccountMappings.clientId, clientId));
  const pageIds = [...new Set(maps.map((m) => m.pageId).filter((p): p is string => !!p))];
  const hasPage = pageIds.length > 0;

  const since = new Date(sinceMs);
  const until = new Date(untilMs);
  const match = pageIds.length
    ? or(eq(organicPosts.clientId, clientId), inArray(organicPosts.pageId, pageIds))
    : eq(organicPosts.clientId, clientId);

  // All synced posts for this client/page (any date) — lets us tell apart
  // "really posted nothing this week" from "we have no network data at all yet".
  const rows = await db
    .select({ createdTime: organicPosts.createdTime })
    .from(organicPosts)
    .where(match);

  let latestAt: Date | null = null;
  let count = 0;
  for (const r of rows) {
    if (!r.createdTime) continue;
    const ms = r.createdTime.getTime();
    if (ms >= sinceMs && ms <= untilMs) count += 1;
    if (!latestAt || r.createdTime > latestAt) latestAt = r.createdTime;
  }
  return { hasPage, count, everSynced: rows.length > 0, latestAt };
}

interface ClientAudit {
  name: string;
  status: "ok" | "deviation" | "unverifiable";
  finding: AuditFinding | null;
}

async function auditClient(
  db: Db,
  client: { id: string; name: string },
  weekAgoMs: number,
  nowMs: number,
): Promise<ClientAudit> {
  const redes = await getRedesPostStats(db, client.id, weekAgoMs, nowMs + 86400000).catch(() => null);
  const net = await networkActivity(db, client.id, weekAgoMs, nowMs + 86400000).catch(
    () => ({ hasPage: false, count: 0, everSynced: false, latestAt: null }) as NetworkActivity,
  );

  const plannedThisWeek = redes?.plannedThisWeek ?? 0;
  const publishedClickUp = redes?.publishedThisWeek ?? 0;
  const missedNames = redes?.missedNames ?? [];
  const hasClickupActivity = (redes?.total ?? 0) > 0;

  // No network connected, or no organic data ever synced for this page → we
  // genuinely cannot verify. Surface it as a blind spot (not a silent pass) so
  // the team connects/reconnects the page or checks by hand. Treating a data
  // gap as "0 posteos" would cry wolf, so we keep these separate.
  if (!net.hasPage || !net.everSynced) {
    if (hasClickupActivity || plannedThisWeek > 0) {
      const reason = !net.hasPage
        ? "sin red de Meta conectada"
        : "sin publicaciones sincronizadas de la red todavía";
      return {
        name: client.name,
        status: "unverifiable",
        finding: {
          client: client.name,
          severity: "info",
          text: `${reason} → no se puede verificar el posteo (conectar/reconectar página o revisar a mano)`,
        },
      };
    }
    return { name: client.name, status: "unverifiable", finding: null };
  }

  // Network is connected → verify intent vs reality.
  // 1) ClickUp says posts went out, but the network shows fewer/none.
  if (publishedClickUp > 0 && net.count < publishedClickUp) {
    return {
      name: client.name,
      status: "deviation",
      finding: {
        client: client.name,
        severity: "warn",
        text: `ClickUp marca ${publishedClickUp} publicado(s), pero en la red aparecen ${net.count} esta semana`,
      },
    };
  }

  // 2) There was a plan for this week but nothing is reflected on the network.
  if (net.count === 0 && (plannedThisWeek > 0 || hasClickupActivity)) {
    const detail = missedNames.length
      ? `0 publicaciones detectadas en la red; planeados sin realizar: ${missedNames.slice(0, 4).join(", ")}`
      : "0 publicaciones detectadas en la red esta semana (se esperaban posteos)";
    return {
      name: client.name,
      status: "deviation",
      finding: { client: client.name, severity: "warn", text: detail },
    };
  }

  // 3) Planned posts whose date passed without publishing, even if some others
  //    did go out — partial compliance.
  if (missedNames.length > 0 && net.count > 0) {
    return {
      name: client.name,
      status: "deviation",
      finding: {
        client: client.name,
        severity: "warn",
        text: `${net.count} publicado(s) en la red, pero ${missedNames.length} planeado(s) sin salir: ${missedNames.slice(0, 3).join(", ")}`,
      },
    };
  }

  // 4) Posting on track — confirmed against the real network.
  if (net.count > 0) {
    return {
      name: client.name,
      status: "ok",
      finding: { client: client.name, severity: "ok", text: `${net.count} publicación(es) reflejada(s) en la red` },
    };
  }

  // Network connected but no plan and no posts → nothing to report.
  return { name: client.name, status: "ok", finding: null };
}

export async function runOperationalAudit(db: Db): Promise<{
  findings: AuditFinding[];
  ok: number;
  deviations: number;
  unverifiable: number;
  lowBalances: BalanceInfo[];
  delivered: boolean;
}> {
  const rows = await activeClients(db);
  const now = Date.now();
  const weekAgoMs = now - 7 * 86400000;

  const audits: ClientAudit[] = [];
  for (const client of rows) {
    audits.push(await auditClient(db, client, weekAgoMs, now));
  }

  const deviations = audits.filter((a) => a.status === "deviation");
  const okCount = audits.filter((a) => a.status === "ok").length;
  const unver = audits.filter((a) => a.status === "unverifiable");
  const findings = audits.map((a) => a.finding).filter((f): f is AuditFinding => f !== null);

  // Low-balance accounts (folded into this same weekly report).
  const balances = await fetchAccountBalances(db).catch(() => [] as BalanceInfo[]);
  const lowBalances = balances.filter((b) => b.low);

  // Build + deliver the WEEKLY digest. Per the boss: WhatsApp carries ONLY two
  // things — (1) low balance, (2) clients that had posts planned but they are
  // NOT confirmed/published on the network. No operational-status parroting
  // ("al día"), no "sin verificar" blind-spots, no efemérides. If neither
  // condition holds, we stay silent (no news = good news).
  const team = alertsNumber();
  let delivered = false;
  const hasAnything = deviations.length > 0 || lowBalances.length > 0;

  if (hasAnything) {
    const fmt = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("es-AR")}`;
    const lines: string[] = ["*Reporte semanal LMTM*", ""];

    if (deviations.length > 0) {
      lines.push("⚠️ *Clientes con posteos planificados sin confirmar en la red:*");
      for (const a of deviations.slice(0, 25)) lines.push(`• ${a.name}: ${a.finding!.text}`);
      lines.push("");
    }

    if (lowBalances.length > 0) {
      lines.push("💰 *Saldo bajo en cuentas de Meta:*");
      for (const b of lowBalances.slice(0, 15)) {
        const left = b.remaining ?? 0;
        lines.push(`• *${b.clientName}*: quedan ${fmt(left, b.currency)} antes del tope${left <= 0 ? " (¡FRENADA!)" : ""}`);
      }
      lines.push("_Recargá el presupuesto / subí el spend cap para que no se frene la pauta._", "");
    }

    lines.push("_LMTM-OS · reporte semanal_");
    if (team) {
      const r = await sendWhatsAppToNumber(team, lines.join("\n"));
      delivered = r.ok;
    }
  }

  return { findings, ok: okCount, deviations: deviations.length, unverifiable: unver.length, lowBalances, delivered };
}

let auditTimer: ReturnType<typeof setInterval> | null = null;
let lastAuditWeek = "";

// ISO week key (e.g. "2026-W26") so the digest fires once per calendar week.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function initAuditor(db: Db): void {
  if (auditTimer) return;
  const WEEKLY_SEND_DOW = Number(process.env.LMTM_WEEKLY_REPORT_DOW ?? 1); // 1 = Monday
  const tick = async () => {
    const now = new Date();
    if (now.getDay() !== WEEKLY_SEND_DOW) return; // only on the configured weekday
    const week = isoWeekKey(now);
    if (week === lastAuditWeek) return; // once per ISO week
    lastAuditWeek = week;
    await runOperationalAudit(db).catch((e) => console.warn("[auditor] run failed:", e));
  };
  setTimeout(() => { void tick(); }, 25 * 60 * 1000);
  auditTimer = setInterval(() => { void tick(); }, 6 * 3600 * 1000); // checks; fires once/week
  console.log("[auditor] scheduled weekly operational report");
}
