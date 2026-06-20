// LMTM-OS: agent tool-execution endpoint.
//
// The minimax_local adapter runs the model HTTP-direct (no spawned process), so
// when the model emits a tool call there is nothing to execute it. This router
// is the executor: the adapter (authenticated with the agent's local JWT) lists
// the available tools and runs them here, in-process, with full access to the
// issue service and the plugin tool dispatcher.
//
// Exposed tools:
//  - CORE: get_issue, post_comment, set_issue_status, create_child_issue — let an
//    agent read its task and CLOSE THE LOOP (comment its result + mark the issue
//    done/blocked) so runs actually progress instead of spinning.
//  - PLUGIN: every tool registered by the bundled LMTM plugins (Meta Ads, etc.).
//
// Auth: the agent JWT (req.actor.type === "agent") or a board actor.

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { clients, competitors, accountScores } from "@paperclipai/db";
import { desc, eq } from "drizzle-orm";
import { issueService } from "../services/issues.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";
import { getBrainContext, upsertMemory, type MemoryKind } from "../services/customer-brain.js";
import { aggInsights } from "../services/agency-ops.js";
import { resolveCompanyId } from "../services/intel-common.js";
import { unauthorized } from "../errors.js";

type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const CORE_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_issue",
      description:
        "Lee los detalles de un issue (título, descripción, estado). Pasá el id o el identificador (ej. LMTM-7).",
      parameters: {
        type: "object",
        properties: { issueId: { type: "string", description: "ID o identificador del issue (ej. LMTM-7)" } },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_comment",
      description:
        "Deja un comentario en el issue con tu análisis, resultado o pregunta. Es la forma de entregar tu trabajo al equipo.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "string", description: "ID o identificador del issue" },
          body: { type: "string", description: "Texto del comentario (markdown)" },
        },
        required: ["issueId", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_issue_status",
      description:
        "Cambia el estado del issue. Usá 'done' cuando completaste la tarea (dejá antes un comentario con el resultado), 'blocked' si estás bloqueado (explicá por qué en un comentario), 'in_progress' si seguís. SIEMPRE cerrá la tarea con un estado para que no quede colgada.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "string" },
          status: { type: "string", enum: ["done", "in_progress", "blocked", "backlog", "todo", "cancelled"] },
          reason: { type: "string", description: "Motivo breve del cambio (opcional)" },
        },
        required: ["issueId", "status"],
      },
    },
  },
  // ── Acceso a datos del cliente (lectura) ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_clients",
      description:
        "Lista los clientes activos de la agencia (id, nombre, slug). Usalo para encontrar el clientId de un cliente por su nombre antes de pedir sus datos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_brain",
      description:
        "Devuelve la MEMORIA viva del cliente: hechos, decisiones, preferencias, riesgos, performance y el Enfoque Técnico acumulado. Leelo SIEMPRE antes de trabajar sobre un cliente para tener contexto.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string", description: "UUID del cliente (de list_clients)" } },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_competitors",
      description: "Lista los competidores cargados del cliente (nombre, redes, web, notas, anuncios de muestra).",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_ads_performance",
      description:
        "Métricas REALES de Meta Ads del cliente para los últimos N días (spend, impresiones, clicks, leads, reach, CTR, CPL, CPC). Datos sincronizados, no inventes.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          sinceDays: { type: "number", description: "Ventana en días (default 30)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_scores",
      description: "Devuelve el último score de Salud de cuenta (ads) y Operativo (cumplimiento) del cliente, 0-100.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
  },
  // ── Autoaprendizaje (escritura en la memoria del cliente) ─────────────────
  {
    type: "function",
    function: {
      name: "remember_about_client",
      description:
        "Guarda un aprendizaje en la MEMORIA del cliente para que el sistema lo recuerde en el futuro. Usalo cuando descubrís algo útil y durable: qué creatividad/ángulo funciona, una preferencia del cliente, un riesgo, una decisión, un resultado clave. Así el sistema autoaprende a medida que trabajamos. NO guardes ruido ni cosas obvias.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          key: { type: "string", description: "Identificador corto del aprendizaje (ej. 'angulo-ganador', 'preferencia-tono')" },
          content: { type: "string", description: "El aprendizaje, claro y autocontenido (1-3 frases)" },
          kind: {
            type: "string",
            enum: ["fact", "preference", "decision", "event", "performance", "context", "risk"],
            description: "Tipo de memoria (default 'fact')",
          },
        },
        required: ["clientId", "key", "content"],
      },
    },
  },
];

