// LMTM-OS: Centro de Inteligencia — motor de vigilantes (pedido 2026-07-18).
//
// Un vigilante observa un área y produce INTERVENCIONES (alertas,
// oportunidades, aprendizajes) con nivel de interrupción 1-5:
//   5 → WhatsApp inmediato · 4 → WhatsApp agrupable · 3 → brief diario
//   2 → dashboard · 1 → solo historial.
// Regla dura del equipo: máximo LMTM_MAX_INTERRUPTIONS_DAY (def. 8) mensajes
// reales por día — si un día llegan 40, el sistema falló. El dedupe_key evita
// re-alertar lo mismo mientras la intervención siga abierta.
//
// v1: vigilante de Salud Financiera de Campañas. El monitor de saldo existente
// (balance-monitor) ya cubre low/pacing/frenadas — acá se suman las reglas del
// doc del 18/7: consumo bruscamente mayor al promedio y cuenta activa sin
// actividad, y todo queda persistido en `interventions` para el dashboard y el
// brief de las 8:00/18:00.

import type { Db } from "@paperclipai/db";
import { adsInsights, clients, interventions } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { fetchAccountBalances } from "./balance-monitor.js";
import { sendWhatsAppToNumber, alertsNumber, dayStr } from "./agency-ops.js";

const MAX_INTERRUPTIONS_DAY = Number(process.env.LMTM_MAX_INTERRUPTIONS_DAY) || 8;
// Grupo del equipo para el brief (decisión del 18/7: WhatsApp al grupo).
// Hasta que el usuario pase el grupo, cae al número interno de alertas.
const briefNumber = () => process.env.LMTM_TEAM_WA_GROUP || alertsNumber();

export interface InterventionInput {
  vigilante: string;
  kind?: string;
  level: number;
  clientId?: string | null;
  title: string;
  body?: string;
  dedupeKey: string;
  evidence?: Record<string, unknown>;
}

/** Upsert por dedupe_key abierto: si ya existe la misma intervención abierta,
 *  refresca evidencia y NO se considera nueva (no re-interrumpe). */
export async function recordIntervention(db: Db, input: InterventionInput): Promise<{ id: string; isNew: boolean }> {
  const [existing] = await db.select({ id: interventions.id })
    .from(interventions)
    .where(and(eq(interventions.dedupeKey, input.dedupeKey), inArray(interventions.status, ["open", "sent"])));
  if (existing) {
    await db.update(interventions)
      .set({ evidence: input.evidence ?? {}, body: input.body ?? null, updatedAt: new Date() })
      .where(eq(interventions.id, existing.id));
    return { id: existing.id, isNew: false };
  }
  const [row] = await db.insert(interventions).values({
    vigilante: input.vigilante,
    kind: input.kind ?? "alerta",
    level: Math.min(5, Math.max(1, input.level)),
    clientId: input.clientId ?? null,
    title: input.title.slice(0, 300),
    body: input.body?.slice(0, 2000) ?? null,
    dedupeKey: input.dedupeKey.slice(0, 200),
    evidence: input.evidence ?? {},
  }).returning({ id: interventions.id });
  return { id: row.id, isNew: true };
}

/** Presupuesto de interrupciones del día: cuántos envíos reales quedan. */
export async function interruptionsLeftToday(db: Db): Promise<number> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [r] = await db.select({ n: sql<number>`count(*)::int` })
    .from(interventions)
    .where(and(gte(interventions.sentAt, today), gte(interventions.level, 4)));
  return Math.max(0, MAX_INTERRUPTIONS_DAY - (r?.n ?? 0));
}

/** Marca intervenciones como enviadas (para el conteo del tope diario). */
async function markSent(db: Db, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.update(interventions)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(inArray(interventions.id, ids));
}

// ── Vigilante: Salud Financiera de Campañas ────────────────────────────────

