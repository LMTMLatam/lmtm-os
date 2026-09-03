// LMTM-OS: ad-account balance monitor (low-balance alerts).
//
// The boss wants a heads-up when an account is about to run out of budget —
// e.g. MAERS silently hit its spend cap and stopped delivering. Meta exposes
// per-account `spend_cap` and `amount_spent` (both in the currency's minor
// unit, i.e. cents); remaining = (spend_cap - amount_spent) / 100. When that
// drops below a threshold we WhatsApp the team. Accounts with spend_cap = 0
// (uncapped / read-only / prepaid) are skipped — there's no cap to run out of.
//
// Google Ads tiene el mismo freno un nivel más arriba: el `account_budget`
// (presupuesto de CUENTA, distinto del diario de cada campaña). Cuando
// `amount_served` alcanza el límite, Google deja de servir TODAS las campañas
// aunque sigan ENABLED, ELIGIBLE y con presupuesto diario intacto. Pasó con
// Distrillantas el 24/8/26: gastaba ~$30.000/día, se comió el tope de cuenta y
// estuvo NUEVE DÍAS sin entregar una sola impresión sin que nadie lo viera,
// porque este monitor solo miraba Meta.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, adsInsights, clients } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { sendWhatsAppToNumber, alertsNumber, dayStr } from "./agency-ops.js";
import { withFreshAccessToken } from "./ads/token-refresh.js";
import { searchStream } from "./ads/providers/google.js";

const GRAPH = "https://graph.facebook.com/v21.0";
// Threshold in the account's major currency unit (pesos for ARS accounts).
const DEFAULT_THRESHOLD = Number(process.env.LMTM_BALANCE_ALERT_THRESHOLD) || 100000;
// Flag pacing when the budget will run out within this many days at the current
// burn rate (and it isn't already "low" — that has its own alert).
const PACING_DAYS = Number(process.env.LMTM_PACING_ALERT_DAYS) || 7;

export interface BalanceInfo {
  account: string;
  platform: "meta" | "google";
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
  /** Gastó algo en los últimos 30 días. Una cuenta dormida con el presupuesto
   *  agotado no es un problema que alguien tenga que ir a resolver hoy. */
  activaReciente: boolean;
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
      connectionId: adsAccountMappings.connectionId,
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

