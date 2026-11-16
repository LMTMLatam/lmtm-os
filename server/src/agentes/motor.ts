// LMTM-OS: el motor propio corre a los agentes de la flota (plan 15/11, fase 6).
//
// Pedido de Naza (15/11): «poné el nuevo servicio a correr los agentes». Hasta acá
// los 15 agentes los despertaba el heartbeat de paperclip (9.313 líneas). Ahora,
// para los agentes MIGRADOS (instance_settings.general.motorPropio.agentes):
//  - paperclip no los despierta (heartbeat y wakeOnDemand apagados en su runtime);
//  - este motor toma sus tareas pendientes —vengan de una rutina, de otro agente o
//    de una persona—, una por agente a la vez, y las corre con el MISMO adaptador de
//    siempre (claude_local: skills, herramientas, cerco del usuario sin root y el
//    freno de Make), así no se pierde ninguna capacidad;
//  - topes propios: la cuota del proveedor (cuota-llm), 3 corridas por tarea por día y
//    una sola por versión de la tarea (no vuelve a correr si nadie la tocó después).
// Las tareas y las rutinas siguen siendo las de paperclip por ahora (paso 4 del plan).

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, instanceSettings, issues } from "@paperclipai/db";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { enmascararClaves } from "../redaction.js";

export const FUENTE = "motor_propio";
/** Corridas por tarea en 24 h: si no la resolvió en 3, que la mire una persona. */
export const MAX_CORRIDAS_POR_TAREA_DIA = 3;

export interface ConfigMotor { agentes: string[] }

export async function configMotor(db: Db): Promise<ConfigMotor> {
  const [r] = await db.select({ general: instanceSettings.general }).from(instanceSettings).where(eq(instanceSettings.singletonKey, "default")).limit(1);
  const m = (r?.general as { motorPropio?: { agentes?: unknown } } | undefined)?.motorPropio;
  return { agentes: Array.isArray(m?.agentes) ? (m!.agentes as unknown[]).filter((x): x is string => typeof x === "string") : [] };
}

/**
 * Pasa (o devuelve) un agente al motor propio. Al pasarlo, paperclip deja de
 * despertarlo; al devolverlo, se restaura lo que tenía (queda en el runtime).
 */
export async function migrarAgente(db: Db, agentId: string, alMotor: boolean): Promise<{ ok: boolean; motivo?: string }> {
  const [a] = await db.select({ id: agents.id, name: agents.name, adapterType: agents.adapterType, runtimeConfig: agents.runtimeConfig }).from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!a) return { ok: false, motivo: "No existe ese agente." };
  if (a.adapterType !== "claude_local") return { ok: false, motivo: `${a.name} no corre con claude_local: el motor propio no lo sabe correr todavía.` };
  const rc = (a.runtimeConfig ?? {}) as Record<string, unknown>;
  const hb = (rc.heartbeat ?? {}) as Record<string, unknown>;
  const actual = await configMotor(db);
  if (alMotor) {
    const antes = rc.heartbeatAntesDelMotor ?? hb;
    await db.update(agents).set({
      runtimeConfig: { ...rc, heartbeatAntesDelMotor: antes, heartbeat: { ...hb, enabled: false, wakeOnDemand: false } },
      updatedAt: new Date(),
    }).where(eq(agents.id, a.id));
    if (!actual.agentes.includes(a.id)) await guardar(db, { agentes: [...actual.agentes, a.id] });
  } else {
    const { heartbeatAntesDelMotor, ...resto } = rc;
    await db.update(agents).set({ runtimeConfig: { ...resto, heartbeat: heartbeatAntesDelMotor ?? { ...hb, enabled: true, wakeOnDemand: true } }, updatedAt: new Date() }).where(eq(agents.id, a.id));
    await guardar(db, { agentes: actual.agentes.filter((x) => x !== a.id) });
  }
  return { ok: true };
}

