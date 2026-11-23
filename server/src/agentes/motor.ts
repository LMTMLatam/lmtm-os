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

import { and, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, instanceSettings, issueComments, issues } from "@paperclipai/db";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { enmascararClaves } from "../redaction.js";
import { publishLiveEvent } from "../services/live-events.js";

export const FUENTE = "motor_propio";
/** Corridas por tarea en 24 h: si no la resolvió en 3, que la mire una persona. */
export const MAX_CORRIDAS_POR_TAREA_DIA = 3;
/** Días sin movimiento después de los cuales una tarea ya no se corre sola. */
export const DIAS_VIGENTE = 7;

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

export interface Pendiente {
  issueId: string; identifier: string | null; title: string; status: string; priority: string; agentId: string;
  /** 0 rutina · 1 pedida por una persona · 2 urgente/alta de un cliente · 3 el resto (lo primero que se deja con poca cuota). */
  valor?: number;
  /** La corrida anterior se cortó por el tope de turnos: esta sigue desde su último comentario. */
  continua?: boolean;
  /** Sesión de Claude de la corrida cortada: la que sigue la retoma (19/11: arrancando de cero, 5 tareas se cortaron 5-6 veces sin terminar). */
  sesion?: string | null;
}

/**
 * Corridas cortas (18/11). Una corrida de 30 a 56 turnos releía todo el contexto en cada turno
 * (2 a 5 M de tokens) y con el plan semanal de MiniMax daban ~25 corridas por día para 12
 * agentes. Con tope de 20 y la consigna de dejar escrito lo hecho antes del 16, la tarea grande
 * se hace por partes y la que sigue arranca del comentario, no del contexto entero.
 * 20/11: sube a 30 (pedido de Naza): con 20, 40 de 60 corridas en 48 h se cortaron por el tope.
 */
export const TURNOS_MAX = 30;
export const AVISO_TURNOS = 25;
/** Con el gasto de la semana así de adelantado (5 puntos), solo corre lo de valor (0 a 2). */
export const CUOTA_AJUSTADA = 0.05;

