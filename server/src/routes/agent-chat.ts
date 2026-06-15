import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { clients, metaConnections, metaAdAccountMappings, agentChatSessions } from "@paperclipai/db";
import { badRequest, unauthorized } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { getEnfoqueTecnicoContext } from "../services/clickup-sync.js";
import { getBrainContext } from "../services/customer-brain.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_LOOP_ITERATIONS = 10;
const SESSION_HISTORY_LIMIT = 40; // max messages kept in memory

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
  clientSlug: z.string().trim().max(100).optional(), // auto-loads Enfoque Técnico context
  sessionId: z.string().uuid().optional(), // for persistent memory
});

type ChatMessage = z.infer<typeof chatMessageSchema>;
type ChatBody = z.infer<typeof chatBodySchema>;

// ── System prompts ────────────────────────────────────────────────────────────

const META_TOOLS_NOTE = `
Tenés acceso completo a Meta Ads para todos los clientes:
- list_meta_mappings: lista cuentas del cliente actual
- list_all_meta_accounts: lista TODAS las cuentas de todos los clientes (para comparar)
- meta_insights: métricas de una cuenta específica
- compare_meta_accounts: compara múltiples cuentas lado a lado
- research_niche_competition: detecta el nicho del cliente y genera análisis de competencia, ideas virales y tendencias

Además tenés acceso a internet:
- web_search: busca en la web (DuckDuckGo) y devuelve resultados con título y URL
- web_fetch: descarga una URL y devuelve su texto (para leer artículos, landings de competencia, etc.)
Usá web_search + web_fetch cuando necesites datos reales y actuales de la web; no inventes datos que podés verificar.
`.trim();

const SYSTEM_PROMPTS: Record<string, string> = {
  dashboard: [
    "Sos el Dashboard Agent de LMTM, agencia de marketing latinoamericana.",
    "Tu objetivo: producir un dashboard HTML completo, autocontenido, dark theme — un panel de control real para el cliente.",
    "",
    META_TOOLS_NOTE,
    "",
    "FLUJO:",
    "1) Llamá list_meta_mappings. Si no hay mappings, pedile al usuario que vaya a /integrations/meta.",
    "2) Si falta info crítica (nombre cliente, periodo), pedila en UN mensaje breve.",
    "3) Llamá meta_insights con el período solicitado (default last_30d).",
    "4) Llamá meta_insights de nuevo con datePreset='this_month' para obtener los gastos del mes en curso.",
    "5) Generá el HTML con TODAS las secciones listadas abajo.",
    "6) Llamá deploy_dashboard y respondé con el link + resumen breve.",
    "",
    "SECCIONES OBLIGATORIAS DEL DASHBOARD:",
    "— GASTOS MENSUALES: spend del mes, proyección, barra de progreso",
    "— RESUMEN EJECUTIVO: spend, impressiones, alcance, clics, CTR, CPC, CPM",
    "— TENDENCIA DIARIA: tabla con spend/día. Días con spend=0 → 'Sin actividad'",
    "— MEJORES CAMPAÑAS/ANUNCIOS: top 3 por CTR o conversiones",
    "— ALERTAS OPERATIVAS: CTR < 1%, frecuencia > 3, días sin datos",
    "— IDEAS DE CONTENIDO: 3 sugerencias basadas en el nicho y performance",
    "— PRÓXIMOS PASOS: 3 acciones concretas recomendadas",
    "",
    "DISEÑO: Dark theme #0a0a0a/cards #111/bordes #222. Sin frameworks. Responsive. Max 1200 líneas.",
    "REGLAS: Español rioplatense. Nunca inventés números.",
  ].join("\n"),

  analytics: [
    "Sos el Analytics Agent de LMTM. Analizás datos de Meta Ads para múltiples clientes.",
    "",
    META_TOOLS_NOTE,
    "",
    "Podés comparar cuentas entre clientes, detectar tendencias, y buscar cómo anuncia la competencia.",
    "Español rioplatense. Breve y accionable. Mostrá tablas comparativas cuando sea útil.",
  ].join("\n"),

  n8n: [
    "Sos el Agente n8n de LMTM. Podés crear, listar y ejecutar workflows en n8n.",
    "",
    META_TOOLS_NOTE,
    "",
    "Cuando te pidan un flujo nuevo:",
    "1) Usá n8n_search_nodes para encontrar los nodos necesarios.",
    "2) Usá n8n_get_sdk_reference para entender el formato de código.",
    "3) Creá el workflow con n8n_create_workflow.",
    "4) Confirmá con el usuario qué hace y si lo activamos.",
    "Español rioplatense. Breve y accionable.",
  ].join("\n"),

  default: [
    "Sos un asistente de LMTM, agencia de marketing.",
    "",
    META_TOOLS_NOTE,
    "",
    "Respondé en español rioplatense. Breve y accionable.",
  ].join("\n"),
};

