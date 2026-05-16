import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { metaConnections } from "@paperclipai/db";
import { badRequest, unauthorized } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

const GRAPH = "https://graph.facebook.com/v19.0";
const MAX_LOOP_ITERATIONS = 6;

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({ name: z.string(), arguments: z.string() }),
      }),
    )
    .optional(),
});

const chatBodySchema = z.object({
  agent: z.string().default("dashboard"),
  companyId: z.string().uuid(),
  messages: z.array(chatMessageSchema).min(1).max(50),
  client: z.string().trim().max(200).optional(),
});

type ChatMessage = z.infer<typeof chatMessageSchema>;
type ChatBody = z.infer<typeof chatBodySchema>;

const SYSTEM_PROMPTS: Record<string, string> = {
  dashboard: [
    "Sos el Dashboard Agent de LMTM, agencia de marketing latinoamericana.",
    "Tu objetivo: producir un dashboard web (HTML estático autocontenido) basado en datos REALES y deployarlo a Vercel.",
    "Flujo correcto:",
    "1) Si te falta info crítica (cliente, KPIs, fuente de datos, periodo), pedila en UN solo mensaje breve.",
    "2) Cuando tengas la conexión Meta y el ad account, llamá meta_insights para traer datos reales.",
    "3) Generá un HTML completo (<!doctype html>...</html>) dark theme, sans-serif, sin frameworks externos, con KPI cards y tablas.",
    "4) Llamá deploy_dashboard con name (slug) y html. Después respondé al usuario con el link de Vercel y un resumen breve.",
    "Reglas: Español rioplatense. No inventes números — si no tenés datos, decilo y deployá con placeholders marcados.",
  ].join("\n"),
  default:
    "Sos un asistente de LMTM. Respondé en español, breve y accionable. Si te ofrecen tools, usalas.",
};

const TOOLS_BY_AGENT: Record<string, unknown[]> = {
  dashboard: [
    {
      type: "function",
      function: {
        name: "list_meta_connections",
        description: "Lista las conexiones Meta (Facebook Ads) disponibles para esta company.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "meta_insights",
        description:
          "Obtiene métricas de Meta Ads (spend, impressions, clicks, ctr, cpc, reach, actions) para un ad account.",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "ID de la conexión Meta (uuid)." },
            adAccount: {
              type: "string",
              description: "Ad account ID con o sin prefijo act_. Si vacío, usa el del connection.",
            },
            datePreset: {
              type: "string",
              enum: [
                "today",
                "yesterday",
                "this_week_mon_today",
                "this_month",
                "last_7d",
                "last_14d",
                "last_28d",
                "last_30d",
                "last_90d",
              ],
              description: "Rango de fechas. Default last_30d.",
            },
          },
          required: ["connectionId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deploy_dashboard",
        description:
          "Deploya un HTML estático a Vercel y devuelve la URL pública. Llamá esto al final cuando tengas el HTML listo.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Slug del dashboard (a-z, 0-9, guiones)." },
            html: { type: "string", description: "Documento HTML completo." },
            target: { type: "string", enum: ["preview", "production"], description: "Default production." },
          },
          required: ["name", "html"],
          additionalProperties: false,
        },
      },
    },
  ],
};

interface MiniMaxResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  base_resp?: { status_code?: number; status_msg?: string };
}

async function callMiniMax(messages: ChatMessage[], tools: unknown[]) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not configured");
  const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7-highspeed";

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 4096,
    temperature: 0.6,
  };
  if (tools.length > 0) body.tools = tools;

  const r = await fetch(`${baseUrl}/text/chatcompletion_v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`MiniMax HTTP ${r.status}: ${text.slice(0, 400)}`);
  }
  const json = (await r.json()) as MiniMaxResponse;
  if (json.base_resp && json.base_resp.status_code && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax ${json.base_resp.status_code}: ${json.base_resp.status_msg}`);
  }
  return json;
}

async function execListMetaConnections(db: Db, companyId: string) {
  const rows = await db
    .select({
      id: metaConnections.id,
      label: metaConnections.label,
      adAccountId: metaConnections.adAccountId,
      pageId: metaConnections.pageId,
      businessId: metaConnections.businessId,
      status: metaConnections.status,
    })
    .from(metaConnections)
    .where(eq(metaConnections.companyId, companyId));
  return { connections: rows };
}

