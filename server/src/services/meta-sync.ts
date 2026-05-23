import type { Db } from "@paperclipai/db";
import {
  metaConnections, metaAdAccountMappings,
  syncLogs, metaCampaigns, metaAdsets, metaAds, metaAdsInsights, metaPagePosts, metaPostInsights,
} from "@paperclipai/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

const GRAPH = "https://graph.facebook.com/v21.0";
const PAGE_LIMIT = 50;

// ── helpers ──────────────────────────────────────────────────────────────────

async function gGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  const json = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? JSON.stringify(json).slice(0, 200);
    throw new Error(`Graph ${path} → ${r.status}: ${msg}`);
  }
  return json;
}

async function* paginate(path: string, params: Record<string, string>): AsyncGenerator<Record<string, unknown>[]> {
  let after: string | undefined;
  do {
    const p = { ...params, limit: String(PAGE_LIMIT), ...(after ? { after } : {}) };
    const res = await gGet(path, p);
    const data = (res.data ?? []) as Record<string, unknown>[];
    if (data.length) yield data;
    const cursors = (res.paging as { cursors?: { after?: string }; next?: string } | undefined);
    after = cursors?.cursors?.after;
    if (!cursors?.next) break;
  } while (after);
}

async function startLog(db: Db, jobName: string, companyId: string, connectionId: string): Promise<string> {
  const [row] = await db.insert(syncLogs).values({ jobName, companyId, connectionId, status: "running" }).returning({ id: syncLogs.id });
  return row.id;
}

async function endLog(db: Db, logId: string, status: "completed" | "failed" | "partial", records: number, error?: string) {
  await db.update(syncLogs).set({ status, completedAt: new Date(), recordsSynced: records, error: error ?? null }).where(eq(syncLogs.id, logId));
}

// ── connection resolver ───────────────────────────────────────────────────────

async function resolveConnections(db: Db, companyId?: string) {
  const rows = companyId
    ? await db.select().from(metaConnections).where(and(eq(metaConnections.companyId, companyId), eq(metaConnections.status, "active")))
    : await db.select().from(metaConnections).where(eq(metaConnections.status, "active"));
  return rows;
}

async function resolveAdAccounts(db: Db, connectionId: string): Promise<string[]> {
  const conn = await db.select().from(metaConnections).where(eq(metaConnections.id, connectionId)).limit(1);
  if (!conn[0]) return [];
  const mappings = await db.select({ adAccountId: metaAdAccountMappings.adAccountId }).from(metaAdAccountMappings).where(eq(metaAdAccountMappings.connectionId, connectionId));
  if (mappings.length) return mappings.map(m => m.adAccountId);
  if (conn[0].adAccountId) return [conn[0].adAccountId];
  return [];
}

// ── syncCampaigns ─────────────────────────────────────────────────────────────

export async function syncCampaigns(db: Db, companyId?: string) {
  const connections = await resolveConnections(db, companyId);
  let total = 0;
  for (const conn of connections) {
    const accounts = await resolveAdAccounts(db, conn.id);
    const logId = await startLog(db, "campaigns", conn.companyId, conn.id);
    let count = 0;
    try {
      for (const account of accounts) {
        for await (const page of paginate(`/${account}/campaigns`, {
          access_token: conn.accessToken,
          fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time",
        })) {
          const values = page.map((c) => ({
            id: c.id as string,
            companyId: conn.companyId,
            connectionId: conn.id,
            adAccountId: account,
            name: (c.name as string) ?? "",
            status: c.status as string | undefined,
            objective: c.objective as string | undefined,
            dailyBudget: c.daily_budget ? String(c.daily_budget) : undefined,
            lifetimeBudget: c.lifetime_budget ? String(c.lifetime_budget) : undefined,
            startTime: c.start_time ? new Date(c.start_time as string) : undefined,
            stopTime: c.stop_time ? new Date(c.stop_time as string) : undefined,
            raw: c,
            syncedAt: new Date(),
            updatedAt: new Date(),
          }));
          await db.insert(metaCampaigns).values(values).onConflictDoUpdate({
            target: metaCampaigns.id,
            set: { name: metaCampaigns.name, status: metaCampaigns.status, syncedAt: new Date(), updatedAt: new Date(), raw: metaCampaigns.raw },
          });
          count += values.length;
        }
      }
      await endLog(db, logId, "completed", count);
    } catch (e) {
      await endLog(db, logId, "failed", count, String(e));
    }
    total += count;
  }
  return { synced: total };
}

// ── syncAdsets ────────────────────────────────────────────────────────────────