export async function runVigilanteFinanciera(db: Db): Promise<{ nuevas: number; enviadas: number }> {
  const balances = await fetchAccountBalances(db);
  const today = dayStr(new Date());
  const yesterday = dayStr(new Date(Date.now() - 86_400_000));
  const since8 = dayStr(new Date(Date.now() - 8 * 86_400_000));

  // Gasto por cuenta por día (últimos 8 días) para consumo-brusco y sin-actividad.
  const spendRows = await db.select({
    adAccountId: adsInsights.adAccountId,
    date: adsInsights.date,
    spend: sql<string>`coalesce(sum(${adsInsights.spend})::numeric,0)`,
    impressions: sql<number>`coalesce(sum(${adsInsights.impressions}),0)::int`,
  }).from(adsInsights)
    .where(gte(adsInsights.date, since8))
    .groupBy(adsInsights.adAccountId, adsInsights.date);
  const bare = (a: string) => a.replace(/^act_/, "");
  const byAccount = new Map<string, Array<{ date: string; spend: number; impressions: number }>>();
  for (const r of spendRows) {
    const k = bare(r.adAccountId);
    const arr = byAccount.get(k) ?? [];
    arr.push({ date: r.date, spend: Number(r.spend), impressions: r.impressions });
    byAccount.set(k, arr);
  }

  const fmt = (n: number, cur: string) => `${cur} ${Math.round(n).toLocaleString("es-AR")}`;
  let nuevas = 0;
  const toSend: Array<{ id: string; level: number; line: string }> = [];

  for (const b of balances) {
    const days = byAccount.get(bare(b.account)) ?? [];
    const latest = days.find((d) => d.date === yesterday) ?? days.find((d) => d.date === today);
    const prior = days.filter((d) => d.date !== yesterday && d.date !== today && d.spend > 0);
    const avgPrior = prior.length ? prior.reduce((s, d) => s + d.spend, 0) / prior.length : 0;

    // Regla: saldo bajo / frenada (nivel 5) — la detección vive en balance-monitor,
    // acá solo se persiste para el dashboard/brief (el WA ya lo manda ese monitor).
    if (b.low || [2, 3, 7].includes(b.accountStatus)) {
      const halted = [2, 3, 7].includes(b.accountStatus);
      const r = await recordIntervention(db, {
        vigilante: "financiera", level: 5, clientId: b.clientId,
        title: halted ? `${b.clientName}: cuenta de Meta frenada (status ${b.accountStatus})` : `${b.clientName}: saldo de Meta por agotarse`,
        body: `Quedan ${fmt(b.remaining ?? 0, b.currency)} (gasta ${fmt(b.dailySpend, b.currency)}/día).` +
          `\n\nMensaje sugerido para el cliente:\n"Buenas! Quería avisarte que el saldo se está agotando y es importante reforzarlo. Ahora tenemos ${fmt(b.remaining ?? 0, b.currency)} y nos puede durar ~${b.daysLeft != null ? Math.floor(b.daysLeft) : "?"} día(s) con los avisos activos."`,
        dedupeKey: `financiera:saldo:${b.account}`,
        evidence: { remaining: b.remaining, dailySpend: b.dailySpend, daysLeft: b.daysLeft, accountStatus: b.accountStatus },
      });
      if (r.isNew) nuevas++;
      continue; // no apilar más reglas sobre una cuenta ya crítica
    }

    // Regla nueva: consumo bruscamente mayor al promedio (≥3× y monto real).
    if (latest && avgPrior > 0 && latest.spend >= avgPrior * 3 && latest.spend - avgPrior > 10_000) {
      const r = await recordIntervention(db, {
        vigilante: "financiera", level: 4, clientId: b.clientId, kind: "alerta",
        title: `${b.clientName}: consumo de pauta ${Math.round(latest.spend / avgPrior)}× el promedio`,
        body: `Ayer gastó ${fmt(latest.spend, b.currency)} vs promedio ${fmt(avgPrior, b.currency)}/día. Revisar si es intencional (campaña nueva/escalada) o un error de presupuesto.`,
        dedupeKey: `financiera:brusco:${b.account}:${yesterday}`,
        evidence: { latest: latest.spend, avgPrior, date: yesterday },
      });
      if (r.isNew) { nuevas++; toSend.push({ id: r.id, level: 4, line: `⚡ *${b.clientName}*: gastó ${fmt(latest.spend, b.currency)} ayer (${Math.round(latest.spend / avgPrior)}× su promedio)` }); }
    }

    // Regla nueva: cuenta con historial de gasto que quedó SIN actividad 48h.
    const recent2 = days.filter((d) => d.date >= dayStr(new Date(Date.now() - 2 * 86_400_000)));
    const active2 = recent2.some((d) => d.spend > 0 || d.impressions > 0);
    if (!active2 && avgPrior > 1000 && b.accountStatus === 1) {
      const r = await recordIntervention(db, {
        vigilante: "financiera", level: 4, clientId: b.clientId,
        title: `${b.clientName}: cuenta sin actividad hace 48h`,
        body: `Venía gastando ${fmt(avgPrior, b.currency)}/día y hace 48h no registra gasto ni impresiones, con la cuenta activa. Puede ser campaña pausada, rechazo de anuncio o error de pago.`,
        dedupeKey: `financiera:sin-actividad:${b.account}`,
        evidence: { avgPrior, accountStatus: b.accountStatus },
      });
      if (r.isNew) { nuevas++; toSend.push({ id: r.id, level: 4, line: `😴 *${b.clientName}*: cuenta activa pero sin gasto/impresiones hace 48h` }); }
    }
  }

  // Envío nivel 4 AGRUPADO en un solo WhatsApp, respetando el tope diario.
  let enviadas = 0;
  const budget = await interruptionsLeftToday(db);
  if (toSend.length > 0 && budget > 0) {
    const batch = toSend.slice(0, budget);
    const team = briefNumber();
    if (team) {
      const msg = ["*⚠️ Vigilante financiero — atención hoy*", "", ...batch.map((t) => `• ${t.line}`), "", "_LMTM-OS · Centro de Inteligencia_"].join("\n");
      const res = await sendWhatsAppToNumber(team, msg);
      if (res.ok) { await markSent(db, batch.map((t) => t.id)); enviadas = batch.length; }
    }
  }
  return { nuevas, enviadas };
}

