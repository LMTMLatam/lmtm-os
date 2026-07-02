// LMTM-OS: ad-account balance monitor (low-balance alerts).
//
// The boss wants a heads-up when an account is about to run out of budget —
// e.g. MAERS silently hit its spend cap and stopped delivering. Meta exposes
// per-account `spend_cap` and `amount_spent` (both in the currency's minor
// unit, i.e. cents); remaining = (spend_cap - amount_spent) / 100. When that
// drops below a threshold we WhatsApp the team. Accounts with spend_cap = 0
// (uncapped / read-only / prepaid) are skipped — there's no cap to run out of.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, adsInsights, clients } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { sendWhatsAppToNumber, alertsNumber, dayStr } from "./agency-ops.js";

const GRAPH = "https://graph.facebook.com/v21.0";
// Threshold in the account's major currency unit (pesos for ARS accounts).
const DEFAULT_THRESHOLD = Number(process.env.LMTM_BALANCE_ALERT_THRESHOLD) || 100000;
// Flag pacing when the budget will run out within this many days at the current
// burn rate (and it isn't already "low" — that has its own alert).
const PACING_DAYS = Number(process.env.LMTM_PACING_ALERT_DAYS) || 7;

export interface BalanceInfo {
  account: string;
  clientId: string | null;
  clientName: string;
  currency: string;
  spendCap: number;     // major units
  amountSpent: number;  // major units
  remaining: number | null; // major units; null when uncapped (spend_cap = 0)
  dailySpend: number;   // avg major units/day over the last 7d
  daysLeft: number | null; // remaining / dailySpend; null when uncapped or not spending
  accountStatus: number;
  low: boolean;
}

export async function fetchAccountBalances(
  db: Db,
  threshold = DEFAULT_THRESHOLD,
  opts: { clientId?: string } = {},
): Promise<BalanceInfo[]> {
  const rows = await db
    .select({
      adAccountId: adsAccountMappings.adAccountId,
      clientId: adsAccountMappings.clientId,
      accessToken: adsConnections.accessToken,
      platform: adsConnections.platform,
      clientName: clients.name,
    })
    .from(adsAccountMappings)
    .leftJoin(adsConnections, eq(adsConnections.id, adsAccountMappings.connectionId))
    .leftJoin(clients, eq(clients.id, adsAccountMappings.clientId))
    .where(opts.clientId ? eq(adsAccountMappings.clientId, opts.clientId) : undefined);

  // Last-7d spend per ad account → daily burn rate (for pacing). One query.
  const since7 = dayStr(new Date(Date.now() - 7 * 86_400_000));
  const spendRows = await db
    .select({ adAccountId: adsInsights.adAccountId, spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)` })
    .from(adsInsights)
    .where(gte(adsInsights.date, since7))
    .groupBy(adsInsights.adAccountId);
  const bare = (a: string) => a.replace(/^act_/, "");
  const spend7ByAccount = new Map(spendRows.map((r) => [bare(r.adAccountId), Number(r.spend)]));

  const out: BalanceInfo[] = [];
  for (const r of rows) {
    if (r.platform !== "meta" || !r.accessToken || !r.adAccountId) continue;
    const acct = r.adAccountId.startsWith("act_") ? r.adAccountId : `act_${r.adAccountId}`;
    try {
      const url = `${GRAPH}/${acct}?fields=name,account_status,currency,amount_spent,spend_cap&access_token=${encodeURIComponent(r.accessToken)}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const j = (await resp.json().catch(() => ({}))) as {
        name?: string; account_status?: number; currency?: string;
        amount_spent?: string; spend_cap?: string; error?: { message?: string };
      };
      if (!resp.ok || j.error) continue;
      const spendCap = Number(j.spend_cap ?? 0) / 100;
      const amountSpent = Number(j.amount_spent ?? 0) / 100;
      const remaining = spendCap > 0 ? spendCap - amountSpent : null;
      const dailySpend = (spend7ByAccount.get(bare(acct)) ?? 0) / 7;
      const daysLeft = remaining !== null && dailySpend > 0 ? remaining / dailySpend : null;
      out.push({
        account: acct,
        clientId: r.clientId ?? null,
        clientName: r.clientName ?? j.name ?? acct,
        currency: j.currency ?? "",
        spendCap,
        amountSpent,
        remaining,
        dailySpend,
        daysLeft,
        accountStatus: Number(j.account_status ?? 0),
        low: remaining !== null && remaining < threshold,
      });
    } catch { /* skip this account */ }
    await new Promise((res) => setTimeout(res, 400));
  }
  return out;
}

// Meta account_status values that mean "delivery is stopped and someone must
// act": 2 = DISABLED, 3 = UNSETTLED (unpaid balance), 7 = PENDING_RISK_REVIEW.
// Found the hard way: SRP had 223 ACTIVE campaigns and an empty dashboard for
// days because the account sat in UNSETTLED and nothing alerted anyone.
const HALTED_STATUS: Record<number, string> = {
  2: "deshabilitada por Meta",
  3: "frenada por deuda (pago pendiente)",
  7: "en revisión de riesgo de pago",
};