  // Gasto de los últimos 30 días: separa la cuenta que SE FRENÓ de la que está
  // dormida hace meses. Sin esto el aviso trae 8 cuentas sin uso todos los días
  // y en una semana nadie lo lee — y la que sí importa se pierde en el medio.
  // No alcanza con los 7 días: una cuenta que se frenó hace 10 gastó 0 en la
  // última semana justamente PORQUE está frenada.
  const since30 = dayStr(new Date(Date.now() - 30 * 86_400_000));
  const spend30Rows = await db
    .select({ adAccountId: adsInsights.adAccountId, spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)` })
    .from(adsInsights)
    .where(gte(adsInsights.date, since30))
    .groupBy(adsInsights.adAccountId);
  const spend30ByAccount = new Map(spend30Rows.map((r) => [bare(r.adAccountId), Number(r.spend)]));

  const out: BalanceInfo[] = [];
  for (const r of rows) {
    if (r.platform === "google") {
      const info = await saldoGoogle(db, r, spend7ByAccount, spend30ByAccount, threshold);
      if (info) out.push(info);
      await new Promise((res) => setTimeout(res, 400));
      continue;
    }
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
        platform: "meta",
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
        activaReciente: (spend30ByAccount.get(bare(acct)) ?? 0) > 0,
      });
    } catch { /* skip this account */ }
    await new Promise((res) => setTimeout(res, 400));
  }
  return out;
}

const MICROS = 1_000_000;

/** Saldo del presupuesto de CUENTA de una cuenta de Google Ads.
 *
 *  Se devuelve con la misma forma que el de Meta para que todo lo de abajo
 *  (aviso de saldo bajo, ritmo de gasto, sello de salud en el cliente) funcione
 *  igual sin tocar nada más. `accountStatus` queda en 1 a propósito: los códigos
 *  de HALTED_STATUS son de Meta y etiquetarían mal una cuenta de Google — la
 *  cuenta frenada de Google se detecta por `remaining <= 0`. */
async function saldoGoogle(
  db: Db,
  r: { adAccountId: string; clientId: string | null; connectionId: string | null; clientName: string | null },
  spend7ByAccount: Map<string, number>,
  spend30ByAccount: Map<string, number>,
  threshold: number,
): Promise<BalanceInfo | null> {
  if (!r.connectionId || !r.adAccountId) return null;
  const customerId = r.adAccountId.replace(/^act_/i, "").replace(/-/g, "").trim();
  if (!customerId) return null;
  try {
    const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, r.connectionId)).limit(1);
    if (!conn) return null;
    const fresca = await withFreshAccessToken(db, conn);
    const filas = await searchStream(fresca, customerId, `
      SELECT account_budget.status,
             account_budget.adjusted_spending_limit_micros,
             account_budget.approved_spending_limit_micros,
             account_budget.amount_served_micros,
             customer.currency_code
      FROM account_budget
      WHERE account_budget.status = 'APPROVED'`);
    if (filas.length === 0) return null;

    // Puede haber varios presupuestos aprobados (histórico). Nos interesa el que
    // todavía tiene margen; si están todos consumidos, el de mayor margen es el
    // menos malo y su margen es <= 0, que es exactamente lo que hay que avisar.
    let mejor: { limite: number; servido: number; moneda: string } | null = null;
    for (const f of filas) {
      const ab = (f as Record<string, Record<string, unknown>>).account_budget ?? {};
      const cust = (f as Record<string, Record<string, unknown>>).customer ?? {};
      const limite = Number(ab.adjusted_spending_limit_micros ?? ab.approved_spending_limit_micros ?? 0) / MICROS;
      const servido = Number(ab.amount_served_micros ?? 0) / MICROS;
      if (limite <= 0) continue; // sin tope declarado: no hay nada que se agote
      const cand = { limite, servido, moneda: String(cust.currency_code ?? "") };
      if (!mejor || cand.limite - cand.servido > mejor.limite - mejor.servido) mejor = cand;
    }
    if (!mejor) return null;

    const remaining = mejor.limite - mejor.servido;
    const dailySpend = (spend7ByAccount.get(customerId) ?? 0) / 7;
    return {
      account: customerId,
      platform: "google",
      clientId: r.clientId ?? null,
      clientName: r.clientName ?? customerId,
      currency: mejor.moneda,
      spendCap: mejor.limite,
      amountSpent: mejor.servido,
      remaining,
      dailySpend,
      daysLeft: dailySpend > 0 ? remaining / dailySpend : null,
      accountStatus: 1,
      low: remaining < threshold,
      activaReciente: (spend30ByAccount.get(customerId) ?? 0) > 0,
    };
  } catch (e) {
    console.warn(`[balance-monitor] google ${customerId} falló:`, e instanceof Error ? e.message : e);
    return null;
  }
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
  // Una cuenta está FRENADA si Meta la deshabilitó / le reclama plata, o si el
  // tope de gasto ya se consumió — en Google eso apaga toda la cuenta con las
  // campañas en ENABLED, que es justo lo que no se veía (Distrillantas, 24/8).
  // Solo cuentas que venían gastando: una dormida con el tope consumido hace
  // meses no es trabajo de nadie, y si entra al aviso lo vuelve ilegible. Medido
  // el 3/9/26: 6 cuentas de Google daban "frenada" y 5 no habían gastado un peso
  // en su vida. La única real era Distrillantas.
  // "< 1" y no "<= 0": con menos de una unidad de moneda la cuenta ya no compra
  // una sola impresión, y quedaría avisada como "saldo bajo: quedan $0", que
  // suena a que todavía hay margen.
  const agotada = (b: BalanceInfo) => b.remaining !== null && b.remaining < 1 && b.activaReciente;
  const halted = all.filter((b) => HALTED_STATUS[b.accountStatus] != null || agotada(b));
  // Sin las agotadas: ya salen arriba como frenadas, no hace falta repetirlas.
  const low = all.filter((b) => b.low && b.activaReciente && !agotada(b));
  // Pacing: healthy balance now, but at the current burn rate it runs out within
  // PACING_DAYS — a proactive heads-up BEFORE it becomes "low". Excludes accounts
  // already flagged low (that has its own alert).
  const pacing = all.filter((b) => !b.low && b.daysLeft !== null && b.daysLeft <= PACING_DAYS && b.dailySpend > 0);
  let delivered = false;
  const team = alertsNumber();
  const fmt = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("es-AR")}`;
  const sections: string[] = [];
  if (halted.length > 0) {
    const lines = ["*🛑 Cuentas FRENADAS (no entregan pauta)*", ""];
    for (const b of halted) {
      const donde = b.platform === "google" ? "Google Ads" : "Meta";
      const motivo = HALTED_STATUS[b.accountStatus]
        ?? `consumió el presupuesto de cuenta (${fmt(b.spendCap, b.currency)}) — las campañas quedan activas pero no se muestran`;
      lines.push(`• *${b.clientName}* (${donde} ${b.account}): ${motivo}.`);
    }
    lines.push("", "_El dashboard de estos clientes va a estar en cero hasta recargar el presupuesto o resolverlo en la plataforma._");
    sections.push(lines.join("\n"));
  }
  if (low.length > 0) {
    const lines = ["*⚠️ Saldo bajo*", ""];
    for (const b of low) {
      const left = b.remaining ?? 0;
      lines.push(`• *${b.clientName}* (${b.platform === "google" ? "Google Ads" : "Meta"}): quedan ${fmt(left, b.currency)} antes del tope`);
    }
    lines.push("", "_Recargá el presupuesto / subí el spend cap para que no se frene la pauta._");
    sections.push(lines.join("\n"));
  }
  if (pacing.length > 0) {
    const lines = ["*⏳ Presupuesto por agotarse (ritmo de gasto)*", ""];
    for (const b of pacing) {
      lines.push(`• *${b.clientName}* (${b.platform === "google" ? "Google Ads" : "Meta"}): quedan ${fmt(b.remaining ?? 0, b.currency)}, gasta ${fmt(b.dailySpend, b.currency)}/día → se agota en ~${Math.floor(b.daysLeft!)} día(s).`);
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
