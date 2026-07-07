// LMTM-OS: content knowledge graph (#7).
// Links each content piece (organic posts + ad creatives) to its performance
// metrics + derived tags/format, so we can answer "what content drives what
// result" per client/niche. Feeds the learning engine and opportunities.

import type { Db } from "@paperclipai/db";
import { organicPosts, organicPostInsights, adsCreatives, adsInsights, contentPerformance } from "@paperclipai/db";
import { eq, desc } from "drizzle-orm";
import { resolveCompanyId, activeClients, num } from "./intel-common.js";

const STOP = new Set("de la el en y a los las un una que con por para del al se su lo es más o the and for".split(" "));
function tagsFrom(text: string): string[] {
  return Array.from(new Set((text || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9áéíóúñ\s]/g, " ")
    .split(/\s+/).filter((w) => w.length >= 5 && !STOP.has(w)))).slice(0, 6);
}

async function upsertContent(db: Db, row: typeof contentPerformance.$inferInsert): Promise<void> {
  await db.insert(contentPerformance).values(row).onConflictDoUpdate({
    target: [contentPerformance.contentRef, contentPerformance.source],
    set: { metrics: row.metrics, score: row.score, tags: row.tags, title: row.title, format: row.format, updatedAt: new Date() },
  });
}

export async function rebuildClientContent(db: Db, clientId: string): Promise<{ items: number }> {
  const companyId = await resolveCompanyId(db, clientId);
  if (!companyId) return { items: 0 };
  let items = 0;

  // Organic posts (each has key/value metric rows).
  const posts = await db.select().from(organicPosts).where(eq(organicPosts.clientId, clientId)).orderBy(desc(organicPosts.createdTime)).limit(80);
  for (const p of posts) {
    const ins = await db.select({ metric: organicPostInsights.metric, value: organicPostInsights.value })
      .from(organicPostInsights).where(eq(organicPostInsights.postId, p.id));
    const metrics: Record<string, number> = {};
    for (const r of ins) metrics[r.metric] = num(r.value);
    const engagement = (metrics.reactions ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0);
    const score = metrics.engagement ?? (engagement > 0 ? engagement : (metrics.impressions ?? 0));
    await upsertContent(db, {
      companyId, clientId, contentRef: p.id, source: "organic",
      title: (p.message ?? p.story ?? "").slice(0, 140) || null, format: p.postType ?? null,
      tags: tagsFrom(p.message ?? ""), publishedAt: p.createdTime ?? null, metrics, score: String(score),
    });
    items += 1;
  }

  // Ad creatives (metrics aggregated from insights by ad id).
  const creatives = await db.select().from(adsCreatives).where(eq(adsCreatives.clientId, clientId)).limit(80);
  for (const c of creatives) {
    const agg = await db.select().from(adsInsights).where(eq(adsInsights.adId, c.id)).limit(500);
    const m = agg.reduce((acc, r) => {
      acc.impressions += num(r.impressions); acc.clicks += num(r.clicks); acc.leads += num(r.leads); acc.spend += num(r.spend);
      return acc;
    }, { impressions: 0, clicks: 0, leads: 0, spend: 0 });
    const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    // Real media format via object_story_spec (video_data → video, link/photo
    // → imagen) — same extraction as mineAdsWinningFormats. The old hardcoded
    // "ad" fallback polluted format learnings ("el formato ad rinde mejor").
    const raw = (c.raw ?? {}) as Record<string, unknown>;
    const creative = (raw.creative ?? {}) as Record<string, unknown>;
    const spec = (creative.object_story_spec ?? {}) as Record<string, unknown>;
    const hasVideo = Boolean(spec.video_data ?? creative.video_id ?? raw.video_id);
    const hasImage = Boolean(spec.link_data ?? spec.photo_data ?? creative.image_url ?? raw.image_url ?? raw.picture);
    await upsertContent(db, {
      companyId, clientId, contentRef: c.id, source: "meta",
      title: c.name?.slice(0, 140) ?? null, format: hasVideo ? "video" : hasImage ? "imagen" : "ad",
      tags: tagsFrom(c.name ?? ""), publishedAt: null,
      metrics: { ...m, ctr: Number(ctr.toFixed(2)) }, score: String(m.leads || Number(ctr.toFixed(2))),
    });
    items += 1;
  }

  return { items };
}

export async function topContent(db: Db, clientId: string, limit = 10) {
  return db.select().from(contentPerformance).where(eq(contentPerformance.clientId, clientId))
    .orderBy(desc(contentPerformance.score)).limit(limit);
}

export async function rebuildAllContent(db: Db): Promise<{ clients: number }> {
  const rows = await activeClients(db);
  let clientsDone = 0;
  for (const c of rows) { const r = await rebuildClientContent(db, c.id).catch(() => ({ items: 0 })); if (r.items > 0) clientsDone += 1; }
  return { clients: clientsDone };
}

let kgTimer: ReturnType<typeof setInterval> | null = null;
export function initKnowledgeGraph(db: Db): void {
  if (kgTimer) return;
  setTimeout(() => { rebuildAllContent(db).catch((e) => console.warn("[kg] rebuild failed:", e)); }, 15 * 60 * 1000);
  kgTimer = setInterval(() => { rebuildAllContent(db).catch((e) => console.warn("[kg] rebuild failed:", e)); }, 24 * 3600 * 1000);
  console.log("[knowledge-graph] scheduled content rebuild every 24h");
}
