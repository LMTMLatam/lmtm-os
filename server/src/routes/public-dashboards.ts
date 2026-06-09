// LMTM-OS: PUBLIC dashboard routes (no auth).
// These power the /public/dashboards/:slug read-only view. The slug
// identifies the dashboard token; we look it up in `public_dashboards`,
// verify `enabled = true`, then proxy the data to the same query
// functions used by the admin dashboard endpoints (without the actor
// / company access checks).
//
// IMPORTANT: only data tied to the resolved client_id is exposed.
// There is no company-wide or admin-only info in the response.

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsCampaigns, adsInsights, clients, organicPosts, organicPostInsights, publicDashboards } from "@paperclipai/db";
import { and, eq, gte, lte, or, sql } from "drizzle-orm";

export function publicDashboardRoutes(db: Db): Router {
  const router = Router();

  // Resolve a public dashboard by slug and verify it's enabled.
  // Returns the public_dashboards row + the bound client row, or null.
  async function resolve(slug: string) {
    if (!slug || slug.length < 8) return null;
    const [row] = await db
      .select()
      .from(publicDashboards)
      .where(eq(publicDashboards.slug, slug));
    if (!row || !row.enabled) return null;
    const [client] = await db
      .select({ id: clients.id, slug: clients.slug, name: clients.name, currency: clients.currency })
      .from(clients)
      .where(eq(clients.id, row.clientId));
    if (!client) return null;
    // Update lastViewedAt (best effort, fire-and-forget)
    db.update(publicDashboards)
      .set({ lastViewedAt: new Date() })
      .where(eq(publicDashboards.id, row.id))
      .catch(() => {});
    return { dashboard: row, client };
  }

  function defaultSince(): string {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  function defaultUntil(): string {
    return new Date().toISOString().slice(0, 10);
  }
  function windowOf(req: Request): { since: string; until: string } {
    return {
      since: (req.query.since as string) || defaultSince(),
      until: (req.query.until as string) || defaultUntil(),
    };
  }

  // GET /api/public/dashboards/:slug
  // returns: { client, dashboard: { label, enabled, createdAt, lastViewedAt } }
  router.get("/dashboards/:slug", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      res.json({
        client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency },
        dashboard: {
          label: r.dashboard.label,
          enabled: r.dashboard.enabled,
          createdAt: r.dashboard.createdAt,
          lastViewedAt: r.dashboard.lastViewedAt,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 300) });
    }
  });

  // GET /api/public/dashboards/:slug/funnel?since&until
  router.get("/dashboards/:slug/funnel", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const { since, until } = windowOf(req);
      const [agg] = await db
        .select({
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversions: sql<number>`coalesce(sum(${adsInsights.conversions}),0)::int`,
          conversionValue: sql<string>`coalesce(sum(${adsInsights.conversionValue})::numeric, 0::numeric)`,
          reach: sql<number>`coalesce(sum(${adsInsights.reach}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, r.client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ));
      const impressions = Number(agg?.impressions ?? 0);
      const clicks = Number(agg?.clicks ?? 0);
      const leads = Number(agg?.leads ?? 0);
      const conversions = Number(agg?.conversions ?? 0);
      const spend = Number(agg?.spend ?? 0);
      const revenue = Number(agg?.conversionValue ?? 0);
      const landingVisits = Math.round(clicks * 0.6);
      res.json({
        client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency },
        since, until,
        funnel: {
          impressions, clicks, landingVisits, leads, conversions, spend, revenue,
          reach: Number(agg?.reach ?? 0),
          rates: {
            ctr: impressions > 0 ? clicks / impressions : 0,
            clickToLanding: clicks > 0 ? landingVisits / clicks : 0,
            landingToLead: landingVisits > 0 ? leads / landingVisits : 0,
            clickToLead: clicks > 0 ? leads / clicks : 0,
            leadToSale: leads > 0 ? conversions / leads : 0,
            clickToSale: clicks > 0 ? conversions / clicks : 0,
          },
          cpls: {
            cpc: clicks > 0 ? spend / clicks : 0,
            cpl: leads > 0 ? spend / leads : 0,
            cpa: conversions > 0 ? spend / conversions : 0,
            roas: spend > 0 ? revenue / spend : 0,
          },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 300) });
    }
  });

  // GET /api/public/dashboards/:slug/timeseries?since&until
  router.get("/dashboards/:slug/timeseries", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const { since, until } = windowOf(req);
      const rows = await db
        .select({
          date: adsInsights.date,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversions: sql<number>`coalesce(sum(${adsInsights.conversions}),0)::int`,
          reach: sql<number>`coalesce(sum(${adsInsights.reach}),0)::int`,
          videoViews: sql<number>`coalesce(sum(${adsInsights.videoViews}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, r.client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ))
        .groupBy(adsInsights.date)
        .orderBy(adsInsights.date);
      const series = rows.map((row) => {
        const imp = Number(row.impressions);
        const clk = Number(row.clicks);
        const sp = Number(row.spend);
        const ld = Number(row.leads);
        return {
          date: String(row.date),
          impressions: imp,
          clicks: clk,
          spend: sp,
          leads: ld,
          conversions: Number(row.conversions),
          reach: Number(row.reach),
          videoViews: Number(row.videoViews),
          ctr: imp > 0 ? clk / imp : 0,
          cpc: clk > 0 ? sp / clk : 0,
          cpm: imp > 0 ? (sp / imp) * 1000 : 0,
          cpl: ld > 0 ? sp / ld : 0,
        };
      });
      res.json({ client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency }, since, until, series });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 300) });
    }
  });

  // GET /api/public/dashboards/:slug/campaigns?since&until
  router.get("/dashboards/:slug/campaigns", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const { since, until } = windowOf(req);
      const campaignRows = await db
        .select({
          id: adsCampaigns.id, name: adsCampaigns.name, status: adsCampaigns.status,
          objective: adsCampaigns.objective, platform: adsCampaigns.platform,
          adAccountId: adsCampaigns.adAccountId, dailyBudget: adsCampaigns.dailyBudget,
          lifetimeBudget: adsCampaigns.lifetimeBudget,
        })
        .from(adsCampaigns)
        .where(eq(adsCampaigns.clientId, r.client.id));
      const insightRows = await db
        .select({
          campaignId: adsInsights.campaignId,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, r.client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
        ))
        .groupBy(adsInsights.campaignId);
      const byCampaign = new Map(insightRows.map((row) => [row.campaignId ?? "", row]));
      const rows = campaignRows.map((c) => {
        const m: any = byCampaign.get(c.id) ?? { impressions: 0, clicks: 0, spend: 0, leads: 0 };
        const imp = Number(m.impressions), clk = Number(m.clicks), sp = Number(m.spend), ld = Number(m.leads);
        return {
          id: c.id, name: c.name, status: c.status ?? "unknown",
          objective: c.objective ?? null, platform: c.platform, adAccountId: c.adAccountId,
          dailyBudget: c.dailyBudget ? Number(c.dailyBudget) : null,
          lifetimeBudget: c.lifetimeBudget ? Number(c.lifetimeBudget) : null,
          impressions: imp, clicks: clk, spend: sp, leads: ld,
          ctr: imp > 0 ? clk / imp : 0,
          cpc: clk > 0 ? sp / clk : 0,
          cpm: imp > 0 ? (sp / imp) * 1000 : 0,
          cpl: ld > 0 ? sp / ld : 0,
        };
      }).sort((a, b) => b.spend - a.spend);
      const totals = rows.reduce(
        (acc, r) => { acc.spend += r.spend; acc.impressions += r.impressions; acc.clicks += r.clicks; acc.leads += r.leads; return acc; },
        { spend: 0, impressions: 0, clicks: 0, leads: 0, ctr: 0, cpc: 0, cpm: 0 },
      );
      totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
      totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
      totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
      res.json({
        client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency },
        since, until, totals, campaigns: rows,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 300) });
    }
  });

  // GET /api/public/dashboards/:slug/organic
  router.get("/dashboards/:slug/organic", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      let posts = await db.select().from(organicPosts).where(eq(organicPosts.clientId, r.client.id));
      if (posts.length === 0) {
        const mappedPages = await db.select({ pageId: adsAccountMappings.pageId })
          .from(adsAccountMappings).where(eq(adsAccountMappings.clientId, r.client.id));
        const pageIds = Array.from(new Set(mappedPages.map((m) => m.pageId).filter(Boolean) as string[]));
        if (pageIds.length > 0) {
          const orCond = or(...pageIds.map((p) => eq(organicPosts.pageId, p)));
          if (orCond) posts = await db.select().from(organicPosts).where(orCond);
        }
      }
      const postIds = posts.map((p) => p.id);
      let metrics: any[] = [];
      if (postIds.length > 0) {
        metrics = await db.select().from(organicPostInsights)
          .where(sql`${organicPostInsights.postId} = ANY(${sql.raw(`ARRAY[${postIds.map((_, i) => `$${i + 1}`).join(",")}])`)}`)
          .catch(async () => {
            // Fallback: simple inArray
            return db.select().from(organicPostInsights).where(sql`${organicPostInsights.postId} IN ${postIds}`);
          });
      }
      const byPost = new Map<string, Record<string, number>>();
      for (const m of metrics) {
        const row = byPost.get(m.postId) ?? {};
        row[m.metric] = Number(m.value);
        byPost.set(m.postId, row);
      }
      const merged = posts.map((p) => {
        const m = byPost.get(p.id) ?? {};
        const impressions = m["post_impressions"] ?? m["post_impressions_unique"] ?? 0;
        const engaged = m["post_engaged_users"] ?? m["post_engaged_fan"] ?? 0;
        const reactions = m["post_reactions_by_type_total"] ?? m["post_clicks"] ?? 0;
        const comments = m["comments"] ?? m["post_comments"] ?? 0;
        const shares = m["shares"] ?? m["post_shares"] ?? 0;
        const clicks = m["post_clicks"] ?? 0;
        const videoViews = m["post_video_views"] ?? m["video_views"] ?? 0;
        return {
          id: p.id, pageId: p.pageId, message: p.message ?? p.story ?? "",
          postType: p.postType ?? "unknown", createdTime: p.createdTime,
          permalinkUrl: p.permalinkUrl, fullPicture: p.fullPicture,
          reactions, comments, shares, clicks, videoViews,
          impressions, engaged,
          engagementRate: impressions > 0 ? engaged / impressions : 0,
          score: (reactions * 1) + (comments * 3) + (shares * 5) + (clicks * 2),
        };
      }).sort((a, b) => Number(b.createdTime ? new Date(b.createdTime).getTime() : 0) - Number(a.createdTime ? new Date(a.createdTime).getTime() : 0));
      res.json({ client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency }, posts: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: "Internal server error", detail: msg.slice(0, 300) });
    }
  });

  return router;
}