// ── Tools definition ──────────────────────────────────────────────────────────

const META_TOOLS_DEF = [
  {
    type: "function",
    function: {
      name: "list_meta_mappings",
      description: "Lista las cuentas de Meta Ads mapeadas al cliente actual (companyId). Devuelve adAccountId y label.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_all_meta_accounts",
      description: "Lista TODAS las cuentas de Meta Ads de todos los clientes. Útil para comparaciones cross-cliente o encontrar cuentas de referencia.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "meta_insights",
      description: "Métricas de Meta Ads (spend, impressions, clicks, ctr, cpc, reach, actions) para un ad account.",
      parameters: {
        type: "object",
        properties: {
          adAccount: { type: "string", description: "Ad account ID (act_xxx). Si se omite, usa el mapping del cliente actual." },
          connectionId: { type: "string", description: "UUID de la connection a usar. Si se omite, se resuelve por adAccount." },
          datePreset: {
            type: "string",
            enum: ["today", "yesterday", "this_week_mon_today", "this_month", "last_7d", "last_14d", "last_28d", "last_30d", "last_90d"],
            description: "Rango de fechas. Default last_30d.",
          },
          since: { type: "string", description: "Fecha inicio YYYY-MM-DD (alternativa a datePreset)." },
          until: { type: "string", description: "Fecha fin YYYY-MM-DD." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_meta_accounts",
      description: "Compara múltiples cuentas de Meta Ads lado a lado. Devuelve métricas agregadas por cuenta para el mismo período.",
      parameters: {
        type: "object",
        properties: {
          accounts: {
            type: "array",
            items: { type: "string" },
            description: "Lista de adAccountIds (act_xxx) a comparar.",
          },
          datePreset: {
            type: "string",
            enum: ["last_7d", "last_14d", "last_28d", "last_30d", "last_90d", "this_month"],
            description: "Período a comparar. Default last_30d.",
          },
        },
        required: ["accounts"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "research_niche_competition",
      description: "Detecta el nicho/industria del cliente a partir de sus campañas y genera un análisis competitivo: quiénes son los competidores típicos, qué tipo de contenido viral funciona en ese sector, tendencias actuales, ideas de anuncios, ángulos de copy y estrategias que están usando las marcas líderes. No requiere APIs externas.",
      parameters: {
        type: "object",
        properties: {
          niche: {
            type: "string",
            description: "Nicho o industria del cliente (ej: 'inmobiliaria', 'ecommerce moda', 'gimnasio', 'restaurante', 'odontología'). Si no lo sabés, inferilo de los nombres de campaña.",
          },
          campaignNames: {
            type: "array",
            items: { type: "string" },
            description: "Nombres de campañas del cliente para inferir el nicho automáticamente.",
          },
          country: {
            type: "string",
            description: "País de operación (AR, MX, CO, CL, ES...). Default AR. Afecta tendencias locales.",
          },
          focus: {
            type: "string",
            enum: ["viral_content", "competitor_strategies", "ad_copy", "seasonal_trends", "full_analysis"],
            description: "Qué aspecto profundizar. Default full_analysis.",
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
      description: "Deploya un HTML estático a Vercel y devuelve la URL pública.",
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
];

const N8N_TOOLS_DEF = [
  {
    type: "function",
    function: {
      name: "n8n_search_workflows",
      description: "Lista/busca workflows en n8n.",
      parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "n8n_get_workflow_details",
      description: "Obtiene detalles de un workflow.",
      parameters: { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "n8n_execute_workflow",
      description: "Ejecuta un workflow de n8n.",
      parameters: { type: "object", properties: { workflowId: { type: "string" }, executionMode: { type: "string", enum: ["manual", "production"] } }, required: ["workflowId"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "n8n_create_workflow",
      description: "Crea un workflow nuevo en n8n desde código SDK.",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "n8n_get_sdk_reference",
      description: "Obtiene documentación del n8n Workflow SDK.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "n8n_search_nodes",
      description: "Busca nodos de n8n por servicio.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    },
  },
];

const WEB_TOOLS_DEF = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Busca en la web (DuckDuckGo) y devuelve los primeros resultados con título, URL y dominio. Útil para research de competencia, tendencias, datos de mercado actuales. Después podés usar web_fetch para leer una URL en detalle.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Términos de búsqueda." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Descarga una URL (http/https) y devuelve su contenido como texto plano (HTML limpiado). Útil para leer una página web, un artículo, una landing de un competidor, etc.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL completa con http(s)://" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
];

function getToolsForAgent(agentKey: string) {
  const base = [...META_TOOLS_DEF, ...WEB_TOOLS_DEF];
  if (agentKey === "n8n") return [...base, ...N8N_TOOLS_DEF];
  return base;
}

// ── AI call ───────────────────────────────────────────────────────────────────

interface AIMessage {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface AIResponse {
  choices?: Array<{
    message?: AIMessage;
    finish_reason?: string;
  }>;
  base_resp?: { status_code?: number; status_msg?: string };
}

async function callAI(messages: ChatMessage[], tools: unknown[]): Promise<AIResponse> {
  // Try Anthropic (Claude) first
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      return await callClaude(messages, tools, anthropicKey);
    } catch (e) {
      console.warn("[agent-chat] Claude failed, falling back to MiniMax:", e instanceof Error ? e.message : e);
    }
  }

  // Fallback: MiniMax
  const minimaxKey = process.env.MINIMAX_API_KEY;
  if (!minimaxKey) throw new Error("No AI API key configured (ANTHROPIC_API_KEY or MINIMAX_API_KEY required)");
  return callMiniMax(messages, tools, minimaxKey);
}

async function callClaude(messages: ChatMessage[], tools: unknown[], apiKey: string): Promise<AIResponse> {
  // Extract system message
  const systemMsg = messages.find(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  // Convert tool definitions to Anthropic format
  const anthropicTools = (tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }>).map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  // Convert messages to Anthropic format
  const anthropicMessages = userMessages.map(m => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [{
          type: "tool_result" as const,
          tool_use_id: m.tool_call_id ?? "unknown",
          content: m.content ?? "",
        }],
      };
    }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const content: unknown[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function.arguments || "{}"); } catch { /* noop */ }
        content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      return { role: "assistant" as const, content };
    }
    return { role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user", content: m.content ?? "" };
  }).filter(m => m.content !== "" || (Array.isArray(m.content) && (m.content as unknown[]).length > 0));

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: anthropicMessages,
    ...(systemMsg?.content ? { system: systemMsg.content } : {}),
    ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Claude HTTP ${r.status}: ${text.slice(0, 400)}`);
  }

  const json = (await r.json()) as {
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
    stop_reason?: string;
  };

  // Convert Anthropic response to OpenAI-compatible format
  const textParts = (json.content ?? []).filter(c => c.type === "text").map(c => c.text ?? "").join("");
  const toolUses = (json.content ?? []).filter(c => c.type === "tool_use");

  const message: AIMessage = {
    role: "assistant",
    content: textParts || null,
  };

  if (toolUses.length > 0) {
    message.tool_calls = toolUses.map(tu => ({
      id: tu.id ?? `call_${Date.now()}`,
      type: "function" as const,
      function: {
        name: tu.name ?? "",
        arguments: JSON.stringify(tu.input ?? {}),
      },
    }));
  }

  return { choices: [{ message, finish_reason: json.stop_reason ?? "stop" }] };
}

async function callMiniMax(messages: ChatMessage[], tools: unknown[], apiKey: string): Promise<AIResponse> {
  const baseUrl = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-M2.7";

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
  const json = (await r.json()) as AIResponse;
  if (json.base_resp?.status_code && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax ${json.base_resp.status_code}: ${json.base_resp.status_msg}`);
  }
  return json;
}

// ── Tool executors ────────────────────────────────────────────────────────────

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

async function execListAllMetaAccounts(db: Db) {
  const rows = await db
    .select({
      companyId: metaAdAccountMappings.companyId,
      adAccountId: metaAdAccountMappings.adAccountId,
      mappingLabel: metaAdAccountMappings.label,
      connectionId: metaAdAccountMappings.connectionId,
      connectionLabel: metaConnections.label,
      connectionStatus: metaConnections.status,
    })
    .from(metaAdAccountMappings)
    .leftJoin(metaConnections, eq(metaConnections.id, metaAdAccountMappings.connectionId));
  return { accounts: rows };
}

async function execMetaInsights(
  db: Db,
  companyId: string,
  args: { adAccount?: string; connectionId?: string; datePreset?: string; since?: string; until?: string },
) {
  // Resolve connection
  let conn: typeof metaConnections.$inferSelect | null = null;
  let account: string;

  if (args.connectionId) {
    conn = (await db.query.metaConnections.findFirst({ where: eq(metaConnections.id, args.connectionId) })) ?? null;
    if (!conn) return { error: "Connection not found" };
    account = args.adAccount ?? conn.adAccountId ?? "";
  } else if (args.adAccount) {
    // Find a mapping with this adAccount (across all companies this agent can see)
    const wanted = args.adAccount.startsWith("act_") ? args.adAccount : `act_${args.adAccount}`;
    const mapping = await db.query.metaAdAccountMappings.findFirst({
      where: eq(metaAdAccountMappings.adAccountId, wanted),
    });
    if (!mapping) return { error: `No mapping found for ${wanted}` };
    conn = (await db.query.metaConnections.findFirst({ where: eq(metaConnections.id, mapping.connectionId) })) ?? null;
    if (!conn) return { error: "Mapped connection not found" };
    account = wanted;
  } else {
    // Use the single mapping for this company
    const filters = [eq(metaAdAccountMappings.companyId, companyId)];
    const mappings = await db.select({ adAccountId: metaAdAccountMappings.adAccountId, connectionId: metaAdAccountMappings.connectionId }).from(metaAdAccountMappings).where(and(...filters));
    if (mappings.length === 0) return { error: "No mapping found. Configure one in /integrations/meta first." };
    if (mappings.length > 1) return { error: `Company has ${mappings.length} mappings. Pass adAccount explicitly.` };
    conn = (await db.query.metaConnections.findFirst({ where: eq(metaConnections.id, mappings[0].connectionId) })) ?? null;
    if (!conn) return { error: "Mapped connection not found" };
    account = mappings[0].adAccountId;
  }

  if (!account) return { error: "No ad account resolved" };
  if (!account.startsWith("act_")) account = `act_${account}`;

  const url = new URL(`${GRAPH}/${account}/insights`);
  url.searchParams.set("access_token", conn.accessToken);
  url.searchParams.set("fields", "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,date_start,date_stop");
  url.searchParams.set("level", "account");
  url.searchParams.set("time_increment", "1");

  if (args.since && args.until) {
    url.searchParams.set("time_range", JSON.stringify({ since: args.since, until: args.until }));
  } else {
    url.searchParams.set("date_preset", args.datePreset ?? "last_30d");
  }

  const r = await fetch(url.toString());
  const json = (await r.json().catch(() => ({}))) as { data?: unknown[]; error?: { message?: string } };
  if (!r.ok) return { error: json.error?.message ?? `Graph HTTP ${r.status}` };
  return { adAccount: account, rows: json.data ?? [] };
}

async function execCompareMetaAccounts(
  db: Db,
  args: { accounts: string[]; datePreset?: string },
) {
  const results: Array<{ adAccount: string; totals: Record<string, unknown>; error?: string }> = [];

  for (const adAccountId of args.accounts) {
    const wanted = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const mapping = await db.query.metaAdAccountMappings.findFirst({
      where: eq(metaAdAccountMappings.adAccountId, wanted),
    });
    if (!mapping) {
      results.push({ adAccount: wanted, totals: {}, error: "No mapping found" });
      continue;
    }
    const conn = await db.query.metaConnections.findFirst({ where: eq(metaConnections.id, mapping.connectionId) });
    if (!conn) {
      results.push({ adAccount: wanted, totals: {}, error: "Connection not found" });
      continue;
    }

    try {
      const url = new URL(`${GRAPH}/${wanted}/insights`);
      url.searchParams.set("access_token", conn.accessToken);
      url.searchParams.set("fields", "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions");
      url.searchParams.set("level", "account");
      url.searchParams.set("date_preset", args.datePreset ?? "last_30d");
      const r = await fetch(url.toString());
      const json = (await r.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>>; error?: { message?: string } };
      if (!r.ok) {
        results.push({ adAccount: wanted, totals: {}, error: json.error?.message ?? `Graph HTTP ${r.status}` });
        continue;
      }
      // Aggregate totals
      const rows = json.data ?? [];
      const totals = rows.reduce((acc: Record<string, number>, row) => ({
        spend: (acc.spend ?? 0) + parseFloat(String(row.spend ?? 0)),
        impressions: (acc.impressions ?? 0) + parseInt(String(row.impressions ?? 0), 10),
        clicks: (acc.clicks ?? 0) + parseInt(String(row.clicks ?? 0), 10),
        reach: (acc.reach ?? 0) + parseInt(String(row.reach ?? 0), 10),
      }), {});
      const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
      const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
      const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
      results.push({ adAccount: wanted, totals: { ...totals, ctr: ctr.toFixed(2) + "%", cpc: "$" + cpc.toFixed(2), cpm: "$" + cpm.toFixed(2) } });
    } catch (e) {
      results.push({ adAccount: wanted, totals: {}, error: String(e) });
    }
  }

  return { comparison: results, period: args.datePreset ?? "last_30d" };
}

async function execResearchNicheCompetition(
  args: { niche?: string; campaignNames?: string[]; country?: string; focus?: string },
) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Infer niche from campaign names if not provided
  let niche = args.niche?.trim() ?? "";
  if (!niche && args.campaignNames && args.campaignNames.length > 0) {
    niche = `cliente con campañas: ${args.campaignNames.slice(0, 5).join(", ")}`;
  }
  if (!niche) return { error: "Proporcioná el nicho o nombres de campaña para inferirlo." };

  const country = args.country ?? "AR";
  const focus = args.focus ?? "full_analysis";
  const countryNames: Record<string, string> = { AR: "Argentina", MX: "México", CO: "Colombia", CL: "Chile", ES: "España", US: "Estados Unidos", PE: "Perú", UY: "Uruguay" };
  const countryName = countryNames[country.toUpperCase()] ?? country;

  const focusInstructions: Record<string, string> = {
    viral_content: "Enfocate en: tipos de contenido viral que funcionan en este nicho, formatos (Reels, carruseles, stories), hooks virales, tendencias de contenido orgánico vs pago.",
    competitor_strategies: "Enfocate en: quiénes son los competidores típicos de este nicho, qué estrategias de Meta Ads usan, presupuestos estimados, segmentación típica, ofertas y propuestas de valor comunes.",
    ad_copy: "Enfocate en: ángulos de copy que convierten en este nicho, headlines poderosos, CTAs efectivos, objeciones comunes y cómo rebatirlas, gatillos emocionales.",
    seasonal_trends: "Enfocate en: estacionalidad del nicho, fechas clave del año para campañas, eventos relevantes, variaciones de demanda mensual.",
    full_analysis: "Cubrí todos los aspectos: competidores típicos, estrategias de contenido viral, copy que convierte, estacionalidad, y 5 ideas concretas de anuncios.",
  };

  const prompt = `Sos un experto en marketing digital y publicidad en Meta Ads para ${countryName}.

El cliente opera en el siguiente nicho: **${niche}**

${focusInstructions[focus] ?? focusInstructions.full_analysis}

Respondé en español rioplatense con:
1. **Análisis del nicho** (2-3 párrafos): cómo funciona este mercado en Meta Ads, nivel de competencia, CPL/CPC típicos si los conocés
2. **Competidores y estrategias típicas** (lista de 4-5 puntos): qué tipo de marcas dominan el espacio, qué ángulos usan, qué los hace efectivos
3. **Ideas de contenido viral** (5 ideas concretas con formato, hook y call-to-action)
4. **Copy que convierte** (3 ejemplos de headline + descripción para este nicho)
5. **Recomendaciones de segmentación** (audiencias, intereses, lookalikes típicos)
6. **Errores comunes** en este nicho que deben evitarse

Sé específico y accionable. Basate en tendencias reales del mercado latinoamericano.`;

  // Try Claude first
  if (anthropicKey) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const data = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = data.content?.find(c => c.type === "text")?.text ?? "";
        if (text) return { niche, country: countryName, focus, analysis: text };
      }
    } catch { /* fall through */ }
  }

  // Fallback: OpenAI
  if (openaiKey) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text) return { niche, country: countryName, focus, analysis: text };
      }
    } catch { /* noop */ }
  }

  return { error: "No AI key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY required)" };
}

