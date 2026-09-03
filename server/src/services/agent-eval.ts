// LMTM-OS: weekly agent performance evaluation (pedido 25/7, patrón "Agent
// Engine": las interacciones ya se coleccionan en heartbeat_runs — usarlas para
// evaluar y mejorar cada agente en el tiempo).
//
// Per agent, once a week: aggregate its last-7-days runs (success/fail/timeout,
// duration, error excerpts) and issue outcomes (done vs blocked), have an LLM
// score the period and distill 1-3 actionable lessons, then persist:
//  - agents.metadata.lastEval  → visible en el panel / API
//  - learnings scope "agent"   → el agente las recibe en su próximo
//    get_team_lessons (sección "tu evaluación"), cerrando el loop
//    coleccionar → evaluar → mejorar sin tocar prompts a mano.

import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, issues, learnings } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { llmExtract } from "./client-tasks.js";
import { getRunLogStore } from "./run-log-store.js";

const PERIOD_DAYS = 7;

// ── Eje de TRAYECTORIA (curso reliable-agents 26/7): evaluar CÓMO llegó el
// agente, no solo el resultado. Dos señales baratas extraídas de los logs:
// (a) loops — la misma tool llamada ≥5 veces en una corrida (agente trabado,
// quema tokens); (b) "sin fuente" — comentó/cerró un issue sin haber llamado
// NINGUNA tool de lectura de datos (la respuesta plausible pero inventada).
const TRAJ_SAMPLE = 8;
const LOOP_THRESHOLD = 5;
const READ_TOOL_RE = /^(mcp__\w*(Get|List|Read|Search|read|list|search|metadata|processes)\w*|WebFetch|WebSearch|Read|Grep|Glob)/;
const DELIVER_TOOL_RE = /^mcp__\w*(AddComment|UpdateIssue|CreateIssue|SaveDeliverable|add_comment|create_task|update_task)/;

interface Trayectoria {
  muestras: number;
  conLoops: number;
  sinFuente: number;
  ejemplos: string[];
}

async function readRunToolCalls(run: { logStore: string | null; logRef: string | null }): Promise<string[] | null> {
  if (run.logStore !== "local_file" || !run.logRef) return null;
  const store = getRunLogStore();
  let offset = 0;
  let raw = "";
  while (raw.length < 4_000_000) {
    const res = await store.read({ store: "local_file", logRef: run.logRef }, { offset, limitBytes: 512_000 }).catch(() => null);
    if (!res) break;
    raw += res.content;
    if (res.nextOffset == null) break;
    offset = res.nextOffset;
  }
  if (!raw) return null;
  const chunks: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const p = JSON.parse(line) as { chunk?: unknown };
      if (typeof p.chunk === "string") chunks.push(p.chunk);
    } catch { /* línea cortada por el cap de lectura */ }
  }
  const joined = chunks.join("");
  const calls: string[] = [];
  const re = /"type":"tool_use","id":"[^"]*","name":"([A-Za-z0-9_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) calls.push(m[1]);
  return calls;
}

async function analizarTrayectorias(db: Db, agentId: string, since: Date): Promise<Trayectoria | null> {
  const runs = await db
    .select({ id: heartbeatRuns.id, logStore: heartbeatRuns.logStore, logRef: heartbeatRuns.logRef, triggerDetail: heartbeatRuns.triggerDetail })
    .from(heartbeatRuns)
    .where(and(
      eq(heartbeatRuns.agentId, agentId),
      gte(heartbeatRuns.createdAt, since),
      inArray(heartbeatRuns.status, ["succeeded", "failed", "timed_out"] as never),
      eq(heartbeatRuns.logStore, "local_file"),
    ))
    .orderBy(desc(heartbeatRuns.createdAt))
    .limit(TRAJ_SAMPLE);
  if (runs.length === 0) {
    console.warn(`[agent-eval] trayectoria: 0 runs con log local_file para agente ${agentId}`);
    return null;
  }

  const t: Trayectoria = { muestras: 0, conLoops: 0, sinFuente: 0, ejemplos: [] };
  for (const run of runs) {
    const calls = await readRunToolCalls(run).catch(() => null);
    if (!calls || calls.length === 0) continue;
    t.muestras += 1;
    const counts = new Map<string, number>();
    for (const c of calls) counts.set(c, (counts.get(c) ?? 0) + 1);
    const [loopTool, loopN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (loopN >= LOOP_THRESHOLD) {
      t.conLoops += 1;
      if (t.ejemplos.length < 3) t.ejemplos.push(`llamó ${loopTool} ${loopN} veces en una corrida`);
    }
    const entrego = calls.some((c) => DELIVER_TOOL_RE.test(c));
    const leyo = calls.some((c) => READ_TOOL_RE.test(c));
    if (entrego && !leyo) {
      t.sinFuente += 1;
      if (t.ejemplos.length < 3) t.ejemplos.push("entregó (comentario/issue) sin llamar ninguna tool de lectura de datos");
    }
  }
  return t.muestras > 0 ? t : null;
}

interface AgentEval {
  score: number;
  resumen: string;
  lecciones: string[];
}

// MiniMax (the fallback LLM) sometimes leaks CJK/Cyrillic tokens mid-sentence;
// the fleet has a strict Spanish-only rule, so a polluted lesson is dropped
// (better to lose one than to feed garbled advice to an agent).
const NON_LATIN = /[Ѐ-ӿ　-ヿ一-鿿가-힯]/;

function parseEval(raw: string): AgentEval | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const score = Number(o.score);
    const resumen = typeof o.resumen === "string" ? o.resumen.trim().replace(new RegExp(NON_LATIN.source, "g"), "") : "";
    const lecciones = Array.isArray(o.lecciones)
      ? o.lecciones
          .filter((l): l is string => typeof l === "string" && l.trim().length > 0 && !NON_LATIN.test(l))
          .map((l) => l.trim().slice(0, 600))
          .slice(0, 3)
      : [];
    if (!Number.isFinite(score) || !resumen) return null;
    return { score: Math.max(0, Math.min(100, Math.round(score))), resumen: resumen.slice(0, 600), lecciones };
  } catch {
    return null;
  }
}

