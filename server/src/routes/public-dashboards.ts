// LMTM-OS: PUBLIC dashboard routes (no auth).
// These power the /public/dashboards/:slug read-only view. The slug
// identifies the dashboard token; we look it up in `public_dashboards`,
// verify `enabled = true`, then proxy the data to the same query
// functions used by the admin dashboard endpoints (without the actor
// / company access checks).
//
// IMPORTANT: only data tied to the resolved client_id is exposed.
// There is no company-wide or admin-only info in the response.

import { microCache } from "../services/micro-cache.js";
import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsCampaigns, adsCreatives, adsInsights, clients, organicPosts, organicPostInsights, publicDashboards } from "@paperclipai/db";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { fechaLocal, restarDias } from "../decisiones/motor-datos.js";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const valida = (s: string) => FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/**
 * Puro. La ventana del dashboard público: por defecto de hoy-30 a ayer (`hoy` en hora local).
 * null si una fecha vino mal escrita o el rango está al revés.
 */
export function ventanaPublica(since: unknown, until: unknown, hoy: string): { since: string; until: string } | null {
  const s = typeof since === "string" && since ? since : restarDias(hoy, 30);
  const u = typeof until === "string" && until ? until : restarDias(hoy, 1);
  if (!valida(s) || !valida(u) || s > u) return null;
  return { since: s, until: u };
}

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
      .select({ id: clients.id, slug: clients.slug, name: clients.name, currency: clients.currency, industry: clients.industry, metadata: clients.metadata })
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

  // Termina AYER: el dia en curso esta a medio sincronizar y arrastra hacia
  // abajo el ultimo punto de las series y los deltas contra el periodo
  // anterior (que si esta completo). Mismo criterio que balance-monitor.ts y
  // que el preset "Ultimos 30 dias" de Meta. Pedir hoy con ?until= sigue
  // andando: esto es solo el default. En hora de Buenos Aires (20/11): en UTC,
  // de 21 a 24 h "ayer" era hoy y entraba el dia a medio cargar.
  // Filtro de plataforma (28/7): ?platform=meta|google separa; sin param unifica.
  function platformOf(req: Request): "meta" | "google" | null {
    const p = String(req.query.platform ?? "");
    return p === "meta" || p === "google" ? p : null;
  }
  /** null = fechas mal escritas: la ruta responde 400 sin tocar la base. */
  function windowOf(req: Request): { since: string; until: string } | null {
    return ventanaPublica(req.query.since, req.query.until, fechaLocal(new Date()));
  }
  const fechasMal = (res: Response) => res.status(400).json({ error: "Fechas inválidas: usá AAAA-MM-DD." });
  /** Al cliente no le llega el detalle interno del error (20/11: devolvía el mensaje de la base). */
  const fallo = (res: Response, donde: string, e: unknown) => {
    console.warn(`[dashboard-publico] ${donde}:`, e instanceof Error ? e.message : e);
    res.status(500).json({ error: "No se pudieron leer los datos." });
  };

  // GET /api/public/dashboards/:slug
  // returns: { client, dashboard: { label, enabled, createdAt, lastViewedAt } }
  router.get("/dashboards/:slug", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      // CPL objetivo para el semáforo: solo el que fijó una persona
      // (metadata.cplObjetivo). Antes caía al ideal del rubro, que es un
      // promedio ajeno presentado al cliente como si fuera su objetivo (B3).
      const meta = (r.client.metadata ?? {}) as Record<string, unknown>;
      const cplObjetivo = Number(meta.cplObjetivo) > 0 ? Number(meta.cplObjetivo) : null;
      res.json({
        client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency, cplObjetivo },
        dashboard: {
          label: r.dashboard.label,
          enabled: r.dashboard.enabled,
          createdAt: r.dashboard.createdAt,
          lastViewedAt: r.dashboard.lastViewedAt,
        },
      });
    } catch (e) {
      fallo(res, req.path, e);
    }
  });

  // GET /api/public/dashboards/:slug/informe?semana=YYYY-MM-DD — el informe
  // semanal para el cliente (rediseño B3): costo por consulta contra el
  // objetivo, tendencia, campañas y la narrativa publicada. Todo de `metricas`.
  // Sin microCache: el informe tiene su propio caché por cliente y semana
  // (decisiones/informe-cache.ts), que se borra al publicar o retirar.
  router.get("/dashboards/:slug/informe", async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const { informePublicoCacheado } = await import("../decisiones/informe-publico.js");
      const semana = typeof req.query.semana === "string" ? req.query.semana : undefined;
      res.json({ cliente: r.client.name.trim(), ...(await informePublicoCacheado(db, r.client.id, semana)) });
    } catch (e) {
      // Al cliente no le llega el detalle interno del error.
      console.warn("[informe-publico]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "No se pudo armar el informe." });
    }
  });

  // GET /api/public/dashboards/:slug/audiencia — a QUIÉN le estamos hablando
  // (6/8): edad, género, dispositivo y red. El dato más vendedor del reporte y
  // no estaba en el tablero del cliente. Último snapshot por dimensión.
  router.get("/dashboards/:slug/audiencia", microCache(10 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const { audienceDemographics } = await import("@paperclipai/db");
      const rows = await db
        .select({
          dimension: audienceDemographics.dimension,
          dimKey: audienceDemographics.dimKey,
          spend: sql<string>`coalesce(sum(${audienceDemographics.spend}),0)`,
          leads: sql<number>`coalesce(sum(${audienceDemographics.leads}),0)::int`,
          impressions: sql<number>`coalesce(sum(${audienceDemographics.impressions}),0)::int`,
        })
        .from(audienceDemographics)
        .where(and(
          eq(audienceDemographics.clientId, r.client.id),
          sql`${audienceDemographics.periodUntil} = (select max(period_until) from audience_demographics a2 where a2.client_id = ${r.client.id} and a2.dimension = ${audienceDemographics.dimension})`,
        ))
        .groupBy(audienceDemographics.dimension, audienceDemographics.dimKey);
      const out: Record<string, Array<{ key: string; spend: number; leads: number; impressions: number; cpl: number | null }>> = {};
      for (const row of rows) {
        const spend = Number(row.spend);
        (out[row.dimension] ??= []).push({
          key: row.dimKey, spend, leads: row.leads, impressions: row.impressions,
          cpl: row.leads > 0 ? spend / row.leads : null,
        });
      }
      for (const k of Object.keys(out)) out[k].sort((a, b) => b.spend - a.spend);
      res.json({ audiencia: out });
    } catch (e) {
      fallo(res, req.path, e);
    }
  });

  // GET /api/public/dashboards/:slug/funnel?since&until
  router.get("/dashboards/:slug/funnel", microCache(3 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const w = windowOf(req);
      if (!w) return fechasMal(res);
      const { since, until } = w;
      const platform = platformOf(req);
      // Por plataforma, para no sumar consultas que no son consultas (12/11: MA
      // PROPIEDADES mostraba 8.812 en 30 días; 8.541 eran conversiones de Google
      // que no eran consultas). Ventas solo de Meta y solo con seguimiento real
      // de compras (metricasCliente); las «conversiones» de Google no son ventas.
      const porPlat = await db
        .select({
          platform: adsInsights.platform,
          impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
          clicks: sql<number>`coalesce(sum(${adsInsights.clicks}),0)::int`,
          spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric, 0::numeric)`,
          leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
          conversionValue: sql<string>`coalesce(sum(${adsInsights.conversionValue}) filter (where ${adsInsights.platform} = 'meta')::numeric, 0::numeric)`,
          reach: sql<number>`coalesce(sum(${adsInsights.reach}),0)::int`,
        })
        .from(adsInsights)
        .where(and(
          eq(adsInsights.clientId, r.client.id),
          gte(adsInsights.date, since),
          lte(adsInsights.date, until),
          ...(platform ? [eq(adsInsights.platform, platform)] : []),
        ))
        .groupBy(adsInsights.platform);
      const { conversionesDudosas, metricasCliente } = await import("../metricas/index.js");
      const m = await metricasCliente(db, r.client.id, { desde: since, hasta: until, ...(platform ? { plataforma: platform } : {}) });
      const sum = (k: "impressions" | "clicks" | "spend" | "reach" | "conversionValue") => porPlat.reduce((s, p) => s + Number(p[k] ?? 0), 0);
      const dudosas = porPlat.filter((p) => conversionesDudosas(String(p.platform), Number(p.leads), Number(p.clicks))).map((p) => String(p.platform));
      const confiables = porPlat.filter((p) => !dudosas.includes(String(p.platform)));
      const impressions = sum("impressions");
      const clicks = sum("clicks");
      const spend = sum("spend");
      const revenue = sum("conversionValue");
      // Si todas las plataformas pedidas son dudosas, no hay número de consultas: null.
      const leads = confiables.length ? confiables.reduce((s, p) => s + Number(p.leads ?? 0), 0) : null;
      const clicksConfiables = confiables.reduce((s, p) => s + Number(p.clicks ?? 0), 0);
      const spendConfiable = confiables.reduce((s, p) => s + Number(p.spend ?? 0), 0);
      const ventas = m.ventas;
      res.json({
        client: { id: r.client.id, slug: r.client.slug, name: r.client.name, currency: r.client.currency },
        since, until,
        funnel: {
          impressions, clicks, leads, conversions: ventas ?? 0, ventas, spend, revenue,
          reach: sum("reach"),
          rates: {
            ctr: impressions > 0 ? clicks / impressions : 0,
            clickToLead: leads != null && clicksConfiables > 0 ? leads / clicksConfiables : null,
            leadToSale: ventas != null && leads ? ventas / leads : null,
            clickToSale: ventas != null && clicks > 0 ? ventas / clicks : null,
          },
          cpls: {
            cpc: clicks > 0 ? spend / clicks : 0,
            cpl: leads ? spendConfiable / leads : null,
            cpa: ventas ? spend / ventas : null,
            roas: ventas != null && spend > 0 ? revenue / spend : null,
          },
          medicion: {
            plataformasSinConsultasConfiables: dudosas,
            nota: dudosas.length
              ? "En Google la cuenta marca como conversión acciones que no son consultas: esas no se cuentan hasta corregir la medición."
              : null,
          },
        },
      });
    } catch (e) {
      fallo(res, req.path, e);
    }
  });

  // GET /api/public/dashboards/:slug/timeseries?since&until
  router.get("/dashboards/:slug/timeseries", microCache(3 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const w = windowOf(req);
      if (!w) return fechasMal(res);
      const { since, until } = w;
      const platform = platformOf(req);
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
          ...(platform ? [eq(adsInsights.platform, platform)] : []),
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
      fallo(res, req.path, e);
    }
  });

  // GET /api/public/dashboards/:slug/campaigns?since&until
  router.get("/dashboards/:slug/campaigns", microCache(3 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const w = windowOf(req);
      if (!w) return fechasMal(res);
      const { since, until } = w;
      const platform = platformOf(req);
      const campaignRows = await db
        .select({
          id: adsCampaigns.id, name: adsCampaigns.name, status: adsCampaigns.status,
          objective: adsCampaigns.objective, platform: adsCampaigns.platform,
          adAccountId: adsCampaigns.adAccountId, dailyBudget: adsCampaigns.dailyBudget,
          lifetimeBudget: adsCampaigns.lifetimeBudget,
        })
        .from(adsCampaigns)
        .where(and(eq(adsCampaigns.clientId, r.client.id), ...(platform ? [eq(adsCampaigns.platform, platform)] : [])));
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
          ...(platform ? [eq(adsInsights.platform, platform)] : []),
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
      fallo(res, req.path, e);
    }
  });

  // GET /api/public/dashboards/:slug/optimizaciones?since&until — los cambios
  // que se ejecutaron en la cuenta del cliente en el período y, si ya se midió,
  // qué pasó con su costo por consulta (pedido 15/10: que el trabajo real quede
  // reflejado en el dashboard). Ver services/trabajo.ts.
  router.get("/dashboards/:slug/optimizaciones", microCache(3 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const w = windowOf(req);
      if (!w) return fechasMal(res);
      const { since, until } = w;
      const { optimizacionesPublicas } = await import("../services/trabajo.js");
      res.json({ since, until, optimizaciones: await optimizacionesPublicas(db, r.client.id, since, until) });
    } catch (e) {
      console.warn("[optimizaciones-publicas]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "No se pudieron leer las optimizaciones." });
    }
  });

  // GET /api/public/dashboards/:slug/novedades — las buenas noticias del
  // cliente (titulares con sus números; ver services/novedades.ts). Sin el
  // mensaje armado para WhatsApp: ese es del equipo.
  router.get("/dashboards/:slug/novedades", microCache(10 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const { novedades } = await import("../services/novedades.js");
      const [c] = await novedades(db, { clientId: r.client.id });
      res.json({ novedades: (c?.novedades ?? []).map((n) => ({ area: n.area, titular: n.titular, detalle: n.detalle })) });
    } catch (e) {
      console.warn("[novedades-publicas]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "No se pudieron leer las novedades." });
    }
  });

  // GET /api/public/dashboards/:slug/creatives?since&until&platform
  // Los anuncios que mejor rindieron, CON la miniatura del creativo. La
  // miniatura vive anidada en raw.creative (el sync pide
  // "creative{thumbnail_url,image_url,...}"), no en el top level.
  // Las URLs de fbcdn están firmadas y expiran ~36h después del sync; como el
  // sync corre todas las noches se mantienen vivas. El front igual esconde la
  // imagen si falla (onError) en vez de mostrar un roto.
  router.get("/dashboards/:slug/creatives", microCache(3 * 60_000), async (req, res) => {
    try {
      const r = await resolve(req.params.slug);
      if (!r) return res.status(404).json({ error: "dashboard not found or disabled" });
      const w = windowOf(req);
      if (!w) return fechasMal(res);
      const { since, until } = w;
      const platform = platformOf(req);
      const perf = await db
        .select({
          adId: adsInsights.adId,
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
          ...(platform ? [eq(adsInsights.platform, platform)] : []),
        ))
        .groupBy(adsInsights.adId);
      const conGasto = perf.filter((p) => p.adId && Number(p.spend) > 0);
      if (conGasto.length === 0) return res.json({ since, until, creatives: [] });
      const creativeRows = await db
        .select({ id: adsCreatives.id, name: adsCreatives.name, status: adsCreatives.status, raw: adsCreatives.raw })
        .from(adsCreatives)
        .where(and(eq(adsCreatives.clientId, r.client.id), ...(platform ? [eq(adsCreatives.platform, platform)] : [])));
      const byId = new Map(creativeRows.map((c) => [c.id, c]));
      const creatives = conGasto.map((p) => {
        const c = byId.get(p.adId!);
        const raw = (c?.raw ?? {}) as Record<string, any>;
        const cr = (raw.creative ?? {}) as Record<string, any>;
        const imp = p.impressions, clk = p.clicks, sp = Number(p.spend), ld = p.leads;
        return {
          id: p.adId!,
          name: c?.name ?? "Anuncio",
          status: c?.status ?? null,
          imageUrl: (cr.image_url ?? cr.thumbnail_url ?? raw.image_url ?? raw.picture ?? null) as string | null,
          copy: (cr.body ?? null) as string | null,
          titulo: (cr.title ?? null) as string | null,
          impressions: imp, clicks: clk, spend: sp, leads: ld,
          ctr: imp > 0 ? clk / imp : 0,
          cpl: ld > 0 ? sp / ld : 0,
        };
      })
        // Ranking por leads primero (lo que le importa al cliente), después por
        // inversión — así el podio de arriba son los que trajeron consultas.
        .sort((a, b) => (b.leads - a.leads) || (b.spend - a.spend))
        .slice(0, 12);
      res.json({ since, until, creatives });
    } catch (e) {
      fallo(res, req.path, e);
    }
  });

  // GET /api/public/dashboards/:slug/organic
  router.get("/dashboards/:slug/organic", microCache(3 * 60_000), async (req, res) => {
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
      // Una sola consulta (20/11): la de ARRAY[$1…] armaba los parámetros como texto sin pasarlos, fallaba
      // siempre y recién andaba el plan B.
      const postIds = posts.map((p) => p.id);
      const metrics = postIds.length
        ? await db.select({ postId: organicPostInsights.postId, metric: organicPostInsights.metric, value: organicPostInsights.value })
            .from(organicPostInsights).where(inArray(organicPostInsights.postId, postIds))
        : [];
      const byPost = new Map<string, Record<string, number>>();
      for (const m of metrics) {
        if (!m.postId) continue;
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
      fallo(res, req.path, e);
    }
  });

  return router;
}
