import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { metaConnections, metaAdAccountMappings } from "@paperclipai/db";
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
    "Tu objetivo: producir un dashboard HTML completo, autocontenido, dark theme — un panel de control real para el cliente.",
    "",
    "FLUJO:",
    "1) Llamá list_meta_mappings. Si no hay mappings, pedile al usuario que vaya a /integrations/meta.",
    "2) Si falta info crítica (nombre cliente, periodo), pedila en UN mensaje breve.",
    "3) Llamá meta_insights con el período solicitado (default last_30d).",
    "4) Llamá meta_insights de nuevo con datePreset='this_month' para obtener los gastos del mes en curso.",
    "5) Generá el HTML con TODAS las secciones listadas abajo.",
    "6) Llamá deploy_dashboard y respondé con el link + resumen breve.",
    "",
    "SECCIONES OBLIGATORIAS DEL DASHBOARD (cards separadas):",
    "— GASTOS MENSUALES: card destacada (grande, arriba) con spend total del mes en curso (this_month), comparado con el período anterior si tenés datos. Barra de progreso visual del mes (días transcurridos vs. días totales). Proyección de gasto fin de mes basada en el ritmo actual. Alerta roja si el ritmo proyecta gasto 20% mayor al promedio.",
    "— RESUMEN EJECUTIVO: spend total, impresiones, alcance, clics, CTR, CPC, CPM del período solicitado",
    "— ROAS & PERFORMANCE: ROAS calculado si hay datos de conversión, CPA, frecuencia",
    "— ALERTA DE PRESUPUESTO: aviso visible si spend diario es inusualmente alto o bajo, o si hay días sin gasto",
    "— TENDENCIA DIARIA: tabla con spend/día. Resaltar días con spend=0 como 'Sin actividad'.",
    "— MEJORES CAMPAÑAS/ANUNCIOS: top 3 por CTR o conversiones (si hay datos de actions)",
    "— ALERTAS OPERATIVAS: tarjetas rojas/amarillas para anomalías (CTR < 1%, frecuencia > 3, días consecutivos sin datos)",
    "— DÍAS SIN CONTENIDO: listado de días del mes donde spend=0 — marcar como días sin publicación/actividad",
    "— IDEAS DE CONTENIDO: 3 sugerencias creativas basadas en el nicho/cliente y los datos de performance",
    "— PRÓXIMOS PASOS: 3 acciones concretas recomendadas por el agente",
    "",
    "DISEÑO:",
    "— Dark theme: fondo #0a0a0a, cards #111, bordes #222",
    "— Tipografía: system-ui, sans-serif",
    "— Cards con color según estado: verde (ok), amarillo (atención), rojo (crítico)",
    "— Sin frameworks externos. Todo inline o en <style>. Max 1200 líneas.",
    "— Responsive: grid de 2-3 columnas en desktop, 1 en mobile",
    "— Header con logo-placeholder LMTM, nombre del cliente y período analizado",
    "",
    "REGLAS: Español rioplatense. Nunca inventés números — si no tenés datos, marcá el card con '[Sin datos — conectar fuente]' en gris.",
  ].join("\n"),
  n8n: [
    "Sos el Agente n8n de LMTM. Podés crear, listar y ejecutar workflows en n8n.",
    "Cuando te pidan un flujo nuevo:",
    "1) Usá n8n_search_nodes para encontrar los nodos necesarios.",
    "2) Usá n8n_get_sdk_reference para entender el formato de código.",
    "3) Creá el workflow con n8n_create_workflow.",
    "4) Confirmá con el usuario qué hace y si lo activamos.",
    "Cuando listen o busquen workflows: n8n_search_workflows + n8n_get_workflow_details.",
    "Para ejecutar: n8n_execute_workflow.",
    "Español rioplatense. Breve y accionable. Si algo falla, mostrá el error y proponé fix.",
  ].join("\n"),
  default:
    "Sos un asistente de LMTM. Respondé en español, breve y accionable. Si te ofrecen tools, usalas.",
};