async function guardar(db: Db, c: ConfigMotor): Promise<void> {
  await db.insert(instanceSettings).values({ singletonKey: "default", general: { motorPropio: c } })
    .onConflictDoUpdate({
      target: instanceSettings.singletonKey,
      set: { general: sql`coalesce(${instanceSettings.general}, '{}'::jsonb) || ${JSON.stringify({ motorPropio: c })}::jsonb`, updatedAt: new Date() },
    });
}

export interface Pendiente { issueId: string; identifier: string | null; title: string; status: string; priority: string; agentId: string }

/**
 * Las tareas que el motor tiene que correr ahora. Una tarea corre si:
 *  - es de un agente migrado y está en todo/in_progress (o bloqueada/en revisión
 *    con un comentario de OTRO después de la última corrida);
 *  - no la está corriendo nadie (ni este motor ni paperclip);
 *  - cambió desde la última corrida del motor (comentario de otro o tarea nueva):
 *    así no se repite en círculo sobre algo que el agente ya trabajó;
 *  - no se corrió 3 veces en 24 h.
 * Una por agente (la más prioritaria y vieja).
 */
export async function pendientes(db: Db, agentesIds: string[]): Promise<Pendiente[]> {
  if (!agentesIds.length) return [];
  const r = await db.execute(sql`
    with cand as (
      select i.id, i.identifier, i.title, i.status, i.priority, i.assignee_agent_id, i.created_at,
        -- Comentarios de otro (persona u otro agente). Los avisos administrativos de las limpiezas no despiertan a nadie.
        (select max(c.created_at) from issue_comments c where c.issue_id = i.id and c.author_agent_id is distinct from i.assignee_agent_id
           and c.body !~ '^(Cerrada en la limpieza|Pasada a «en revisión»)') ultimo_ajeno,
        (select max(r.created_at) from heartbeat_runs r where r.context_snapshot->>'issueId' = i.id::text and r.invocation_source = ${FUENTE}) ultima_corrida
      from issues i
      where i.assignee_agent_id in (${sql.join(agentesIds.map((id) => sql`${id}::uuid`), sql`, `)})
        and i.status in ('todo', 'in_progress', 'blocked', 'in_review') and i.hidden_at is null
        and not exists (select 1 from heartbeat_runs r where r.context_snapshot->>'issueId' = i.id::text and r.status in ('queued', 'running'))
        and (select count(*) from heartbeat_runs r where r.context_snapshot->>'issueId' = i.id::text
             and r.invocation_source = ${FUENTE} and r.created_at > now() - interval '24 hours') < ${MAX_CORRIDAS_POR_TAREA_DIA}
    )
    select distinct on (assignee_agent_id) id, identifier, title, status, priority, assignee_agent_id
    from cand
    where (status in ('todo', 'in_progress') and (ultima_corrida is null or coalesce(ultimo_ajeno, created_at) > ultima_corrida))
       or (status in ('blocked', 'in_review') and ultimo_ajeno is not null and (ultima_corrida is null or ultimo_ajeno > ultima_corrida)
           and ultimo_ajeno > now() - interval '7 days')
    order by assignee_agent_id,
      case priority when 'critical' then 0 when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, created_at`);
  const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
  return filas.map((f) => ({ issueId: String(f.id), identifier: (f.identifier as string) ?? null, title: String(f.title), status: String(f.status), priority: String(f.priority), agentId: String(f.assignee_agent_id) }));
}

/** Últimas 5 entradas de la conversación de la tarea, para el contexto del despertar. */
async function comentariosRecientes(db: Db, issueId: string) {
  const r = await db.execute(sql`select id, body, author_type, author_agent_id, author_user_id, created_at from issue_comments
    where issue_id = ${issueId} order by created_at desc limit 5`);
  const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
  return filas.reverse().map((c) => ({ id: String(c.id), body: String(c.body ?? "").slice(0, 4000), authorType: c.author_type ?? null, authorAgentId: c.author_agent_id ?? null, authorUserId: c.author_user_id ?? null, createdAt: c.created_at }));
}