async function execDeployDashboard(args: { name: string; html: string; target?: string }) {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  if (!token) return { error: "VERCEL_API_TOKEN not configured" };
  const teamId = process.env.VERCEL_TEAM_ID?.trim();

  const slug = args.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lmtm-dashboard";
  const projectName = `lmtm-${slug}`;
  const target = args.target === "preview" ? "preview" : "production";

  const url = new URL("https://api.vercel.com/v13/deployments");
  url.searchParams.set("forceNew", "1");
  if (teamId) url.searchParams.set("teamId", teamId);

  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: projectName, target, projectSettings: { framework: null }, files: [{ file: "index.html", data: args.html, encoding: "utf-8" }] }),
  });
  const raw = (await r.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!r.ok) return { error: raw.error?.message ?? `Vercel HTTP ${r.status}` };
  if (!raw.url || !raw.id) return { error: "Vercel returned no url/id" };

  try {
    const patchUrl = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`);
    if (teamId) patchUrl.searchParams.set("teamId", teamId);
    await fetch(patchUrl.toString(), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ssoProtection: null, passwordProtection: null }),
    });
  } catch { /* noop */ }

  return { id: raw.id, projectName, url: `https://${raw.url}`, target };
}

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
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: toolName, arguments: args } }),
    });
    const text = await r.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) };
        if (data.result) {
          const content = data.result?.content;
          if (Array.isArray(content)) {
            const texts = (content as Array<{ type: string; text?: string }>).filter(c => c.type === "text").map(c => c.text ?? "");
            if (texts.length === 1) { try { return JSON.parse(texts[0]); } catch { return { result: texts[0] }; } }
            return { result: texts.join("\n") };
          }
          return data.result;
        }
      } catch { /* continue */ }
    }
    return { error: "No result from n8n MCP" };
  } catch (e) {
    return { error: `n8n MCP fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function execWebFetch(args: { url?: string }): Promise<unknown> {
  const url = (args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { error: "URL inválida (debe empezar con http:// o https://)" };
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; LMTM-OS/1.0)" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: `HTTP ${r.status}`, url };
    const ct = r.headers.get("content-type") ?? "";
    const raw = await r.text();
    if (ct.includes("json")) return { url, contentType: ct, content: raw.slice(0, 8000) };
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
    return { url, chars: text.length, content: text.slice(0, 8000) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), url };
  }
}

async function execWebSearch(args: { query?: string }): Promise<unknown> {
  const q = (args.query ?? "").trim();
  if (!q) return { error: "query requerida" };
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LMTM-OS/1.0)", "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await r.text();
    const results: Array<{ title: string; url: string }> = [];
    const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 6) {
      let href = m[1];
      const uddg = /[?&]uddg=([^&]+)/.exec(href);
      if (uddg) href = decodeURIComponent(uddg[1]);
      if (href.startsWith("//")) href = "https:" + href;
      const title = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
      if (title && href.startsWith("http")) results.push({ title, url: href });
    }
    if (results.length === 0) return { query: q, results: [], note: "Sin resultados parseables. Probá web_fetch con una URL directa." };
    return { query: q, results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function executeTool(db: Db, companyId: string, name: string, argsJson: string): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(argsJson || "{}"); } catch { return { error: `Invalid JSON args: ${argsJson.slice(0, 200)}` }; }

  if (name === "list_meta_mappings") return execListMetaMappings(db, companyId);
  if (name === "list_all_meta_accounts") return execListAllMetaAccounts(db);
  if (name === "meta_insights") return execMetaInsights(db, companyId, args as Parameters<typeof execMetaInsights>[2]);
  if (name === "compare_meta_accounts") return execCompareMetaAccounts(db, args as Parameters<typeof execCompareMetaAccounts>[1]);
  if (name === "research_niche_competition") return execResearchNicheCompetition(args as Parameters<typeof execResearchNicheCompetition>[0]);
  if (name === "deploy_dashboard") return execDeployDashboard(args as Parameters<typeof execDeployDashboard>[0]);
  if (name === "web_search") return execWebSearch(args as { query?: string });
  if (name === "web_fetch") return execWebFetch(args as { url?: string });

  if (name.startsWith("n8n_")) {
    const key = name.slice(4);
    return callN8nMcp(N8N_TOOL_MAP[key] ?? key, args);
  }

  return { error: `Unknown tool: ${name}` };
}

// ── Session memory helpers ────────────────────────────────────────────────────

async function loadSession(db: Db, sessionId: string, companyId: string): Promise<{ id: string; messages: ChatMessage[]; clientContext: string | null } | null> {
  const row = await db.query.agentChatSessions.findFirst({
    where: and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.companyId, companyId)),
  });
  if (!row) return null;
  return { id: row.id, messages: (row.messages as ChatMessage[]) ?? [], clientContext: row.clientContext ?? null };
}

async function saveSession(db: Db, sessionId: string, companyId: string, agentKey: string, messages: ChatMessage[], clientContext?: string) {
  // Keep only last N messages to avoid unbounded growth
  const trimmed = messages.slice(-SESSION_HISTORY_LIMIT);
  const existing = await db.query.agentChatSessions.findFirst({ where: eq(agentChatSessions.id, sessionId) });
  if (existing) {
    await db.update(agentChatSessions).set({ messages: trimmed as Record<string, unknown>[], clientContext: clientContext ?? existing.clientContext, updatedAt: new Date() }).where(eq(agentChatSessions.id, sessionId));
  } else {
    await db.insert(agentChatSessions).values({ id: sessionId, companyId, agentKey, messages: trimmed as Record<string, unknown>[], clientContext: clientContext ?? null });
  }
}

async function createSession(db: Db, companyId: string, agentKey: string): Promise<string> {
  const [row] = await db.insert(agentChatSessions).values({ companyId, agentKey, messages: [] }).returning({ id: agentChatSessions.id });
  return row.id;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export function agentChatRoutes(db: Db) {
  const router = Router();

  // GET /api/agents/sessions — list sessions for a company
  router.get("/agents/sessions", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : null;
    if (!companyId) throw badRequest("companyId required");
    assertCompanyAccess(req, companyId);
    const rows = await db.select({
      id: agentChatSessions.id,
      agentKey: agentChatSessions.agentKey,
      clientContext: agentChatSessions.clientContext,
      updatedAt: agentChatSessions.updatedAt,
    }).from(agentChatSessions).where(eq(agentChatSessions.companyId, companyId));
    res.json(rows);
  });

  // DELETE /api/agents/sessions/:id — clear a session
  router.delete("/agents/sessions/:id", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const row = await db.query.agentChatSessions.findFirst({ where: eq(agentChatSessions.id, req.params.id) });
    if (!row) return res.status(404).json({ error: "Session not found" });
    assertCompanyAccess(req, row.companyId);
    await db.delete(agentChatSessions).where(eq(agentChatSessions.id, req.params.id));
    res.json({ ok: true });
  });

  // POST /api/agents/chat
  router.post("/agents/chat", async (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("Invalid body: " + parsed.error.issues.map(i => i.message).join("; "));
    const body: ChatBody = parsed.data;
    assertCompanyAccess(req, body.companyId);

    const agentKey = body.agent.toLowerCase();
    const tools = getToolsForAgent(agentKey);
    const systemPrompt = SYSTEM_PROMPTS[agentKey] ?? SYSTEM_PROMPTS.default;

    // Auto-load Enfoque Técnico context if clientSlug provided but no explicit client text
    let clientContextStr = body.client?.trim() ?? "";
    if (!clientContextStr && body.clientSlug) {
      try {
        const [clientRow] = await db.select().from(clients).where(eq(clients.slug, body.clientSlug));
        if (clientRow) {
          const ctx = await getEnfoqueTecnicoContext(db, clientRow.id, { maxAgeMs: 30 * 60 * 1000 });
          if (ctx.markdown.trim().length > 0) {
            // Cap the injected context so a long doc doesn't blow the prompt.
            const doc = ctx.markdown.length > 6000 ? ctx.markdown.slice(0, 6000) + "\n…(truncado)" : ctx.markdown;
            clientContextStr = `Cliente: ${clientRow.name}\n\nEnfoque Técnico (documento de contexto del cliente en ClickUp):\n${doc}`;
          } else {
            clientContextStr = `Cliente: ${clientRow.name}`;
          }
          // Customer Brain: living memory (facts, performance, decisions).
          try {
            const brain = await getBrainContext(db, clientRow.id, 1800);
            if (brain) clientContextStr += `\n\nMemoria del cliente (Customer Brain):\n${brain}`;
          } catch { /* brain optional */ }
        }
      } catch (e) {
        console.warn("[agent-chat] failed to load client context for", body.clientSlug, e);
      }
    }
    const clientContext = clientContextStr ? `\n\nContexto del cliente: ${clientContextStr}` : "";

    // Load session history if sessionId provided
    let sessionHistory: ChatMessage[] = [];
    let resolvedSessionId = body.sessionId;

    if (resolvedSessionId) {
      const session = await loadSession(db, resolvedSessionId, body.companyId);
      if (session) {
        sessionHistory = session.messages;
        // If client context not provided in this request, use stored one
        if (!body.client && session.clientContext) {
          // already in history
        }
      } else {
        // Session ID provided but not found — create new with that ID is not possible, create fresh
        resolvedSessionId = undefined;
      }
    }

    // Build conversation: system + history + new messages
    const conversation: ChatMessage[] = [
      { role: "system", content: systemPrompt + clientContext },
      ...sessionHistory,
      ...body.messages,
    ];

    const toolTrace: Array<{ name: string; args: unknown; result: unknown }> = [];

    for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
      let aiResp: AIResponse;
      try {
        aiResp = await callAI(conversation, tools);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(502).json({ error: "AI call failed", detail: msg, toolTrace });
      }

      const msg = aiResp.choices?.[0]?.message;
      if (!msg) return res.status(502).json({ error: "AI returned no message", toolTrace });

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
            result: call.function.name === "deploy_dashboard" && (result as { url?: string }).url
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

      // Final response
      const rawOutput = msg.content ?? "";
      const cleaned = rawOutput.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();

      // Persist session — save history excluding system message
      const historyToSave = conversation.slice(1); // drop system
      if (resolvedSessionId) {
        await saveSession(db, resolvedSessionId, body.companyId, agentKey, [...historyToSave, { role: "assistant", content: cleaned }], clientContextStr || body.client?.trim()).catch(() => {});
      } else if (body.sessionId === undefined && body.messages.length > 0) {
        // Auto-create session for continuity
        const newId = await createSession(db, body.companyId, agentKey).catch(() => null);
        if (newId) {
          resolvedSessionId = newId;
          await saveSession(db, newId, body.companyId, agentKey, [...historyToSave, { role: "assistant", content: cleaned }], body.client?.trim()).catch(() => {});
        }
      }

      return res.json({
        output: cleaned,
        agent: agentKey,
        toolTrace,
        sessionId: resolvedSessionId ?? null,
      });
    }

    return res.status(502).json({ error: "Agent loop exceeded max iterations", detail: `Max ${MAX_LOOP_ITERATIONS} iterations reached`, toolTrace });
  });

  return router;
}
