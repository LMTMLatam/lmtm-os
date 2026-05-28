import type { Db } from "@paperclipai/db";
import {
  metaConnections, metaAdAccountMappings,
  syncLogs, metaCampaigns, metaAdsets, metaAds, metaAdsInsights, metaPagePosts, metaPostInsights, metaAlerts,
} from "@paperclipai/db";
import { eq, and, gte, lte, inArray, desc } from "drizzle-orm";

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
          fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type,updated_time",
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
          fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,bid_strategy,billing_event,optimization_goal,targeting",
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
            set: { name: metaAdsets.name, status: metaAdsets.status, syncedAt: new Date(), updatedAt: new Date(), raw: metaAdsets.raw },
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
          fields: "id,name,status,effective_status,adset_id,campaign_id,creative{id,thumbnail_url,image_url,body,title,call_to_action_type,object_story_spec}",
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
            set: { name: metaAds.name, status: metaAds.status, syncedAt: new Date(), updatedAt: new Date(), raw: metaAds.raw },
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
        // Delete existing rows for the period before inserting fresh data.
        // Avoids onConflictDoUpdate issues with nullable columns in the unique index.
        await db.delete(metaAdsInsights).where(
          and(
            eq(metaAdsInsights.connectionId, conn.id),
            eq(metaAdsInsights.adAccountId, account),
            gte(metaAdsInsights.date, since),
            lte(metaAdsInsights.date, until),
          ),
        );

        const allValues: (typeof metaAdsInsights.$inferInsert)[] = [];
        for await (const page of paginate(`/${account}/insights`, {
          access_token: conn.accessToken,
          fields: "campaign_id,campaign_name,adset_id,ad_id,date_start,impressions,clicks,spend,reach,ctr,cpc,cpm,frequency,actions,cost_per_action_type,action_values",
          level: "ad",
          time_range: JSON.stringify({ since, until }),
          time_increment: "1",
        })) {
          for (const r of page) {
            const actions = (r.actions as Array<{ action_type: string; value: string }> | undefined) ?? [];
            const leads = actions.find(a => a.action_type === "lead")?.value ?? "0";
            allValues.push({
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
            });
          }
        }

        if (allValues.length > 0) {
          // Insert in batches of 500
          for (let i = 0; i < allValues.length; i += 500) {
            await db.insert(metaAdsInsights).values(allValues.slice(i, i + 500));
          }
        }
        count += allValues.length;
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
        fields: "id,message,story,full_picture,permalink_url,created_time,type",
      })) {
        const postValues = page.map((p) => ({
          id: p.id as string,
          companyId: conn.companyId,
          connectionId: conn.id,
          pageId: conn.pageId!,
          message: p.message as string | undefined,
          story: p.story as string | undefined,
          fullPicture: p.full_picture as string | undefined,
          permalinkUrl: p.permalink_url as string | undefined,
          createdTime: p.created_time ? new Date(p.created_time as string) : undefined,
          postType: p.type as string | undefined,
          raw: p,
          syncedAt: new Date(),
        }));
        await db.insert(metaPagePosts).values(postValues).onConflictDoUpdate({
          target: metaPagePosts.id,
          set: { message: metaPagePosts.message, syncedAt: new Date(), raw: metaPagePosts.raw },
        });

        // Fetch insights for each post
        for (const post of postValues) {
          try {
            const insightRes = await gGet(`/${post.id}/insights`, {
              access_token: conn.accessToken,
              metric: "post_impressions_unique,post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total",
            });
            const insightData = (insightRes.data ?? []) as Array<{ name: string; values?: Array<{ value: number }> }>;
            for (const metric of insightData) {
              const val = metric.values?.[0]?.value ?? 0;
              await db.insert(metaPostInsights).values({
                companyId: conn.companyId,
                postId: post.id,
                metric: metric.name,
                value: typeof val === "number" ? val : 0,
                syncedAt: new Date(),
              }).onConflictDoUpdate({
                target: [metaPostInsights.postId, metaPostInsights.metric],
                set: { value: typeof val === "number" ? val : 0, syncedAt: new Date() },
              }).catch(() => {});
            }
          } catch {
            // post insights may fail silently
          }
        }
        count += page.length;
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

export async function getDashboardData(db: Db, companyId: string, opts: { since?: string; until?: string; adAccountId?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = opts.until ?? new Date().toISOString().slice(0, 10);
  const { adAccountId } = opts;

  const [insights, campaigns, lastSync, alertCount] = await Promise.all([
    db.select().from(metaAdsInsights).where(
      and(eq(metaAdsInsights.companyId, companyId), adAccountId ? eq(metaAdsInsights.adAccountId, adAccountId) : undefined, gte(metaAdsInsights.date, since), lte(metaAdsInsights.date, until))
    ).orderBy(metaAdsInsights.date),

    db.select().from(metaCampaigns).where(and(eq(metaCampaigns.companyId, companyId), adAccountId ? eq(metaCampaigns.adAccountId, adAccountId) : undefined)),

    db.select({ completedAt: syncLogs.completedAt, jobName: syncLogs.jobName, status: syncLogs.status })
      .from(syncLogs)
      .where(eq(syncLogs.companyId, companyId))
      .orderBy(desc(syncLogs.createdAt))
      .limit(5),

    db.select({ id: metaAlerts.id }).from(metaAlerts)
      .where(and(eq(metaAlerts.companyId, companyId), eq(metaAlerts.status, "pending"))),
  ]);

  const totals = insights.reduce((acc, r) => ({
    spend: acc.spend + parseFloat(String(r.spend ?? 0)),
    impressions: acc.impressions + (r.impressions ?? 0),
    clicks: acc.clicks + (r.clicks ?? 0),
    leads: acc.leads + (r.leads ?? 0),
    reach: acc.reach + (r.reach ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0 });

  const cpl = totals.leads > 0 ? totals.spend / totals.leads : null;
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : null;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : null;

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
    totals: { ...totals, cpl, ctr, cpm, cpc },
    daily,
    byCampaign,
    lastSync,
    hasData: insights.length > 0,
    pendingAlerts: alertCount.length,
  };
}

// ── getCampaignsData ──────────────────────────────────────────────────────────

export async function getCampaignsData(db: Db, companyId: string, opts: { since?: string; until?: string; adAccountId?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = opts.until ?? new Date().toISOString().slice(0, 10);
  const { adAccountId } = opts;

  const [campaigns, insights] = await Promise.all([
    db.select().from(metaCampaigns).where(and(eq(metaCampaigns.companyId, companyId), adAccountId ? eq(metaCampaigns.adAccountId, adAccountId) : undefined)),
    db.select().from(metaAdsInsights).where(
      and(eq(metaAdsInsights.companyId, companyId), adAccountId ? eq(metaAdsInsights.adAccountId, adAccountId) : undefined, gte(metaAdsInsights.date, since), lte(metaAdsInsights.date, until))
    ),
  ]);

  type CampEntry = {
    id: string; name: string; status?: string | null; objective?: string | null;
    dailyBudget?: number | null; lifetimeBudget?: number | null;
    adAccountId?: string;
    spend: number; impressions: number; clicks: number; leads: number; reach: number;
  };

  const map = new Map<string, CampEntry>();

  for (const r of insights) {
    if (!r.campaignId) continue;
    const camp = campaigns.find(c => c.id === r.campaignId);
    const prev: CampEntry = map.get(r.campaignId) ?? {
      id: r.campaignId,
      name: r.campaignName ?? r.campaignId,
      status: camp?.status,
      objective: camp?.objective,
      dailyBudget: camp?.dailyBudget ? parseFloat(String(camp.dailyBudget)) : null,
      lifetimeBudget: camp?.lifetimeBudget ? parseFloat(String(camp.lifetimeBudget)) : null,
      adAccountId: camp?.adAccountId,
      spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0,
    };
    map.set(r.campaignId, {
      ...prev,
      spend: prev.spend + parseFloat(String(r.spend ?? 0)),
      impressions: prev.impressions + (r.impressions ?? 0),
      clicks: prev.clicks + (r.clicks ?? 0),
      leads: prev.leads + (r.leads ?? 0),
      reach: prev.reach + (r.reach ?? 0),
    });
  }

  for (const c of campaigns) {
    if (!map.has(c.id)) {
      map.set(c.id, {
        id: c.id, name: c.name, status: c.status, objective: c.objective,
        dailyBudget: c.dailyBudget ? parseFloat(String(c.dailyBudget)) : null,
        lifetimeBudget: c.lifetimeBudget ? parseFloat(String(c.lifetimeBudget)) : null,
        adAccountId: c.adAccountId,
        spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0,
      });
    }
  }

  return Array.from(map.values()).map(c => ({
    ...c,
    cpl: c.leads > 0 ? c.spend / c.leads : null,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
    cpc: c.clicks > 0 ? c.spend / c.clicks : null,
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : null,
  })).sort((a, b) => b.spend - a.spend);
}

// ── getAdsetsData ─────────────────────────────────────────────────────────────

export async function getAdsetsData(db: Db, companyId: string, opts: { since?: string; until?: string; adAccountId?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = opts.until ?? new Date().toISOString().slice(0, 10);
  const { adAccountId } = opts;

  const [adsets, insights] = await Promise.all([
    db.select().from(metaAdsets).where(and(eq(metaAdsets.companyId, companyId), adAccountId ? eq(metaAdsets.adAccountId, adAccountId) : undefined)),
    db.select().from(metaAdsInsights).where(
      and(eq(metaAdsInsights.companyId, companyId), adAccountId ? eq(metaAdsInsights.adAccountId, adAccountId) : undefined, gte(metaAdsInsights.date, since), lte(metaAdsInsights.date, until))
    ),
  ]);

  type AdsetEntry = {
    id: string; name: string; status?: string | null; campaignId?: string | null;
    dailyBudget?: number | null; lifetimeBudget?: number | null;
    bidStrategy?: string | null; billingEvent?: string | null; optimizationGoal?: string | null;
    spend: number; impressions: number; clicks: number; leads: number; reach: number;
  };

  const map = new Map<string, AdsetEntry>();

  for (const r of insights) {
    if (!r.adsetId) continue;
    const adset = adsets.find(a => a.id === r.adsetId);
    const raw = adset?.raw as Record<string, unknown> | undefined;
    const prev: AdsetEntry = map.get(r.adsetId) ?? {
      id: r.adsetId,
      name: adset?.name ?? r.adsetId,
      status: adset?.status,
      campaignId: r.campaignId ?? adset?.campaignId,
      dailyBudget: adset?.dailyBudget ? parseFloat(String(adset.dailyBudget)) : null,
      lifetimeBudget: adset?.lifetimeBudget ? parseFloat(String(adset.lifetimeBudget)) : null,
      bidStrategy: raw?.bid_strategy as string | undefined,
      billingEvent: raw?.billing_event as string | undefined,
      optimizationGoal: raw?.optimization_goal as string | undefined,
      spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0,
    };
    map.set(r.adsetId, {
      ...prev,
      spend: prev.spend + parseFloat(String(r.spend ?? 0)),
      impressions: prev.impressions + (r.impressions ?? 0),
      clicks: prev.clicks + (r.clicks ?? 0),
      leads: prev.leads + (r.leads ?? 0),
      reach: prev.reach + (r.reach ?? 0),
    });
  }

  for (const a of adsets) {
    if (!map.has(a.id)) {
      const raw = a.raw as Record<string, unknown> | undefined;
      map.set(a.id, {
        id: a.id, name: a.name, status: a.status, campaignId: a.campaignId,
        dailyBudget: a.dailyBudget ? parseFloat(String(a.dailyBudget)) : null,
        lifetimeBudget: a.lifetimeBudget ? parseFloat(String(a.lifetimeBudget)) : null,
        bidStrategy: raw?.bid_strategy as string | undefined,
        billingEvent: raw?.billing_event as string | undefined,
        optimizationGoal: raw?.optimization_goal as string | undefined,
        spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0,
      });
    }
  }

  return Array.from(map.values()).map(a => ({
    ...a,
    cpl: a.leads > 0 ? a.spend / a.leads : null,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : null,
    cpc: a.clicks > 0 ? a.spend / a.clicks : null,
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
  })).sort((a, b) => b.spend - a.spend);
}

// ── getAdsData ────────────────────────────────────────────────────────────────

export async function getAdsData(db: Db, companyId: string, opts: { since?: string; until?: string; adAccountId?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = opts.until ?? new Date().toISOString().slice(0, 10);
  const { adAccountId } = opts;

  const [ads, insights] = await Promise.all([
    db.select().from(metaAds).where(and(eq(metaAds.companyId, companyId), adAccountId ? eq(metaAds.adAccountId, adAccountId) : undefined)),
    db.select().from(metaAdsInsights).where(
      and(eq(metaAdsInsights.companyId, companyId), adAccountId ? eq(metaAdsInsights.adAccountId, adAccountId) : undefined, gte(metaAdsInsights.date, since), lte(metaAdsInsights.date, until))
    ),
  ]);

  type AdEntry = {
    id: string; name: string; status?: string | null; adsetId?: string | null; campaignId?: string | null;
    creativeId?: string | null; thumbnailUrl?: string | null; imageUrl?: string | null;
    body?: string | null; title?: string | null; callToAction?: string | null;
    spend: number; impressions: number; clicks: number; leads: number; reach: number;
  };

  const map = new Map<string, AdEntry>();

  const extractCreative = (raw: Record<string, unknown> | undefined) => {
    const creative = raw?.creative as Record<string, unknown> | undefined;
    if (!creative) return {};
    const storySpec = creative.object_story_spec as Record<string, unknown> | undefined;
    const linkData = storySpec?.link_data as Record<string, unknown> | undefined;
    return {
      thumbnailUrl: (creative.thumbnail_url ?? linkData?.picture) as string | undefined,
      imageUrl: creative.image_url as string | undefined,
      body: (creative.body ?? linkData?.message) as string | undefined,
      title: (creative.title ?? linkData?.name) as string | undefined,
      callToAction: (creative.call_to_action_type ?? (linkData?.call_to_action as Record<string, unknown> | undefined)?.type) as string | undefined,
    };
  };

  for (const r of insights) {
    if (!r.adId) continue;
    const ad = ads.find(a => a.id === r.adId);
    const creative = extractCreative(ad?.raw as Record<string, unknown> | undefined);
    const prev: AdEntry = map.get(r.adId) ?? {
      id: r.adId,
      name: ad?.name ?? r.adId,
      status: ad?.status,
      adsetId: r.adsetId ?? ad?.adsetId,
      campaignId: r.campaignId ?? ad?.campaignId,
      creativeId: ad?.creativeId,
      ...creative,
      spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0,
    };
    map.set(r.adId, {
      ...prev,
      spend: prev.spend + parseFloat(String(r.spend ?? 0)),
      impressions: prev.impressions + (r.impressions ?? 0),
      clicks: prev.clicks + (r.clicks ?? 0),
      leads: prev.leads + (r.leads ?? 0),
      reach: prev.reach + (r.reach ?? 0),
    });
  }

  for (const a of ads) {
    if (!map.has(a.id)) {
      const creative = extractCreative(a.raw as Record<string, unknown> | undefined);
      map.set(a.id, {
        id: a.id, name: a.name, status: a.status,
        adsetId: a.adsetId, campaignId: a.campaignId, creativeId: a.creativeId,
        ...creative,
        spend: 0, impressions: 0, clicks: 0, leads: 0, reach: 0,
      });
    }
  }

  return Array.from(map.values()).map(a => ({
    ...a,
    cpl: a.leads > 0 ? a.spend / a.leads : null,
    ctr: a.impressions > 0 ? a.clicks / a.impressions : null,
    cpc: a.clicks > 0 ? a.spend / a.clicks : null,
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
  })).sort((a, b) => b.spend - a.spend);
}

// ── getPostsData ──────────────────────────────────────────────────────────────

export async function getPostsData(db: Db, companyId: string) {
  const posts = await db.select().from(metaPagePosts)
    .where(eq(metaPagePosts.companyId, companyId))
    .orderBy(desc(metaPagePosts.createdTime))
    .limit(200);

  if (!posts.length) return [];

  const postIds = posts.map(p => p.id);
  const insights = await db.select().from(metaPostInsights)
    .where(inArray(metaPostInsights.postId, postIds));

  return posts.map(p => {
    const pi = insights.filter(i => i.postId === p.id);
    const getM = (m: string) => pi.find(i => i.metric === m)?.value ?? 0;
    const reach = getM("post_impressions_unique");
    const impressions = getM("post_impressions");
    const engagement = getM("post_engaged_users");
    const clicks = getM("post_clicks");
    const reactions = getM("post_reactions_by_type_total");
    return {
      id: p.id,
      message: p.message,
      story: p.story,
      fullPicture: p.fullPicture,
      permalinkUrl: p.permalinkUrl,
      createdTime: p.createdTime,
      postType: p.postType,
      reach,
      impressions,
      engagement,
      clicks,
      reactions,
      engagementRate: reach > 0 ? engagement / reach : 0,
    };
  });
}

// ── getAlerts ─────────────────────────────────────────────────────────────────

export async function getAlerts(db: Db, companyId: string, adAccountId?: string) {
  return db.select().from(metaAlerts)
    .where(and(eq(metaAlerts.companyId, companyId), adAccountId ? eq(metaAlerts.entityId, adAccountId) : undefined))
    .orderBy(desc(metaAlerts.createdAt))
    .limit(100);
}

export async function updateAlertStatus(db: Db, alertId: string, status: string) {
  await db.update(metaAlerts).set({ status, updatedAt: new Date() }).where(eq(metaAlerts.id, alertId));
}

// ── evaluateAlerts ────────────────────────────────────────────────────────────

export async function evaluateAlerts(db: Db, companyId: string, opts: { adAccountId?: string } = {}) {
  const { adAccountId } = opts;
  await db.delete(metaAlerts).where(
    and(eq(metaAlerts.companyId, companyId), eq(metaAlerts.status, "pending"), adAccountId ? eq(metaAlerts.entityId, adAccountId) : undefined)
  );

  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const campaigns = await getCampaignsData(db, companyId, { since, until, adAccountId });

  type AlertInsert = typeof metaAlerts.$inferInsert;
  const alerts: AlertInsert[] = [];

  // 1. Campaigns active with no spend
  for (const c of campaigns) {
    if (c.status === "ACTIVE" && c.spend === 0) {
      alerts.push({
        companyId, severity: "warning",
        title: "Campaña activa sin gasto",
        description: `"${c.name}" está activa pero no registró gasto en el período.`,
        metric: "spend", currentValue: "0", thresholdValue: "1",
        recommendation: "Verificar estado real en Meta Ads Manager y revisar límites de presupuesto.",
        entityType: "campaign", entityId: c.id, status: "pending",
      });
    }
    // 2. Campaigns spending without leads
    if (c.spend > 100 && c.leads === 0) {
      alerts.push({
        companyId, severity: "warning",
        title: "Campaña gastando sin leads",
        description: `"${c.name}" gastó $${c.spend.toFixed(0)} sin generar leads.`,
        metric: "leads", currentValue: "0", thresholdValue: "1",
        recommendation: "Revisar targeting, formulario de leads y creatividades.",
        entityType: "campaign", entityId: c.id, status: "pending",
      });
    }
  }

  // 3. CTR bajo (< 0.5%)
  const campaignsWithImp = campaigns.filter(c => c.impressions > 1000 && c.ctr !== null);
  for (const c of campaignsWithImp) {
    if ((c.ctr ?? 0) < 0.005) {
      alerts.push({
        companyId, severity: "info",
        title: "CTR bajo",
        description: `"${c.name}" tiene CTR de ${((c.ctr ?? 0) * 100).toFixed(2)}%.`,
        metric: "ctr", currentValue: String(((c.ctr ?? 0) * 100).toFixed(4)), thresholdValue: "0.5",
        recommendation: "Probar nuevas creatividades más atractivas o ajustar el targeting.",
        entityType: "campaign", entityId: c.id, status: "pending",
      });
    }
  }

  // 4. CPL alto (> 2x average)
  const withLeads = campaigns.filter(c => c.leads > 0 && c.cpl !== null);
  if (withLeads.length > 1) {
    const avgCpl = withLeads.reduce((s, c) => s + (c.cpl ?? 0), 0) / withLeads.length;
    for (const c of withLeads) {
      if ((c.cpl ?? 0) > avgCpl * 2 && c.spend > 50) {
        alerts.push({
          companyId, severity: "warning",
          title: "CPL alto",
          description: `"${c.name}" CPL $${(c.cpl ?? 0).toFixed(0)} vs promedio $${avgCpl.toFixed(0)}.`,
          metric: "cpl",
          currentValue: String((c.cpl ?? 0).toFixed(2)),
          thresholdValue: String((avgCpl * 2).toFixed(2)),
          recommendation: "Revisar segmento, creatividades y página de destino para mejorar la tasa de conversión.",
          entityType: "campaign", entityId: c.id, status: "pending",
        });
      }
    }
  }

  if (alerts.length > 0) {
    await db.insert(metaAlerts).values(alerts);
  }

  return { evaluated: alerts.length };
}