async function execMetaInsights(
  db: Db,
  companyId: string,
  args: { connectionId: string; adAccount?: string; datePreset?: string },
) {
  const conn = await db.query.metaConnections.findFirst({
    where: and(eq(metaConnections.id, args.connectionId), eq(metaConnections.companyId, companyId)),
  });
  if (!conn) return { error: "Connection not found or not in this company" };
  const adAccount = args.adAccount ?? conn.adAccountId;
  if (!adAccount) return { error: "adAccount required (or set on connection)" };
  const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;

  const url = new URL(`${GRAPH}/${account}/insights`);
  url.searchParams.set("access_token", conn.accessToken);
  url.searchParams.set(
    "fields",
    "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,date_start,date_stop",
  );
  url.searchParams.set("level", "account");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("date_preset", args.datePreset ?? "last_30d");

  const r = await fetch(url.toString());
  const json = (await r.json().catch(() => ({}))) as { data?: unknown[]; error?: { message?: string } };
  if (!r.ok) return { error: json.error?.message ?? `Graph HTTP ${r.status}` };
  return { adAccount: account, rows: json.data ?? [] };
}

async function execDeployDashboard(args: { name: string; html: string; target?: string }) {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  if (!token) return { error: "VERCEL_API_TOKEN not configured" };
  const teamId = process.env.VERCEL_TEAM_ID?.trim();

  const slug =
    args.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "lmtm-dashboard";
  const projectName = `lmtm-${slug}`;
  const target = args.target === "preview" ? "preview" : "production";

  const url = new URL("https://api.vercel.com/v13/deployments");
  url.searchParams.set("forceNew", "1");
  if (teamId) url.searchParams.set("teamId", teamId);

  const body = {
    name: projectName,
    target,
    projectSettings: { framework: null },
    files: [{ file: "index.html", data: args.html, encoding: "utf-8" }],
  };
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = (await r.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!r.ok) return { error: raw.error?.message ?? `Vercel HTTP ${r.status}` };
  if (!raw.url || !raw.id) return { error: "Vercel returned no url/id" };

  // best-effort disable SSO protection
  try {
    const patchUrl = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`);
    if (teamId) patchUrl.searchParams.set("teamId", teamId);
    await fetch(patchUrl.toString(), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ssoProtection: null, passwordProtection: null }),
    });
  } catch {
    // noop
  }

  return { id: raw.id, projectName, url: `https://${raw.url}`, target };
}

async function executeTool(
  db: Db,
  companyId: string,
  name: string,
  argsJson: string,
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return { error: `Invalid JSON args: ${argsJson.slice(0, 200)}` };
  }
  if (name === "list_meta_connections") return execListMetaConnections(db, companyId);
  if (name === "meta_insights")
    return execMetaInsights(db, companyId, args as { connectionId: string; adAccount?: string; datePreset?: string });
  if (name === "deploy_dashboard")
    return execDeployDashboard(args as { name: string; html: string; target?: string });
  return { error: `Unknown tool: ${name}` };
}

export function agentChatRoutes(db: Db) {
  const router = Router();

  router.post("/agents/chat", async (req, res) => {
    if (req.actor.type === "none") {
      throw unauthorized("Authentication required");
    }
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid body: " + parsed.error.issues.map((i) => i.message).join("; "));
    }
    const body: ChatBody = parsed.data;
    assertCompanyAccess(req, body.companyId);

    const agentKey = body.agent.toLowerCase();
    const tools = TOOLS_BY_AGENT[agentKey] ?? [];
    const systemPrompt = SYSTEM_PROMPTS[agentKey] ?? SYSTEM_PROMPTS.default;
    const clientContext = body.client?.trim()
      ? `\n\nContexto del cliente: ${body.client.trim()}`
      : "";

    const conversation: ChatMessage[] = [
      { role: "system", content: systemPrompt + clientContext },
      ...body.messages,
    ];

    const toolTrace: Array<{ name: string; args: unknown; result: unknown }> = [];

    for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
      let mm: MiniMaxResponse;
      try {
        mm = await callMiniMax(conversation, tools);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(502).json({ error: "MiniMax call failed", detail: msg, toolTrace });
      }

      const msg = mm.choices?.[0]?.message;
      if (!msg) {
        return res.status(502).json({ error: "MiniMax returned no message", toolTrace });
      }

      // If the model wants to call tools, execute and loop.
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        conversation.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        });
        for (const call of msg.tool_calls) {
          const result = await executeTool(db, body.companyId, call.function.name, call.function.arguments);
          toolTrace.push({
            name: call.function.name,
            args: call.function.arguments,
            result:
              call.function.name === "deploy_dashboard" && (result as { url?: string }).url
                ? { url: (result as { url: string }).url, id: (result as { id?: string }).id }
                : result,
          });
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 8000),
          });
        }
        continue;
      }

      // Final assistant message — return.
      return res.json({
        output: msg.content ?? "",
        agent: agentKey,
        toolTrace,
      });
    }

    return res.status(502).json({
      error: "Agent loop exceeded max iterations",
      detail: `Max ${MAX_LOOP_ITERATIONS} iterations reached`,
      toolTrace,
    });
  });

  return router;
}