/** Corre UNA tarea con el adaptador del agente. Devuelve el estado de la corrida. */
export async function correrTarea(db: Db, p: Pendiente, opts: { manual?: boolean } = {}): Promise<{ runId: string | null; estado: string; motivo?: string }> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, p.agentId)).limit(1);
  if (!agent) return { runId: null, estado: "omitida", motivo: "agente inexistente" };
  if (agent.status === "paused" || agent.status === "terminated") return { runId: null, estado: "omitida", motivo: `agente ${agent.status}` };

  const { corteParaDespertar, registrarCuotaAgotada } = await import("../services/cuota-llm.js");
  // Pedida por una persona = a pedido (como en paperclip): el ritmo semanal no la frena; la cuota agotada sí.
  const corte = await corteParaDespertar(db, agent.adapterConfig, opts.manual ? "on_demand" : FUENTE);
  if (corte) return { runId: null, estado: "omitida", motivo: corte };
  console.log(`[motor] corre ${p.identifier ?? p.issueId} (${agent.name})${opts.manual ? " a pedido" : ""}`);

  const comentarios = await comentariosRecientes(db, p.issueId);
  const contexto: Record<string, unknown> = {
    source: FUENTE, reason: FUENTE, wakeReason: FUENTE, wakeSource: FUENTE,
    issueId: p.issueId, taskId: p.issueId, taskKey: p.issueId,
    paperclipWake: {
      reason: FUENTE,
      issue: { id: p.issueId, identifier: p.identifier, title: p.title, status: p.status, priority: p.priority },
      comments: comentarios, commentIds: comentarios.map((c) => c.id), truncated: false,
      checkedOutByHarness: true, fallbackFetchNeeded: true,
    },
  };
  const [run] = await db.insert(heartbeatRuns).values({
    companyId: agent.companyId, agentId: agent.id, invocationSource: FUENTE, status: "running",
    startedAt: new Date(), contextSnapshot: contexto, triggerDetail: FUENTE,
  }).returning({ id: heartbeatRuns.id });
  if (!run) return { runId: null, estado: "fallo", motivo: "no se pudo registrar la corrida" };

  // La tarea queda tomada por esta corrida (igual que el checkout de paperclip).
  await db.update(issues).set({
    status: p.status === "todo" ? "in_progress" : p.status, checkoutRunId: run.id, executionRunId: run.id, executionLockedAt: new Date(),
    startedAt: sql`coalesce(${issues.startedAt}, now())`, updatedAt: new Date(),
  }).where(eq(issues.id, p.issueId));

  let salida = "";
  let errores = "";
  const onLog = async (stream: "stdout" | "stderr", chunk: string) => {
    if (stream === "stdout") salida = (salida + chunk).slice(-24_000);
    else errores = (errores + chunk).slice(-8_000);
  };
  let estado = "failed";
  let error: string | null = null;
  let errorCode: string | null = null;
  try {
    const { getServerAdapter } = await import("../adapters/index.js");
    const adapter = getServerAdapter(agent.adapterType);
    const authToken = createLocalAgentJwt(agent.id, agent.companyId, agent.adapterType, run.id) ?? undefined;
    const res = await adapter.execute({
      runId: run.id,
      agent: { id: agent.id, companyId: agent.companyId, name: agent.name, adapterType: agent.adapterType, adapterConfig: agent.adapterConfig },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: p.issueId },
      config: (agent.adapterConfig ?? {}) as Record<string, unknown>,
      context: contexto,
      onLog,
      authToken,
    });
    estado = res.timedOut ? "timed_out" : res.exitCode === 0 && !res.errorMessage ? "succeeded" : "failed";
    error = res.errorMessage ?? null;
    errorCode = res.errorCode ?? null;
    if (errorCode === "claude_quota_exhausted") await registrarCuotaAgotada(db, agent.adapterConfig, res.retryNotBefore ?? null).catch(() => undefined);
    await db.update(heartbeatRuns).set({
      exitCode: res.exitCode, signal: res.signal, usageJson: (res.usage ?? null) as Record<string, unknown> | null, resultJson: res.resultJson ?? null,
      sessionIdAfter: res.sessionId ?? null,
    }).where(eq(heartbeatRuns.id, run.id));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    await db.update(heartbeatRuns).set({
      status: estado, finishedAt: new Date(), error: error ? enmascararClaves(error).slice(0, 2000) : null, errorCode,
      stdoutExcerpt: enmascararClaves(salida).slice(-8_000), stderrExcerpt: enmascararClaves(errores).slice(-4_000), updatedAt: new Date(),
    }).where(eq(heartbeatRuns.id, run.id));
    // Se suelta la tarea; si el agente no la cerró, queda como la dejó.
    await db.update(issues).set({ executionRunId: null, executionLockedAt: null })
      .where(and(eq(issues.id, p.issueId), eq(issues.executionRunId, run.id)));
  }
  return { runId: run.id, estado, ...(error ? { motivo: error.slice(0, 200) } : {}) };
}

