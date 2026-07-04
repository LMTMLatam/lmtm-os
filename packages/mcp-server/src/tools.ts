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
        return formatTextResponse(await execute(parsed));
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
      "PAUSAR una campaña o adset de Meta de un cliente (única acción de escritura sobre pauta). Para gasto sin conversiones, CTR muy bajo o aviso quemando presupuesto. MUEVE plata: proponé en el issue con la justificación y esperá OK humano; recién con aprobación pasá approved=true. El server verifica que la entidad sea de ESE cliente. No hay reanudar/subir presupuesto/crear por acá.",
      z.object({
        clientId: z.string().min(1),
        entityType: z.enum(["campaign", "adset"]),
        entityId: z.string().min(1),
        approved: z.boolean().optional().describe("true SOLO tras aprobación humana explícita en el issue"),
      }),
      async ({ clientId, entityType, entityId, approved }) =>
        client.requestJson("POST", "/agent-tools/execute", {
          body: { tool: "pause_ad_entity", parameters: { clientId, entityType, entityId, ...(approved ? { approved } : {}) } },
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
      "lmtmGetClientScheduledContent",
      "Contenido PROGRAMADO del cliente (lista de Redes Sociales de ClickUp): qué se planeó publicar, cuándo, estado y si está marcado como publicado. Cruzalo con lmtmGetClientOrganicPosts para ver si el plan se cumple.",
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
  ];
}
