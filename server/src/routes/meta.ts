import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { metaConnections } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound, unauthorized } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const GRAPH = "https://graph.facebook.com/v19.0";

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

export function metaRoutes(db: Db) {
  const router = Router();

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
      "ads_read",
      "ads_management",
      "business_management",
      "read_insights",
    ].join(",");

    const state = Buffer.from(
      JSON.stringify({
        companyId: parsed.data.companyId,
        label: parsed.data.label ?? "Meta Ads",
        ts: Date.now(),
      }),
    ).toString("base64url");

    const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", state);
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

    // 3) Persist
    const actor = getActorInfo(req);
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
          "ads_read",
          "ads_management",
          "business_management",
          "read_insights",
        ],
        status: "active",
        createdByUserId: actor.actorId ?? null,
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
  router.get("/meta/connections/:id/ad-accounts", async (req, res) => {
    const id = req.params.id as string;
    const conn = await db.query.metaConnections.findFirst({
      where: eq(metaConnections.id, id),
    });
    if (!conn) throw notFound("Connection not found");
    assertCompanyAccess(req, conn.companyId);
    const data = (await graphGet("/me/adaccounts", {
      access_token: conn.accessToken,
      fields: "id,account_id,name,currency,business",
      limit: "100",
    })) as { data?: Array<{ id: string; account_id: string; name: string; currency: string }> };
    res.json({ data: data.data ?? [] });
  });

  // ----- Insights -----
  router.get("/meta/insights", async (req, res) => {
    const parsed = insightsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw badRequest("Invalid query: " + parsed.error.issues.map((i) => i.message).join("; "));
    }
    const q = parsed.data;
    assertCompanyAccess(req, q.company);

    // Pick connection: explicit id, else first active for this company
    let conn = null;
    if (q.connection) {
      conn =
        (await db.query.metaConnections.findFirst({
          where: and(eq(metaConnections.id, q.connection), eq(metaConnections.companyId, q.company)),
        })) ?? null;
    } else {
      const rows = await db
        .select()
        .from(metaConnections)
        .where(and(eq(metaConnections.companyId, q.company), eq(metaConnections.status, "active")))
        .limit(1);
      conn = rows[0] ?? null;
    }
    if (!conn) throw notFound("No active Meta connection for this company");

    const adAccount = q.adAccount ?? conn.adAccountId;
    if (!adAccount) throw badRequest("adAccount is required (or set on connection)");
    const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;

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
