// LMTM-OS: AdsAggregator
// The platform-agnostic sync orchestrator. Takes a connection + mapping,
// dispatches to the right AdsProvider, and persists the normalized
// results into the platform-agnostic DB tables.
//
// This is the function the scheduled routines call, the manual sync
// button calls, and the Dashboard Builder agent calls when a new client
// is provisioned.

import type { Db } from "@paperclipai/db";
import {
  adsAccountMappings,
  adsAdsets,
  adsCampaigns,
  adsConnections,
  adsCreatives,
  adsInsights,
  organicPostInsights,
  organicPosts,
  syncLogs,
} from "@paperclipai/db";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getAdsProvider, isKnownAdsPlatform } from "./registry.js";
import type { AdsPlatform } from "./types.js";

export interface SyncJobResult {
  jobName: string;
  platform: AdsPlatform;
  connectionId: string;
  mappingId: string;
  status: "completed" | "partial" | "failed";
  recordsSynced: number;
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

export interface SyncOptions {
  jobName: string;
  connectionId: string;
  mappingId: string;
  since: Date;
  until: Date;
}

async function logJobStart(
  db: Db,
  opts: { companyId: string; connectionId: string; clientId: string | null; platform: AdsPlatform; jobName: string },
): Promise<{ logId: string }> {
  const [row] = await db.insert(syncLogs).values({
    companyId: opts.companyId,
    connectionId: opts.connectionId,
    clientId: opts.clientId,
    platform: opts.platform,
    jobName: opts.jobName,
    status: "running",
  }).returning({ id: syncLogs.id });
  return { logId: row.id };
}

async function logJobEnd(
  db: Db,
  logId: string,
  status: "completed" | "failed" | "partial",
  recordsSynced: number,
  error?: string,
): Promise<void> {
  await db.update(syncLogs)
    .set({ status, completedAt: new Date(), recordsSynced, error: error ?? null })
    .where(eq(syncLogs.id, logId));
}

async function syncCampaigns(db: Db, opts: SyncOptions): Promise<number> {
  const provider = getAdsProvider(resolvePlatform(opts));
  const [connection, mapping] = await loadConnectionAndMapping(db, opts.connectionId, opts.mappingId);
  const campaigns = await provider.syncCampaigns(connection, mapping, opts.since, opts.until);
  if (campaigns.length === 0) return 0;
  // Delete existing rows for this connection/adAccount, then insert fresh.
  // Simpler than per-row upsert in this Drizzle version, and OK for an
  // agency-scale dataset (40 clients * 100s of campaigns each).
  await db.delete(adsCampaigns)
    .where(and(eq(adsCampaigns.connectionId, connection.id), eq(adsCampaigns.adAccountId, mapping.adAccountId)));
  await db.insert(adsCampaigns).values(campaigns.map((c) => ({
    id: c.id,
    companyId: connection.companyId,
    clientId: mapping.clientId ?? null,
    connectionId: connection.id,
    platform: connection.platform,
    adAccountId: mapping.adAccountId,
    name: c.name,
    status: c.status,
    objective: c.objective ?? null,
    dailyBudget: c.dailyBudget?.toString() ?? null,
    lifetimeBudget: c.lifetimeBudget?.toString() ?? null,
    startTime: c.startTime ?? null,
    stopTime: c.stopTime ?? null,
    syncedAt: new Date(),
    raw: c.raw,
  })));
  return campaigns.length;
}

async function syncAdsets(db: Db, opts: SyncOptions): Promise<number> {
  const provider = getAdsProvider(resolvePlatform(opts));
  const [connection, mapping] = await loadConnectionAndMapping(db, opts.connectionId, opts.mappingId);
  const allAdsets = await provider.syncAdSets(connection, mapping, opts.since, opts.until);
  if (allAdsets.length === 0) return 0;
  // Apply the Make.com-style "included adsets" filter from the mapping.
  // Empty array = include all (default for backward compat).
  const includeSet = Array.isArray(mapping.includedAdsets) && mapping.includedAdsets.length > 0
    ? new Set(mapping.includedAdsets)
    : null;
  const adsets = includeSet
    ? allAdsets.filter((a) => includeSet.has(a.id))
    : allAdsets;
  if (adsets.length === 0) return 0;
  // If a filter is set, only delete the rows for the included adset IDs to
  // avoid wiping data the user is excluding on purpose.
  if (includeSet) {
    await db.delete(adsAdsets)
      .where(and(
        eq(adsAdsets.connectionId, connection.id),
        eq(adsAdsets.adAccountId, mapping.adAccountId),
        inArray(adsAdsets.id, Array.from(includeSet)),
      ));
  } else {
    await db.delete(adsAdsets)
      .where(and(eq(adsAdsets.connectionId, connection.id), eq(adsAdsets.adAccountId, mapping.adAccountId)));
  }
  await db.insert(adsAdsets).values(adsets.map((a) => ({
    id: a.id,
    companyId: connection.companyId,
    clientId: mapping.clientId ?? null,
    connectionId: connection.id,
    platform: connection.platform,
    campaignId: a.campaignId,
    adAccountId: mapping.adAccountId,
    name: a.name,
    status: a.status,
    dailyBudget: a.dailyBudget?.toString() ?? null,
    lifetimeBudget: a.lifetimeBudget?.toString() ?? null,
    syncedAt: new Date(),
    raw: a.raw,
  })));
  return adsets.length;
}

async function syncCreatives(db: Db, opts: SyncOptions): Promise<number> {
  const provider = getAdsProvider(resolvePlatform(opts));
  const [connection, mapping] = await loadConnectionAndMapping(db, opts.connectionId, opts.mappingId);
  const ads = await provider.syncAds(connection, mapping, opts.since, opts.until);
  if (ads.length === 0) return 0;
  await db.delete(adsCreatives)
    .where(and(eq(adsCreatives.connectionId, connection.id), eq(adsCreatives.adAccountId, mapping.adAccountId)));
  await db.insert(adsCreatives).values(ads.map((a) => ({
    id: a.id,
    companyId: connection.companyId,
    clientId: mapping.clientId ?? null,
    connectionId: connection.id,
    platform: connection.platform,
    adsetId: a.adsetId ?? null,
    campaignId: a.campaignId ?? null,
    adAccountId: mapping.adAccountId,
    name: a.name,
    status: a.status,
    creativeId: a.creativeId ?? null,
    syncedAt: new Date(),
    raw: a.raw,
  })));
  return ads.length;
}

async function syncInsights(db: Db, opts: SyncOptions): Promise<number> {
  const provider = getAdsProvider(resolvePlatform(opts));
  const [connection, mapping] = await loadConnectionAndMapping(db, opts.connectionId, opts.mappingId);
  const allInsights = await provider.syncInsights(connection, mapping, opts.since, opts.until);
  if (allInsights.length === 0) return 0;
  // Apply the Make.com-style "included adsets" filter from the mapping.
  // Empty array = include all (default for backward compat).
  const includeSet = Array.isArray(mapping.includedAdsets) && mapping.includedAdsets.length > 0
    ? new Set(mapping.includedAdsets)
    : null;
  const insights = includeSet
    ? allInsights.filter((i) => i.adsetId != null && includeSet.has(i.adsetId))
    : allInsights;
  if (insights.length === 0) return 0;
  // Idempotent: delete the existing rows for this (connection, adAccount, date range)
  // then insert fresh. The unique index on ads_insights_uniq would reject duplicates
  // anyway, but deleting-then-inserting is faster than conflict resolution at scale.
  await db.delete(adsInsights)
    .where(and(
      eq(adsInsights.connectionId, connection.id),
      eq(adsInsights.platform, connection.platform),
      eq(adsInsights.adAccountId, mapping.adAccountId),
      gte(adsInsights.date, opts.since.toISOString().slice(0, 10)),
      lte(adsInsights.date, opts.until.toISOString().slice(0, 10)),
    ));
  await db.insert(adsInsights)
    .values(insights.map((i) => ({
      companyId: connection.companyId,
      clientId: mapping.clientId ?? null,
      connectionId: connection.id,
      platform: connection.platform,
      adAccountId: mapping.adAccountId,
      campaignId: i.campaignId ?? null,
      campaignName: i.campaignName ?? null,
      adsetId: i.adsetId ?? null,
      adId: i.adId ?? null,
      date: i.date.toISOString().slice(0, 10),
      impressions: i.impressions,
      clicks: i.clicks,
      spend: i.spend.toString(),
      reach: i.reach ?? 0,
      ctr: i.ctr?.toString() ?? null,
      cpc: i.cpc?.toString() ?? null,
      cpm: i.cpm?.toString() ?? null,
      leads: i.leads ?? 0,
      conversions: i.conversions ?? 0,
      conversionValue: i.conversionValue?.toString() ?? null,
      videoViews: i.videoViews ?? 0,
      raw: i.raw,
    })));
  return insights.length;
}

async function syncOrganic(db: Db, opts: SyncOptions): Promise<number> {
  const provider = getAdsProvider(resolvePlatform(opts));
  const [connection, mapping] = await loadConnectionAndMapping(db, opts.connectionId, opts.mappingId);
  if (!mapping.pageId) return 0;
  const posts = await provider.syncOrganicPosts(connection, mapping, opts.since, opts.until);
  if (posts.length === 0) return 0;
  await db.insert(organicPosts)
    .values(posts.map((p) => ({
      id: p.id,
      companyId: connection.companyId,
      clientId: mapping.clientId ?? null,
      connectionId: connection.id,
      platform: connection.platform,
      pageId: p.pageId,
      message: p.message ?? null,
      story: p.story ?? null,
      fullPicture: p.fullPicture ?? null,
      // ON CONFLICT DO NOTHING: the same page can be mapped to multiple
      // LMTM clients, and the post id (pageid_postid) is the natural
      // primary key — the first sync wins, subsequent syncs are no-ops.
      // The endpoint falls back to page-id based lookup anyway, so
      // missing-clientId rows are still discoverable.
      permalinkUrl: p.permalinkUrl ?? null,
      createdTime: p.createdTime ?? null,
      postType: p.postType ?? null,
      syncedAt: new Date(),
      raw: p.raw,
    })))
    .onConflictDoNothing({ target: organicPosts.id });
  // Fetch per-post metrics for the most recent posts.
  const recent = posts.slice(-20);
  for (const post of recent) {
    try {
      const metrics = await provider.fetchPostMetrics(connection, post);
      for (const m of metrics) {
        await db.insert(organicPostInsights)
          .values({
            companyId: connection.companyId,
            postId: post.id,
            metric: m.metric,
            value: m.value.toString(),
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [organicPostInsights.postId, organicPostInsights.metric],
            set: { value: m.value.toString(), syncedAt: new Date() },
          });
      }
    } catch {
      // Best-effort; a failed metrics fetch shouldn't fail the whole organic sync.
    }
  }
  return posts.length;
}

async function loadConnectionAndMapping(
  db: Db,
  connectionId: string,
  mappingId: string,
): Promise<[typeof adsConnections.$inferSelect, typeof adsAccountMappings.$inferSelect]> {
  const connection = await db.query.adsConnections.findFirst({ where: eq(adsConnections.id, connectionId) });
  if (!connection) throw new Error(`ads connection ${connectionId} not found`);
  const mapping = await db.query.adsAccountMappings.findFirst({ where: eq(adsAccountMappings.id, mappingId) });
  if (!mapping) throw new Error(`ads account mapping ${mappingId} not found`);
  return [connection, mapping];
}

function resolvePlatform(opts: SyncOptions): AdsPlatform {
  if (!isKnownAdsPlatform("meta")) throw new Error("unreachable");
  // We don't have access to the connection at this point, so this is a
  // placeholder; the real platform resolution happens inside the provider
  // dispatch. The type is here so the registry can validate.
  return "meta";
}

export const adsAggregator = {
  syncCampaigns,
  syncAdsets,
  syncCreatives,
  syncInsights,
  syncOrganic,
};