const EVAL_SYSTEM =
  "Sos el evaluador de desempeño de una flota de agentes IA de una agencia de marketing. " +
  "Recibís las métricas operativas de UN agente en los últimos 7 días (corridas, errores, issues resueltos/bloqueados). " +
  "Evaluá con criterio: muchos timeouts o issues bloqueados = problema; corridas exitosas que cierran issues = bien. " +
  "Si hay datos de TRAYECTORIA, pesalos fuerte: loops de tools (misma tool ≥5 veces) = agente trabado que quema recursos; 'entregó sin leer datos' = respuesta sin fuente, el peor defecto (números probablemente inventados). " +
  "Las lecciones deben ser ACCIONABLES y dirigidas al agente en segunda persona (ej. 'Cuando el issue dependa de un humano, dejá comentario y marcá blocked en vez de reintentar'), " +
  "basadas SOLO en la evidencia dada — no inventes causas. Si el período fue limpio, devolvé lecciones = []. " +
  'Respondé ÚNICAMENTE con JSON: {"score": 0-100, "resumen": "1-2 frases del período", "lecciones": ["...", "..."]} (máx 3 lecciones).';

/** Collect the last-7-days operational evidence for one agent, as prompt text. */
async function collectEvidence(db: Db, agentId: string): Promise<{ text: string; runs: number } | null> {
  const since = new Date(Date.now() - PERIOD_DAYS * 86400000);
  const runRows = await db
    .select({
      status: heartbeatRuns.status,
      c: sql<number>`count(*)::int`,
      avgMin: sql<number | null>`round(avg(extract(epoch from (${heartbeatRuns.finishedAt} - ${heartbeatRuns.startedAt})) / 60)::numeric, 1)::float`,
    })
    .from(heartbeatRuns)
    .where(and(eq(heartbeatRuns.agentId, agentId), gte(heartbeatRuns.createdAt, since)))
    .groupBy(heartbeatRuns.status);
  const totalRuns = runRows.reduce((s, r) => s + r.c, 0);
  if (totalRuns === 0) return null;

  const errRows = await db
    .select({ error: heartbeatRuns.error, stderr: heartbeatRuns.stderrExcerpt })
    .from(heartbeatRuns)
    .where(and(
      eq(heartbeatRuns.agentId, agentId),
      gte(heartbeatRuns.createdAt, since),
      inArray(heartbeatRuns.status, ["failed", "timed_out"] as never),
    ))
    .orderBy(desc(heartbeatRuns.createdAt))
    .limit(20);
  const errSamples = [...new Set(errRows.map((r) => (r.error ?? r.stderr ?? "").trim().slice(0, 200)).filter(Boolean))].slice(0, 4);

  const issueRows = await db
    .select({ status: issues.status, c: sql<number>`count(*)::int` })
    .from(issues)
    .where(and(eq(issues.assigneeAgentId, agentId), gte(issues.updatedAt, since)))
    .groupBy(issues.status);
  const blockedTitles = await db
    .select({ title: issues.title })
    .from(issues)
    .where(and(eq(issues.assigneeAgentId, agentId), eq(issues.status, "blocked")))
    .orderBy(desc(issues.updatedAt))
    .limit(5);

  const lines = [
    `Corridas (${PERIOD_DAYS} días): ` + runRows.map((r) => `${r.status}=${r.c}${r.avgMin != null ? ` (avg ${r.avgMin} min)` : ""}`).join(", "),
    `Issues asignados tocados en el período: ` + (issueRows.length ? issueRows.map((r) => `${r.status}=${r.c}`).join(", ") : "ninguno"),
  ];
  if (errSamples.length) lines.push("Errores recientes (muestra):\n" + errSamples.map((e) => `  - ${e}`).join("\n"));
  if (blockedTitles.length) lines.push("Issues actualmente bloqueados:\n" + blockedTitles.map((t) => `  - ${(t.title ?? "").slice(0, 100)}`).join("\n"));
  return { text: lines.join("\n"), runs: totalRuns };
}