const TOOLS_BY_AGENT: Record<string, unknown[]> = {
  dashboard: [
    {
      type: "function",
      function: {
        name: "list_meta_mappings",
        description:
          "Lista los ad accounts de Meta Ads mapeados a esta company (cliente). Devuelve adAccountId y label. Si no hay mappings, devolver lista vacía y pedirle al usuario que los configure en /integrations/meta.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "meta_insights",
        description:
          "Obtiene métricas de Meta Ads (spend, impressions, clicks, ctr, cpc, reach, actions) para un ad account mapeado a esta company.",
        parameters: {
          type: "object",
          properties: {
            adAccount: {
              type: "string",
              description:
                "Ad account ID (act_xxx) — usar uno de los que devuelve list_meta_mappings. Si la company solo tiene 1 mapping, podés omitir y se usa ese.",
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
          required: [],
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
  n8n: [
    {
      type: "function",
      function: {
        name: "n8n_search_workflows",
        description: "Lista/busca workflows en n8n. Devuelve nombre, id, estado activo.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Filtrar por nombre o descripción" },
            limit: { type: "integer", description: "Máximo de resultados (default 20)" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "n8n_get_workflow_details",
        description: "Obtiene detalles de un workflow: nodos, trigger, configuración.",
        parameters: {
          type: "object",
          properties: {
            workflowId: { type: "string", description: "ID del workflow" },
          },
          required: ["workflowId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "n8n_execute_workflow",
        description: "Ejecuta un workflow de n8n por su ID.",
        parameters: {
          type: "object",
          properties: {
            workflowId: { type: "string", description: "ID del workflow a ejecutar" },
            executionMode: { type: "string", enum: ["manual", "production"], description: "Default: production" },
          },
          required: ["workflowId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "n8n_create_workflow",
        description: "Crea un workflow nuevo en n8n desde código SDK. Consultá n8n_get_sdk_reference primero para entender el formato.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Código TypeScript del n8n Workflow SDK" },
          },
          required: ["code"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "n8n_get_sdk_reference",
        description: "Obtiene la documentación del n8n Workflow SDK para saber cómo escribir código de workflows.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "n8n_search_nodes",
        description: "Busca nodos de n8n por servicio (ej: 'gmail', 'slack', 'webhook', 'http'). Usar al construir workflows.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre del servicio o función a buscar" },
          },
          required: ["query"],
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

async function execListMetaMappings(db: Db, companyId: string) {
  const rows = await db
    .select({
      adAccountId: metaAdAccountMappings.adAccountId,
      label: metaAdAccountMappings.label,
      connectionId: metaAdAccountMappings.connectionId,
      connectionLabel: metaConnections.label,
      connectionStatus: metaConnections.status,
    })
    .from(metaAdAccountMappings)
    .leftJoin(metaConnections, eq(metaConnections.id, metaAdAccountMappings.connectionId))
    .where(eq(metaAdAccountMappings.companyId, companyId));
  return { mappings: rows };
}

async function execMetaInsights(
  db: Db,
  companyId: string,
  args: { adAccount?: string; datePreset?: string },
) {
  // Resolve via mapping. If args.adAccount provided, match it; else use the single mapping.
  const filters = [eq(metaAdAccountMappings.companyId, companyId)];
  if (args.adAccount) {
    const wanted = args.adAccount.startsWith("act_") ? args.adAccount : `act_${args.adAccount}`;
    filters.push(eq(metaAdAccountMappings.adAccountId, wanted));
  }
  const mappings = await db
    .select({
      adAccountId: metaAdAccountMappings.adAccountId,
      connectionId: metaAdAccountMappings.connectionId,
    })
    .from(metaAdAccountMappings)
    .where(and(...filters));
  if (mappings.length === 0) {
    return { error: "No mapping found. Configure one in /integrations/meta first." };
  }
  if (mappings.length > 1 && !args.adAccount) {
    return {
      error: `Company has ${mappings.length} mappings. Call list_meta_mappings and pass adAccount explicitly.`,
    };
  }
  const m = mappings[0];
  const conn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.id, m.connectionId),
  });
  if (!conn) return { error: "Mapped connection not found" };
  const account = m.adAccountId.startsWith("act_") ? m.adAccountId : `act_${m.adAccountId}`;

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

// n8n tool name mapping: our name (without n8n_ prefix) → MCP tool name
const N8N_TOOL_MAP: Record<string, string> = {
  search_workflows: "search_workflows",
  get_workflow_details: "get_workflow_details",
  execute_workflow: "execute_workflow",
  create_workflow: "create_workflow_from_code",
  get_sdk_reference: "get_sdk_reference",
  search_nodes: "search_nodes",
};

async function callN8nMcp(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const url = process.env.N8N_MCP_URL;
  const token = process.env.N8N_MCP_TOKEN;
  if (!url || !token) return { error: "N8N_MCP_URL / N8N_MCP_TOKEN not configured" };
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: toolName, arguments: args } }),
    });
  } catch (e) {
    return { error: `n8n MCP fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  const text = await r.text();
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const data = JSON.parse(line.slice(5).trim());
      if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) };
      if (data.result) {
        const content = data.result?.content;
        if (Array.isArray(content)) {
          const texts = (content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "");
          if (texts.length === 1) { try { return JSON.parse(texts[0]); } catch { return { result: texts[0] }; } }
          return { result: texts.join("\n") };
        }
        return data.result;
      }
    } catch { /* continue */ }
  }
  return { error: "No result from n8n MCP", raw: text.slice(0, 300) };
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
  if (name === "list_meta_mappings") return execListMetaMappings(db, companyId);
  if (name === "meta_insights")
    return execMetaInsights(db, companyId, args as { adAccount?: string; datePreset?: string });
  if (name === "deploy_dashboard")
    return execDeployDashboard(args as { name: string; html: string; target?: string });
  if (name.startsWith("n8n_")) {
    const key = name.slice(4);
    const mcpTool = N8N_TOOL_MAP[key] ?? key;
    return callN8nMcp(mcpTool, args);
  }
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
      // M2.x reasoning models emit <think>...</think> traces inline. Strip them
      // from the user-facing output (we keep them in toolTrace via content for
      // debugging if needed).
      const rawOutput = msg.content ?? "";
      const cleaned = rawOutput.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
      return res.json({
        output: cleaned,
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