/** Puro. La consigna que se le agrega a la tarea en cada corrida con tope. */
export function consignaDeTurnos(continua: boolean): string {
  return [
    "## Presupuesto de esta corrida",
    `Tenés como máximo ${TURNOS_MAX} turnos. Antes del turno ${AVISO_TURNOS}, dejá en la tarea un comentario con: qué hiciste (con los datos que lo prueban), qué falta y el próximo paso concreto. Después terminá.`,
    "Si la tarea es grande, hacé una parte bien y dejá el resto escrito: la próxima corrida arranca de tu comentario, no de cero. No releas lo que ya está en los comentarios.",
    ...(continua ? ["", "**La corrida anterior se cortó por el tope de turnos.** Seguí desde el último comentario de la tarea; no repitas lo que ya está hecho."] : []),
  ].join("\n");
}

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
      select i.id, i.identifier, i.title, i.status, i.priority, i.assignee_agent_id, i.created_at, i.origin_kind,
        case when i.origin_kind = 'routine_execution' then 0 when i.origin_kind = 'manual' then 1
             when i.client_id is not null and i.priority in ('critical', 'urgent', 'high') then 2 else 3 end as valor,
        -- Comentarios de otro (persona u otro agente). Los avisos administrativos de las limpiezas no despiertan a nadie.
        (select max(c.created_at) from issue_comments c where c.issue_id = i.id and c.author_agent_id is distinct from i.assignee_agent_id
           -- Tampoco los del propio motor (20/11): el rastro del corte revivía la tarea en revisión (LMTM-7105 corrió 3 veces más).
           and c.body !~ ${AVISOS_QUE_NO_DESPIERTAN}) ultimo_ajeno,
        (select max(r.created_at) from heartbeat_runs r where r.company_id = i.company_id and r.context_snapshot->>'issueId' = i.id::text and r.invocation_source = ${FUENTE}) ultima_corrida,
        -- La última corrida del motor sobre la tarea: si se cortó por el tope de turnos, la próxima la retoma (17/11).
        (select r.error_code from heartbeat_runs r where r.company_id = i.company_id and r.context_snapshot->>'issueId' = i.id::text and r.invocation_source = ${FUENTE} order by r.created_at desc limit 1) ultimo_codigo,
        (select r.session_id_after from heartbeat_runs r where r.company_id = i.company_id and r.context_snapshot->>'issueId' = i.id::text and r.invocation_source = ${FUENTE} order by r.created_at desc limit 1) ultima_sesion,
        -- Reparto justo (17/11): ordenando por id de agente, Luna/Milo/Caro se llevaban todos los turnos
        -- y los otros 9 no corrieron en 5 h. Primero va el que hace más que no corre.
        (select max(r.created_at) from heartbeat_runs r where r.agent_id = i.assignee_agent_id and r.invocation_source = ${FUENTE}) ultima_del_agente
      from issues i
      where i.assignee_agent_id in (${sql.join(agentesIds.map((id) => sql`${id}::uuid`), sql`, `)})
        and i.status in ('todo', 'in_progress', 'blocked', 'in_review') and i.hidden_at is null
        -- Vigencia, como el reloj de paperclip (DIAS_ISSUE_VIGENTE): una tarea que nadie toca hace más de
        -- DIAS_VIGENTE días no se revive sola (16/11: ~100 tareas de 7 a 30 días habrían corrido en fila).
        and i.updated_at > now() - make_interval(days => ${DIAS_VIGENTE})
        and not exists (select 1 from heartbeat_runs r where r.company_id = i.company_id and r.context_snapshot->>'issueId' = i.id::text and r.status in ('queued', 'running'))
        and (select count(*) from heartbeat_runs r where r.company_id = i.company_id and r.context_snapshot->>'issueId' = i.id::text
             and r.invocation_source = ${FUENTE} and r.created_at > now() - interval '24 hours') < ${MAX_CORRIDAS_POR_TAREA_DIA}
    )
    select * from (
    select distinct on (assignee_agent_id) id, identifier, title, status, priority, assignee_agent_id, ultima_del_agente, valor,
      coalesce(ultimo_codigo = 'max_turns_exhausted', false) as continua,
      case when ultimo_codigo = 'max_turns_exhausted' then ultima_sesion end as sesion
    from cand
    where (status in ('todo', 'in_progress') and (ultima_corrida is null or coalesce(ultimo_ajeno, created_at) > ultima_corrida
           or ultimo_codigo = 'max_turns_exhausted'))
       or (status in ('blocked', 'in_review') and ultimo_ajeno is not null and (ultima_corrida is null or ultimo_ajeno > ultima_corrida)
           and ultimo_ajeno > now() - interval '7 days')
    order by assignee_agent_id,
      -- La rutina del día primero (17/11): con 4 corridas por hora, detrás de 17 urgentes/altas el informe diario salía al otro día.
      valor,
      case priority when 'critical' then 0 when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, created_at
    ) x order by valor, ultima_del_agente nulls first`);
  const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
  return filas.map((f) => ({ issueId: String(f.id), identifier: (f.identifier as string) ?? null, title: String(f.title), status: String(f.status), priority: String(f.priority), agentId: String(f.assignee_agent_id), valor: Number(f.valor), continua: Boolean(f.continua), sesion: (f.sesion as string | null) ?? null }));
}

/** Últimas 5 entradas de la conversación de la tarea, para el contexto del despertar. */
async function comentariosRecientes(db: Db, issueId: string) {
  const r = await db.execute(sql`select id, body, author_type, author_agent_id, author_user_id, created_at from issue_comments
    where issue_id = ${issueId} order by created_at desc limit 5`);
  const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
  return filas.reverse().map((c) => ({ id: String(c.id), body: String(c.body ?? "").slice(0, 4000), authorType: c.author_type ?? null, authorAgentId: c.author_agent_id ?? null, authorUserId: c.author_user_id ?? null, createdAt: c.created_at }));
}

/** Cortes seguidos por el tope de turnos tras los que la tarea se frena para que la mire una persona. */
// 22/11: baja de 3 a 2. En 7 días, la tercera corrida tras dos cortes terminó 12 veces y se cortó 35 (62 M de tokens): la cuota semanal se agotó 10 h antes del reset.
export const CORTES_SEGUIDOS_MAX = 2;

/** Puro. El aviso que deja el motor al frenar una tarea por cortes seguidos. */
export function textoFrenada(): string {
  return `Frenada por cortes seguidos: ${CORTES_SEGUIDOS_MAX} corridas al hilo llegaron al tope de ${TURNOS_MAX} turnos sin terminar. No entra en una corrida: hay que partirla en tareas más chicas o achicarle el alcance. Un comentario de una persona la vuelve a correr.`;
}

/**
 * Los comentarios administrativos que NO despiertan al agente (regex de Postgres, también válida en JS). Todo aviso
 * nuevo que escriba el motor o una limpieza tiene que entrar acá: el 20/11 el rastro del corte no estaba y revivía
 * tareas en revisión (LMTM-7105 corrió 3 veces más). El test lo controla contra los textos reales.
 */
export const AVISOS_QUE_NO_DESPIERTAN = "^(Cerrada en la limpieza|Pasada a «en revisión»|La corrida se cortó por el tope|Frenada por cortes seguidos)";

/**
 * Puro. Con los códigos de error de las corridas ANTERIORES de la tarea (la más nueva primero), si el corte
 * de ahora completa CORTES_SEGUIDOS_MAX seguidos (20/11: LMTM-7110 se cortó 9 veces y LMTM-7195 6, 0 bien).
 */
export function demasiadosCortes(anteriores: Array<string | null>): boolean {
  const previos = anteriores.slice(0, CORTES_SEGUIDOS_MAX - 1);
  return previos.length === CORTES_SEGUIDOS_MAX - 1 && previos.every((c) => c === "max_turns_exhausted");
}

/** Puro. La config del agente con el tope de turnos de la corrida (el menor entre el suyo y TURNOS_MAX). */
export function conTopeDeTurnos(adapterConfig: unknown): Record<string, unknown> {
  const c = { ...((adapterConfig ?? {}) as Record<string, unknown>) };
  const suyo = Number(c.maxTurnsPerRun);
  c.maxTurnsPerRun = Number.isFinite(suyo) && suyo > 0 ? Math.min(suyo, TURNOS_MAX) : TURNOS_MAX;
  return c;
}

/**
 * Puro. El rastro de una corrida cortada por el tope (17/11): el agente no sabe en qué turno
 * va y Sergio se cortó sin dejar nada. De la salida stream-json se sacan las herramientas que
 * usó y sus últimos textos, para que la próxima corrida no arranque de cero.
 */
export function rastroDeCorte(salida: string): string | null {
  const herramientas = new Map<string, number>();
  const textos: string[] = [];
  for (const linea of salida.split("\n")) {
    let ev: { type?: string; message?: { content?: Array<{ type?: string; text?: string; name?: string }> } };
    try { ev = JSON.parse(linea); } catch { continue; } // la primera puede venir cortada
    if (ev?.type !== "assistant") continue;
    for (const b of ev.message?.content ?? []) {
      if (b.type === "tool_use" && b.name) herramientas.set(b.name, (herramientas.get(b.name) ?? 0) + 1);
      if (b.type === "text" && b.text?.trim()) textos.push(b.text.trim());
    }
  }
  if (!herramientas.size && !textos.length) return null;
  const usadas = [...herramientas].map(([n, k]) => `${n.replace(/^mcp__\w+__/, "")} ×${k}`).join(", ");
  return [
    `La corrida se cortó por el tope de ${TURNOS_MAX} turnos sin dejar comentario. Lo que alcanzó a hacer (lo arma el motor de su salida):`,
    ...(usadas ? [`- Herramientas: ${usadas}`] : []),
    ...textos.slice(-2).map((t) => `- «${t.slice(0, 600)}»`),
    "La próxima corrida sigue desde acá.",
  ].join("\n");
}

/**
 * Las corridas que este proceso está corriendo ahora (las del reloj y las manuales). La limpieza de colgadas solo da
 * por muerta una «running» que no esté acá: antes cortaba a los 90 min fijos, y el Editor tiene 90 de tope (auditoría 20/11).
 */
const corridasVivas = new Set<string>();

/** Corre UNA tarea con el adaptador del agente. Devuelve el estado de la corrida. */
export async function correrTarea(db: Db, p: Pendiente, opts: { manual?: boolean } = {}): Promise<{ runId: string | null; estado: string; motivo?: string }> {
  const [agent] = await db.select().from(agents).where(eq(agents.id, p.agentId)).limit(1);
  if (!agent) return { runId: null, estado: "omitida", motivo: "agente inexistente" };
  if (agent.status === "paused" || agent.status === "terminated") return { runId: null, estado: "omitida", motivo: `agente ${agent.status}` };

  const { corteParaDespertar, registrarCuotaAgotada, estadoCuota, proveedorDe, puntosAdelantado } = await import("../services/cuota-llm.js");
  // El tope de turnos y la cuota ajustada son del plan de MiniMax (el Productor va a OpenAI).
  const conTope = /minimax\.io/.test(proveedorDe(agent.adapterConfig));
  if (conTope && !opts.manual && (p.valor ?? 0) >= 3) {
    const e = await estadoCuota(agent.adapterConfig);
    if (e && puntosAdelantado(e) >= CUOTA_AJUSTADA) return { runId: null, estado: "omitida", motivo: "cuota ajustada: solo corre lo de valor" };
  }
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
    ...(conTope ? { paperclipTaskMarkdown: consignaDeTurnos(Boolean(p.continua)) } : {}),
  };
  const [run] = await db.insert(heartbeatRuns).values({
    companyId: agent.companyId, agentId: agent.id, invocationSource: FUENTE, status: "running",
    startedAt: new Date(), contextSnapshot: contexto, triggerDetail: FUENTE, sessionIdBefore: p.sesion ?? null,
  }).returning({ id: heartbeatRuns.id, createdAt: heartbeatRuns.createdAt });
  if (!run) return { runId: null, estado: "fallo", motivo: "no se pudo registrar la corrida" };
  corridasVivas.add(run.id);
  avisarCorrida(agent.companyId, run.id, agent.id, "running", null);

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
    // La tarea queda tomada por esta corrida (igual que el checkout de paperclip). Dentro del try: si falla, la corrida
    // se cierra como fallida y no queda «running» colgada hasta el reaper (Luna 18/11).
    await db.update(issues).set({
      status: p.status === "todo" ? "in_progress" : p.status, checkoutRunId: run.id, executionRunId: run.id, executionLockedAt: new Date(),
      startedAt: sql`coalesce(${issues.startedAt}, now())`, updatedAt: new Date(),
    }).where(eq(issues.id, p.issueId));
    await ponerEstado(db, agent.id, "running");

    const { getServerAdapter } = await import("../adapters/index.js");
    const adapter = getServerAdapter(agent.adapterType);
    const authToken = createLocalAgentJwt(agent.id, agent.companyId, agent.adapterType, run.id) ?? undefined;
    // Las claves guardadas como secret_ref se resuelven como en el heartbeat de paperclip (18/11: el Editor, el primero
    // con su clave en secret_ref, salía «Not logged in» porque el motor le pasaba la referencia y no el valor).
    const { secretService } = await import("../services/secrets.js");
    const { config } = await secretService(db).resolveAdapterConfigForRuntime(
      agent.companyId,
      conTope ? conTopeDeTurnos(agent.adapterConfig) : ((agent.adapterConfig ?? {}) as Record<string, unknown>),
      { consumerType: "agent", consumerId: agent.id, actorType: "agent", actorId: agent.id, issueId: p.issueId, heartbeatRunId: run.id },
    );
    // Las skills de la empresa, como en el heartbeat de paperclip (22/11: sin esto el adaptador solo veía las de /app/skills;
    // el núcleo —caveman, lmtm-ahorro-tokens— y las de la lista de cada agente salían «Unknown skill» desde la migración).
    const { companySkillService } = await import("../services/company-skills.js");
    const paperclipRuntimeSkills = await companySkillService(db).listRuntimeSkillEntries(agent.companyId)
      .catch((e) => { console.error("[motor] no se pudieron listar las skills:", e); return []; });
    const res = await adapter.execute({
      runId: run.id,
      agent: { id: agent.id, companyId: agent.companyId, name: agent.name, adapterType: agent.adapterType, adapterConfig: agent.adapterConfig },
      // Si la sesión ya no existe (un deploy borra el disco), el adaptador arranca una nueva solo.
      runtime: { sessionId: p.sesion ?? null, sessionParams: null, sessionDisplayId: null, taskKey: p.issueId },
      config: { ...config, paperclipRuntimeSkills },
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
    // Cortada por el tope: si el agente no comentó en esta corrida, el motor deja el rastro.
    if (errorCode === "max_turns_exhausted") {
      const [yaComento] = await db.select({ id: issueComments.id }).from(issueComments)
        .where(and(eq(issueComments.issueId, p.issueId), eq(issueComments.authorAgentId, agent.id), gte(issueComments.createdAt, run.createdAt))).limit(1);
      const rastro = yaComento ? null : rastroDeCorte(salida);
      if (rastro) await db.insert(issueComments).values({ companyId: agent.companyId, issueId: p.issueId, authorType: "system", body: enmascararClaves(rastro) } as never);
      // Tope de cortes seguidos: sin esto la tarea que no entra en el tope gasta 3 corridas por día toda su vigencia.
      const anteriores = await db.select({ c: heartbeatRuns.errorCode }).from(heartbeatRuns)
        .where(and(sql`${heartbeatRuns.contextSnapshot}->>'issueId' = ${p.issueId}`, ne(heartbeatRuns.id, run.id)))
        .orderBy(desc(heartbeatRuns.createdAt)).limit(CORTES_SEGUIDOS_MAX - 1);
      if (demasiadosCortes(anteriores.map((a) => a.c))) {
        const frenada = await db.update(issues).set({ status: "blocked", updatedAt: new Date() })
          .where(and(eq(issues.id, p.issueId), inArray(issues.status, ["todo", "in_progress"]))).returning({ id: issues.id });
        if (frenada.length) await db.insert(issueComments).values({
          companyId: agent.companyId, issueId: p.issueId, authorType: "system",
          body: textoFrenada(),
        } as never);
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    corridasVivas.delete(run.id);
    await db.update(heartbeatRuns).set({
      status: estado, finishedAt: new Date(), error: error ? enmascararClaves(error).slice(0, 2000) : null, errorCode,
      stdoutExcerpt: enmascararClaves(salida).slice(-8_000), stderrExcerpt: enmascararClaves(errores).slice(-4_000), updatedAt: new Date(),
    }).where(eq(heartbeatRuns.id, run.id));
    // Se suelta la tarea; si el agente no la cerró, queda como la dejó.
    await db.update(issues).set({ executionRunId: null, executionLockedAt: null })
      .where(and(eq(issues.id, p.issueId), eq(issues.executionRunId, run.id)));
    // Estado del agente en el panel, como lo dejaba paperclip (finalizeAgentStatus); no pisa pausado/terminado.
    // Cortada por el tope = previsto (la próxima la retoma): no pinta al agente de rojo (19/11: 9 en «error» por esto).
    await ponerEstado(db, agent.id, estado === "succeeded" || errorCode === "max_turns_exhausted" ? "idle" : "error", true);
    avisarCorrida(agent.companyId, run.id, agent.id, estado, errorCode);
  }
  return { runId: run.id, estado, ...(error ? { motivo: error.slice(0, 200) } : {}) };
}

/**
 * Avisa por el canal en vivo que una corrida empezó o terminó, con el mismo evento que usaba paperclip: el panel
 * refresca lo de agentes al instante en vez de preguntar cada 20 s (auditoría 20/11). Si falla, no frena la corrida.
 */
function avisarCorrida(companyId: string, runId: string, agentId: string, status: string, errorCode: string | null): void {
  try {
    publishLiveEvent({ companyId, type: "heartbeat.run.status", payload: { runId, agentId, status, invocationSource: FUENTE, errorCode } });
  } catch {
    /* el aviso es cortesía */
  }
}

async function ponerEstado(db: Db, agentId: string, status: "running" | "idle" | "error", latido = false): Promise<void> {
  await db.update(agents)
    .set({ status, updatedAt: new Date(), ...(latido ? { lastHeartbeatAt: new Date() } : {}) })
    .where(and(eq(agents.id, agentId), sql`${agents.status} not in ('paused', 'terminated')`))
    .catch(() => undefined);
}

let reloj: ReturnType<typeof setInterval> | null = null;
const enCurso = new Set<string>(); // agentes corriendo ahora
/** Agentes cuya tarea se omitió (cuota, ritmo) y hasta cuándo no se vuelven a probar. 22/11: los dos primeros de la
 *  lista ocupaban los dos lugares en cada minuto y, con MiniMax sin cuota, Milo (ya en Anthropic) no corría nunca. */
const omitidos = new Map<string, number>();
export const ESPERA_OMITIDO_MS = 5 * 60_000;

/** El reloj del motor: cada minuto mira las tareas de los agentes migrados. */
export function iniciarMotor(db: Db): void {
  if (reloj) return;
  const concurrencia = Math.max(1, Number(process.env.LMTM_MOTOR_CONCURRENCIA) || 2);
  const tick = async () => {
    try {
      const { agentes } = await configMotor(db);
      if (!agentes.length) return;
      // Corridas que quedaron «running» de un proceso que se murió (deploy): a fallo. Las que corre este proceso no se
      // tocan; los 10 min cubren el rato en que, durante un deploy, el contenedor viejo todavía está terminando las suyas.
      const vivas = [...corridasVivas];
      await db.update(heartbeatRuns).set({ status: "failed", error: "Se cortó sin terminar (reinicio del servidor).", finishedAt: new Date() })
        .where(and(
          eq(heartbeatRuns.invocationSource, FUENTE), eq(heartbeatRuns.status, "running"), sql`${heartbeatRuns.startedAt} < now() - interval '10 minutes'`,
          ...(vivas.length ? [notInArray(heartbeatRuns.id, vivas)] : []),
        ));
      // Tareas tomadas por una corrida del motor que ya terminó (cortada por el reaper o un deploy): se sueltan. Si no, la
      // rutina del día siguiente no puede tomar la suya (índice único issues_open_routine_execution_uq; Luna 18/11).
      await db.update(issues).set({ executionRunId: null, executionLockedAt: null })
        .where(sql`${issues.executionRunId} in (select id from heartbeat_runs where invocation_source = ${FUENTE} and status not in ('queued', 'running'))`);
      const libres = agentes.filter((a) => !enCurso.has(a) && (omitidos.get(a) ?? 0) < Date.now());
      for (const p of await pendientes(db, libres)) {
        if (enCurso.size >= concurrencia) break;
        enCurso.add(p.agentId);
        void correrTarea(db, p)
          // Las omitidas (cuota, ritmo) se repiten cada minuto: no se loguean.
          .then((r) => { if (r.estado === "omitida") omitidos.set(p.agentId, Date.now() + ESPERA_OMITIDO_MS); else console.log(`[motor] ${p.identifier ?? p.issueId}: ${r.estado}${r.motivo ? ` (${r.motivo})` : ""}`); })
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
  // Auditoría 20/11: una corrida cortada por el tope de turnos es diseño (la siguiente la retoma), no una falla; y lo que
  // importa es cuántas TAREAS terminó el agente, no cuántas corridas hizo.
  const r = await db.execute(sql`select agent_id, count(*)::int total, count(*) filter (where status = 'succeeded')::int bien,
      count(*) filter (where error_code = 'max_turns_exhausted')::int cortadas,
      max(created_at) ultima from heartbeat_runs where invocation_source = ${FUENTE} and created_at > now() - interval '7 days' group by 1`);
  const t = await db.execute(sql`select assignee_agent_id agent_id, count(*)::int terminadas from issues
      where status = 'done' and completed_at > now() - interval '7 days' and assignee_agent_id is not null group by 1`);
  const corridas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<{ agent_id: string; total: number; bien: number; cortadas: number; ultima: string }>;
  const tareas = (Array.isArray(t) ? t : ((t as { rows?: unknown[] }).rows ?? [])) as Array<{ agent_id: string; terminadas: number }>;
  return todos.map((a) => {
    const c = corridas.find((x) => x.agent_id === a.id);
    return {
      id: a.id, nombre: a.name, estado: a.status, enMotorPropio: agentes.includes(a.id),
      corridas7d: c?.total ?? 0, bien7d: c?.bien ?? 0, cortadas7d: c?.cortadas ?? 0,
      tareasTerminadas7d: tareas.find((x) => x.agent_id === a.id)?.terminadas ?? 0, ultima: c?.ultima ?? null,
    };
  }).sort((x, y) => Number(y.enMotorPropio) - Number(x.enMotorPropio) || x.nombre.localeCompare(y.nombre));
}