/** Evaluate every claude_local agent and persist metadata + agent-scoped lessons. */
export async function runAgentEvals(db: Db): Promise<{ evaluated: number; skipped: number }> {
  const roster = await db
    .select({ id: agents.id, name: agents.name, companyId: agents.companyId, metadata: agents.metadata })
    .from(agents)
    .where(eq(agents.adapterType, "claude_local"));
  let evaluated = 0;
  let skipped = 0;
  for (const agent of roster) {
    try {
      const evidence = await collectEvidence(db, agent.id);
      if (!evidence) { skipped += 1; continue; }
      // Segundo eje: trayectoria (loops de tools, entregas sin fuente).
      const since = new Date(Date.now() - PERIOD_DAYS * 86400000);
      const tray = await analizarTrayectorias(db, agent.id, since).catch((e) => {
        console.warn(`[agent-eval] trayectoria failed for ${agent.name}:`, e instanceof Error ? e.message : e);
        return null;
      });
      const trayLine = tray
        ? `\nTrayectoria (muestra de ${tray.muestras} corridas): ${tray.conLoops} con loop de tools (misma tool ≥${LOOP_THRESHOLD} veces), ${tray.sinFuente} entregaron sin leer datos.` +
          (tray.ejemplos.length ? `\n  Ejemplos: ${tray.ejemplos.join("; ")}` : "")
        : "";
      const raw = await llmExtract(EVAL_SYSTEM, `Agente: ${agent.name}\n${evidence.text}${trayLine}`);
      const verdict = raw ? parseEval(raw) : null;
      if (!verdict) { skipped += 1; continue; }

      const meta = (agent.metadata ?? {}) as Record<string, unknown>;
      await db.update(agents).set({
        metadata: { ...meta, lastEval: { at: new Date().toISOString(), periodDays: PERIOD_DAYS, runs: evidence.runs, ...(tray ? { trayectoria: tray } : {}), ...verdict } },
        updatedAt: new Date(),
      } as never).where(eq(agents.id, agent.id));

      // Replace (not accumulate) this agent's lessons: an eval reflects the
      // CURRENT period; last week's advice may already be obsolete.
      await db.delete(learnings).where(and(eq(learnings.scope, "agent"), eq(learnings.scopeKey, agent.id)));
      for (const lesson of verdict.lecciones) {
        await db.insert(learnings).values({
          companyId: agent.companyId, scope: "agent", scopeKey: agent.id, pattern: lesson,
          evidence: { agentName: agent.name, score: verdict.score, periodDays: PERIOD_DAYS },
          metricImpact: "agent_eval", confidence: "0.6", occurrences: 1, lastSeenAt: new Date(),
        }).onConflictDoNothing();
      }
      evaluated += 1;
    } catch (e) {
      console.warn(`[agent-eval] failed for ${agent.name}:`, e);
      skipped += 1;
    }
  }
  console.log(`[agent-eval] evaluated ${evaluated} agent(s), skipped ${skipped}`);
  return { evaluated, skipped };
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastRunDay = "";

export function initAgentEval(db: Db): void {
  if (timer) return;
  // Weekly, Mondays: checks every 6h, fires once per Monday.
  const tick = async () => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    if (dayKey === lastRunDay || now.getUTCDay() !== 1) return;
    lastRunDay = dayKey;
    await runAgentEvals(db).catch((e) => console.warn("[agent-eval] run failed:", e));
  };
  setTimeout(() => { void tick(); }, 12 * 60 * 1000);
  timer = setInterval(() => { void tick(); }, 6 * 3600 * 1000);
  console.log("[agent-eval] scheduled weekly agent performance evals (Mondays)");
}
