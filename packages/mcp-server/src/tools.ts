import { z } from "zod";
import {
  addIssueCommentSchema,
  askUserQuestionsPayloadSchema,
  checkoutIssueSchema,
  createApprovalSchema,
  createIssueInputSchema,
  issueThreadInteractionContinuationPolicySchema,
  requestConfirmationPayloadSchema,
  suggestTasksPayloadSchema,
  updateIssueSchema,
  upsertIssueDocumentSchema,
  linkIssueApprovalSchema,
} from "@paperclipai/shared";
import { PaperclipApiClient } from "./client.js";
import { formatErrorResponse, formatTextResponse } from "./format.js";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.AnyZodObject;
  execute: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}

/**
 * El ejecutor de agentes (/agent-tools/execute) contesta `{ ok, content }`, con el
 * texto adentro. Devuelto como JSON, cada salto de línea y cada comilla llega
 * escapado: más tokens y peor lectura. Se devuelve el texto tal cual (21/10).
 */
export function desenvolver(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.ok === "boolean" && typeof o.content === "string" && Object.keys(o).length === 2) {
      return o.ok ? o.content : `ERROR: ${o.content}`;
    }
  }
  return v;
}

function makeTool<TSchema extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<TSchema>,
  execute: (input: z.infer<typeof schema>) => Promise<unknown>,
): ToolDefinition {
  return {
    name,
    description,
    schema,
    execute: async (input) => {
      try {
        const parsed = schema.parse(input);
        return formatTextResponse(desenvolver(await execute(parsed)));
      } catch (error) {
        return formatErrorResponse(error);
      }
    },
  };
}

function parseOptionalJson(raw: string | undefined | null): unknown {
  if (!raw || raw.trim().length === 0) return undefined;
  return JSON.parse(raw);
}

const companyIdOptional = z.string().uuid().optional().nullable();
const agentIdOptional = z.string().uuid().optional().nullable();
const issueIdSchema = z.string().min(1);
const projectIdSchema = z.string().min(1);
const goalIdSchema = z.string().uuid();
const approvalIdSchema = z.string().uuid();
const documentKeySchema = z.string().trim().min(1).max(64);

const listIssuesSchema = z.object({
  companyId: companyIdOptional,
  status: z.string().optional(),
  projectId: z.string().uuid().optional(),
  assigneeAgentId: z.string().uuid().optional(),
  participantAgentId: z.string().uuid().optional(),
  assigneeUserId: z.string().optional(),
  touchedByUserId: z.string().optional(),
  inboxArchivedByUserId: z.string().optional(),
  unreadForUserId: z.string().optional(),
  labelId: z.string().uuid().optional(),
  executionWorkspaceId: z.string().uuid().optional(),
  originKind: z.string().optional(),
  originId: z.string().optional(),
  includeRoutineExecutions: z.boolean().optional(),
  q: z.string().optional(),
});

const listCommentsSchema = z.object({
  issueId: issueIdSchema,
  after: z.string().uuid().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const upsertDocumentToolSchema = z.object({
  issueId: issueIdSchema,
  key: documentKeySchema,
  title: z.string().trim().max(200).nullable().optional(),
  format: z.enum(["markdown"]).default("markdown"),
  body: z.string().max(524288),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  baseRevisionId: z.string().uuid().nullable().optional(),
});

const createIssueToolSchema = z.object({
  companyId: companyIdOptional,
}).merge(createIssueInputSchema);

const updateIssueToolSchema = z.object({
  issueId: issueIdSchema,
}).merge(updateIssueSchema);

const checkoutIssueToolSchema = z.object({
  issueId: issueIdSchema,
  agentId: agentIdOptional,
  expectedStatuses: checkoutIssueSchema.shape.expectedStatuses.optional(),
});

const addCommentToolSchema = z.object({
  issueId: issueIdSchema,
}).merge(addIssueCommentSchema);

const createSuggestTasksToolSchema = z.object({
  issueId: issueIdSchema,
  idempotencyKey: z.string().trim().max(255).nullable().optional(),
  sourceCommentId: z.string().uuid().nullable().optional(),
  sourceRunId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(240).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
  payload: suggestTasksPayloadSchema,
});

const createAskUserQuestionsToolSchema = z.object({
  issueId: issueIdSchema,
  idempotencyKey: z.string().trim().max(255).nullable().optional(),
  sourceCommentId: z.string().uuid().nullable().optional(),
  sourceRunId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(240).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("wake_assignee"),
  payload: askUserQuestionsPayloadSchema,
});

const createRequestConfirmationToolSchema = z.object({
  issueId: issueIdSchema,
  idempotencyKey: z.string().trim().max(255).nullable().optional(),
  sourceCommentId: z.string().uuid().nullable().optional(),
  sourceRunId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(240).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  continuationPolicy: issueThreadInteractionContinuationPolicySchema.optional().default("none"),
  payload: requestConfirmationPayloadSchema,
});

const approvalDecisionSchema = z.object({
  approvalId: approvalIdSchema,
  action: z.enum(["approve", "reject", "requestRevision", "resubmit"]),
  decisionNote: z.string().optional(),
  payloadJson: z.string().optional(),
});

const createApprovalToolSchema = z.object({
  companyId: companyIdOptional,
}).merge(createApprovalSchema);

const apiRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1),
  jsonBody: z.string().optional(),
});

const workspaceRuntimeControlTargetSchema = z.object({
  workspaceCommandId: z.string().min(1).optional().nullable(),
  runtimeServiceId: z.string().uuid().optional().nullable(),
  serviceIndex: z.number().int().nonnegative().optional().nullable(),
});

const issueWorkspaceRuntimeControlSchema = z.object({
  issueId: issueIdSchema,
  action: z.enum(["start", "stop", "restart"]),
}).merge(workspaceRuntimeControlTargetSchema);

