// LMTM-OS: ad-account balance monitor (low-balance alerts).
//
// The boss wants a heads-up when an account is about to run out of budget —
// e.g. MAERS silently hit its spend cap and stopped delivering. Meta exposes
// per-account `spend_cap` and `amount_spent` (both in the currency's minor
// unit, i.e. cents); remaining = (spend_cap - amount_spent) / 100. When that
// drops below a threshold we WhatsApp the team. Accounts with spend_cap = 0
// (uncapped / read-only / prepaid) are skipped — there's no cap to run out of.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";

const GRAPH = "https://graph.facebook.com/v21.0";
// Threshold in the account's major currency unit (pesos for ARS accounts).
const DEFAULT_THRESHOLD = Number(process.env.LMTM_BALANCE_ALERT_THRESHOLD) || 100000;

export interface BalanceInfo {
  account: string;
  clientName: string;
  currency: string;
  spendCap: number;     // major units
  amountSpent: number;  // major units
  remaining: number | null; // major units; null when uncapped (spend_cap = 0)
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
      accessToken: adsConnections.accessToken,
      platform: adsConnections.platform,
      clientName: clients.name,
    })
    .from(adsAccountMappings)
    .leftJoin(adsConnections, eq(adsConnections.id, adsAccountMappings.connectionId))
    .leftJoin(clients, eq(clients.id, adsAccountMappings.clientId))
    .where(opts.clientId ? eq(adsAccountMappings.clientId, opts.clientId) : undefined);

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
      out.push({
        account: acct,
        clientName: r.clientName ?? j.name ?? acct,
        currency: j.currency ?? "",
        spendCap,
        amountSpent,
        remaining,
        accountStatus: Number(j.account_status ?? 0),
        low: remaining !== null && remaining < threshold,
      });
    } catch { /* skip this account */ }
    await new Promise((res) => setTimeout(res, 400));
  }
  return out;
}

/** Check balances and WhatsApp the team a digest of accounts running low. */
export async function runBalanceCheck(db: Db, threshold = DEFAULT_THRESHOLD): Promise<{ checked: number; low: BalanceInfo[]; delivered: boolean }> {
  const all = await fetchAccountBalances(db, threshold);
  const low = all.filter((b) => b.low);
  let delivered = false;
  const team = alertsNumber();
  if (team && low.length > 0) {
    const fmt = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("es-AR")}`;
    const lines = ["*⚠️ Saldo bajo en cuentas de Meta*", ""];
    for (const b of low) {
      const left = b.remaining ?? 0;
      lines.push(`• *${b.clientName}*: quedan ${fmt(left, b.currency)} antes del tope${left <= 0 ? " (¡FRENADA!)" : ""}`);
    }
    lines.push("", "_Recargá el presupuesto / subí el spend cap para que no se frene la pauta._", "_LMTM-OS · monitor de saldo_");
    const r = await sendWhatsAppToNumber(team, lines.join("\n"));
    delivered = r.ok;
  }
  return { checked: all.length, low, delivered };
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
