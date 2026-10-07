// LMTM-OS: Centro de Inteligencia — motor de vigilantes (pedido 2026-07-18).
//
// Un vigilante observa un área y produce INTERVENCIONES (alertas,
// oportunidades, aprendizajes) con nivel 1-5. Desde el rediseño B2 el nivel
// ya no decide si interrumpe: solo interrumpen los incidentes del motor de
// decisiones (avisos/politica.ts, tope 3 por día). Lo de los vigilantes va al
// resumen de las 9:00. El dedupe_key evita re-registrar lo mismo mientras la
// intervención siga abierta.
//
// v1: vigilante de Salud Financiera de Campañas. El monitor de saldo existente
// (balance-monitor) ya cubre low/pacing/frenadas — acá se suman las reglas del
// doc del 18/7: consumo bruscamente mayor al promedio y cuenta activa sin
// actividad, y todo queda persistido en `interventions` para el dashboard.

import type { Db } from "@paperclipai/db";
import { adsInsights, clients, interventions } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { fetchAccountBalances, mereceAvisoDeSaldo, motivoFrenada } from "./balance-monitor.js";
import { dayStr } from "./agency-ops.js";
import { avisarAlEquipo } from "./wa-embudo.js";
import { operativaMedida } from "./account-scoring.js";

