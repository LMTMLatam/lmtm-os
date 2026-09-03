// LMTM-OS: client-scoped task creation + detection.
//
// One place to turn "a pending thing for client X" into a tracked issue tagged
// with that client. Used by (a) the agent tool create_client_task and (b) the
// WhatsApp group bot, which scans a client's group chat and auto-files the
// action items it finds. Per the boss's rule: INTERNAL ops tasks are created
// active; EXTERNAL ones (contacting the client / spending money / publishing)
// are created as proposals that need approval in the per-client panel.

import type { Db } from "@paperclipai/db";
import { issues, agents } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { issueService } from "./issues.js";
import { resolveCompanyId } from "./intel-common.js";

/**
 * The triage owner (the "CEO"): every new issue is assigned to them by default,
 * and they re-derive it to the best specialist. Marked with metadata.triageOwner
 * = true on exactly one agent per company. Returns null if none is flagged (then
 * the issue is created unassigned, same as before).
 */
export async function resolveTriageOwnerId(db: Db, companyId: string): Promise<string | null> {
  if (!companyId) return null;
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), sql`${agents.metadata} ->> 'triageOwner' = 'true'`))
    .limit(1);
  return rows[0]?.id ?? null;
}

export type TaskType = "internal" | "external";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface CreateClientTaskInput {
  clientId: string;
  title: string;
  description?: string;
  taskType?: TaskType;
  priority?: TaskPriority;
  source?: string;
  createdByAgentId?: string | null;
  fallbackCompanyId?: string;
  /**
   * Días que tiene que pasar antes de volver a levantar ESTA MISMA señal para
   * este cliente, aunque la anterior ya esté cerrada.
   *
   * La deduplicación de abajo solo mira tareas ABIERTAS, y eso alcanza mientras
   * alguien deje la tarea abierta hasta resolverla. Para un vigilante que corre
   * todos los días no alcanza: el agente cierra la tarea el mismo día y al día
   * siguiente se crea otra igual. Medido el 30/8/26 sobre el watcher de
   * retención: 284 avisos en 60 días, muchos con CERO días de diferencia
   * (SKYGARDEN 52, MAERS 51). Con 7 días de espera se evitaba el 87%.
   */
  noRepetirDias?: number;
}

export interface CreateClientTaskResult {
  created: boolean;
  duplicate: boolean;
  identifier: string | null;
  taskType: TaskType;
  message: string;
}

/** ¿La señal anterior es tan reciente que no vale la pena repetirla? */
export function dentroDeLaEspera(ultima: Date | null | undefined, dias: number, ahora = new Date()): boolean {
  if (!ultima || !Number.isFinite(dias) || dias <= 0) return false;
  return ahora.getTime() - new Date(ultima).getTime() < dias * 86_400_000;
}

/**
 * Create a task (issue) tagged to a client, with dedup against open tasks of the
 * same title. Internal → active (todo). External → proposal (backlog +
 * origin_kind=agent_proposed) awaiting approval.
 *
 * Con `noRepetirDias` la deduplicación además mira las YA CERRADAS: un
 * vigilante diario no puede volver a levantar la misma señal todos los días.
 */