const waitForIssueWorkspaceServiceSchema = z.object({
  issueId: issueIdSchema,
  runtimeServiceId: z.string().uuid().optional().nullable(),
  serviceName: z.string().min(1).optional().nullable(),
  timeoutSeconds: z.number().int().positive().max(300).optional(),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCurrentExecutionWorkspace(context: unknown): Record<string, unknown> | null {
  if (!context || typeof context !== "object") return null;
  const workspace = (context as { currentExecutionWorkspace?: unknown }).currentExecutionWorkspace;
  return workspace && typeof workspace === "object" ? workspace as Record<string, unknown> : null;
}

function readWorkspaceRuntimeServices(workspace: Record<string, unknown> | null): Array<Record<string, unknown>> {
  const raw = workspace?.runtimeServices;
  return Array.isArray(raw)
    ? raw.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function selectRuntimeService(
  services: Array<Record<string, unknown>>,
  input: { runtimeServiceId?: string | null; serviceName?: string | null },
) {
  if (input.runtimeServiceId) {
    return services.find((service) => service.id === input.runtimeServiceId) ?? null;
  }
  if (input.serviceName) {
    return services.find((service) => service.serviceName === input.serviceName) ?? null;
  }
  return services.find((service) => service.status === "running" || service.status === "starting")
    ?? services[0]
    ?? null;
}

async function getIssueWorkspaceRuntime(client: PaperclipApiClient, issueId: string) {
  const context = await client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/heartbeat-context`);
  const workspace = readCurrentExecutionWorkspace(context);
  return {
    context,
    workspace,
    runtimeServices: readWorkspaceRuntimeServices(workspace),
  };
}

export function createToolDefinitions(client: PaperclipApiClient): ToolDefinition[] {
  return [
    makeTool(
      "paperclipMe",
      "Get the current authenticated Paperclip actor details",
      z.object({}),
      async () => client.requestJson("GET", "/agents/me"),
    ),
    makeTool(
      "paperclipInboxLite",
      "Get the current authenticated agent inbox-lite assignment list",
      z.object({}),
      async () => client.requestJson("GET", "/agents/me/inbox-lite"),
    ),
    makeTool(
      "paperclipListAgents",
      "List agents in a company",
      z.object({ companyId: companyIdOptional }),
      async ({ companyId }) => client.requestJson("GET", `/companies/${client.resolveCompanyId(companyId)}/agents`),
    ),
    makeTool(
      "paperclipGetAgent",
      "Get a single agent by id",
      z.object({ agentId: z.string().min(1), companyId: companyIdOptional }),
      async ({ agentId, companyId }) => {
        const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
        return client.requestJson("GET", `/agents/${encodeURIComponent(agentId)}${qs}`);
      },
    ),
    makeTool(
      "paperclipListIssues",
      "List issues for a company with optional filters",
      listIssuesSchema,
      async (input) => {
        const companyId = client.resolveCompanyId(input.companyId);
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(input)) {
          if (key === "companyId" || value === undefined || value === null) continue;
          params.set(key, String(value));
        }
        const qs = params.toString();
        return client.requestJson("GET", `/companies/${companyId}/issues${qs ? `?${qs}` : ""}`);
      },
    ),
    makeTool(
      "paperclipGetIssue",
      "Get a single issue by UUID or identifier",
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) => client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}`),
    ),
    makeTool(
      "paperclipGetHeartbeatContext",
      "Get compact heartbeat context for an issue",
      z.object({ issueId: issueIdSchema, wakeCommentId: z.string().uuid().optional() }),
      async ({ issueId, wakeCommentId }) => {
        const qs = wakeCommentId ? `?wakeCommentId=${encodeURIComponent(wakeCommentId)}` : "";
        return client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/heartbeat-context${qs}`);
      },
    ),
    makeTool(
      "paperclipListComments",
      "List issue comments with incremental options",
      listCommentsSchema,
      async ({ issueId, after, order, limit }) => {
        const params = new URLSearchParams();
        if (after) params.set("after", after);
        if (order) params.set("order", order);
        if (limit) params.set("limit", String(limit));
        const qs = params.toString();
        return client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/comments${qs ? `?${qs}` : ""}`);
      },
    ),
    makeTool(
      "paperclipGetComment",
      "Get a specific issue comment by id",
      z.object({ issueId: issueIdSchema, commentId: z.string().uuid() }),
      async ({ issueId, commentId }) =>
        client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/comments/${encodeURIComponent(commentId)}`),
    ),
    makeTool(
      "paperclipListIssueApprovals",
      "List approvals linked to an issue",
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) => client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/approvals`),
    ),
    makeTool(
      "paperclipListDocuments",
      "List issue documents",
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) => client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/documents`),
    ),
    makeTool(
      "paperclipGetDocument",
      "Get one issue document by key",
      z.object({ issueId: issueIdSchema, key: documentKeySchema }),
      async ({ issueId, key }) =>
        client.requestJson("GET", `/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`),
    ),
    makeTool(
      "paperclipListDocumentRevisions",
      "List revisions for an issue document",
      z.object({ issueId: issueIdSchema, key: documentKeySchema }),
      async ({ issueId, key }) =>
        client.requestJson(
          "GET",
          `/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}/revisions`,
        ),
    ),
    makeTool(
      "paperclipListProjects",
      "List projects in a company",
      z.object({ companyId: companyIdOptional }),
      async ({ companyId }) => client.requestJson("GET", `/companies/${client.resolveCompanyId(companyId)}/projects`),
    ),
    makeTool(
      "paperclipGetProject",
      "Get a project by id or company-scoped short reference",
      z.object({ projectId: projectIdSchema, companyId: companyIdOptional }),
      async ({ projectId, companyId }) => {
        const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
        return client.requestJson("GET", `/projects/${encodeURIComponent(projectId)}${qs}`);
      },
    ),
    makeTool(
      "paperclipGetIssueWorkspaceRuntime",
      "Get the current execution workspace and runtime services for an issue, including service URLs",
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) => getIssueWorkspaceRuntime(client, issueId),
    ),
    makeTool(
      "paperclipControlIssueWorkspaceServices",
      "Start, stop, or restart the current issue execution workspace runtime services",
      issueWorkspaceRuntimeControlSchema,
      async ({ issueId, action, ...target }) => {
        const runtime = await getIssueWorkspaceRuntime(client, issueId);
        const workspaceId = typeof runtime.workspace?.id === "string" ? runtime.workspace.id : null;
        if (!workspaceId) {
          throw new Error("Issue has no current execution workspace");
        }
        return client.requestJson(
          "POST",
          `/execution-workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`,
          { body: target },
        );
      },
    ),
    makeTool(
      "paperclipWaitForIssueWorkspaceService",
      "Wait until an issue execution workspace runtime service is running and has a URL when one is exposed",
      waitForIssueWorkspaceServiceSchema,
      async ({ issueId, runtimeServiceId, serviceName, timeoutSeconds }) => {
        const deadline = Date.now() + (timeoutSeconds ?? 60) * 1000;
        let latest: Awaited<ReturnType<typeof getIssueWorkspaceRuntime>> | null = null;
        while (Date.now() <= deadline) {
          latest = await getIssueWorkspaceRuntime(client, issueId);
          const service = selectRuntimeService(latest.runtimeServices, { runtimeServiceId, serviceName });
          if (service?.status === "running" && service.healthStatus !== "unhealthy") {
            return {
              workspace: latest.workspace,
              service,
            };
          }
          await sleep(1000);
        }

        return {
          timedOut: true,
          latestWorkspace: latest?.workspace ?? null,
          latestRuntimeServices: latest?.runtimeServices ?? [],
        };
      },
    ),
    makeTool(
      "paperclipListGoals",
      "List goals in a company",
      z.object({ companyId: companyIdOptional }),
      async ({ companyId }) => client.requestJson("GET", `/companies/${client.resolveCompanyId(companyId)}/goals`),
    ),
    makeTool(
      "paperclipGetGoal",
      "Get a goal by id",
      z.object({ goalId: goalIdSchema }),
      async ({ goalId }) => client.requestJson("GET", `/goals/${encodeURIComponent(goalId)}`),
    ),
    makeTool(
      "paperclipListApprovals",
      "List approvals in a company",
      z.object({ companyId: companyIdOptional, status: z.string().optional() }),
      async ({ companyId, status }) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : "";
        return client.requestJson("GET", `/companies/${client.resolveCompanyId(companyId)}/approvals${qs}`);
      },
    ),
    makeTool(
      "paperclipCreateApproval",
      "Create a board approval request, optionally linked to one or more issues",
      createApprovalToolSchema,
      async ({ companyId, ...body }) =>
        client.requestJson("POST", `/companies/${client.resolveCompanyId(companyId)}/approvals`, {
          body,
        }),
    ),
    makeTool(
      "paperclipGetApproval",
      "Get an approval by id",
      z.object({ approvalId: approvalIdSchema }),
      async ({ approvalId }) => client.requestJson("GET", `/approvals/${encodeURIComponent(approvalId)}`),
    ),
    makeTool(
      "paperclipGetApprovalIssues",
      "List issues linked to an approval",
      z.object({ approvalId: approvalIdSchema }),
      async ({ approvalId }) => client.requestJson("GET", `/approvals/${encodeURIComponent(approvalId)}/issues`),
    ),
    makeTool(
      "paperclipListApprovalComments",
      "List comments for an approval",
      z.object({ approvalId: approvalIdSchema }),
      async ({ approvalId }) => client.requestJson("GET", `/approvals/${encodeURIComponent(approvalId)}/comments`),
    ),
    makeTool(
      "paperclipCreateIssue",
      "Create a new issue",
      createIssueToolSchema,
      async ({ companyId, ...body }) =>
        client.requestJson("POST", `/companies/${client.resolveCompanyId(companyId)}/issues`, { body }),
    ),
    makeTool(
      "paperclipUpdateIssue",
      "Patch an issue, optionally including a comment; include resume=true when intentionally requesting follow-up on resumable closed work",
      updateIssueToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson("PATCH", `/issues/${encodeURIComponent(issueId)}`, { body }),
    ),
    makeTool(
      "paperclipCheckoutIssue",
      "Checkout an issue for an agent",
      checkoutIssueToolSchema,
      async ({ issueId, agentId, expectedStatuses }) =>
        client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/checkout`, {
          body: {
            agentId: client.resolveAgentId(agentId),
            expectedStatuses: expectedStatuses ?? ["todo", "backlog", "blocked"],
          },
        }),
    ),
    makeTool(
      "paperclipReleaseIssue",
      "Release an issue checkout",
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) => client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/release`, { body: {} }),
    ),
    makeTool(
      "paperclipAddComment",
      "Add a comment to an issue; include resume=true when intentionally requesting follow-up on resumable closed work",
      addCommentToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/comments`, { body }),
    ),
    makeTool(
      "paperclipSuggestTasks",
      "Create a suggest_tasks interaction on an issue",
      createSuggestTasksToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/interactions`, {
          body: {
            kind: "suggest_tasks",
            ...body,
          },
        }),
    ),
    makeTool(
      "paperclipAskUserQuestions",
      "Create an ask_user_questions interaction on an issue",
      createAskUserQuestionsToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/interactions`, {
          body: {
            kind: "ask_user_questions",
            ...body,
          },
        }),
    ),
    makeTool(
      "paperclipRequestConfirmation",
      "Create a request_confirmation interaction on an issue",
      createRequestConfirmationToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/interactions`, {
          body: {
            kind: "request_confirmation",
            ...body,
          },
        }),
    ),
    makeTool(
      "paperclipUpsertIssueDocument",
      "Create or update an issue document",
      upsertDocumentToolSchema,
      async ({ issueId, key, ...body }) =>
        client.requestJson(
          "PUT",
          `/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`,
          { body },
        ),
    ),
    makeTool(
      "paperclipRestoreIssueDocumentRevision",
      "Restore a prior revision of an issue document",
      z.object({
        issueId: issueIdSchema,
        key: documentKeySchema,
        revisionId: z.string().uuid(),
      }),
      async ({ issueId, key, revisionId }) =>
        client.requestJson(
          "POST",
          `/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}/revisions/${encodeURIComponent(revisionId)}/restore`,
          { body: {} },
        ),
    ),
    makeTool(
      "paperclipLinkIssueApproval",
      "Link an approval to an issue",
      z.object({ issueId: issueIdSchema }).merge(linkIssueApprovalSchema),
      async ({ issueId, approvalId }) =>
        client.requestJson("POST", `/issues/${encodeURIComponent(issueId)}/approvals`, {
          body: { approvalId },
        }),
    ),
    makeTool(
      "paperclipUnlinkIssueApproval",
      "Unlink an approval from an issue",
      z.object({ issueId: issueIdSchema, approvalId: approvalIdSchema }),
      async ({ issueId, approvalId }) =>
        client.requestJson(
          "DELETE",
          `/issues/${encodeURIComponent(issueId)}/approvals/${encodeURIComponent(approvalId)}`,
        ),
    ),
    makeTool(
      "paperclipApprovalDecision",
      "Approve, reject, request revision, or resubmit an approval",
      approvalDecisionSchema,
      async ({ approvalId, action, decisionNote, payloadJson }) => {
        const path =
          action === "approve"
            ? `/approvals/${encodeURIComponent(approvalId)}/approve`
            : action === "reject"
              ? `/approvals/${encodeURIComponent(approvalId)}/reject`
              : action === "requestRevision"
                ? `/approvals/${encodeURIComponent(approvalId)}/request-revision`
                : `/approvals/${encodeURIComponent(approvalId)}/resubmit`;

        const body =
          action === "resubmit"
            ? { payload: parseOptionalJson(payloadJson) ?? {} }
            : { decisionNote };

        return client.requestJson("POST", path, { body });
      },
    ),
    makeTool(
      "paperclipAddApprovalComment",
      "Add a comment to an approval",
      z.object({ approvalId: approvalIdSchema, body: z.string().min(1) }),
      async ({ approvalId, body }) =>
        client.requestJson("POST", `/approvals/${encodeURIComponent(approvalId)}/comments`, {
          body: { body },
        }),
    ),
    makeTool(
      "paperclipApiRequest",
      "Make a JSON request to an existing Paperclip /api endpoint for unsupported operations",
      apiRequestSchema,
      async ({ method, path, jsonBody }) => {
        if (!path.startsWith("/") || path.includes("..")) {
          throw new Error("path must start with / and be relative to /api, and must not contain '..'");
        }
        return client.requestJson(method, path, {
          body: parseOptionalJson(jsonBody),
        });
      },
    ),
    // ── LMTM client-data + self-learning tools ──────────────────────────────
    // First-class wrappers over the in-process agent-tools executor
    // (POST /agent-tools/execute {tool, parameters}). Exposing them as native
    // MCP tools (instead of making the model hand-craft paperclipApiRequest
    // calls) stops the model from fumbling/looping on guessed endpoints.
    makeTool(
      "lmtmGuiaContenido",
      "EMPEZÁ ACÁ para cualquier pieza de un cliente: «quiero un video / reel / historia / placa / carrusel de X de tal cliente». En UNA llamada trae la identidad de marca (mensaje, público, diferencial, tono, frases propias, paleta, logo), lo que se sabe del producto pedido, la memoria del cliente, lo que mejor le funcionó, el MATERIAL REAL de Drive (videos, fotos, logos, documentos, con link de descarga que vence en 24 h), su web (páginas, videos e imágenes) y la receta para producirla. Acepta el nombre del cliente aunque sea parcial («Ferrol»): no hace falta llamar antes a lmtmListClients ni a lmtmGetClientBrain. Solo lectura, no gasta créditos.",
      z.object({
        cliente: z.string().min(1).describe("Nombre del cliente (aunque sea parcial) o su id."),
        producto: z.string().optional().describe("Producto, servicio o tema de la pieza («departamento de 2 habitaciones», «promo invierno»)."),
        formato: z.enum(["reel", "video", "historia", "placa", "carrusel"]).optional().describe("Default reel."),
        refrescar: z.boolean().optional().describe("Rehacer el índice de Drive y la lectura de la web (tarda más). Solo si falta algo que se subió hoy."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_guia_contenido", parameters: p } }),
    ),
    makeTool(
      "lmtmListClients",
      "Lista los clientes activos de la agencia (id, nombre, slug). Usalo para encontrar el clientId de un cliente por su nombre antes de pedir sus datos.",
      z.object({}),
      async () => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "list_clients", parameters: {} } }),
    ),
    makeTool(
      "lmtmGetClientBrain",
      "Memoria viva del cliente (Customer Brain): contexto, Enfoque Técnico, aprendizajes previos. Leelo ANTES de trabajar un cliente.",
      z.object({ clientId: z.string().min(1) }),
      async ({ clientId }) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_client_brain", parameters: { clientId } } }),
    ),
    makeTool(
      "lmtmGetClientAdsPerformance",
      "Métricas REALES de Meta Ads del cliente (spend, impresiones, clicks, leads, CTR, CPL, CPC) para los últimos N días. No inventes datos.",
      z.object({ clientId: z.string().min(1), sinceDays: z.number().int().positive().max(365).optional() }),
      async ({ clientId, sinceDays }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_client_ads_performance", parameters: { clientId, ...(sinceDays ? { sinceDays } : {}) } },
        }),
    ),
    makeTool(
      "lmtmGetClientCampaigns",
      "Pauta del cliente CAMPAÑA POR CAMPAÑA (y conjunto por conjunto en Meta): id, estado, fecha de fin, presupuesto diario, gasto, leads, CPL, días con gasto. Es la que da los ids para proponer pausar o mover presupuesto. Trae el objetivo de CPL del cliente.",
      z.object({ clientId: z.string().min(1), sinceDays: z.number().int().positive().max(90).optional() }),
      async ({ clientId, sinceDays }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_client_campaigns", parameters: { clientId, ...(sinceDays ? { sinceDays } : {}) } },
        }),
    ),
    makeTool(
      "lmtmSql",
      "LEER TODO: consulta SQL de solo lectura sobre la base de LMTM-OS (Postgres). Corre con el rol de solo lectura (no ve tokens ni secretos), 20 s de tope, hasta 500 filas. Para escribir usá las otras herramientas o paperclipApiRequest, nunca SQL. Solo admin del tablero.",
      z.object({ sql: z.string().min(1).describe("Una sola sentencia SELECT/WITH.") }),
      async ({ sql }) => client.requestJson("POST", "/lectura/sql", { body: { sql } }),
    ),
    makeTool(
      "lmtmEscribirInforme",
      "Escribe el INFORME SEMANAL de un cliente (lo que ve el cliente en su link, después de que una persona lo publique). SIN NÚMEROS: usá marcadores que el servidor completa con las métricas de la semana: {cpl} {objetivo} {leads} {inversion} {ventas} {costoPorVenta} {variacionCpl} {variacionLeads} {cplAnterior} {leadsAnterior} {inversionAnterior} {desde} {hasta}. El resumen tiene que decir {cpl} y compararlo con {objetivo}, y `proximos` no puede ir vacío. La respuesta trae la auditoría (ok / fallas): si falla, corregí y volvé a llamar UNA vez. No publica nada.",
      z.object({
        clientId: z.string().min(1),
        semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Lunes de la semana (YYYY-MM-DD). Sin esto, la última semana completa."),
        narrativa: z.object({
          resumen: z.string().min(1).describe("Dos o tres frases, hasta 600 caracteres, con {cpl} y {objetivo}."),
          hicimos: z.array(z.string()),
          aprendimos: z.array(z.string()),
          proximos: z.array(z.string()).min(1),
          pedidos: z.array(z.string()).describe("Lo que necesitamos del cliente. Vacío si no hay nada."),
        }),
      }),
      async ({ clientId, semana, narrativa }) =>
        client.requestJson("POST", "/informes", { body: { clientId, ...(semana ? { semana } : {}), narrativa } }),
    ),
    makeTool(
      "lmtmGetClientCompetitors",
      "Lista los competidores cargados del cliente.",
      z.object({ clientId: z.string().min(1) }),
      async ({ clientId }) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_client_competitors", parameters: { clientId } } }),
    ),
    makeTool(
      "lmtmGetClientScores",
      "Último score de Salud de cuenta (ads) y Operativo (cumplimiento) del cliente, 0-100.",
      z.object({ clientId: z.string().min(1) }),
      async ({ clientId }) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_client_scores", parameters: { clientId } } }),
    ),
    makeTool(
      "lmtmPortfolioSnapshot",
      "Foto AGREGADA de toda la agencia (últimos 7 días): clientes activos, spend y leads totales, cuántos tienen datos y cuántos tienen alertas abiertas. Usalo ANTES de escalar un problema para saber si es sistémico (toda la cartera) o solo de tu cliente — evita falsos outages.",
      z.object({}),
      async () =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "portfolio_snapshot", parameters: {} } }),
    ),
    makeTool(
      "lmtmRememberAboutClient",
      "Guarda un aprendizaje DURABLE en la memoria del cliente (autoaprendizaje). Usalo cuando descubrís algo útil: ángulo/creatividad que funciona, preferencia, riesgo, decisión, resultado clave. No guardes ruido.",
      z.object({
        clientId: z.string().min(1),
        key: z.string().min(1),
        content: z.string().min(1),
        kind: z.enum(["fact", "preference", "decision", "event", "performance", "context", "risk"]).optional(),
      }),
      async ({ clientId, key, content, kind }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "remember_about_client", parameters: { clientId, key, content, ...(kind ? { kind } : {}) } },
        }),
    ),
    makeTool(
      "lmtmSaveHook",
      "Guarda un GANCHO en el Baúl de Ganchos: una apertura/primera línea probada que vale reusar (de un post propio top, un reel de competidor con sus views, una tendencia, o manual). Con clientId va al baúl del cliente; sin clientId queda global para el nicho.",
      z.object({
        text: z.string().min(1).describe("El gancho textual (1-2 frases)"),
        clientId: z.string().optional(),
        niche: z.string().optional(),
        sourceKind: z.enum(["manual", "organico", "competidor", "tendencia"]).optional(),
        sourceRef: z.string().optional().describe("@creador, URL del reel/post, etc."),
        format: z.string().optional().describe("reel | carrusel | story | estatico"),
        views: z.number().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "save_hook", parameters: p } }),
    ),
    makeTool(
      "lmtmSearchHooks",
      "Busca en el Baúl de Ganchos (por cliente y/o nicho y/o texto); devuelve los mejores primero. Usalo ANTES de escribir un guion/copy para arrancar de un gancho probado.",
      z.object({
        clientId: z.string().optional(),
        niche: z.string().optional(),
        q: z.string().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "search_hooks", parameters: p } }),
    ),
    makeTool(
      "lmtmGetClientVideoTasks",
      "Tareas abiertas de 'Producción de video' del cliente (ClickUp) con flag tieneGuion. Las que no tienen guion, escribíselo: comentario en la tarea (clickup add_comment) + deliverable.",
      z.object({ clientId: z.string().min(1) }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_client_video_tasks", parameters: p } }),
    ),
    makeTool(
      "lmtmListLicitaciones",
      "Licitaciones de Mercado Público (ChileCompra) del panel. estado: candidata (a revisar) | util | descartada | vencida.",
      z.object({ estado: z.string().optional() }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "list_licitaciones", parameters: p } }),
    ),
    makeTool(
      "lmtmSetLicitacionEstado",
      "Cura una licitación: util (relevancia OBLIGATORIA: por qué nos sirve y qué ofertaríamos) o descartada.",
      z.object({ codigo: z.string().min(1), estado: z.enum(["util", "descartada"]), relevancia: z.string().optional() }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "set_licitacion_estado", parameters: p } }),
    ),
    makeTool(
      "lmtmGetClientMarketingPlan",
      "Plan de Marketing del cliente en ClickUp (reuniones, planificaciones y estrategia que cargó el equipo). Fuente de 'qué se decidió con el cliente' — usalo antes de proponer estrategia o contenido para alinear con lo acordado.",
      z.object({
        clientId: z.string().min(1),
        limit: z.number().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_client_marketing_plan", parameters: p } }),
    ),
    makeTool(
      "lmtmSaveNicheReport",
      "Guarda el RADAR DE NICHO semanal (informe accionable del panel de Nichos): analisisCruzado {organico, pauta} de NUESTROS clientes del rubro, referentes EXTERNOS tendencia (con urlPerfil/urlEjemplo reales), ideas con titulo+detalle+url de referencia (link OBLIGATORIO si salió de redes), y planPorCliente con movidas concretas. Upsert por rubro+semana.",
      z.object({
        niche: z.string().min(1),
        analisisCruzado: z.object({ organico: z.string().optional(), pauta: z.string().optional() }).optional(),
        referentes: z.array(z.object({
          nombre: z.string(), cuenta: z.string().optional(), plataforma: z.string().optional(),
          ubicacion: z.string().optional(), queHacen: z.string().optional(),
          urlPerfil: z.string().optional(), urlEjemplo: z.string().optional(),
        })).optional(),
        ideas: z.array(z.object({
          titulo: z.string(), detalle: z.string().optional(), url: z.string().optional(), fuente: z.string().optional(),
        })).optional(),
        planPorCliente: z.array(z.object({
          cliente: z.string(), clientId: z.string().optional(), movidas: z.array(z.string()),
        })).optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "save_niche_report", parameters: p } }),
    ),
    makeTool(
      "lmtmAddClientCompetitor",
      "Carga un COMPETIDOR del cliente: negocio REAL y EXTERNO del mismo rubro/zona (NUNCA otro cliente de la agencia — se rechaza). Al menos una fuente verificable: igHandle, fbPageUrl o website. Dedupe por nombre.",
      z.object({
        clientId: z.string(),
        name: z.string().min(1),
        igHandle: z.string().optional(),
        fbPageUrl: z.string().optional(),
        website: z.string().optional(),
        notes: z.string().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "add_client_competitor", parameters: p } }),
    ),
    makeTool(
      "lmtmSaveTrend",
      "Guarda una TENDENCIA en el panel: noticia/novedad externa con potencial de contenido. Tag honesto: potencial-de-gancho | explicativo | ignorar. Indicá los nichos a los que sirve.",
      z.object({
        title: z.string().min(1),
        url: z.string().optional(),
        source: z.string().optional(),
        tag: z.enum(["potencial-de-gancho", "explicativo", "ignorar"]).optional(),
        niches: z.array(z.string()).optional(),
        summary: z.string().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "save_trend", parameters: p } }),
    ),
    makeTool(
      "lmtmSaveDeliverable",
      "Guardá un ENTREGABLE terminado (copy final, spec de campaña, reporte, investigación, plan) como artefacto reutilizable ligado al issue/cliente — no un comentario. Usalo cuando termines algo concreto.",
      z.object({
        kind: z.enum(["copy", "campaign_spec", "report", "research", "plan", "other"]),
        title: z.string().min(1),
        content: z.string().min(1).describe("El entregable completo en markdown, autocontenido"),
        issueId: z.string().optional(),
        clientId: z.string().optional(),
        url: z.string().optional(),
      }),
      async ({ kind, title, content, issueId, clientId, url }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "save_deliverable", parameters: { kind, title, content, ...(issueId ? { issueId } : {}), ...(clientId ? { clientId } : {}), ...(url ? { url } : {}) } },
        }),
    ),
    makeTool(
      "lmtmListDeliverables",
      "Lista entregables guardados (por cliente o issue) para reutilizar trabajo hecho en vez de rehacerlo.",
      z.object({ clientId: z.string().optional(), issueId: z.string().optional() }),
      async ({ clientId, issueId }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "list_deliverables", parameters: { ...(clientId ? { clientId } : {}), ...(issueId ? { issueId } : {}) } },
        }),
    ),
    makeTool(
      "lmtmCrmRequest",
      "Operar el CRM PROPIO de LMTM (FastAPI, crm.lmtmas.com) vía su API. El server maneja login/token; pasás method + path (relativo a /api) + body. GET y dry-runs libres; escrituras requieren OK humano (approved=true solo tras aprobación explícita en el issue); DELETE/envío de mensajes/cambios de plan/credenciales prohibidos. Leé la skill lmtm-crm-propio.",
      z.object({
        method: z.enum(["GET", "POST", "PUT"]),
        path: z.string().min(1).describe("Path relativo a /api (ej. '/users/', '/pipeline/board')"),
        body: z.record(z.unknown()).optional(),
        approved: z.boolean().optional().describe("true SOLO si un humano ya aprobó la escritura"),
      }),
      async ({ method, path, body, approved }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "crm_request", parameters: { method, path, ...(body ? { body } : {}), ...(approved ? { approved } : {}) } },
        }),
    ),
    makeTool(
      "lmtmGetAgentCards",
      "TARJETAS del equipo de agentes: quién es cada uno, qué sabe hacer, cuándo derivarle trabajo y su carga actual de issues. Consultalo ANTES de delegar con lmtmDelegateToAgent para elegir al especialista correcto.",
      z.object({}),
      async () =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_agent_cards", parameters: {} },
        }),
    ),
    makeTool(
      "lmtmDelegateToAgent",
      "DELEGA trabajo a otro agente del equipo: crea un issue asignado a él con tu contexto. Usalo cuando detectás algo que NO es de tu especialidad (ej. detectaste un problema de pauta y sos de contenido → delegar a Milo). Mirá primero lmtmGetAgentCards. No te autodelegues ni delegues lo que podés resolver vos.",
      z.object({
        agentName: z.string().min(1).describe("Nombre del agente destino (ej. 'Milo', 'Caro', 'Esteban')"),
        title: z.string().min(1).describe("Título corto y accionable de la tarea"),
        description: z.string().min(1).describe("Contexto completo: qué detectaste, dónde, qué esperás que haga"),
        clientId: z.string().optional().describe("UUID del cliente si aplica"),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        issueId: z.string().optional().describe("Tu issue de origen, para dejar registro de la derivación"),
      }),
      async ({ agentName, title, description, clientId, priority, issueId }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: {
            tool: "delegate_to_agent",
            parameters: {
              agentName, title, description,
              ...(clientId ? { clientId } : {}),
              ...(priority ? { priority } : {}),
              ...(issueId ? { issueId } : {}),
            },
          },
        }),
    ),
    makeTool(
      "lmtmGetTeamStatus",
      "Qué está haciendo AHORA el resto del equipo: issues en progreso/review por agente (24h). Consultalo antes de arrancar un trabajo grande para no duplicar lo que otro ya hace, o para saber a quién mencionar. Opcional 'clientId'.",
      z.object({ clientId: z.string().optional() }),
      async ({ clientId }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_team_status", parameters: { ...(clientId ? { clientId } : {}) } },
        }),
    ),
    makeTool(
      "lmtmPauseAdEntity",
      "PAUSAR una campaña o adset de un cliente. Para gasto sin conversiones, CTR muy bajo o aviso quemando presupuesto. MUEVE plata: mandá siempre 'justificacion' con los números; el server deja la propuesta armada y una persona la aprueba con un click (no hace falta que vuelvas a llamar la tool). Verifica que la entidad sea de ESE cliente. Para MOVER presupuesto usá lmtmSetBudget o lmtmShiftBudget.",
      z.object({
        clientId: z.string().min(1),
        entityType: z.enum(["campaign", "adset"]),
        entityId: z.string().min(1),
        justificacion: z.string().optional().describe("Los números que la sostienen. Sin esto no se arma la propuesta."),
        approved: z.boolean().optional().describe("true SOLO tras aprobación humana explícita en el issue"),
      }),
      async ({ clientId, entityType, entityId, justificacion, approved }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "pause_ad_entity", parameters: { clientId, entityType, entityId, ...(justificacion ? { justificacion } : {}), ...(approved ? { approved } : {}) } },
        }),
    ),
    makeTool(
      "lmtmSetBudget",
      "SUBIR o BAJAR el presupuesto diario de una campaña (Meta y Google) o conjunto (solo Meta). Es la palanca para EMPUJAR lo que rinde, no sólo frenar lo que no. El monto va EN PESOS; el server convierte a la unidad de cada plataforma. Límites que aplica el server: máximo 30% de cambio por vez, una vez cada 24h por entidad, nunca por debajo de $1.000 (para apagar, usá lmtmPauseAdEntity). MUEVE plata: mandá 'justificacion' y el server deja la propuesta lista para aprobar con un click.",
      z.object({
        clientId: z.string().min(1),
        entityType: z.enum(["campaign", "adset"]),
        entityId: z.string().min(1),
        nuevoDiario: z.number().positive().describe("Nuevo diario EN PESOS (no centavos ni micros)"),
        justificacion: z.string().optional().describe("CPL, leads y gasto que justifican el cambio"),
        approved: z.boolean().optional(),
        ensayo: z.boolean().optional().describe("Valida contra la plataforma sin guardar"),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "set_budget", parameters: p },
        }),
    ),
    makeTool(
      "lmtmShiftBudget",
      "MOVER presupuesto diario entre dos entidades del MISMO cliente: baja una y sube la otra por el mismo monto, en pesos. Es lo que corresponde cuando el gasto total no puede cambiar pero está mal repartido (un conjunto con CPL muy arriba del rubro y otro muy abajo). Valida las dos patas ANTES de escribir ninguna, y baja primero para que un fallo deje al cliente gastando de menos y no de más.",
      z.object({
        clientId: z.string().min(1),
        desdeEntityType: z.enum(["campaign", "adset"]).optional(),
        desdeEntityId: z.string().min(1).describe("De dónde se saca"),
        haciaEntityType: z.enum(["campaign", "adset"]).optional(),
        haciaEntityId: z.string().min(1).describe("A dónde va"),
        monto: z.number().positive().describe("Cuánto mover por día, EN PESOS"),
        justificacion: z.string().optional(),
        approved: z.boolean().optional(),
        ensayo: z.boolean().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "shift_budget", parameters: p },
        }),
    ),
    makeTool(
      "lmtmDuplicateWinner",
      "DUPLICAR un conjunto de Meta que viene rindiendo, para escalarlo sin tocar el original. La copia NACE PAUSADA y con el MISMO presupuesto: arrancarla es una decisión humana aparte. El server verifica que de verdad sea un ganador antes de copiar (al menos 5 leads en 30 días y CPL igual o mejor que el promedio del RESTO de la cuenta del cliente); si no lo cumple te dice por qué y no copia. Una copia por conjunto por día, sólo Meta. A diferencia de las otras palancas, ésta NUNCA se ejecuta sola: crea algo que gasta, y lo creado no se deshace, se borra.",
      z.object({
        clientId: z.string().min(1),
        adsetId: z.string().min(1).describe("ID del conjunto de Meta a duplicar"),
        justificacion: z.string().optional().describe("Leads y CPL del conjunto contra el resto de la cuenta"),
        approved: z.boolean().optional(),
      }),
      async (p) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "duplicate_winner", parameters: p },
        }),
    ),
    makeTool(
      "lmtmGetNicheIntel",
      "Inteligencia del NICHO/rubro: benchmark CTR/CPL (promedio vs ideal), formato ganador, experimento sugerido, mejor contenido y competidores de todos los clientes del rubro. Para comparar a tu cliente contra pares y generalizar lo que mejor funciona. Sin 'niche' devuelve el resumen de todos los nichos.",
      z.object({ niche: z.string().optional() }),
      async ({ niche }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_niche_intel", parameters: { ...(niche ? { niche } : {}) } },
        }),
    ),
    makeTool(
      "lmtmRememberTeamLesson",
      "Guarda una LECCIÓN DE EQUIPO (no de un cliente): limitación del sistema, patrón operativo, error que otros agentes no deberían repetir. Visible para TODOS. Ej: 'el guard de permisos no deja reasignar issues — pedirlo a un humano'.",
      z.object({
        area: z.string().min(1).describe("Área corta (ej. 'harness', 'escalation', 'clickup', 'meta', 'whatsapp')"),
        lesson: z.string().min(1).describe("La lección, autocontenida (1-3 frases), útil para un colega que no vivió el problema"),
      }),
      async ({ area, lesson }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "remember_team_lesson", parameters: { area, lesson } },
        }),
    ),
    makeTool(
      "lmtmGetTeamLessons",
      "Lecciones de equipo acumuladas (limitaciones del sistema, patrones operativos, errores conocidos). Consultalo ANTES de diagnosticar problemas del sistema, escalar outages, o reintentar algo que quizás otro agente ya descubrió que no funciona.",
      z.object({ area: z.string().optional() }),
      async ({ area }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_team_lessons", parameters: { ...(area ? { area } : {}) } },
        }),
    ),
    makeTool(
      "lmtmGetClientBalance",
      "Saldo REAL de las cuentas de Meta Ads del cliente: spend cap, gastado y lo que queda antes del tope. Para detectar cuentas por frenarse por falta de presupuesto.",
      z.object({ clientId: z.string().min(1) }),
      async ({ clientId }) =>
        client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_client_balance", parameters: { clientId } } }),
    ),
    makeTool(
      "lmtmGetClientOrganicPosts",
      "Publicaciones orgánicas REALES (Instagram + Facebook) del cliente en las últimas N horas: texto, fecha, permalink, plataforma, tipo. Para verificar si lo que se debía postear realmente salió.",
      z.object({ clientId: z.string().min(1), sinceHours: z.number().int().positive().max(24 * 90).optional() }),
      async ({ clientId, sinceHours }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_client_organic_posts", parameters: { clientId, ...(sinceHours ? { sinceHours } : {}) } },
        }),
    ),
    makeTool(
      "lmtmGetCadenaPublicacion",
      "Estado de la cadena de publicación de TODA la agencia medido por EFECTO real (destino en Make, despacho que Make escribió, posts que devolvió la red), no por etiquetas ni por corridas en verde. Devuelve por cliente el PRIMER eslabón roto y un detalle con qué hacer y dónde: sin_destino (lo que se le programe no va a ningún lado), destino_sin_escenario (tiene la fila cargada en el datastore pero no hay escenario activo detrás y nunca despachó: la fila sola no publica, hay que crear o encender el escenario), sin_calendario, contenido_incompleto (tiene fechas pero ningún post pasa las compuertas), despachador_mudo (venía despachando y dejó de hacerlo hace días), despacho_sin_registro (NUNCA hubo un despacho: puede ser un alta nueva que todavía no llegó a su fecha o un escenario que nunca se conectó — no afirmes que está caído), sync_ciego (no estamos viendo su red, hay que arreglar el sync antes de concluir nada) o red_muda (Make dice que publicó y no está). Usala para la revisión de publicación en vez de la etiqueta 'mandado a make', que no prueba que se haya publicado.",
      z.object({}),
      async () => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_cadena_publicacion", parameters: {} } }),
    ),
    makeTool(
      "lmtmGetClientScheduledContent",
      "Contenido PROGRAMADO del cliente (lista de Redes Sociales de ClickUp): qué se planeó publicar, cuándo, estado y si está marcado como enviado a Make. OJO: 'enviado' NO prueba que se publicó — la etiqueta la pone ClickUp antes de que Make actúe. Para saber si salió de verdad, lmtmGetCadenaPublicacion o lmtmGetClientOrganicPosts.",
      z.object({
        clientId: z.string().min(1),
        sinceHours: z.number().int().positive().optional(),
        aheadHours: z.number().int().positive().optional(),
      }),
      async ({ clientId, sinceHours, aheadHours }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_client_scheduled_content", parameters: { clientId, ...(sinceHours ? { sinceHours } : {}), ...(aheadHours ? { aheadHours } : {}) } },
        }),
    ),
    makeTool(
      "lmtmGetClientContentMatrix",
      "MATRIZ PROFUNDA de contenido del cliente (base de la auditoría de perfil): mix real de formatos + posts/semana, señal de falta de creatividad (aperturas de copy repetidas, formato dominante), matriz planificada formato×objetivo con huecos y atrasos reales, y tendencias recientes del nicho. Combinala con lmtmGetNicheIntel y la navegación del perfil público.",
      z.object({
        clientId: z.string().min(1),
        days: z.number().int().positive().optional().describe("Ventana de orgánico hacia atrás (default 60)"),
      }),
      async ({ clientId, days }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "get_client_content_matrix", parameters: { clientId, ...(days ? { days } : {}) } },
        }),
    ),
    makeTool(
      "lmtmSendBalanceAlert",
      "Envía una alerta de saldo bajo por WhatsApp al equipo. Usalo SIEMPRE para alertas de saldo/presupuesto/spend_cap. NUNCA crees issues para saldo — van por WhatsApp con esta tool.",
      z.object({
        clientId: z.string().min(1),
        message: z.string().min(1).describe("Mensaje de la alerta (ej. 'MAERS: spend_cap agotado, pauta frenada')"),
      }),
      async ({ clientId, message }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "send_balance_alert", parameters: { clientId, message } },
        }),
    ),
    makeTool(
      "lmtmSendWhatsappReport",
      "Envía un reporte/mensaje por WhatsApp al equipo de la agencia. Usalo cuando te piden reportar/avisar algo por WhatsApp (resumen, estado, hallazgo). Para alertas de saldo usá lmtmSendBalanceAlert.",
      z.object({
        message: z.string().min(1).describe("Texto del reporte (markdown de WhatsApp)"),
        title: z.string().optional().describe("Título opcional para encabezar el reporte"),
      }),
      async ({ message, title }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "send_whatsapp_report", parameters: { message, ...(title ? { title } : {}) } },
        }),
    ),
    makeTool(
      "lmtmCreateClientTask",
      "Crea una tarea (issue) asociada a un cliente cuando detectás un pendiente real (ej. surgió en un grupo de WhatsApp). NO uses esto para alertas de saldo — esas van por WhatsApp con lmtmSendBalanceAlert. taskType 'internal' (operativa) se crea activa; 'external' (implica al cliente o gasto) queda para aprobar. No dupliques tareas ya abiertas.",
      z.object({
        clientId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        taskType: z.enum(["internal", "external"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        source: z.string().optional(),
      }),
      async ({ clientId, title, description, taskType, priority, source }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: {
            tool: "create_client_task",
            parameters: {
              clientId,
              title,
              ...(description ? { description } : {}),
              ...(taskType ? { taskType } : {}),
              ...(priority ? { priority } : {}),
              ...(source ? { source } : {}),
            },
          },
        }),
    ),
    // ── Contenido generado (Higgsfield / Magnific) y el resto de las ─────────
    // herramientas de los agentes, para Claude por el conector (pedido 11/10).
    makeTool(
      "lmtmGenerarContenido",
      "GENERA un video o una imagen para un cliente con Higgsfield (plan de la agencia; si no alcanza, su API) o Magnific, lo GUARDA en el Drive de Super Redes del cliente (carpeta VIDEOS o PLACAS) y lo registra en Contenido generado con lo que gastó. GASTA CRÉDITOS: confirmá con la persona antes de llamarla y no la repitas para 'probar'. El prompt va en INGLÉS, describiendo sujeto + lugar + luz + movimiento de cámara + estilo; sin marcas, logos ni texto en pantalla (los modelos escriben con faltas: el texto lo monta diseño). Video: vertical 9:16 de ~8 s. Imagen: 'placa' (3:4, feed) o 'vertical' (9:16, historia). Leé antes lmtmGetClientBrain para respetar la marca. Si la pieza ya existe como tarea de ClickUp, usá lmtmGenerarPieza.",
      z.object({
        clientId: z.string().min(1),
        tipo: z.enum(["video", "imagen"]),
        prompt: z.string().min(10).max(1500).describe("En inglés."),
        titulo: z.string().optional().describe("Nombre del archivo en Drive (en castellano está bien)."),
        imagenUrl: z.string().optional().describe("Solo video: imagen pública de partida (la pieza del diseñador) para que respete la identidad de la marca."),
        formato: z.enum(["placa", "vertical"]).optional().describe("Solo imagen. Default placa."),
        herramienta: z.enum(["auto", "magnific"]).optional().describe("Solo imagen. 'magnific' fuerza Magnific; default auto (Higgsfield plan → API → Magnific)."),
      }),
      async (p) => client.requestJson("POST", "/contenido/generar-libre", { body: { ...p, origen: "claude" } }),
    ),
    // Productor de contenido (28/10): lo que necesita una clave o el servicio de render.
    // La composición la escribe el agente con HyperFrames; ver la skill lmtm-video.
    makeTool(
      "lmtmVideoVoz",
      "VOZ EN OFF en español rioplatense: Gemini (voz Sulafat, la de los reels aprobados) si está configurado; si no, OpenAI. Una frase por llamada; guarda un .wav bajo /tmp/videos/ y devuelve su duración. Usá el MISMO estilo en todas las frases. Después sacale los tiempos con lmtmVideoTranscribir.",
      z.object({
        texto: z.string().min(1).max(600),
        archivo: z.string().min(1).describe("Ruta .wav bajo /tmp/videos/."),
        estilo: z.string().optional().describe("Cómo suena, adaptado al cliente («mujer argentina con acento rioplatense, cálida, como una asesora que recomienda a una amiga, sin tono de locutora»)."),
        voz: z.string().optional().describe("Gemini: Sulafat por defecto. OpenAI: marin o cedar."),
        proveedor: z.enum(["gemini", "openai"]).optional().describe("Solo para forzar OpenAI."),
        instrucciones: z.string().optional().describe("OpenAI: tono extra."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_voz", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoTranscribir",
      "TIEMPOS de cada palabra de un audio o video (Whisper). Guarda <archivo>.words.json, el formato que leen las skills de subtítulos. Usá los tiempos; el texto de los subtítulos sale del guion.",
      z.object({ archivo: z.string().min(1).describe("Ruta bajo /tmp/videos/."), idioma: z.string().optional().describe("ISO, por defecto es.") }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_transcribir", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoPlano",
      "GENERA un plano de video vertical con Magnific (Seedance 2.5 Pro). GASTA CRÉDITOS: solo para lo que el material del cliente no tiene; nunca para mostrar su producto, local o gente como si fueran reales. En segundo plano: devuelve un id para lmtmVideoEstado.",
      z.object({
        prompt: z.string().min(10).max(4000).describe("En inglés: sujeto, lugar, luz, cámara, estilo. Sin texto ni logos."),
        archivo: z.string().min(1).describe("Ruta .mp4 bajo /tmp/videos/."),
        duracion: z.number().int().min(4).max(15).optional(),
        imagen: z.string().optional().describe("Primer cuadro: ruta bajo /tmp/videos/ o URL https."),
        resolucion: z.enum(["720p", "1080p"]).optional(),
        clientId: z.string().optional(),
        pieza: z.string().optional().describe("Id de la tarea de ClickUp o del issue."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_plano", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoMusica",
      "GENERA música de fondo sin voces con Magnific (Lyria 3). GASTA CRÉDITOS. En segundo plano: devuelve un id para lmtmVideoEstado.",
      z.object({
        prompt: z.string().min(10).max(2000).describe("Género, ánimo, instrumentos, tempo."),
        archivo: z.string().min(1).describe("Ruta .mp3 o .wav bajo /tmp/videos/."),
        clientId: z.string().optional(),
        pieza: z.string().optional(),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_musica", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoRenderizar",
      "RENDERIZA un proyecto de HyperFrames (directorio con index.html bajo /tmp/videos/) a .mp4 en el servicio de render. Antes: `npx hyperframes check --json` sin errores. En segundo plano: devuelve un id para lmtmVideoEstado.",
      z.object({
        proyecto: z.string().min(1),
        calidad: z.enum(["draft", "looks", "delivery"]).optional().describe("delivery para entregar (por defecto)."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_renderizar", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoEstado",
      "ESTADO de un render, plano o música en curso. Espera hasta 90 s; si sigue en curso, volvé a consultar.",
      z.object({ id: z.string().min(1) }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_estado", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoRevisar",
      "CONTROL DE CALIDAD con GPT contra el brief: de un .mp4 (archivo; saca cuadros) o de las placas de un carrusel o post (imagenes, en orden). Texto legible, zona segura, texto sobre caras o producto, logo, ortografía, nada que el brief no permita. Complementa a `hyperframes check`.",
      z.object({
        archivo: z.string().optional().describe("Video .mp4 bajo /tmp/videos/."),
        imagenes: z.array(z.string()).max(12).optional().describe("PNG/JPG bajo /tmp/videos/, en orden."),
        brief: z.string().min(10).describe("Qué tiene que decir y mostrar la pieza y qué no."),
        cuadros: z.number().int().min(4).max(12).optional(),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_revisar", parameters: p } }),
    ),
    makeTool(
      "lmtmBuscarMaterial",
      "BUSCA en el Drive del cliente las fotos y videos que MUESTRAN un producto o escena: GPT mira las miniaturas, así que sirve aunque el archivo se llame DJI_….jpg o 1.jpg. Devuelve los mejores con qué se ve en cada uno y el link de descarga. Usala después de lmtmGuiaContenido cuando lo que trae por nombre no alcanza. Lo ya mirado queda guardado.",
      z.object({
        cliente: z.string().min(1).describe("Nombre (aunque sea parcial) o id."),
        producto: z.string().min(3).describe("Qué tiene que verse: «placard blanco», «llantas de BMW», «frascos de OPI»."),
        tipo: z.enum(["foto", "video", "todo"]).optional(),
        cantidad: z.number().int().min(3).max(30).optional(),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "buscar_material", parameters: p } }),
    ),
    makeTool(
      "lmtmDriveBajar",
      "BAJA fotos y videos de una carpeta (o un archivo) de Drive que te pasaron por link, aunque no esté en el índice del cliente. Solo ve lo compartido con grow@bylmtm.com: si dice que no tiene acceso, contalo en la tarea. Devuelve las rutas locales.",
      z.object({
        link: z.string().min(10).describe("Link de Drive (carpeta o archivo) o su id."),
        carpeta: z.string().min(1).describe("Carpeta de destino bajo /tmp/videos/."),
        tipo: z.enum(["foto", "video", "todo"]).optional(),
        cantidad: z.number().int().min(1).max(60).optional(),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "drive_bajar", parameters: p } }),
    ),
    makeTool(
      "lmtmEncargarAlProductor",
      "PASALE al Productor de contenido un pedido de PRODUCCIÓN: editar fotos (ponerles el logo, recortarlas), placas, carruseles, reels. Crea la tarea, lo despierta y devuelve el número. Usala en vez de intentarlo si no tenés terminal ni editor de imágenes.",
      z.object({
        cliente: z.string().min(1).describe("Nombre (aunque sea parcial) o id."),
        pedido: z.string().min(5).describe("Lo que pidió la persona, completo, con los links que pasó."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "encargar_al_productor", parameters: p } }),
    ),
    makeTool(
      "lmtmContenidoImagen",
      "GENERA una imagen con Magnific (Mystic) para fondo o ilustración de una placa o carrusel. GASTA CRÉDITOS. Sin texto ni logos (el texto va en HTML) y nunca haciéndola pasar por el producto o local real del cliente. Tarda hasta 2 min.",
      z.object({
        prompt: z.string().min(10).max(3000).describe("En inglés: sujeto, lugar, luz, estilo. Sin texto ni logos."),
        archivo: z.string().min(1).describe("Ruta .jpg o .png bajo /tmp/videos/."),
        formato: z.enum(["retrato", "vertical", "cuadrado"]).optional().describe("retrato 2:3 (feed, por defecto), vertical 9:16, cuadrado 1:1."),
        clientId: z.string().optional(),
        pieza: z.string().optional(),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "contenido_imagen", parameters: p } }),
    ),
    makeTool(
      "lmtmContenidoEntregarImagenes",
      "ENTREGA una placa o un carrusel (PNG en orden): sube a Super Redes/<cliente>/PLACAS en Drive, deja la portada en la tarea de ClickUp si viene de una y lo registra. No publica.",
      z.object({
        archivos: z.array(z.string()).min(1).max(20).describe("PNG bajo /tmp/videos/, en el orden del carrusel."),
        clientId: z.string().min(1),
        titulo: z.string().min(1).max(120),
        textos: z.string().optional().describe("El texto de cada placa y el copy sugerido para el posteo."),
        issueId: z.string().optional(),
        clickupTaskId: z.string().optional(),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "contenido_entregar_imagenes", parameters: p } }),
    ),
    makeTool(
      "lmtmVideoEntregar",
      "ENTREGA un video: lo sube a la carpeta VIDEOS del cliente en Drive y lo registra. No publica ni toca el calendario. Devuelve el link para dejar en la tarea.",
      z.object({
        archivo: z.string().min(1).describe("Ruta .mp4 bajo /tmp/videos/."),
        clientId: z.string().min(1),
        titulo: z.string().min(1).max(120),
        guion: z.string().optional().describe("El guion y de dónde salió cada plano (cliente o generado)."),
        issueId: z.string().optional(),
        clickupTaskId: z.string().optional().describe("Si el pedido vino de una tarea de ClickUp: ahí queda el link y la etiqueta «contenido generado»."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "video_entregar", parameters: p } }),
    ),
    makeTool(
      "lmtmGenerarPieza",
      "Genera el contenido de una PIEZA que ya es tarea de ClickUp (Super Redes o Redes Sociales), igual que la etiqueta 'generar contenido': el campo Tipo de Contenido decide si sale reel (3 clips pegados), clip, placa o carrusel; usa el Copy y la imagen de la tarea; sube a Drive, carga el Enlace de publicación y comenta en la tarea. GASTA CRÉDITOS: primero llamala con soloPrompt=true para ver qué se va a pedir, mostráselo a la persona y recién con su OK generá. Si la pieza ya se generó no la repite, salvo forzar=true.",
      z.object({
        clientId: z.string().min(1),
        taskId: z.string().min(1).describe("Id de la tarea de ClickUp."),
        soloPrompt: z.boolean().optional().describe("true = no genera ni gasta: devuelve el prompt, las tomas o las placas que se pedirían."),
        forzar: z.boolean().optional().describe("Regenerar aunque ya tenga contenido generado."),
      }),
      async ({ clientId, taskId, soloPrompt, forzar }) =>
        soloPrompt
          ? client.requestJson("POST", "/video/prompt", { body: { clientId, taskId } })
          : client.requestJson("POST", "/video/generar", { body: { clientId, taskId, origen: "claude", ...(forzar ? { forzar } : {}) } }),
    ),
    makeTool(
      "lmtmContenidoGenerado",
      "CONTENIDO GENERADO con Higgsfield y Magnific: cada pieza con su link de Drive, su tarea de ClickUp, quién la pidió (clickup / panel / claude) y lo que gastó; y el gasto por herramienta y por cliente en el período. Las unidades no se mezclan: créditos del plan de Higgsfield, créditos y US$ de su API, y Magnific (que no informa el costo por pedido: se cuenta cuántas). 'noEntregadas' = generaciones pagadas que no terminaron en una pieza. Para saber cuánto le queda al plan, lmtmEstadoGeneracion.",
      z.object({
        dias: z.number().int().positive().max(730).optional().describe("Período hacia atrás (default 30)."),
        clientId: z.string().optional(),
      }),
      async ({ dias, clientId }) => {
        const q = new URLSearchParams();
        if (dias) q.set("dias", String(dias));
        if (clientId) q.set("clientId", clientId);
        const qs = q.toString();
        return client.requestJson("GET", `/contenido/generado${qs ? `?${qs}` : ""}`);
      },
    ),
    makeTool(
      "lmtmEstadoGeneracion",
      "Si se puede generar ahora: créditos que le quedan al plan de Higgsfield, por qué vía saldría (plan o API), si Magnific está configurado, y la cola de tareas con la etiqueta 'generar contenido'. Consultalo antes de generar.",
      z.object({}),
      async () => client.requestJson("GET", "/video/estado"),
    ),
    makeTool(
      "lmtmAnalisisSeo",
      "ANÁLISIS SEO de la web de un cliente (con clientId usa la web cargada en su Marca) o de cualquier URL: título, descripción, encabezados, indexación, datos estructurados, imágenes sin texto alternativo, robots.txt, sitemap, velocidad en celular y Core Web Vitals reales si Google contesta. Devuelve los problemas ordenados por gravedad. Solo lectura.",
      z.object({ clientId: z.string().optional(), url: z.string().optional() }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_analisis_seo", parameters: p } }),
    ),
    makeTool(
      "lmtmRendimientoWeb",
      "RENDIMIENTO DE LA WEB de un cliente (Google Search Console + Google Analytics 4): clics e impresiones en Google, posición media, sesiones, usuarios, eventos clave, interacción, contra el período anterior; lo más buscado, páginas, canales, landings, fuentes y eventos clave configurados. Incluye oportunidades: búsquedas en posición 4 a 20 con muchas impresiones. null = fuente no vinculada (nunca 0); 'falta' dice qué hacer. Solo lectura.",
      z.object({ clientId: z.string().min(1), dias: z.number().int().min(7).max(90).optional() }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_rendimiento_web", parameters: p } }),
    ),
    makeTool(
      "lmtmVincularWebGoogle",
      "VINCULA a un cliente su sitio de Search Console y/o su propiedad de GA4 cuando no se emparejaron solos por la web. Sin gscSitio ni ga4Propiedad lista lo que ven las cuentas de Google conectadas. Queda fijo y se sincroniza en el momento.",
      z.object({ clientId: z.string().min(1), gscSitio: z.string().optional(), ga4Propiedad: z.string().optional() }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "vincular_web_google", parameters: p } }),
    ),
    makeTool(
      "lmtmCompletarMarca",
      "COMPLETA la Marca de un cliente: su web (del Enfoque Técnico o de su página de Facebook, verificada), sus colores principales (paleta del Enfoque Técnico o de la web) y, del Enfoque Técnico, tono, tipografías, palabras que usa y evita, mensaje, público y diferencial. Nunca pisa lo que cargó una persona. Corre sola todos los días; usala para un cliente nuevo o con forzar=true si cambió su Enfoque Técnico.",
      z.object({ clientId: z.string().min(1), forzar: z.boolean().optional() }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "completar_marca", parameters: p } }),
    ),
    makeTool(
      "lmtmRedesPublicas",
      "Lee el perfil PÚBLICO de una cuenta de Instagram (usuario) o una página de Facebook (url) que no es nuestra —competidor o referente— con sus últimas publicaciones: me gusta, comentarios, formato, fecha, texto y cuántas veces lo normal de ESA cuenta rindió cada una. Lector propio de LMTM, sin costo. Dice si el usuario no existe o es privado. Si responde 'bloqueado', Instagram frenó al servidor: probá más tarde. Para lo ya medido de toda la competencia de un rubro, lmtmGetNicheIntel.",
      z.object({
        red: z.enum(["instagram", "facebook"]),
        usuario: z.string().optional().describe("Instagram: usuario sin @ o URL del perfil."),
        url: z.string().optional().describe("Facebook: URL de la página."),
      }),
      async (p) => client.requestJson("POST", "/agent-tools/execute", { body: { tool: "get_redes_publicas", parameters: p } }),
    ),
    makeTool(
      "lmtmHerramientaAgente",
      "Corre CUALQUIER herramienta de los agentes de LMTM-OS por su nombre (las mismas que usan Milo, Caro y el resto): ClickUp (clickup_list_tasks, clickup_create_task…), planillas (sheets_read), validación de redes, cliente listo para producir, auditoría de keywords de Google, negativas, plugins, etc. Sin 'tool' devuelve la lista completa con la descripción y los parámetros de cada una. Las que mueven plata o escriben afuera siguen pidiendo aprobación humana, igual que para los agentes.",
      z.object({
        tool: z.string().optional().describe("Nombre exacto (snake_case). Vacío = listar."),
        parameters: z.record(z.unknown()).optional(),
      }),
      async ({ tool, parameters }) =>
        tool
          ? client.requestJson("POST", "/agent-tools/execute", { body: { tool, parameters: parameters ?? {} } })
          : client.requestJson("GET", "/agent-tools"),
    ),
  ];
}