export async function syncAdsets(db: Db, companyId?: string) {
  const connections = await resolveConnections(db, companyId);
  let total = 0;
  for (const conn of connections) {
    const accounts = await resolveAdAccounts(db, conn.id);
    const logId = await startLog(db, "adsets", conn.companyId, conn.id);
    let count = 0;
    try {
      for (const account of accounts) {
        for await (const page of paginate(`/${account}/adsets`, {
          access_token: conn.accessToken,
          fields: "id,name,status,campaign_id,daily_budget,lifetime_budget",
        })) {
          const values = page.map((s) => ({
            id: s.id as string,
            companyId: conn.companyId,
            connectionId: conn.id,
            campaignId: s.campaign_id as string | undefined,
            adAccountId: account,
            name: (s.name as string) ?? "",
            status: s.status as string | undefined,
            dailyBudget: s.daily_budget ? String(s.daily_budget) : undefined,
            lifetimeBudget: s.lifetime_budget ? String(s.lifetime_budget) : undefined,
            raw: s,
            syncedAt: new Date(),
            updatedAt: new Date(),
          }));
          await db.insert(metaAdsets).values(values).onConflictDoUpdate({
            target: metaAdsets.id,
            set: { name: metaAdsets.name, status: metaAdsets.status, syncedAt: new Date(), updatedAt: new Date() },
          });
          count += values.length;
        }
      }
      await endLog(db, logId, "completed", count);
    } catch (e) {
      await endLog(db, logId, "failed", count, String(e));
    }
    total += count;
  }
  return { synced: total };
}

// ── syncAds ───────────────────────────────────────────────────────────────────

export async function syncAds(db: Db, companyId?: string) {
  const connections = await resolveConnections(db, companyId);
  let total = 0;
  for (const conn of connections) {
    const accounts = await resolveAdAccounts(db, conn.id);
    const logId = await startLog(db, "ads", conn.companyId, conn.id);
    let count = 0;
    try {
      for (const account of accounts) {
        for await (const page of paginate(`/${account}/ads`, {
          access_token: conn.accessToken,
          fields: "id,name,status,adset_id,campaign_id,creative{id}",
        })) {
          const values = page.map((a) => ({
            id: a.id as string,
            companyId: conn.companyId,
            connectionId: conn.id,
            adsetId: a.adset_id as string | undefined,
            campaignId: a.campaign_id as string | undefined,
            adAccountId: account,
            name: (a.name as string) ?? "",
            status: a.status as string | undefined,
            creativeId: (a.creative as { id?: string } | undefined)?.id,
            raw: a,
            syncedAt: new Date(),
            updatedAt: new Date(),
          }));
          await db.insert(metaAds).values(values).onConflictDoUpdate({
            target: metaAds.id,
            set: { name: metaAds.name, status: metaAds.status, syncedAt: new Date(), updatedAt: new Date() },
          });
          count += values.length;
        }
      }
      await endLog(db, logId, "completed", count);
    } catch (e) {
      await endLog(db, logId, "failed", count, String(e));
    }
    total += count;
  }
  return { synced: total };
}

// ── syncAdsInsights ───────────────────────────────────────────────────────────

export async function syncAdsInsights(db: Db, opts: { companyId?: string; since?: string; until?: string } = {}) {
  const connections = await resolveConnections(db, opts.companyId);
  const since = opts.since ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const until = opts.until ?? new Date().toISOString().slice(0, 10);
  let total = 0;

  for (const conn of connections) {
    const accounts = await resolveAdAccounts(db, conn.id);
    const logId = await startLog(db, "ads_insights", conn.companyId, conn.id);
    let count = 0;
    try {
      for (const account of accounts) {
        for await (const page of paginate(`/${account}/insights`, {
          access_token: conn.accessToken,
          fields: "campaign_id,campaign_name,adset_id,ad_id,date_start,impressions,clicks,spend,reach,ctr,cpc,cpm,actions",
          level: "ad",
          time_range: JSON.stringify({ since, until }),
          time_increment: "1",
        })) {
          const values = page.map((r) => {
            const actions = (r.actions as Array<{ action_type: string; value: string }> | undefined) ?? [];
            const leads = actions.find(a => a.action_type === "lead")?.value ?? "0";
            return {
              companyId: conn.companyId,
              connectionId: conn.id,
              adAccountId: account,
              campaignId: r.campaign_id as string | undefined,
              campaignName: r.campaign_name as string | undefined,
              adsetId: r.adset_id as string | undefined,
              adId: r.ad_id as string | undefined,
              date: r.date_start as string,
              impressions: parseInt(String(r.impressions ?? 0), 10),
              clicks: parseInt(String(r.clicks ?? 0), 10),
              spend: String(r.spend ?? "0"),
              reach: parseInt(String(r.reach ?? 0), 10),
              ctr: r.ctr ? String(r.ctr) : null,
              cpc: r.cpc ? String(r.cpc) : null,
              cpm: r.cpm ? String(r.cpm) : null,
              leads: parseInt(leads, 10),
              actions,
              syncedAt: new Date(),
            };
          });

          for (const v of values) {
            await db.insert(metaAdsInsights).values(v).onConflictDoUpdate({
              target: [metaAdsInsights.connectionId, metaAdsInsights.adAccountId, metaAdsInsights.campaignId, metaAdsInsights.adsetId, metaAdsInsights.adId, metaAdsInsights.date],
              set: { impressions: v.impressions, clicks: v.clicks, spend: v.spend, reach: v.reach, ctr: v.ctr, cpc: v.cpc, cpm: v.cpm, leads: v.leads, actions: v.actions, syncedAt: new Date() },
            }).catch(() => {});
          }
          count += values.length;
        }
      }
      await endLog(db, logId, "completed", count);
    } catch (e) {
      await endLog(db, logId, "failed", count, String(e));
    }
    total += count;
  }
  return { synced: total };
}