const MAX_INTERRUPTIONS_DAY = Number(process.env.LMTM_MAX_INTERRUPTIONS_DAY) || 8;

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
  // Cuentas que se pudieron leer y las que siguen en falta. Solo se cierra lo
  // que se volvió a mirar: una cuenta que esta vez no se leyó no prueba nada.
  // Sin esto el aviso no se cerraba nunca: el 7/10 había 30 "saldo por
  // agotarse" del 3/9 abiertos, y la salud los contaba como saldo crítico.
  const leidas = new Set<string>();
  const enFalta = new Set<string>();

  for (const b of balances) {
    leidas.add(`financiera:saldo:${b.account}`);
    leidas.add(`financiera:sin-actividad:${b.account}`);
    const days = byAccount.get(bare(b.account)) ?? [];
    const latest = days.find((d) => d.date === yesterday) ?? days.find((d) => d.date === today);
    const prior = days.filter((d) => d.date !== yesterday && d.date !== today && d.spend > 0);
    const avgPrior = prior.length ? prior.reduce((s, d) => s + d.spend, 0) / prior.length : 0;

    // Regla: saldo bajo / frenada (nivel 5) — la detección vive en balance-monitor,
    // acá solo se persiste para el dashboard/brief (el WA ya lo manda ese monitor).
    // Mismo criterio que la decisión de saldo de Hoy (motor): una cuenta con
    // poco saldo que no está gastando no está "por agotarse".
    if (mereceAvisoDeSaldo(b) || motivoFrenada(b)) {
      enFalta.add(`financiera:saldo:${b.account}`);
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
      enFalta.add(`financiera:sin-actividad:${b.account}`);
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
  await resolverLeidasQueYaNoFaltan(db, leidas, enFalta);

  // Envío nivel 4 AGRUPADO en un solo WhatsApp, respetando el tope diario.
  let enviadas = 0;
  const budget = await interruptionsLeftToday(db);
  if (toSend.length > 0 && budget > 0) {
    const batch = toSend.slice(0, budget);
    // Nivel 5: saldo y consumo brusco son plata. Interrumpen siempre.
    const msg = ["*⚠️ Vigilante financiero — atención hoy*", "", ...batch.map((t) => `• ${t.line}`), "", "_LMTM-OS · Centro de Inteligencia_"].join("\n");
    const res = await avisarAlEquipo(db, {
      origen: "vigilante-financiero",
      nivel: 5,
      clave: `financiera:${batch.map((t) => t.id).sort().join(",")}`,
      texto: msg,
    });
    if (res.estado === "enviado") { await markSent(db, batch.map((t) => t.id)); enviadas = batch.length; }
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

/** Cierra las intervenciones cuyo dedupe_key se volvió a mirar en esta corrida
 *  (`leidas`) y ya no está en falta. Las que no se pudieron mirar quedan como
 *  están. */
export async function resolverLeidasQueYaNoFaltan(db: Db, leidas: Set<string>, enFalta: Set<string>): Promise<number> {
  const cerrar = [...leidas].filter((k) => !enFalta.has(k));
  if (!cerrar.length) return 0;
  const filas = await db.update(interventions)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(and(inArray(interventions.status, ["open", "sent"]), inArray(interventions.dedupeKey, cerrar)))
    .returning({ id: interventions.id });
  return filas.length;
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

/// ── Vigilante: Salud del Cliente (índice /100 + "estoy preocupado") ────────
// Compone tres señales: pauta (accountScores.health, solo si la pauta corre),
// operativa (accountScores.ops, solo si ClickUp tiene fechas para medirla) y
// contenido (avisos vigentes del vigilante de contenido, solo si leímos la
// página o hay un aviso vigente). Señales de relación (responde rápido,
// aprueba, reuniones) quedan para cuando se integre la lectura de WhatsApp.
//
// Regla (7/10): ningún componente se inventa. Antes, lo que no se podía medir
// valía 50 o 100 y el número salía igual: clientes sin ningún dato daban 78,
// y MONDINO daba 100 con "saldo crítico" como razón. Lo que no se midió queda
// afuera y los pesos se reparten entre lo que sí; sin nada medido, no hay
// salud (null), no un número.

/** Avisos más viejos que esto ya se resolvieron solos o dejaron de importar
 *  (mismo corte que la lista de intervenciones del panel). */
export const VIGENCIA_INTERVENCION_DIAS = 21;

const PESOS_SALUD = { pauta: 0.4, operativa: 0.3, contenido: 0.3 } as const;

export interface ComponentesSalud { pauta: number | null; operativa: number | null; contenido: number | null }

/** Promedio ponderado de los componentes medidos; null si no se midió ninguno. */
export function componerSalud(c: ComponentesSalud): number | null {
  let suma = 0, peso = 0;
  for (const k of Object.keys(PESOS_SALUD) as Array<keyof ComponentesSalud>) {
    const v = c[k];
    if (v == null) continue;
    suma += PESOS_SALUD[k] * v;
    peso += PESOS_SALUD[k];
  }
  return peso > 0 ? Math.round(suma / peso) : null;
}

export async function runVigilanteSaludCliente(db: Db): Promise<{ evaluados: number; preocupado: number }> {
  const { accountScores, organicPosts, organicPostInsights } = await import("@paperclipai/db");
  const { LECTURA_CONFIABLE_MS } = await import("./auditor.js");
  const activos = await db.select({ id: clients.id, name: clients.name, metadata: clients.metadata })
    .from(clients).where(eq(clients.status, "active"));

  // Últimos scores + de hace ~14 días (tendencia).
  const today = dayStr(new Date());
  const back14 = dayStr(new Date(Date.now() - 14 * 86_400_000));
  const scoreRows = await db.select().from(accountScores).where(gte(accountScores.date, back14));
  const latestByClient = new Map<string, { health: number; ops: number | null; date: string; noAds: boolean }>();
  const oldestByClient = new Map<string, { health: number; date: string; noAds: boolean }>();
  for (const r of scoreRows.sort((a, b) => a.date.localeCompare(b.date))) {
    const comp = r.components as Record<string, unknown> | null;
    const noAds = Boolean(comp?.noAds);
    const cur = { health: Number(r.healthScore), ops: operativaMedida(comp) ? Number(r.opsScore) : null, date: r.date, noAds };
    latestByClient.set(r.clientId, cur);
    if (!oldestByClient.has(r.clientId)) oldestByClient.set(r.clientId, { health: cur.health, date: r.date, noAds });
  }

  // Última lectura de la página de cada cliente: sin lectura reciente, que no
  // haya avisos de contenido no prueba que el contenido esté bien.
  const lecturas = await db.select({
    clientId: organicPosts.clientId,
    ultima: sql<string | null>`max(${organicPostInsights.syncedAt})`,
  }).from(organicPosts)
    .innerJoin(organicPostInsights, eq(organicPostInsights.postId, organicPosts.id))
    .groupBy(organicPosts.clientId);
  const ahora = Date.now();
  const conPaginaLeida = new Set(lecturas
    .filter((l) => l.clientId && l.ultima && ahora - new Date(l.ultima).getTime() <= LECTURA_CONFIABLE_MS)
    .map((l) => l.clientId as string));

  // Intervenciones VIGENTES por cliente (señales de contenido/financieras vivas).
  const corte = new Date(ahora - VIGENCIA_INTERVENCION_DIAS * 86_400_000);
  const abiertas = await db.select({ clientId: interventions.clientId, vigilante: interventions.vigilante, level: interventions.level, title: interventions.title })
    .from(interventions).where(and(inArray(interventions.status, ["open", "sent"]), gte(interventions.createdAt, corte)));
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

    // Pauta: solo si corre. Sin pauta (noAds) el health=0 no es "pauta rota".
    let pauta: number | null = score && !score.noAds ? score.health : null;
    if (pauta != null && pauta < 40) razones.push("pauta floja (CTR/CPL)");
    // Saldo crítico vigente: la pauta se corta. Descuenta de pauta; si no hay
    // pauta medida no se lista (una razón que no mueve el número confunde).
    if (pauta != null && propias.some((p) => p.vigilante === "financiera" && p.level >= 5)) {
      pauta = Math.max(0, pauta - 20);
      razones.push("saldo/cuenta de pauta crítica");
    }

    const operativa = score?.ops ?? null;
    if (operativa != null && operativa < 40) razones.push("operativa floja");

    const avisosContenido = propias.filter((p) => p.vigilante === "contenido");
    let contenido: number | null = null;
    if (conPaginaLeida.has(c.id) || avisosContenido.length > 0) {
      contenido = 100;
      for (const p of avisosContenido) {
        if (p.level >= 5) { contenido -= 30; razones.push("piezas programadas sin publicar"); }
        else { contenido -= 20; razones.push("sin actividad en redes"); }
      }
      contenido = Math.max(0, contenido);
    }

    const salud = componerSalud({ pauta, operativa, contenido });
    const medido = Object.entries({ pauta, operativa, contenido }).filter(([, v]) => v != null).map(([k]) => k);

    // Tendencia: caída de salud de pauta ≥15 pts en ~14 días (las dos puntas con pauta corriendo).
    const old = oldestByClient.get(c.id);
    const caida = old && score && !old.noAds && !score.noAds && old.date < today ? old.health - score.health : 0;
    if (caida >= 15) razones.push(`la salud de pauta cayó ${caida} pts en 2 semanas`);

    // Stamp para el dashboard.
    try {
      const meta = { ...((c.metadata as Record<string, unknown>) ?? {}) };
      meta.salud = { score: salud, pauta, operativa, contenido, medido, razones: [...new Set(razones)], checkedAt: new Date().toISOString() };
      await db.update(clients).set({ metadata: meta as never, updatedAt: new Date() }).where(eq(clients.id, c.id));
    } catch { /* stamp es best-effort */ }

    // "Estoy preocupado": score bajo O 3+ señales degradándose a la vez. No es
    // una regla puntual — es el patrón multi-señal que pidió el doc del 18/7.
    const señales = new Set(razones).size;
    if (salud != null && (salud < 45 || (señales >= 3 && caida > 0))) {
      const key = `salud:preocupado:${c.id}`;
      activeKeys.add(key);
      const r = await recordIntervention(db, {
        vigilante: "salud-cliente", level: 4, clientId: c.id, kind: "alerta",
        title: `Estoy preocupado por ${c.name} (salud ${salud}/100)`,
        body: `No hay UN error puntual, pero se juntan señales: ${[...new Set(razones)].join("; ")}. Mi impresión es que esta cuenta necesita atención esta semana.`,
        dedupeKey: key,
        evidence: { salud, pauta, operativa, contenido, razones: [...new Set(razones)] },
      });
      if (r.isNew) preocupado++;
    }
  }
  const resueltas = await autoResolve(db, "salud:", activeKeys);
  void resueltas;
  return { evaluados: activos.length, preocupado };
}

let vigilanteTimer: ReturnType<typeof setInterval> | null = null;

export function initVigilantes(db: Db): void {
  if (!vigilanteTimer) {
    const tick = async () => {
      // 1×/día de verdad: con el día en memoria, cada deploy los volvía a correr.
      const { tocaHoy } = await import("./una-vez-por-dia.js");
      if (!(await tocaHoy(db, "monitor:vigilantes"))) return;
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
  // El brief de 8:00 y 18:00 ya no sale (rediseño B2): eran dos mensajes por
  // día con conteos de intervenciones y el digest del embudo pegado abajo. Lo
  // reemplaza el resumen de las 9:00 (avisos/resumen.ts), uno solo, armado con
  // las decisiones de la tabla y con links a Hoy. Las tendencias del día, que
  // el equipo reenvía a clientes, viajan en ese resumen.
  console.log("[vigilantes] Centro de Inteligencia v1 activo (financiera; el brief lo reemplaza el resumen de las 9:00)");
}
