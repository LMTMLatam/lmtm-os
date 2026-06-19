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
import { issueService } from "../services/issues.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";
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