// ── Vigilante: Contenido ───────────────────────────────────────────────────
// Reusa los monitores existentes en modo dry-run (ellos siguen mandando su
// digest de WhatsApp; acá se persiste el estado para dashboard/brief y se
// auto-resuelve lo que dejó de estar mal).

/** Resuelve intervenciones abiertas de un vigilante cuyo dedupe_key ya no está
 *  en el set vigente (el problema desapareció → se cierra solo). */
async function autoResolve(db: Db, prefix: string, activeKeys: Set<string>): Promise<number> {
  const open = await db.select({ id: interventions.id, key: interventions.dedupeKey })
    .from(interventions)
    .where(and(inArray(interventions.status, ["open", "sent"]), sql`${interventions.dedupeKey} like ${prefix + "%"}`));
  const gone = open.filter((o) => !activeKeys.has(o.key));
  if (gone.length) {
    await db.update(interventions)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(inArray(interventions.id, gone.map((g) => g.id)));
  }
  return gone.length;
}

export async function runVigilanteContenido(db: Db): Promise<{ nuevas: number; resueltas: number }> {
  const { runPublicationCheck, runInactivityCheck } = await import("./publication-monitor.js");
  let nuevas = 0;
  const activeKeys = new Set<string>();

  // Aprobado/programado que no salió (la regla única: start_date pasó sin
  // "mandado a make") — "uno de los más importantes" según el doc del 18/7.
  const pub = await runPublicationCheck(db, { dryRun: true }).catch(() => null);
  if (pub) {
    const byClient = new Map<string, typeof pub.overdue>();
    for (const o of pub.overdue) {
      const arr = byClient.get(o.clientName) ?? []; arr.push(o); byClient.set(o.clientName, arr);
    }
    for (const [clientName, items] of byClient) {
      const key = `contenido:overdue:${clientName}`;
      activeKeys.add(key);
      const r = await recordIntervention(db, {
        vigilante: "contenido", level: 5,
        title: `${clientName}: ${items.length} pieza(s) programada(s) sin publicar`,
        body: items.slice(0, 6).map((i) => `• "${i.name.slice(0, 60)}" — ${i.daysLate}d vencida (${i.status})`).join("\n") +
          "\n\nEl webhook a Make no disparó: revisar el scenario o reprogramar la Fecha de inicio.",
        dedupeKey: key,
        evidence: { count: items.length, items: items.slice(0, 10) },
      });
      if (r.isNew) nuevas++;
    }
  }

  // Inactividad 72h (con cross-check de Make) + sync caído.
  const inact = await runInactivityCheck(db, { dryRun: true }).catch(() => null);
  if (inact) {
    if (inact.syncStale) {
      const key = "contenido:sync-stale";
      activeKeys.add(key);
      const r = await recordIntervention(db, {
        vigilante: "contenido", level: 5,
        title: "Sync de redes detenido — no se puede verificar actividad de clientes",
        body: "La sincronización de posteos orgánicos está vieja. Hasta que se recupere, la inactividad de clientes no es medible (y acusarlos sería falsa alarma).",
        dedupeKey: key, evidence: {},
      });
      if (r.isNew) nuevas++;
    }
    for (const c of inact.inactive) {
      const key = `contenido:inactivo:${c.name}`;
      activeKeys.add(key);
      const r = await recordIntervention(db, {
        vigilante: "contenido", level: 4,
        title: `${c.name}: sin actividad en redes hace ${Math.floor(c.hoursSince / 24)}d ${c.hoursSince % 24}h`,
        body: "Ni posteo orgánico visible ni disparo a Make en la ventana. Verificar: ¿se cortó la programación, falta contenido, o Make no disparó?",
        dedupeKey: key, evidence: { hoursSince: c.hoursSince },
      });
      if (r.isNew) nuevas++;
    }
  }

  const resueltas = await autoResolve(db, "contenido:", activeKeys);
  return { nuevas, resueltas };
}