function actorContext(req: Request): { agentId: string; companyId: string; runId: string } | null {
  if (req.actor.type === "agent") {
    return {
      agentId: req.actor.agentId ?? "",
      companyId: req.actor.companyId ?? "",
      runId: req.actor.runId ?? "",
    };
  }
  return null;
}

export function agentToolsRoutes(
  db: Db,
  deps: { toolDispatcher?: PluginToolDispatcher | null } = {},
): Router {
  const router = Router();
  const issuesSvc = issueService(db);
  const dispatcher = deps.toolDispatcher ?? null;

  function pluginToolDefs(): ToolDef[] {
    if (!dispatcher) return [];
    try {
      return dispatcher.listToolsForAgent().map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters:
            t.parametersSchema && Object.keys(t.parametersSchema).length > 0
              ? t.parametersSchema
              : { type: "object", properties: {} },
        },
      }));
    } catch {
      return [];
    }
  }

  // GET /api/agent-tools — list every tool the agent can call (MiniMax/OpenAI format).
  router.get("/agent-tools", (req, res) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    res.json({ tools: [...CORE_TOOLS, ...pluginToolDefs()] });
  });

  // POST /api/agent-tools/execute — run a tool by name. Always returns 200 with
  // { ok, content } so the adapter can feed the result (success OR error) back to
  // the model as a tool message and let it recover.
  router.post("/agent-tools/execute", async (req, res) => {
    const ctx = actorContext(req);
    if (!ctx) throw unauthorized("Agent authentication required");
    const body = (req.body ?? {}) as { tool?: unknown; parameters?: unknown };
    const tool = typeof body.tool === "string" ? body.tool : "";
    const params = (body.parameters ?? {}) as Record<string, unknown>;
    const issueRef = typeof params.issueId === "string" ? params.issueId : "";

    const reply = (ok: boolean, content: string) => res.json({ ok, content });

    try {
      if (tool === "get_issue") {
        const issue = await issuesSvc.getById(issueRef);
        if (!issue) return reply(false, `Issue "${issueRef}" no encontrado.`);
        return reply(
          true,
          JSON.stringify({
            id: (issue as Record<string, unknown>).identifier ?? issue.id,
            title: issue.title,
            status: issue.status,
            description:
              (issue as Record<string, unknown>).description ??
              (issue as Record<string, unknown>).body ??
              "",
          }),
        );
      }

      if (tool === "post_comment") {
        const issue = await issuesSvc.getById(issueRef);
        if (!issue) return reply(false, `Issue "${issueRef}" no encontrado.`);
        const text = typeof params.body === "string" ? params.body : "";
        if (!text.trim()) return reply(false, "El comentario está vacío.");
        await issuesSvc.addComment(issue.id, text, { agentId: ctx.agentId, runId: ctx.runId });
        return reply(true, "Comentario publicado en el issue.");
      }

      if (tool === "set_issue_status") {
        const issue = await issuesSvc.getById(issueRef);
        if (!issue) return reply(false, `Issue "${issueRef}" no encontrado.`);
        const status = typeof params.status === "string" ? params.status : "";
        const allowed = ["done", "in_progress", "blocked", "backlog", "todo", "cancelled"];
        if (!allowed.includes(status)) return reply(false, `Estado inválido: "${status}".`);
        await issuesSvc.update(issue.id, {
          status: status as never,
          actorAgentId: ctx.agentId,
        });
        return reply(true, `Estado del issue cambiado a "${status}".`);
      }

      if (tool === "list_clients") {
        const rows = await db
          .select({ id: clients.id, name: clients.name, slug: clients.slug })
          .from(clients)
          .where(eq(clients.status, "active"))
          .limit(200);
        return reply(true, JSON.stringify(rows));
      }

      if (tool === "get_client_brain") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const brain = await getBrainContext(db, clientId, 4000);
        return reply(true, brain || "(El cliente todavía no tiene memoria cargada.)");
      }

      if (tool === "get_client_competitors") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const rows = await db.select().from(competitors).where(eq(competitors.clientId, clientId)).limit(50);
        const out = rows.map((c) => ({
          name: c.name,
          fbPageUrl: c.fbPageUrl,
          igHandle: c.igHandle,
          website: c.website,
          notes: c.notes,
          sampleAds: (c.sampleAds ?? []).length,
        }));
        return reply(true, JSON.stringify(out));
      }

      if (tool === "get_client_ads_performance") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const days =
          typeof params.sinceDays === "number" && params.sinceDays > 0 ? Math.min(365, params.sinceDays) : 30;
        const until = new Date();
        const since = new Date(until.getTime() - days * 86_400_000);
        const agg = await aggInsights(db, clientId, since.toISOString(), until.toISOString());
        const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
        const cpl = agg.leads > 0 ? agg.spend / agg.leads : null;
        const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : null;
        return reply(
          true,
          JSON.stringify({
            windowDays: days,
            spend: Math.round(agg.spend),
            impressions: agg.impressions,
            clicks: agg.clicks,
            leads: agg.leads,
            reach: agg.reach,
            ctrPct: Number(ctr.toFixed(2)),
            cpl: cpl != null ? Number(cpl.toFixed(2)) : null,
            cpc: cpc != null ? Number(cpc.toFixed(2)) : null,
          }),
        );
      }

      if (tool === "get_client_scores") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const [row] = await db
          .select()
          .from(accountScores)
          .where(eq(accountScores.clientId, clientId))
          .orderBy(desc(accountScores.date))
          .limit(1);
        if (!row) return reply(true, "(Sin scores calculados todavía para este cliente.)");
        return reply(true, JSON.stringify({ date: row.date, healthScore: row.healthScore, opsScore: row.opsScore }));
      }

      if (tool === "remember_about_client") {
        const clientId = typeof params.clientId === "string" ? params.clientId : "";
        const key = typeof params.key === "string" ? params.key.slice(0, 120) : "";
        const content = typeof params.content === "string" ? params.content : "";
        if (!clientId || !key || !content.trim()) return reply(false, "Faltan clientId, key o content.");
        const kind = (typeof params.kind === "string" ? params.kind : "fact") as MemoryKind;
        const companyId = (await resolveCompanyId(db, clientId)) ?? ctx.companyId;
        await upsertMemory(db, { companyId, clientId, kind, key, content, source: `agent:${ctx.agentId}` });
        return reply(true, "Aprendizaje guardado en la memoria del cliente.");
      }

      // Plugin tool.
      if (dispatcher && dispatcher.getTool(tool)) {
        let projectId = ctx.companyId;
        if (issueRef) {
          const issue = await issuesSvc.getById(issueRef);
          const pid = issue ? (issue as Record<string, unknown>).projectId : null;
          if (typeof pid === "string" && pid) projectId = pid;
        }
        const result = await dispatcher.executeTool(tool, params, {
          agentId: ctx.agentId,
          runId: ctx.runId,
          companyId: ctx.companyId,
          projectId,
        });
        const content = typeof result === "string" ? result : JSON.stringify(result);
        return reply(true, content.slice(0, 8000));
      }

      return reply(false, `Tool "${tool}" no encontrada.`);
    } catch (err) {
      return reply(false, `Error ejecutando "${tool}": ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return router;
}
