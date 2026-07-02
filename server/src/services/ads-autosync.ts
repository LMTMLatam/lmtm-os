// LMTM-OS: automatic daily ads sync.
//
// Until now ad data only refreshed when someone hit "Sincronizar" by hand, so
// dashboards for less-active clients froze for months. This service walks every
// ad-account mapping once a day and pulls campaigns + insights, sequentially and
// gently (small delay between accounts) to stay under Meta's rate limits on the
// 512MB box. Mirrors the defensive scheduler pattern in agency-ops.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings } from "@paperclipai/db";
import { adsAggregator } from "./ads/aggregator.js";

const DAY = 24 * 60 * 60 * 1000;

export interface AutoSyncResult {
  mappings: number;
  ok: number;
  failed: number;
  records: number;
  errors: Array<{ mappingId: string; error: string }>;
}

/** Sync campaigns + insights for every mapping over the last `sinceDays`. */
export async function runAllAdsSync(db: Db, opts?: { sinceDays?: number }): Promise<AutoSyncResult> {
  const sinceDays = opts?.sinceDays ?? 90;
  const until = new Date();
  const since = new Date(Date.now() - sinceDays * DAY);
  const mappings = await db.select().from(adsAccountMappings);

  let ok = 0;
  let failed = 0;
  let records = 0;
  const errors: Array<{ mappingId: string; error: string }> = [];

  for (const m of mappings) {
    // Skip orphaned mappings (connection deleted/replaced → connection_id NULL).
    if (!m.connectionId) continue;
    const base = { connectionId: m.connectionId, mappingId: m.id, since, until };
    try {
      records += await adsAggregator.syncCampaigns(db, { ...base, jobName: "campaigns" });
      records += await adsAggregator.syncInsights(db, { ...base, jobName: "insights" });
      // Demographics snapshot (age/gender/platform/device) — Meta-only, two
      // light account-level Graph calls. Best-effort: it never throws, so a
      // breakdown permission gap can't fail the mapping's core sync.
      try {
        records += await adsAggregator.syncAudience(db, { ...base, jobName: "audience" });
      } catch (e) {
        console.warn(`[ads-autosync] audience ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Organic posts (FB + IG) with inline engagement. Best-effort: mappings
      // without a pageId (or pages without access) must not fail the ad sync.
      try {
        records += await adsAggregator.syncOrganic(db, { ...base, jobName: "organic" });
      } catch (e) {
        console.warn(`[ads-autosync] organic ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      ok++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ mappingId: m.id, error: msg.slice(0, 300) });
      console.warn(`[ads-autosync] mapping ${m.id} failed: ${msg}`);
    }
    // Be gentle with Meta's rate limits between accounts.
    await new Promise((r) => setTimeout(r, 1500));
  }

  // NOTE: the old syncPagePosts sweep (meta-sync.ts) was removed from this
  // path: it wrote to meta_page_posts / meta_post_insights, tables that don't
  // exist in prod — every page WITH posts errored, and the ~600 per-post
  // insight calls burned Meta's app rate-limit budget for nothing. Organic now
  // syncs per mapping above via adsAggregator.syncOrganic (organic_posts +
  // organic_post_insights, the tables the dashboard actually reads).

  console.log(`[ads-autosync] done: ${ok} ok, ${failed} failed, ${records} records across ${mappings.length} mappings`);
  return { mappings: mappings.length, ok, failed, records, errors };
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncDay = "";

export function initAdsAutoSync(db: Db): void {
  if (syncTimer) return;
  const tick = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastSyncDay) return; // once per day
    lastSyncDay = day;
    await runAllAdsSync(db).catch((e) => console.warn("[ads-autosync] run failed:", e));
  };
  // First run 6 min after boot (let the server settle), then check every 3h
  // and fire at most once per calendar day.
  setTimeout(() => { void tick(); }, 6 * 60 * 1000);
  syncTimer = setInterval(() => { void tick(); }, 3 * 3600 * 1000);
  console.log("[ads-autosync] scheduled daily ads sync");
}
