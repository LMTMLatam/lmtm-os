// LMTM-OS: weekly growth roundtable.
//
// The agency has no "growth" workstream — every issue today is client-account
// work. This gives the team a recurring, agent-run space to debate how to grow
// the AGENCY itself: automate manual internal processes (e.g. the redes/video
// sheets that today need a person to build), upsell/retention plays, internal
// efficiency, and brand/positioning. One issue per week, Pablo (triage owner)
// as the standing thread owner, the relevant specialists invited by @mention
// (which already wakes them up — see issues.ts `findMentionedAgents` +
// heartbeat wakeup on comment). Debate is autonomous; anything that would mean
// touching LMTM-OS code/infra becomes a PROPOSAL for engineering, never
// something the agents implement themselves (same boundary as the harness
// off-limits rule).

import type { Db } from "@paperclipai/db";
import { agents, companies, issues } from "@paperclipai/db";
import { and, eq, gte, ilike, ne } from "drizzle-orm";
import { aiNarrative } from "./agency-ops.js";
import { issueService } from "./issues.js";
import { resolveTriageOwnerId } from "./client-tasks.js";
import { heartbeatService } from "./heartbeat.js";

interface FocusArea {
  key: string;
  label: string;
  seed: string;
  specialistPattern: RegExp;
}

// Rotates weekly. `specialistPattern` matches against agent display names to
// pick who gets invited (kept as simple substring/regex, same style as
// issue-router.ts's area→agent matching).
const FOCUS_AREAS: FocusArea[] = [
  {
    key: "automation",
    label: "Automatizar procesos manuales de la agencia",
    seed: "Ejemplo semilla: las planillas (sheets) de redes y de producción de video de cada cliente hoy las arma/actualiza una persona a mano — evaluar si se puede automatizar con Apps Script / Google Sheets API / n8n, y qué otros procesos manuales similares existen.",
    specialistPattern: /content|n8n|dashboards|crm engineer/i,
  },
  {
    key: "upsell",
    label: "Upsell y retención de clientes actuales",
    seed: "Foco en detectar clientes con espacio para más servicios (contenido, pauta, CRM) y señales tempranas de riesgo de churn.",
    specialistPattern: /paid media|crm analyst|conversion/i,
  },
  {
    key: "efficiency",
    label: "Eficiencia interna de la agencia",
    seed: "Foco en procesos internos que hacen perder tiempo al equipo: reportes redundantes, tareas repetitivas, cuellos de botella entre roles.",
    specialistPattern: /crm engineer|n8n|dashboards|data analyst/i,
  },
  {
    key: "brand",
    label: "Estrategia de marca y posicionamiento",
    seed: "Foco en cómo se diferencia LMTM en el mercado, qué nicho conviene profundizar, qué dice la competencia que nosotros no.",
    specialistPattern: /brand|competitor|seo/i,
  },
];

// Single ISO-week source: both the dedup key and the focus rotation derive from
// the same {year, week} so they can never tick over on different days (the old
// weekNumber used a non-ISO Jan-1 count that diverged from isoWeekKey around
// year boundaries, letting a focus area repeat or get skipped).
function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