let reloj: ReturnType<typeof setInterval> | null = null;
const enCurso = new Set<string>(); // agentes corriendo ahora

/** El reloj del motor: cada minuto mira las tareas de los agentes migrados. */
export function iniciarMotor(db: Db): void {
  if (reloj) return;
  const concurrencia = Math.max(1, Number(process.env.LMTM_MOTOR_CONCURRENCIA) || 2);
  const tick = async () => {
    try {
      const { agentes } = await configMotor(db);
      if (!agentes.length) return;
      // Corridas que quedaron «running» de un proceso que se murió (deploy): a fallo.
      await db.update(heartbeatRuns).set({ status: "failed", error: "Se cortó sin terminar (reinicio del servidor).", finishedAt: new Date() })
        .where(and(eq(heartbeatRuns.invocationSource, FUENTE), eq(heartbeatRuns.status, "running"), sql`${heartbeatRuns.startedAt} < now() - interval '90 minutes'`));
      const libres = agentes.filter((a) => !enCurso.has(a));
      for (const p of await pendientes(db, libres)) {
        if (enCurso.size >= concurrencia) break;
        enCurso.add(p.agentId);
        void correrTarea(db, p)
          // Las omitidas (cuota, ritmo) se repiten cada minuto: no se loguean.
          .then((r) => { if (r.estado !== "omitida") console.log(`[motor] ${p.identifier ?? p.issueId}: ${r.estado}${r.motivo ? ` (${r.motivo})` : ""}`); })
          .catch((e) => console.warn("[motor] falló:", e instanceof Error ? e.message : e))
          .finally(() => enCurso.delete(p.agentId));
      }
    } catch (e) {
      console.warn("[motor] tick falló:", e instanceof Error ? e.message : e);
    }
  };
  reloj = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 45_000);
  console.log(`[motor] motor propio de agentes prendido (concurrencia ${concurrencia})`);
}

/** Para el panel: los agentes migrados con sus corridas de 7 días en este motor. */
export async function estadoMotor(db: Db) {
  const { agentes } = await configMotor(db);
  const todos = await db.select({ id: agents.id, name: agents.name, status: agents.status, adapterType: agents.adapterType }).from(agents)
    .where(inArray(agents.adapterType, ["claude_local"]));
  const r = await db.execute(sql`select agent_id, count(*)::int total, count(*) filter (where status = 'succeeded')::int bien,
      max(created_at) ultima from heartbeat_runs where invocation_source = ${FUENTE} and created_at > now() - interval '7 days' group by 1`);
  const corridas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<{ agent_id: string; total: number; bien: number; ultima: string }>;
  return todos.map((a) => {
    const c = corridas.find((x) => x.agent_id === a.id);
    return { id: a.id, nombre: a.name, estado: a.status, enMotorPropio: agentes.includes(a.id), corridas7d: c?.total ?? 0, bien7d: c?.bien ?? 0, ultima: c?.ultima ?? null };
  }).sort((x, y) => Number(y.enMotorPropio) - Number(x.enMotorPropio) || x.nombre.localeCompare(y.nombre));
}
