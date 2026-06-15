// LMTM-OS: operational auditor (#3).
// Daily check of operational health per client: social posting compliance,
// upcoming key dates (efemérides) to anticipate content, and a digest to the
// agency team. Complements the ad-performance alerts in agency-ops.

import type { Db } from "@paperclipai/db";
import { getRedesPostStats } from "./clickup-sync.js";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";
import { activeClients } from "./intel-common.js";
import { upcomingEfemerides } from "./efemerides.js";

export interface AuditFinding { client: string; severity: "info" | "warn"; text: string }

export async function runOperationalAudit(db: Db): Promise<{ findings: AuditFinding[]; delivered: boolean }> {
  const rows = await activeClients(db);
  const today = new Date();
  const weekAgoMs = today.getTime() - 7 * 86400000;
  const findings: AuditFinding[] = [];

  for (const client of rows) {
    const redes = await getRedesPostStats(db, client.id, weekAgoMs, today.getTime() + 86400000).catch(() => null);
    if (redes && redes.hasDates && redes.missed > 0) {
      findings.push({ client: client.name, severity: "warn", text: `${redes.missed} post(s) planeados sin realizar: ${redes.missedNames.slice(0, 5).join(", ")}` });
    } else if (redes && !redes.hasDates && redes.total > 0 && redes.publishedThisWeek === 0) {
      findings.push({ client: client.name, severity: "info", text: `Sin posts marcados como publicados esta semana (${redes.total} en la lista).` });
    }
  }

  // Upcoming key dates (agency-wide opportunity to plan content).
  const efem = upcomingEfemerides(today, 14);

  // Build + deliver the digest to the agency team number.
  const team = alertsNumber();
  let delivered = false;
  if (findings.length > 0 || efem.length > 0) {
    const lines = ["*Auditoría operativa diaria*", ""];
    if (findings.length > 0) {
      lines.push("⚠️ *Pendientes operativos:*");
      for (const f of findings.slice(0, 15)) lines.push(`• ${f.client}: ${f.text}`);
      lines.push("");
    }
    if (efem.length > 0) {
      lines.push("📅 *Fechas próximas (planificar contenido):*");
      for (const e of efem) lines.push(`• ${e.date} (en ${e.inDays}d): ${e.name}`);
      lines.push("");
    }
    lines.push("_LMTM-OS · auditor operativo_");
    if (team) { const r = await sendWhatsAppToNumber(team, lines.join("\n")); delivered = r.ok; }
  }

  return { findings, delivered };
}

let auditTimer: ReturnType<typeof setInterval> | null = null;
let lastAuditDay = "";

export function initAuditor(db: Db): void {
  if (auditTimer) return;
  const tick = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastAuditDay) return; // once per day
    lastAuditDay = day;
    await runOperationalAudit(db).catch((e) => console.warn("[auditor] run failed:", e));
  };
  setTimeout(() => { void tick(); }, 25 * 60 * 1000);
  auditTimer = setInterval(() => { void tick(); }, 6 * 3600 * 1000); // checks; fires once/day
  console.log("[auditor] scheduled daily operational audit");
}