/** Create this week's growth roundtable issue and invite the relevant specialists. */
export async function runGrowthRoundtable(db: Db): Promise<{ created: boolean; issueId?: string }> {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) return { created: false };

  // Idempotency guard: skip if a roundtable was already created this week —
  // protects against duplicate scheduler ticks AND a double manual trigger via
  // the /growth/roundtable/run route (which bypasses the scheduler's own
  // last-week dedup since it calls this function directly).
  const sixDaysAgo = new Date(Date.now() - 6 * 86400000);
  const [recent] = await db.select({ id: issues.id }).from(issues).where(and(
    eq(issues.companyId, company.id),
    ilike(issues.title, "[MESA REDONDA]%"),
    ne(issues.status, "cancelled"),
    gte(issues.createdAt, sixDaysAgo),
  )).limit(1);
  if (recent) return { created: false };

  const focus = FOCUS_AREAS[isoWeek(new Date()).week % FOCUS_AREAS.length];
  const roster = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.companyId, company.id));
  const specialists = roster.filter((a) => focus.specialistPattern.test(a.name));

  const system = [
    "Sos Luna, CMO de LMTM, agencia de marketing latinoamericana.",
    "Cada semana planteás el tema de la mesa redonda de growth de la agencia (no de un cliente puntual, de la AGENCIA misma): qué automatizar, qué vender más, dónde somos ineficientes, cómo posicionarnos.",
    "Escribí un planteo concreto y accionable, no genérico. 4-6 oraciones: contexto breve + la pregunta específica que le hacés al equipo.",
    "Español rioplatense, directo, como lo escribiría una CMO real, no un chatbot.",
  ].join("\n");
  const user = `Área de esta semana: ${focus.label}\n${focus.seed}\nEspecialistas convocados: ${specialists.map((s) => s.name).join(", ") || "(equipo general)"}`;

  const framing = (await aiNarrative(system, user).catch(() => null))
    ?? `${focus.label}. ${focus.seed} ¿Qué opina cada uno desde su área? Quiero una propuesta concreta, no un diagnóstico genérico.`;

  const pabloId = await resolveTriageOwnerId(db, company.id);
  const mentions = specialists.map((s) => `@${s.name}`).join(" ");
  const description = [
    `**Luna (CMO) plantea el tema de esta semana:**`,
    framing,
    "",
    mentions ? `Especialistas convocados: ${mentions}` : "",
    "",
    "**Cómo participar:** comentá tu perspectiva REAL desde tu área — no un resumen genérico. Si disentís con algo, decilo. Si querés el input de otro colega, mencionalo con @.",
    "**Cierre:** Pablo sintetiza una decisión concreta en los próximos días y abre issues de seguimiento si corresponde.",
    "**Límite importante:** si la conclusión implica tocar código, infraestructura, o el propio LMTM-OS, eso queda como PROPUESTA para que ingeniería la evalúe — nadie del equipo la implementa directamente.",
  ].filter(Boolean).join("\n");

  const created = await issueService(db).create(company.id, {
    title: `[MESA REDONDA] ${focus.label}`.slice(0, 200),
    description,
    status: "todo",
    priority: "medium",
    clientId: null,
    originKind: "manual",
    createdByAgentId: null,
    ...(pabloId ? { assigneeAgentId: pabloId } : {}),
  });
  const issueId = String(created.id ?? "");
  if (!issueId) return { created: false };

  const heartbeat = heartbeatService(db);
  for (const s of specialists) {
    await heartbeat.wakeup(s.id, {
      source: "automation",
      triggerDetail: "system",
      reason: "growth_roundtable_invited",
      payload: { issueId },
      contextSnapshot: { issueId, taskId: issueId, wakeReason: "growth_roundtable_invited", source: "growth.roundtable" },
    }).catch(() => {});
  }

  return { created: true, issueId };
}

let roundtableTimer: ReturnType<typeof setInterval> | null = null;

// Argentina is UTC-3 year-round (no DST), so derive the local day-of-week from a
// fixed offset instead of getDay() — the server runs in UTC (Railway), where
// getDay() would flip to "Monday" on Sunday 21:00 ART.
const ART_OFFSET_MS = 3 * 3600 * 1000;
function argentinaDayOfWeek(now: Date): number {
  return new Date(now.getTime() - ART_OFFSET_MS).getUTCDay();
}

export function initGrowthRoundtable(db: Db): void {
  if (roundtableTimer) return;
  const ROUNDTABLE_DOW = Number(process.env.LMTM_ROUNDTABLE_DOW ?? 1); // Monday, ART
  const tick = async () => {
    if (argentinaDayOfWeek(new Date()) !== ROUNDTABLE_DOW) return;
    // No in-memory week guard: runGrowthRoundtable's own DB idempotency check
    // (a non-cancelled [MESA REDONDA] issue in the last 6 days) already handles
    // duplicate ticks, restarts, and manual triggers — and, unlike a pre-set
    // in-memory flag, it retries on the next tick if a run fails.
    await runGrowthRoundtable(db)
      .then((r) => console.log(`[growth-roundtable] created: ${r.created} (${r.issueId ?? "n/a"})`))
      .catch((e) => console.warn("[growth-roundtable] failed:", e));
  };
  // Boot check a few minutes in (in case today is already the scheduled day
  // and the server restarted after it should have fired), then check every 3h.
  setTimeout(() => { void tick(); }, 4 * 60 * 1000);
  roundtableTimer = setInterval(() => { void tick(); }, 3 * 3600 * 1000);
  console.log("[growth-roundtable] scheduled weekly growth roundtable");
}
