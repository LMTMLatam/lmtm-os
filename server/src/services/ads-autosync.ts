// LMTM-OS: automatic daily ads sync.
//
// Until now ad data only refreshed when someone hit "Sincronizar" by hand, so
// dashboards for less-active clients froze for months. This service walks every
// ad-account mapping once a day and pulls campaigns + insights, sequentially and
// gently (small delay between accounts) to stay under Meta's rate limits on the
// 512MB box. Mirrors the defensive scheduler pattern in agency-ops.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, syncLogs } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { adsAggregator } from "./ads/aggregator.js";

const DAY = 24 * 60 * 60 * 1000;
/** Errores que significan "el token murió, hace falta re-autorizar a mano". */
const AUTH_DEAD_RE = /\b401\b|UNAUTHENTICATED|invalid_grant|OAuth ?2? access token|access token.*(expired|revoked)|Session has expired/i;

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
    let mRecords = 0;
    let mErr: string | null = null;
    try {
      mRecords += await adsAggregator.syncCampaigns(db, { ...base, jobName: "campaigns" });
      // Creativos (nombre + miniatura de cada anuncio). Faltaba en el ciclo
      // diario: solo se refrescaban con el botón manual, así que 19 cuentas
      // tenían creativos congelados desde junio/julio mientras los insights
      // seguían frescos — el reporte del cliente mostraba "Anuncio" sin imagen
      // para los anuncios nuevos (11/8). Best-effort: no puede voltear el sync.
      try {
        mRecords += await adsAggregator.syncCreatives(db, { ...base, jobName: "creatives" });
      } catch (e) {
        console.warn(`[ads-autosync] creatives ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      mRecords += await adsAggregator.syncInsights(db, { ...base, jobName: "insights" });
      // Demographics snapshot (age/gender/platform/device) — Meta-only, two
      // light account-level Graph calls. Best-effort: it never throws, so a
      // breakdown permission gap can't fail the mapping's core sync.
      try {
        mRecords += await adsAggregator.syncAudience(db, { ...base, jobName: "audience" });
      } catch (e) {
        console.warn(`[ads-autosync] audience ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Organic posts (FB + IG) with inline engagement. Best-effort: mappings
      // without a pageId (or pages without access) must not fail the ad sync.
      try {
        mRecords += await adsAggregator.syncOrganic(db, { ...base, jobName: "organic" });
      } catch (e) {
        console.warn(`[ads-autosync] organic ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      ok++;
    } catch (e) {
      failed++;
      mErr = e instanceof Error ? e.message : String(e);
      errors.push({ mappingId: m.id, error: mErr.slice(0, 300) });
      console.warn(`[ads-autosync] mapping ${m.id} failed: ${mErr}`);
    }
    records += mRecords;
    // Persist a per-account sync status so the niche panel can tell "sin pauta
    // real" (sync ok, 0 spend) apart from "cuenta con error de sync / sin acceso
    // del token" (sync failed) — otherwise a failed account looks identical to
    // one that simply didn't spend, and shows a silent false "sin pauta activa".
    try {
      await db.insert(syncLogs).values({
        companyId: m.companyId,
        clientId: m.clientId,
        connectionId: m.connectionId,
        platform: m.platform,
        jobName: "ads-autosync",
        status: mErr ? "failed" : "completed",
        completedAt: new Date(),
        recordsSynced: mRecords,
        error: mErr ? mErr.slice(0, 500) : null,
        metadata: { adAccountId: m.adAccountId },
      });
    } catch (e) {
      console.warn(`[ads-autosync] sync-log write for ${m.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Token muerto = la conexión queda marcada, no solo el log. Google Ads
    // estuvo 12 días sin sincronizar con status 'active' y last_error vacío
    // porque nadie escribía el estado: en el panel se veía sana (11/8). Meta ya
    // hace esto en su health-check; acá faltaba para el resto.
    if (mErr && AUTH_DEAD_RE.test(mErr)) {
      try {
        await db.update(adsConnections)
          .set({ status: "error", lastError: mErr.slice(0, 500), lastCheckAt: new Date() })
          .where(eq(adsConnections.id, m.connectionId));
      } catch { /* marcar es best-effort */ }
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