/** Persist each client's ad-account health snapshot in clients.metadata so the
 *  dashboard can EXPLAIN an empty window ("frenada por deuda", "sin saldo")
 *  instead of rendering an unexplained wall of zeros — the exact confusion
 *  SRP caused: 223 active campaigns, empty dashboard, no visible reason. */
async function stampAccountHealth(db: Db, balances: BalanceInfo[]): Promise<void> {
  for (const b of balances) {
    if (!b.clientId) continue;
    try {
      const [row] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, b.clientId)).limit(1);
      const meta = { ...((row?.metadata as Record<string, unknown>) ?? {}) };
      meta.adsAccountHealth = {
        status: b.accountStatus,
        statusLabel: HALTED_STATUS[b.accountStatus] ?? (b.accountStatus === 1 ? "activa" : `status ${b.accountStatus}`),
        remaining: b.remaining,
        currency: b.currency,
        checkedAt: new Date().toISOString(),
      };
      await db.update(clients).set({ metadata: meta as never, updatedAt: new Date() }).where(eq(clients.id, b.clientId));
    } catch (e) {
      console.warn(`[balance-monitor] stamp health for client ${b.clientId} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

/** Check balances and WhatsApp the team a digest of accounts running low. */
export async function runBalanceCheck(db: Db, threshold = DEFAULT_THRESHOLD): Promise<{ checked: number; low: BalanceInfo[]; pacing: BalanceInfo[]; halted: BalanceInfo[]; delivered: boolean }> {
  const all = await fetchAccountBalances(db, threshold);
  await stampAccountHealth(db, all);
  const low = all.filter((b) => b.low);
  const halted = all.filter((b) => HALTED_STATUS[b.accountStatus] != null);
  // Pacing: healthy balance now, but at the current burn rate it runs out within
  // PACING_DAYS — a proactive heads-up BEFORE it becomes "low". Excludes accounts
  // already flagged low (that has its own alert).
  const pacing = all.filter((b) => !b.low && b.daysLeft !== null && b.daysLeft <= PACING_DAYS && b.dailySpend > 0);
  let delivered = false;
  const team = alertsNumber();
  const fmt = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("es-AR")}`;
  const sections: string[] = [];
  if (halted.length > 0) {
    const lines = ["*🛑 Cuentas de Meta FRENADAS (no entregan pauta)*", ""];
    for (const b of halted) {
      lines.push(`• *${b.clientName}* (${b.account}): ${HALTED_STATUS[b.accountStatus]}.`);
    }
    lines.push("", "_El dashboard de estos clientes va a estar en cero hasta resolverlo en el Administrador de Anuncios._");
    sections.push(lines.join("\n"));
  }
  if (low.length > 0) {
    const lines = ["*⚠️ Saldo bajo en cuentas de Meta*", ""];
    for (const b of low) {
      const left = b.remaining ?? 0;
      lines.push(`• *${b.clientName}*: quedan ${fmt(left, b.currency)} antes del tope${left <= 0 ? " (¡FRENADA!)" : ""}`);
    }
    lines.push("", "_Recargá el presupuesto / subí el spend cap para que no se frene la pauta._");
    sections.push(lines.join("\n"));
  }
  if (pacing.length > 0) {
    const lines = ["*⏳ Presupuesto por agotarse (ritmo de gasto)*", ""];
    for (const b of pacing) {
      lines.push(`• *${b.clientName}*: quedan ${fmt(b.remaining ?? 0, b.currency)}, gasta ${fmt(b.dailySpend, b.currency)}/día → se agota en ~${Math.floor(b.daysLeft!)} día(s).`);
    }
    lines.push("", "_Planificá la recarga antes de que la pauta se frene._");
    sections.push(lines.join("\n"));
  }
  if (team && sections.length > 0) {
    const r = await sendWhatsAppToNumber(team, [...sections, "_LMTM-OS · monitor de saldo_"].join("\n\n"));
    delivered = r.ok;
  }
  return { checked: all.length, low, pacing, halted, delivered };
}

let balanceTimer: ReturnType<typeof setInterval> | null = null;
let lastBalanceDay = "";

export function initBalanceMonitor(db: Db): void {
  if (balanceTimer) return;
  const tick = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastBalanceDay) return; // once per day
    lastBalanceDay = day;
    await runBalanceCheck(db).catch((e) => console.warn("[balance-monitor] run failed:", e));
  };
  setTimeout(() => { void tick(); }, 10 * 60 * 1000); // 10 min after boot
  balanceTimer = setInterval(() => { void tick(); }, 4 * 3600 * 1000); // check every 4h, fires once/day
  console.log("[balance-monitor] scheduled daily low-balance check");
}