// ── Vigilante: Salud del Cliente (índice /100 + "estoy preocupado") ────────
// Compone las señales disponibles: salud de pauta (accountScores.health),
// operativa (accountScores.ops), contenido (piezas vencidas / inactividad,
// desde las intervenciones abiertas del vigilante de contenido) y tendencia
// de inversión. Señales de relación (responde rápido, aprueba, reuniones)
// quedan para cuando se integre la lectura de WhatsApp (postergada 18/7).

export async function runVigilanteSaludCliente(db: Db): Promise<{ evaluados: number; preocupado: number }> {
  const { accountScores } = await import("@paperclipai/db");
  const activos = await db.select({ id: clients.id, name: clients.name, metadata: clients.metadata })
    .from(clients).where(eq(clients.status, "active"));

  // Últimos scores + de hace ~14 días (tendencia).
  const today = dayStr(new Date());
  const back14 = dayStr(new Date(Date.now() - 14 * 86_400_000));
  const scoreRows = await db.select().from(accountScores).where(gte(accountScores.date, back14));
  const latestByClient = new Map<string, { health: number; ops: number; date: string; noAds: boolean }>();
  const oldestByClient = new Map<string, { health: number; date: string }>();
  for (const r of scoreRows.sort((a, b) => a.date.localeCompare(b.date))) {
    const noAds = Boolean((r.components as { noAds?: boolean } | null)?.noAds);
    const cur = { health: Number(r.healthScore ?? 0), ops: Number(r.opsScore ?? 0), date: r.date, noAds };
    latestByClient.set(r.clientId, cur);
    if (!oldestByClient.has(r.clientId)) oldestByClient.set(r.clientId, { health: cur.health, date: r.date });
  }

  // Intervenciones abiertas por cliente (señales de contenido/financieras vivas).
  const abiertas = await db.select({ clientId: interventions.clientId, vigilante: interventions.vigilante, level: interventions.level, title: interventions.title })
    .from(interventions).where(inArray(interventions.status, ["open", "sent"]));
  const abiertasByClient = new Map<string, Array<{ vigilante: string; level: number; title: string }>>();
  for (const a of abiertas) {
    if (!a.clientId) continue;
    const arr = abiertasByClient.get(a.clientId) ?? [];
    arr.push({ vigilante: a.vigilante, level: a.level, title: a.title });
    abiertasByClient.set(a.clientId, arr);
  }
  // Las de contenido dedupean por NOMBRE de cliente, no id — matchear por título.
  const abiertasPorNombre = (name: string) => abiertas.filter((a) => !a.clientId && a.title.startsWith(name + ":"));

  let preocupado = 0;
  const activeKeys = new Set<string>();
  for (const c of activos) {
    const score = latestByClient.get(c.id);
    const propias = [...(abiertasByClient.get(c.id) ?? []), ...abiertasPorNombre(c.name)];
    const razones: string[] = [];
    // Base: pauta 40% + ops 30% + contenido 30% (contenido arranca en 100 y
    // pierde por señales abiertas).
    const health = score?.health ?? 50;
    const ops = score?.ops ?? 50;
    let contenido = 100;
    for (const p of propias) {
      if (p.vigilante === "contenido" && p.level >= 5) { contenido -= 30; razones.push("piezas programadas sin publicar"); }
      else if (p.vigilante === "contenido") { contenido -= 20; razones.push("sin actividad en redes"); }
      else if (p.vigilante === "financiera" && p.level >= 5) { razones.push("saldo/cuenta de pauta crítica"); }
    }
    contenido = Math.max(0, contenido);
    // Sin pauta corriendo (components.noAds) el health=0 no es "pauta rota":
    // se repesa ops/contenido y no se castiga la salud por algo que no existe.
    const sinPauta = score?.noAds ?? false;
    if (!sinPauta && health < 40) razones.push("pauta floja (CTR/CPL)");
    if (ops < 40) razones.push("operativa floja");
    const salud = sinPauta
      ? Math.round(0.5 * ops + 0.5 * contenido)
      : Math.round(0.4 * health + 0.3 * ops + 0.3 * contenido);

    // Tendencia: caída de salud de pauta ≥15 pts en ~14 días.
    const old = oldestByClient.get(c.id);
    const caida = old && old.date < today ? old.health - health : 0;
    if (caida >= 15) razones.push(`la salud de pauta cayó ${caida} pts en 2 semanas`);

    // Stamp para el dashboard.
    try {
      const meta = { ...((c.metadata as Record<string, unknown>) ?? {}) };
      meta.salud = { score: salud, health, ops, contenido, razones: [...new Set(razones)], checkedAt: new Date().toISOString() };
      await db.update(clients).set({ metadata: meta as never, updatedAt: new Date() }).where(eq(clients.id, c.id));
    } catch { /* stamp es best-effort */ }

    // "Estoy preocupado": score bajo O 3+ señales degradándose a la vez. No es
    // una regla puntual — es el patrón multi-señal que pidió el doc del 18/7.
    const señales = new Set(razones).size;
    if (salud < 45 || (señales >= 3 && caida > 0)) {
      const key = `salud:preocupado:${c.id}`;
      activeKeys.add(key);
      const r = await recordIntervention(db, {
        vigilante: "salud-cliente", level: 4, clientId: c.id, kind: "alerta",
        title: `Estoy preocupado por ${c.name} (salud ${salud}/100)`,
        body: `No hay UN error puntual, pero se juntan señales: ${[...new Set(razones)].join("; ")}. Mi impresión es que esta cuenta necesita atención esta semana.`,
        dedupeKey: key,
        evidence: { salud, health, ops, contenido, razones: [...new Set(razones)] },
      });
      if (r.isNew) preocupado++;
    }
  }
  const resueltas = await autoResolve(db, "salud:", activeKeys);
  void resueltas;
  return { evaluados: activos.length, preocupado };
}

