import { Router } from "express";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { metaConnections, metaAdAccountMappings } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound, unauthorized, forbidden } from "../errors.js";
import { assertAuthenticated, assertCompanyAccess, getActorInfo } from "./authz.js";

const GRAPH = "https://graph.facebook.com/v21.0";

const createManualSchema = z.object({
  label: z.string().trim().min(1).max(80),
  accessToken: z.string().trim().min(20),
  tokenType: z.enum(["user", "system", "page", "app"]).default("system"),
  businessId: z.string().trim().optional(),
  pageId: z.string().trim().optional(),
  adAccountId: z.string().trim().optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateSchema = createManualSchema.partial();

const createMappingSchema = z.object({
  connectionId: z.string().uuid(),
  adAccountId: z.string().trim().min(1),
  label: z.string().trim().max(120).optional(),
});

const insightsQuerySchema = z.object({
  company: z.string().uuid(),
  adAccount: z.string().trim().min(1).optional(),
  connection: z.string().uuid().optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fields: z.string().optional(),
  datePreset: z
    .enum([
      "today",
      "yesterday",
      "this_week_mon_today",
      "this_month",
      "last_7d",
      "last_14d",
      "last_28d",
      "last_30d",
      "last_90d",
    ])
    .optional(),
});

const oauthStartSchema = z.object({
  companyId: z.string().uuid(),
  label: z.string().trim().min(1).max(80).optional(),
});

interface InsightsRow {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
  actions?: Array<{ action_type: string; value: string }>;
  [key: string]: unknown;
}

async function graphGet(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const r = await fetch(url.toString(), { method: "GET" });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const err = (json as { error?: { message?: string; type?: string } }).error;
    throw new Error(
      `Meta Graph ${path} failed (${r.status}): ${err?.message ?? JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

async function exchangeForLongLivedUserToken(shortToken: string) {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("META_APP_ID/META_APP_SECRET not configured");
  const data = (await graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  })) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Meta did not return access_token");
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
  };
}

function accessibleCompanyIds(req: import("express").Request): string[] | "all" {
  if (req.actor.type === "board") {
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return "all";
    return req.actor.companyIds ?? [];
  }
  if (req.actor.type === "agent" && req.actor.companyId) return [req.actor.companyId];
  return [];
}

export function metaRoutes(db: Db) {
  const router = Router();

  // ----- List ALL connections the caller can access across companies -----
  router.get("/meta/connections", async (req, res) => {
    assertAuthenticated(req);
    const ids = accessibleCompanyIds(req);
    if (Array.isArray(ids) && ids.length === 0) {
      res.json([]);
      return;
    }
    const where = ids === "all" ? undefined : inArray(metaConnections.companyId, ids);
    const rows = await (where
      ? db
          .select({
            id: metaConnections.id,
            companyId: metaConnections.companyId,
            label: metaConnections.label,
            businessId: metaConnections.businessId,
            pageId: metaConnections.pageId,
            adAccountId: metaConnections.adAccountId,
            tokenType: metaConnections.tokenType,
            scopes: metaConnections.scopes,
            status: metaConnections.status,
            expiresAt: metaConnections.expiresAt,
            lastCheckAt: metaConnections.lastCheckAt,
            lastError: metaConnections.lastError,
            createdAt: metaConnections.createdAt,
          })
          .from(metaConnections)
          .where(where)
      : db
          .select({
            id: metaConnections.id,
            companyId: metaConnections.companyId,
            label: metaConnections.label,
            businessId: metaConnections.businessId,
            pageId: metaConnections.pageId,
            adAccountId: metaConnections.adAccountId,
            tokenType: metaConnections.tokenType,
            scopes: metaConnections.scopes,
            status: metaConnections.status,
            expiresAt: metaConnections.expiresAt,
            lastCheckAt: metaConnections.lastCheckAt,
            lastError: metaConnections.lastError,
            createdAt: metaConnections.createdAt,
          })
          .from(metaConnections));
    res.json(rows);
  });

  // ----- OAuth start (redirect) -----
  router.get("/meta/oauth/start", async (req, res) => {
    const parsed = oauthStartSchema.safeParse({
      companyId: req.query.companyId,
      label: req.query.label,
    });
    if (!parsed.success) {
      throw badRequest("companyId is required (uuid)");
    }
    assertCompanyAccess(req, parsed.data.companyId);

    const appId = process.env.META_APP_ID?.trim();
    const redirectUri = process.env.META_REDIRECT_URI?.trim();
    if (!appId || !redirectUri) {
      throw badRequest("META_APP_ID / META_REDIRECT_URI not configured");
    }
    const scope = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "leads_retrieval",
      "ads_read",
      "ads_management",
    ].join(",");

    const state = Buffer.from(
      JSON.stringify({
        companyId: parsed.data.companyId,
        label: parsed.data.label ?? "Meta Ads",
        ts: Date.now(),
      }),
    ).toString("base64url");

    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", state);
    // Force Facebook to re-show the permission + page-selection screen so the
    // user can grant access to client Pages they previously skipped.
    url.searchParams.set("auth_type", "rerequest");
    res.redirect(url.toString());
  });

  // ----- OAuth callback -----
  router.get("/meta/oauth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateRaw = typeof req.query.state === "string" ? req.query.state : "";
    if (!code) throw badRequest("Missing code");

    let state: { companyId?: string; label?: string } = {};
    try {
      state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    } catch {
      throw badRequest("Invalid state");
    }
    if (!state.companyId) throw badRequest("Invalid state (no companyId)");

    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    const redirectUri = process.env.META_REDIRECT_URI?.trim();
    if (!appId || !appSecret || !redirectUri) {
      throw badRequest("META env vars not configured");
    }

    // 1) Exchange code -> short-lived token
    const codeRes = (await graphGet("/oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    })) as { access_token?: string };
    if (!codeRes.access_token) throw badRequest("Meta did not return access_token");

    // 2) Short-lived -> long-lived (~60d)
    const ll = await exchangeForLongLivedUserToken(codeRes.access_token);

    // 3) Persist — callback arrives from Facebook with no JWT, skip actor resolution
    const inserted = await db
      .insert(metaConnections)
      .values({
        companyId: state.companyId,
        label: state.label ?? "Meta Ads",
        tokenType: "user",
        accessToken: ll.accessToken,
        expiresAt: ll.expiresAt ?? null,
        scopes: [
          "public_profile",
          "email",
          "pages_show_list",
          "pages_read_engagement",
          "leads_retrieval",
          "ads_read",
          "ads_management",
        ],
        status: "active",
        createdByUserId: null,
      })
      .returning({ id: metaConnections.id });

    const panel = process.env.LMTM_PANEL_URL?.trim() ?? "";
    const target = panel
      ? `${panel.replace(/\/$/, "")}/integrations/meta?connection=${inserted[0]?.id}`
      : `/integrations/meta?connection=${inserted[0]?.id}`;
    res.redirect(target);
  });

  // ----- List connections for a company -----
  router.get("/companies/:companyId/meta/connections", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select({
        id: metaConnections.id,
        label: metaConnections.label,
        businessId: metaConnections.businessId,
        pageId: metaConnections.pageId,
        adAccountId: metaConnections.adAccountId,
        tokenType: metaConnections.tokenType,
        scopes: metaConnections.scopes,
        status: metaConnections.status,
        expiresAt: metaConnections.expiresAt,
        lastCheckAt: metaConnections.lastCheckAt,
        lastError: metaConnections.lastError,
        createdAt: metaConnections.createdAt,
      })
      .from(metaConnections)
      .where(eq(metaConnections.companyId, companyId));
    res.json(rows);
  });

  // ----- Manual System User token paste -----
  router.post(
    "/companies/:companyId/meta/connections",
    validate(createManualSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const body = req.body as z.infer<typeof createManualSchema>;
      const actor = getActorInfo(req);
      const rows = await db
        .insert(metaConnections)
        .values({
          companyId,
          label: body.label,
          tokenType: body.tokenType,
          accessToken: body.accessToken,
          businessId: body.businessId ?? null,
          pageId: body.pageId ?? null,
          adAccountId: body.adAccountId ?? null,
          scopes: body.scopes ?? [],
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          status: "active",
          createdByUserId: actor.actorId ?? null,
        })
        .returning({ id: metaConnections.id });
      res.status(201).json({ id: rows[0]?.id });
    },
  );

  // ----- Patch / Delete -----
  router.patch("/meta/connections/:id", validate(updateSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await db.query.metaConnections.findFirst({
      where: eq(metaConnections.id, id),
    });
    if (!existing) throw notFound("Connection not found");
    assertCompanyAccess(req, existing.companyId);
    const body = req.body as Partial<z.infer<typeof createManualSchema>>;
    await db
      .update(metaConnections)
      .set({
        label: body.label ?? existing.label,
        accessToken: body.accessToken ?? existing.accessToken,
        tokenType: body.tokenType ?? existing.tokenType,
        businessId: body.businessId ?? existing.businessId,
        pageId: body.pageId ?? existing.pageId,
        adAccountId: body.adAccountId ?? existing.adAccountId,
        scopes: body.scopes ?? existing.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : existing.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(metaConnections.id, id));
    res.status(204).end();
  });

  router.delete("/meta/connections/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await db.query.metaConnections.findFirst({
      where: eq(metaConnections.id, id),
    });
    if (!existing) throw notFound("Connection not found");
    assertCompanyAccess(req, existing.companyId);
    await db.delete(metaConnections).where(eq(metaConnections.id, id));
    res.status(204).end();
  });

  // ----- Probe: list ad accounts the token can see -----
  // Fetches from /me/adaccounts (owned) + Business Manager owned/client accounts
  router.get("/meta/connections/:id/ad-accounts", async (req, res) => {
    const id = req.params.id as string;
    const rows = await db.select().from(metaConnections).where(eq(metaConnections.id, id)).limit(1);
    const conn = rows[0] ?? null;
    if (!conn) throw notFound("Connection not found");
    assertCompanyAccess(req, conn.companyId);
    try {
      type AdAcc = { id: string; account_id: string; name: string; currency: string };
      const accountMap = new Map<string, AdAcc>();

      // 1) Directly owned ad accounts
      try {
        const direct = (await graphGet("/me/adaccounts", {
          access_token: conn.accessToken,
          fields: "id,account_id,name,currency",
          limit: "200",
        })) as { data?: AdAcc[] };
        for (const acc of direct.data ?? []) accountMap.set(acc.id, acc);
      } catch { /* continue to business accounts */ }

      // 2) Business Manager — owned + client ad accounts
      try {
        const bizRes = (await graphGet("/me/businesses", {
          access_token: conn.accessToken,
          fields: "id,name",
          limit: "50",
        })) as { data?: Array<{ id: string; name: string }> };
        for (const biz of bizRes.data ?? []) {
          for (const endpoint of ["owned_ad_accounts", "client_ad_accounts"]) {
            try {
              const bizAccs = (await graphGet(`/${biz.id}/${endpoint}`, {
                access_token: conn.accessToken,
                fields: "id,account_id,name,currency",
                limit: "200",
              })) as { data?: AdAcc[] };
              for (const acc of bizAccs.data ?? []) accountMap.set(acc.id, acc);
            } catch { /* this business may not have this endpoint */ }
          }
        }
      } catch { /* user may not have any businesses */ }

      res.json({ data: Array.from(accountMap.values()) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(502).json({ error: msg, data: [] });
    }
  });

  // ----- Mappings: company → (connection, adAccount) -----
  router.get("/companies/:companyId/meta/mappings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select({
        id: metaAdAccountMappings.id,
        companyId: metaAdAccountMappings.companyId,
        connectionId: metaAdAccountMappings.connectionId,
        adAccountId: metaAdAccountMappings.adAccountId,
        label: metaAdAccountMappings.label,
        createdAt: metaAdAccountMappings.createdAt,
        connectionLabel: metaConnections.label,
        connectionStatus: metaConnections.status,
      })
      .from(metaAdAccountMappings)
      .leftJoin(metaConnections, eq(metaConnections.id, metaAdAccountMappings.connectionId))
      .where(eq(metaAdAccountMappings.companyId, companyId));
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/meta/mappings",
    validate(createMappingSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const body = req.body as z.infer<typeof createMappingSchema>;
      // Validate connection exists AND caller can access the connection's company.
      const conn = await db.query.metaConnections.findFirst({
        where: eq(metaConnections.id, body.connectionId),
      });
      if (!conn) throw notFound("Connection not found");
      const ids = accessibleCompanyIds(req);
      if (ids !== "all" && !ids.includes(conn.companyId)) {
        throw forbidden("You cannot use a connection from a company you don't have access to");
      }
      const adAccount = body.adAccountId.startsWith("act_")
        ? body.adAccountId
        : `act_${body.adAccountId}`;
      const rows = await db
        .insert(metaAdAccountMappings)
        .values({
          companyId,
          connectionId: body.connectionId,
          adAccountId: adAccount,
          label: body.label ?? null,
        })
        .returning({ id: metaAdAccountMappings.id });
      res.status(201).json({ id: rows[0]?.id, adAccountId: adAccount });
    },
  );

  router.get("/meta/mappings/:id", async (req, res) => {
    const id = req.params.id as string;
    const rows = await db
      .select({
        id: metaAdAccountMappings.id,
        companyId: metaAdAccountMappings.companyId,
        connectionId: metaAdAccountMappings.connectionId,
        adAccountId: metaAdAccountMappings.adAccountId,
        pageId: metaAdAccountMappings.pageId,
        label: metaAdAccountMappings.label,
        createdAt: metaAdAccountMappings.createdAt,
        connectionLabel: metaConnections.label,
        connectionStatus: metaConnections.status,
      })
      .from(metaAdAccountMappings)
      .leftJoin(metaConnections, eq(metaConnections.id, metaAdAccountMappings.connectionId))
      .where(eq(metaAdAccountMappings.id, id))
      .limit(1);
    if (!rows[0]) throw notFound("Mapping not found");
    assertCompanyAccess(req, rows[0].companyId);
    res.json(rows[0]);
  });

  // PATCH /api/meta/mappings/:id — update pageId (and/or label)
  router.patch("/meta/mappings/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await db.query.metaAdAccountMappings.findFirst({ where: eq(metaAdAccountMappings.id, id) });
    if (!existing) throw notFound("Mapping not found");
    assertCompanyAccess(req, existing.companyId);
    const { pageId, label } = req.body as { pageId?: string | null; label?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (pageId !== undefined) updates.pageId = pageId || null;
    if (label !== undefined) updates.label = label;
    await db.update(metaAdAccountMappings).set(updates).where(eq(metaAdAccountMappings.id, id));
    res.json({ ok: true });
  });

  // GET /api/meta/connections/:id/pages — list pages accessible via this connection's token
  router.get("/meta/connections/:id/pages", async (req, res) => {
    assertAuthenticated(req);
    const connId = req.params.id as string;
    const conn = await db.query.metaConnections.findFirst({ where: eq(metaConnections.id, connId) });
    if (!conn) throw notFound("Connection not found");
    const url = new URL(`https://graph.facebook.com/v21.0/me/accounts`);
    url.searchParams.set("access_token", conn.accessToken);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("limit", "200");
    const r = await fetch(url.toString());
    const json = await r.json() as { data?: Array<{ id: string; name: string }>; error?: { message: string } };
    if (!r.ok) throw new Error(json.error?.message ?? "Graph error");
    res.json(json.data ?? []);
  });

  router.delete("/meta/mappings/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await db.query.metaAdAccountMappings.findFirst({
      where: eq(metaAdAccountMappings.id, id),
    });
    if (!existing) throw notFound("Mapping not found");
    assertCompanyAccess(req, existing.companyId);
    await db.delete(metaAdAccountMappings).where(eq(metaAdAccountMappings.id, id));
    res.status(204).end();
  });

  // ----- Insights -----
  router.get("/meta/insights", async (req, res) => {
    const parsed = insightsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid query: " + parsed.error.issues.map((i) => i.message).join("; "));
    }
    const q = parsed.data;
    assertCompanyAccess(req, q.company);

    // Resolve (connection, adAccount). Three paths:
    //   1) explicit `connection` param → use that, with optional adAccount override
    //   2) no `connection` → look up a mapping for this company. If `adAccount`
    //      provided, find the mapping matching it. Else, use the single active
    //      mapping (error if 0 or >1 without filter).
    //   3) legacy fallback: company has a connection with adAccountId set on it.
    let conn: typeof metaConnections.$inferSelect | null = null;
    let resolvedAdAccount: string | null = null;

    if (q.connection) {
      conn =
        (await db.query.metaConnections.findFirst({
          where: eq(metaConnections.id, q.connection),
        })) ?? null;
      if (!conn) throw notFound("Connection not found");
      const ids = accessibleCompanyIds(req);
      if (ids !== "all" && !ids.includes(conn.companyId)) {
        throw forbidden("You cannot use that connection");
      }
      resolvedAdAccount = q.adAccount ?? conn.adAccountId ?? null;
    } else {
      // Try mappings first
      const mappingFilters = [eq(metaAdAccountMappings.companyId, q.company)];
      if (q.adAccount) {
        const wanted = q.adAccount.startsWith("act_") ? q.adAccount : `act_${q.adAccount}`;
        mappingFilters.push(eq(metaAdAccountMappings.adAccountId, wanted));
      }
      const mappings = await db
        .select({
          adAccountId: metaAdAccountMappings.adAccountId,
          connectionId: metaAdAccountMappings.connectionId,
        })
        .from(metaAdAccountMappings)
        .where(and(...mappingFilters));
      if (mappings.length > 1 && !q.adAccount) {
        throw badRequest(
          `Company has ${mappings.length} mappings. Pass adAccount=act_xxx to disambiguate.`,
        );
      }
      if (mappings.length === 1) {
        const m = mappings[0];
        conn =
          (await db.query.metaConnections.findFirst({
            where: eq(metaConnections.id, m.connectionId),
          })) ?? null;
        resolvedAdAccount = m.adAccountId;
      } else {
        // Legacy: connection with adAccountId on the company itself
        const rows = await db
          .select()
          .from(metaConnections)
          .where(and(eq(metaConnections.companyId, q.company), eq(metaConnections.status, "active")))
          .limit(1);
        conn = rows[0] ?? null;
        resolvedAdAccount = q.adAccount ?? conn?.adAccountId ?? null;
      }
    }

    if (!conn) throw notFound("No Meta connection / mapping found for this company");
    if (!resolvedAdAccount) throw badRequest("adAccount is required (no mapping, no override)");
    const account = resolvedAdAccount.startsWith("act_")
      ? resolvedAdAccount
      : `act_${resolvedAdAccount}`;

    const fields =
      q.fields ??
      "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type,date_start,date_stop";

    const params: Record<string, string> = {
      access_token: conn.accessToken,
      fields,
      level: "account",
      time_increment: "1",
    };
    if (q.datePreset) {
      params.date_preset = q.datePreset;
    } else if (q.since && q.until) {
      params.time_range = JSON.stringify({ since: q.since, until: q.until });
    } else {
      params.date_preset = "last_30d";
    }

    try {
      const data = (await graphGet(`/${account}/insights`, params)) as {
        data?: InsightsRow[];
      };
      await db
        .update(metaConnections)
        .set({ lastCheckAt: new Date(), lastError: null, status: "active" })
        .where(eq(metaConnections.id, conn.id));
      res.json({
        adAccount: account,
        rows: data.data ?? [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(metaConnections)
        .set({ lastCheckAt: new Date(), lastError: message.slice(0, 500), status: "error" })
        .where(eq(metaConnections.id, conn.id));
      throw badRequest(message);
    }
  });

  return router;
}