export async function createClientTask(db: Db, input: CreateClientTaskInput): Promise<CreateClientTaskResult> {
  const title = (input.title ?? "").trim().slice(0, 200);
  const taskType: TaskType = input.taskType === "external" ? "external" : "internal";
  if (!input.clientId || !title) {
    return { created: false, duplicate: false, identifier: null, taskType, message: "Faltan clientId o title." };
  }
  const priority: TaskPriority = (["low", "medium", "high", "urgent"] as const).includes(input.priority as TaskPriority)
    ? (input.priority as TaskPriority)
    : "medium";
  const source = (input.source ?? "agente").slice(0, 120);
  const companyId = (await resolveCompanyId(db, input.clientId)) ?? input.fallbackCompanyId ?? "";
  if (!companyId) {
    return { created: false, duplicate: false, identifier: null, taskType, message: "No se pudo resolver la empresa del cliente." };
  }

  // Dedup: skip if an open task with the same title already exists for this client.
  const dup = await db
    .select({ identifier: issues.identifier })
    .from(issues)
    .where(and(eq(issues.clientId, input.clientId), eq(issues.title, title), sql`${issues.status} not in ('done','cancelled')`))
    .limit(1);
  if (dup.length > 0) {
    return { created: false, duplicate: true, identifier: dup[0].identifier ?? null, taskType, message: "Ya existe una tarea abierta igual." };
  }

  // Espera entre repeticiones: mira también las cerradas. Sin esto, un vigilante
  // que corre a diario vuelve a levantar la misma señal apenas el agente cierra
  // la anterior, y el tablero se llena de avisos del mismo cliente.
  if (input.noRepetirDias && input.noRepetirDias > 0) {
    const desde = new Date(Date.now() - input.noRepetirDias * 86_400_000);
    const reciente = await db
      .select({ identifier: issues.identifier, createdAt: issues.createdAt })
      .from(issues)
      .where(and(eq(issues.clientId, input.clientId), eq(issues.title, title), gte(issues.createdAt, desde)))
      .limit(1);
    if (reciente.length > 0 && dentroDeLaEspera(reciente[0].createdAt, input.noRepetirDias)) {
      return {
        created: false,
        duplicate: true,
        identifier: reciente[0].identifier ?? null,
        taskType,
        message: `Esta misma señal ya se levantó hace menos de ${input.noRepetirDias} días.`,
      };
    }
  }

  const status = taskType === "external" ? "backlog" : "todo";
  const originKind = taskType === "external" ? "agent_proposed" : "agent_detected";
  const body = input.description
    ? `${input.description}\n\n_Origen: ${source} · detectado por agente_`
    : `_Origen: ${source} · detectado por agente_`;

  // Route to the matching specialist by area (paid/content/seo/…); if the text
  // doesn't clearly belong to an area, fall back to the triage owner (the "CEO").
  // Keeps work flowing to whoever can do it instead of piling on one agent.
  const { routeNewIssue } = await import("./issue-router.js");
  const assigneeAgentId = await routeNewIssue(db, companyId, `${title}\n${input.description ?? ""}`);

  const created = await issueService(db).create(companyId, {
    title,
    description: body,
    status: status as never,
    priority: priority as never,
    clientId: input.clientId,
    originKind,
    createdByAgentId: input.createdByAgentId ?? null,
    ...(assigneeAgentId ? { assigneeAgentId } : {}),
  } as never);
  const identifier = ((created as Record<string, unknown>).identifier ?? (created as Record<string, unknown>).id ?? null) as string | null;

  // Derivación al responsable HUMANO (pedido 18/7): la planilla RESPONSABLES
  // dice quién atiende diseño/copy de cada cliente. Se registra como
  // intervención (listado del Centro de Inteligencia + brief) y las urgentes
  // van directo por WhatsApp — así la tarea llega en tiempo real a la persona
  // correcta sin pasar por el teléfono del ejecutivo.
  try {
    const { clients } = await import("@paperclipai/db");
    const [cli] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, input.clientId)).limit(1);
    const clientName = cli?.name ?? "";
    if (clientName) {
      const { resolverResponsable } = await import("./cotizado.js");
      const resp = await resolverResponsable(clientName, `${title} ${input.description ?? ""}`);
      if (resp) {
        const { recordIntervention } = await import("./vigilantes.js");
        const urgente = priority === "urgent" || priority === "high";
        await recordIntervention(db, {
          vigilante: "tareas", kind: "tarea", level: urgente ? 4 : 3,
          clientId: input.clientId,
          title: `${clientName}: derivar a ${resp.nombre} (${resp.area}) — ${title.slice(0, 120)}`,
          body: `${input.description ?? title}\n\nResponsable según planilla: ${resp.nombre} (${resp.area}). Issue: ${identifier ?? "s/n"}.`,
          dedupeKey: `tareas:${identifier ?? title.slice(0, 60)}`,
        });
        if (urgente) {
          const { sendWhatsAppToNumber, alertsNumber } = await import("./agency-ops.js");
          const team = process.env.LMTM_TEAM_WA_GROUP || alertsNumber();
          if (team) {
            await sendWhatsAppToNumber(team, `📋 *${clientName}* · tarea ${priority === "urgent" ? "URGENTE" : "importante"} para *${resp.nombre}* (${resp.area}):\n${title}\n\n_${identifier ?? ""} · LMTM-OS_`).catch(() => {});
          }
        }
      }
    }
  } catch { /* la derivación es best-effort: la tarea ya quedó creada */ }

  return {
    created: true,
    duplicate: false,
    identifier,
    taskType,
    message: taskType === "external" ? "Tarea creada para aprobar (externa)." : "Tarea creada y activa (interna).",
  };
}