// ── Brief diario 8:00 / 18:00 ART ──────────────────────────────────────────

async function composeBrief(db: Db, moment: "morning" | "evening"): Promise<string> {
  const abiertas = await db.select({
    level: interventions.level, vigilante: interventions.vigilante,
    title: interventions.title, clientId: interventions.clientId,
  }).from(interventions)
    .where(inArray(interventions.status, ["open", "sent"]))
    .orderBy(desc(interventions.level), desc(interventions.updatedAt)).limit(40);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [resueltas] = await db.select({ n: sql<number>`count(*)::int` }).from(interventions)
    .where(and(eq(interventions.status, "resolved"), gte(interventions.updatedAt, today)));
  const criticas = abiertas.filter((a) => a.level >= 5);
  const atencion = abiertas.filter((a) => a.level === 4);
  const seguimiento = abiertas.filter((a) => a.level === 3);
  const activos = await db.select({ n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.status, "active"));

  const lines: string[] = [];
  if (moment === "morning") {
    lines.push("*🌅 Morning Brief — LMTM-OS*", "");
    lines.push(`🔴 Incidentes críticos: ${criticas.length}`);
    lines.push(`🟡 Requieren atención: ${atencion.length}`);
    lines.push(`🔵 En seguimiento: ${seguimiento.length}`);
    lines.push(`👥 Clientes activos: ${activos[0]?.n ?? "?"}`);
    if (criticas.length) {
      lines.push("", "*Prioridad de hoy:*");
      for (const c of criticas.slice(0, 5)) lines.push(`• ${c.title}`);
    }
    // Tendencias del día (pedido 18/7): 1×/día al equipo, para pensar distinto
    // y para reenviar a clientes — invita a la proactividad sin que nadie empuje.
    try {
      const { trends } = await import("@paperclipai/db");
      const desde = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const hoy = await db.select({ title: trends.title, url: trends.url, niches: trends.niches })
        .from(trends).where(and(gte(trends.day, desde), sql`${trends.tag} <> 'ignorar'`))
        .orderBy(desc(trends.day)).limit(5);
      if (hoy.length) {
        lines.push("", "*📡 Tendencias de hoy* (reenviables a clientes):");
        for (const t of hoy) {
          const rubros = (t.niches ?? []).length ? ` [${(t.niches ?? []).join(", ")}]` : "";
          lines.push(`• ${t.title}${rubros}${t.url ? `\n  ${t.url}` : ""}`);
        }
      }
    } catch { /* sin tendencias no se rompe el brief */ }
  } else {
    lines.push("*🌆 Resumen del día — LMTM-OS*", "");
    lines.push(`✔ Intervenciones resueltas hoy: ${resueltas?.n ?? 0}`);
    lines.push(`⚠️ Quedan abiertas: ${criticas.length + atencion.length} (${criticas.length} críticas)`);
    if (criticas.length) {
      lines.push("", "*Pendientes críticos para mañana:*");
      for (const c of criticas.slice(0, 5)) lines.push(`• ${c.title}`);
    }
  }
  lines.push("", "_El detalle vive en el panel → Centro de Inteligencia_");
  return lines.join("\n");
}