// ── syncPagePosts ─────────────────────────────────────────────────────────────

export async function syncPagePosts(db: Db, companyId?: string) {
  const connections = await resolveConnections(db, companyId);
  let total = 0;
  for (const conn of connections) {
    if (!conn.pageId) continue;
    const logId = await startLog(db, "page_posts", conn.companyId, conn.id);
    let count = 0;
    try {
      for await (const page of paginate(`/${conn.pageId}/posts`, {
        access_token: conn.accessToken,
        fields: "id,message,story,full_picture,permalink_url,created_time",
      })) {
        const values = page.map((p) => ({
          id: p.id as string,
          companyId: conn.companyId,
          connectionId: conn.id,
          pageId: conn.pageId!,
          message: p.message as string | undefined,
          story: p.story as string | undefined,
          fullPicture: p.full_picture as string | undefined,
          permalinkUrl: p.permalink_url as string | undefined,
          createdTime: p.created_time ? new Date(p.created_time as string) : undefined,
          raw: p,
          syncedAt: new Date(),
        }));
        await db.insert(metaPagePosts).values(values).onConflictDoUpdate({
          target: metaPagePosts.id,
          set: { message: metaPagePosts.message, syncedAt: new Date() },
        });
        count += values.length;
      }
      await endLog(db, logId, "completed", count);
    } catch (e) {
      await endLog(db, logId, "failed", count, String(e));
    }
    total += count;
  }
  return { synced: total };
}

// ── getDashboardData ──────────────────────────────────────────────────────────

export async function getDashboardData(db: Db, companyId: string, opts: { since?: string; until?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = opts.until ?? new Date().toISOString().slice(0, 10);

  const [insights, campaigns, lastSync] = await Promise.all([
    db.select().from(metaAdsInsights).where(
      and(
        eq(metaAdsInsights.companyId, companyId),
        gte(metaAdsInsights.date, since),
        lte(metaAdsInsights.date, until),
      )
    ).orderBy(metaAdsInsights.date),

    db.select().from(metaCampaigns).where(eq(metaCampaigns.companyId, companyId)),

    db.select({ completedAt: syncLogs.completedAt, jobName: syncLogs.jobName, status: syncLogs.status })
      .from(syncLogs)
      .where(eq(syncLogs.companyId, companyId))
      .orderBy(syncLogs.createdAt)
      .limit(5),
  ]);

  // Aggregate totals
  const totals = insights.reduce((acc, r) => ({
    spend: acc.spend + parseFloat(String(r.spend ?? 0)),
    impressions: acc.impressions + (r.impressions ?? 0),
    clicks: acc.clicks + (r.clicks ?? 0),
    leads: acc.leads + (r.leads ?? 0),
    reach: acc.reach + (r.reach ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0 });

  const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : null;

  // Daily series
  const dailyMap = new Map<string, { date: string; spend: number; impressions: number; clicks: number; leads: number }>();
  for (const r of insights) {
    const d = r.date as string;
    const prev = dailyMap.get(d) ?? { date: d, spend: 0, impressions: 0, clicks: 0, leads: 0 };
    dailyMap.set(d, {
      date: d,
      spend: prev.spend + parseFloat(String(r.spend ?? 0)),
      impressions: prev.impressions + (r.impressions ?? 0),
      clicks: prev.clicks + (r.clicks ?? 0),
      leads: prev.leads + (r.leads ?? 0),
    });
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Per-campaign totals
  const campaignMap = new Map<string, { id: string; name: string; spend: number; impressions: number; clicks: number; leads: number; status?: string }>();
  for (const r of insights) {
    if (!r.campaignId) continue;
    const camp = campaigns.find(c => c.id === r.campaignId);
    const prev = campaignMap.get(r.campaignId) ?? { id: r.campaignId, name: r.campaignName ?? r.campaignId, spend: 0, impressions: 0, clicks: 0, leads: 0, status: camp?.status ?? undefined };
    campaignMap.set(r.campaignId, {
      ...prev,
      spend: prev.spend + parseFloat(String(r.spend ?? 0)),
      impressions: prev.impressions + (r.impressions ?? 0),
      clicks: prev.clicks + (r.clicks ?? 0),
      leads: prev.leads + (r.leads ?? 0),
    });
  }
  const byCampaign = Array.from(campaignMap.values()).sort((a, b) => b.leads - a.leads).slice(0, 10);

  return {
    period: { since, until },
    totals: { ...totals, cpl, ctr },
    daily,
    byCampaign,
    lastSync,
    hasData: insights.length > 0,
  };
}
