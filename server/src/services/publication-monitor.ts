// LMTM-OS: content publication monitor.
//
// Closes the last mile of the idea→published pipeline. Content is planned in
// each client's ClickUp "Redes Sociales" list (getRedesScheduledContent), but
// nothing flagged when a planned post's date passed WITHOUT it being marked
// published. This scans active clients daily and WhatsApps the team a digest of
// overdue-unpublished content so nothing silently slips.

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { getRedesScheduledContent } from "./clickup-sync.js";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";

const DAY = 86_400_000;

export interface OverdueItem {
  clientName: string;
  name: string;
  status: string;
  plannedDate: string;
  daysLate: number;
}

/** Find planned content whose date passed but isn't marked published, and
 *  WhatsApp the team a digest. Window: last 7 days (fresh misses only — older
 *  than a week is history, not actionable). */
export async function runPublicationCheck(db: Db): Promise<{ clients: number; overdue: OverdueItem[]; delivered: boolean }> {
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active"));
  const now = Date.now();
  const overdue: OverdueItem[] = [];

  for (const c of rows) {
    // 7 days back → now: only content whose planned date already passed.
    const items = await getRedesScheduledContent(db, c.id, now - 7 * DAY, now).catch(() => null);
    if (!items) continue; // client has no Redes list mapped
    for (const it of items) {
      if (it.published || !it.plannedDate) continue;
      const planned = new Date(it.plannedDate).getTime();
      if (planned >= now) continue; // still in the future — not overdue
      overdue.push({
        clientName: c.name,
        name: it.name,
        status: it.status,
        plannedDate: it.plannedDate,
        daysLate: Math.floor((now - planned) / DAY),
      });
    }
  }

  // Only alert on clearly-late items (>=1 full day) to avoid same-day noise.
  const actionable = overdue.filter((o) => o.daysLate >= 1).sort((a, b) => b.daysLate - a.daysLate);
  let delivered = false;
  const team = alertsNumber();
  if (team && actionable.length > 0) {
    const byClient = new Map<string, OverdueItem[]>();
    for (const o of actionable) {
      const arr = byClient.get(o.clientName) ?? [];
      arr.push(o);
      byClient.set(o.clientName, arr);
    }
    const lines = ["*📅 Contenido programado sin publicar*", ""];
    for (const [clientName, its] of byClient) {
      lines.push(`*${clientName}* (${its.length}):`);
      for (const it of its.slice(0, 5)) {
        lines.push(`  • "${it.name.slice(0, 50)}" — ${it.daysLate}d vencido (${it.status})`);
      }
    }
    lines.push("", "_Verificar si salió y marcar en ClickUp, o reprogramar._");
    const r = await sendWhatsAppToNumber(team, lines.join("\n"));
    delivered = r.ok;
  }
  return { clients: rows.length, overdue: actionable, delivered };
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
      .then((r) => console.log(`[publication-monitor] ${r.overdue.length} overdue across ${r.clients} clients, delivered=${r.delivered}`))
      .catch((e) => console.warn("[publication-monitor] run failed:", e));
  };
  setTimeout(() => { void tick(); }, 12 * 60 * 1000); // 12 min after boot
  pubTimer = setInterval(() => { void tick(); }, 4 * 3600 * 1000); // every 4h, fires once/day
  console.log("[publication-monitor] scheduled daily publication check");
}