let briefTimer: ReturnType<typeof setInterval> | null = null;
let lastBriefKey = "";
let vigilanteTimer: ReturnType<typeof setInterval> | null = null;
let lastVigilanteDay = "";

export function initVigilantes(db: Db): void {
  if (!vigilanteTimer) {
    const tick = async () => {
      const day = new Date().toISOString().slice(0, 10);
      if (day === lastVigilanteDay) return; // 1×/día (el balance-monitor ya corre aparte)
      lastVigilanteDay = day;
      try {
        const r = await runVigilanteFinanciera(db);
        console.log(`[vigilantes] financiera: ${r.nuevas} nuevas, ${r.enviadas} enviadas`);
      } catch (e) { console.warn("[vigilantes] financiera failed:", e instanceof Error ? e.message : e); }
      try {
        const r = await runVigilanteContenido(db);
        console.log(`[vigilantes] contenido: ${r.nuevas} nuevas, ${r.resueltas} auto-resueltas`);
      } catch (e) { console.warn("[vigilantes] contenido failed:", e instanceof Error ? e.message : e); }
      try {
        const r = await runVigilanteSaludCliente(db);
        console.log(`[vigilantes] salud-cliente: ${r.evaluados} evaluados, ${r.preocupado} preocupado`);
      } catch (e) { console.warn("[vigilantes] salud failed:", e instanceof Error ? e.message : e); }
    };
    setTimeout(() => { void tick(); }, 8 * 60 * 1000);
    vigilanteTimer = setInterval(() => { void tick(); }, 3 * 3600 * 1000);
  }
  if (!briefTimer) {
    const briefTick = async () => {
      // Hora ART sin depender del TZ del contenedor.
      const art = new Date(Date.now() - 3 * 3600 * 1000);
      const hour = art.getUTCHours();
      const day = art.toISOString().slice(0, 10);
      const moment = hour === 8 ? "morning" : hour === 18 ? "evening" : null;
      if (!moment) return;
      const key = `${day}:${moment}`;
      if (key === lastBriefKey) return;
      lastBriefKey = key;
      try {
        const team = briefNumber();
        if (!team) { console.log("[vigilantes] brief compuesto pero sin destino (setear LMTM_TEAM_WA_GROUP)"); return; }
        const msg = await composeBrief(db, moment);
        await sendWhatsAppToNumber(team, msg);
        console.log(`[vigilantes] ${moment} brief enviado`);
      } catch (e) { console.warn("[vigilantes] brief failed:", e instanceof Error ? e.message : e); }
    };
    briefTimer = setInterval(() => { void briefTick(); }, 10 * 60 * 1000);
  }
  console.log("[vigilantes] Centro de Inteligencia v1 activo (financiera + brief 8/18 ART)");
}