// ── Task detection from chat text ───────────────────────────────────────────

interface DetectedTask {
  title: string;
  description?: string;
  type: TaskType;
  priority?: TaskPriority;
}

/** Minimal LLM call (Anthropic → MiniMax fallback) returning raw text. */
export async function llmExtract(system: string, user: string): Promise<string | null> {
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (aKey) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": aKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1024, system, messages: [{ role: "user", content: user }] }),
      });
      if (r.ok) {
        const d = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
        const t = d.content?.find((c) => c.type === "text")?.text ?? "";
        if (t.trim()) return t;
      }
    } catch { /* fall through */ }
  }
  const mKey = process.env.MINIMAX_API_KEY;
  if (mKey) {
    try {
      const base = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.chat/v1";
      const r = await fetch(`${base}/text/chatcompletion_v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mKey}` },
        body: JSON.stringify({
          model: process.env.MINIMAX_MODEL ?? "MiniMax-M2",
          max_tokens: 1024,
          temperature: 0.2,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (r.ok) {
        const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = d?.choices?.[0]?.message?.content ?? "";
        return raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim() || null;
      }
    } catch { /* noop */ }
  }
  return null;
}

function parseTasks(raw: string): DetectedTask[] {
  // Pull the first JSON array out of the response.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1)) as unknown[];
    const out: DetectedTask[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) continue;
      out.push({
        title,
        description: typeof o.description === "string" ? o.description : undefined,
        type: o.type === "external" ? "external" : "internal",
        priority: (["low", "medium", "high", "urgent"].includes(o.priority as string) ? o.priority : undefined) as TaskPriority | undefined,
      });
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

const DETECT_SYSTEM =
  "Sos un asistente de una agencia de marketing. A partir de una conversación de un grupo de WhatsApp de un cliente, extraé SOLO las tareas/pendientes accionables y concretas que el equipo debe hacer. " +
  "Ignorá charla, saludos y cosas ya resueltas. Para cada tarea devolvé: title (corto, accionable, en español), description (1 frase de contexto), type ('internal' = trabajo operativo interno; 'external' = implica contactar al cliente, gastar plata o publicar algo), priority ('low'|'medium'|'high'|'urgent'). " +
  'Respondé ÚNICAMENTE con un array JSON, sin texto extra. Si no hay tareas claras, respondé [].';

/**
 * Scan a client's group conversation and return the action items found —
 * DETECTION ONLY. Pedido 2026-07-27: los pendientes de los grupos de WhatsApp
 * NO se convierten más en tareas ejecutables (los agentes actuaban solos sobre
 * pedidos del cliente sin OK del equipo); quedan anotados en el resumen del
 * grupo y un humano decide qué se hace.
 */
export async function detectPendingItems(
  messages: Array<{ senderName: string | null; body: string }>,
): Promise<DetectedTask[]> {
  if (messages.length === 0) return [];
  const transcript = messages.map((m) => `${m.senderName ?? "Desconocido"}: ${m.body}`).join("\n").slice(0, 8000);
  const raw = await llmExtract(DETECT_SYSTEM, `Conversación:\n${transcript}`);
  if (!raw) return [];
  return parseTasks(raw);
}
