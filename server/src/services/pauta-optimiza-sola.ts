// LMTM-OS: el departamento de pauta optimiza solo (17/11).
//
// Pedido de Naza (17/11): que la pauta funcione como un departamento autónomo,
// con una regla: "pueden optimizar pero no frenar ni apagar". Venía de dos
// pedidos anteriores que siguen valiendo: el 20/10 el piloto pausó 35 cosas
// (11 que el equipo había vuelto a prender, una campaña con 198 leads) y el
// 26/10 bajó dos conjuntos de DUNOD sin que nadie lo viera.
//
// QUÉ HACE SOLO
//   · subir el presupuesto de lo que rinde (set_budget hacia arriba);
//   · mover presupuesto de lo caro a lo barato (shift_budget);
//   · desde el 20/11 (Naza: «las optimizaciones no tienen que esperar a ser aprobadas, siempre y cuando nada sea
//     apagar o deshabilitar campaña»): bajar el presupuesto de lo que rinde mal (topes de ads-budget: 30% por vez,
//     nunca debajo de $1.000, así que nunca apaga) y duplicar un ganador (la copia nace pausada).
// QUÉ SIGUE SIENDO DE UNA PERSONA
//   · pausar o apagar cualquier cosa.
//
// FRENOS (además de los de ads-budget.ts: paso ≤ 30%, 24 h por entidad, piso,
// propiedad de la cuenta, y los del evaluador: escalón ≤ 20%, CPL bajo el
// objetivo, misma plataforma, hacia lo más barato):
//   · volumen: con menos de MIN_LEADS leads el CPL es ruido, no se escala solo;
//   · saldo: subir en una cuenta de Meta que se queda sin saldo la frena antes
//     (justo lo que no se quiere). Si no se puede leer el saldo, no se sube;
//   · topes por cliente por día y por vuelta;
//   · todo queda en el resumen del equipo con los números.
// Cada acción se mide igual que las aprobadas (action-outcomes.ts, 7 días).
//
// Interruptor: LMTM_PAUTA_OPTIMIZA=0 lo apaga sin deploy de código.

import type { Db } from "@paperclipai/db";
import { adsAccountMappings, adsConnections, approvals } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { esAccionPauta, ejecutarAccionAprobada, TIPO_ACCION_PAUTA, type AccionPauta, type PayloadAccionPauta } from "./ads-propuestas.js";
import { EVIDENCIA_PAUSA, probPocosLeads } from "../metricas/eval-propuestas.js";

export const OPTIMIZA = {
  minLeads: 5,
  diasSaldoMinimo: 14,
  porClientePorDia: 2,
  porVuelta: 10,
} as const;

/** Prefijo de la nota: la pantalla Trabajo marca como automático lo que empieza con "Ejecutada sola". */
export const NOTA = "Ejecutada sola (optimización)";

export function optimizaPrendido(): boolean {
  return process.env.LMTM_PAUTA_OPTIMIZA !== "0";
}

export interface DatosDecision {
  /** Presupuesto diario actual y leads de la ventana de la entidad que se toca (o recibe, en shift). */
  presupuestoActual: number | null;
  leads: number;
  /** Días de saldo que le quedan a la cuenta de Meta del cliente. undefined = no se pudo leer; null = sin tope. */
  diasSaldo: number | null | undefined;
}

/** Puro: ¿esta propuesta (que ya pasó el evaluador) la puede ejecutar el departamento solo? */
export function puedeIrSola(accion: AccionPauta, d: DatosDecision): { ok: true } | { ok: false; motivo: string } {
  if (accion.accion === "pause") return { ok: false, motivo: "pausar frena anuncios: lo decide una persona" };
  // La copia nace pausada y duplicateWinner verifica que sea un ganador (5 leads y CPL mejor que el resto).
  if (accion.accion === "duplicate") return { ok: true };
  // Bajar: el evaluador ya vio que con los números de hoy se sostiene; los topes impiden apagarla.
  if (accion.accion === "set_budget" && d.presupuestoActual != null && accion.nuevoDiario < d.presupuestoActual) return { ok: true };
  if (d.leads < OPTIMIZA.minLeads) {
    return { ok: false, motivo: `${d.leads} leads en la ventana: con menos de ${OPTIMIZA.minLeads} el CPL es ruido` };
  }
  if (accion.accion === "set_budget") {
    if (d.presupuestoActual == null) return { ok: false, motivo: "no se sabe el presupuesto actual" };
    if (accion.nuevoDiario === d.presupuestoActual) return { ok: false, motivo: "el presupuesto ya es ese" };
    // Subir gasta más rápido el saldo: una cuenta que se queda sin saldo se frena.
    if (d.diasSaldo === undefined) return { ok: false, motivo: "no se pudo leer el saldo de la cuenta" };
    if (d.diasSaldo != null && d.diasSaldo < OPTIMIZA.diasSaldoMinimo) {
      return { ok: false, motivo: `a la cuenta le quedan ${Math.floor(d.diasSaldo)} días de saldo: subir la frena antes` };
    }
  }
  return { ok: true };
}

/**
 * Puro. Meta rechaza una baja que queda debajo de su mínimo para esa entidad (no se ve antes de pedirla):
 * el presupuesto hasta el que sí se puede bajar, o null si con ese mínimo ya no hay baja posible.
 */
export function bajaHastaMinimo(accion: AccionPauta, antes: number | null, minimo: number | undefined): number | null {
  if (accion.accion !== "set_budget" || antes == null || minimo == null) return null;
  const piso = Math.ceil(minimo);
  return accion.nuevoDiario < piso && piso < antes ? piso : null;
}

export interface ResultadoOptimiza { ejecutadas: number; fallas: number; quedanParaPersona: number; lineas: string[] }

/** Lo que se guarda al ejecutar para poder juzgarlo y deshacerlo. */
export interface Seguimiento {
  /** La entidad que recibió la plata (set_budget: la misma; shift_budget: `hacia`). */
  entidad: { entityType: "campaign" | "adset"; entityId: string } | null;
  presupuestoAntes: number | null;
  cplAntes: number | null;
  revisada?: { at: string; gasto: number; leads: number; esperadas: number; revertida: boolean; detalle: string };
}

/** Horas que se le dan a un cambio antes de juzgarlo. */
export const HORAS_PARA_JUZGAR = 72;

/**
 * Puro. ¿El cambio empeoró? Con el gasto de después y el CPL de antes, la entidad "debería"
 * haber traído `esperadas` consultas. Si trajo tan pocas que a su CPL de antes pasaría menos
 * de 1 vez cada 10 (la misma vara que una pausa con evidencia), el cambio salió mal.
 * Con menos de 3 esperadas no hay datos para decir nada.
 */
export function empeoro(gastoDespues: number, leadsDespues: number, cplAntes: number | null): { empeoro: boolean; esperadas: number } {
  if (cplAntes == null || !(cplAntes > 0)) return { empeoro: false, esperadas: 0 };
  const esperadas = gastoDespues / cplAntes;
  if (esperadas < 3) return { empeoro: false, esperadas };
  return { empeoro: probPocosLeads(leadsDespues, esperadas) < EVIDENCIA_PAUSA, esperadas };
}

/**
 * A las 72 h de cada cambio automático: si empeoró, lo deshace (vuelve el presupuesto a como
 * estaba, o devuelve la plata movida) y avisa. Deshacer vuelve al nivel que había decidido el
 * equipo, no frena más que eso. Cada cambio se revisa una sola vez.
 */
export async function revisarOptimizaciones(db: Db, ahora = new Date()): Promise<{ revisadas: number; revertidas: number }> {
  const out = { revisadas: 0, revertidas: 0 };
  const limite = new Date(ahora.getTime() - HORAS_PARA_JUZGAR * 3600_000);
  const filas = await db
    .select({ id: approvals.id, payload: approvals.payload, decidedAt: approvals.decidedAt })
    .from(approvals)
    .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), eq(approvals.status, "approved"),
      sql`${approvals.decisionNote} like ${NOTA + "%"}`, sql`${approvals.decidedAt} < ${limite.toISOString()}::timestamptz`,
      sql`(${approvals.payload}->'resultado'->>'ok')::boolean`, sql`${approvals.payload}->'seguimiento'->'revisada' is null`));
  const lineas: string[] = [];
  for (const f of filas) {
    const p = f.payload as unknown as PayloadAccionPauta & { seguimiento?: Seguimiento };
    const s = p.seguimiento;
    if (!s?.entidad || !f.decidedAt) continue;
    // Los días COMPLETOS después del cambio (el día del cambio quedó a medias).
    const desde = new Date(f.decidedAt.getTime() + 86_400_000).toISOString().slice(0, 10);
    const hasta = new Date(ahora.getTime() - 86_400_000).toISOString().slice(0, 10);
    const col = s.entidad.entityType === "adset" ? sql`adset_id` : sql`campaign_id`;
    const r = await db.execute(sql`select coalesce(sum(spend), 0) as gasto, coalesce(sum(leads), 0) as leads
      from ads_insights where client_id = ${p.clientId} and ${col} = ${s.entidad.entityId} and date between ${desde} and ${hasta}`);
    const fila = ((Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<{ gasto: unknown; leads: unknown }>)[0];
    const gasto = Number(fila?.gasto ?? 0);
    const leads = Number(fila?.leads ?? 0);
    const v = empeoro(gasto, leads, s.cplAntes);

    let detalle = v.esperadas < 3 ? "sin gasto suficiente para juzgarlo" : v.empeoro ? "" : "no empeoró";
    let revertida = false;
    if (v.empeoro) {
      const a = p.accion;
      const deshacer = a.accion === "set_budget" && s.presupuestoAntes != null
        ? await import("./ads-budget.js").then(({ setBudget }) => setBudget(db, {
            clientId: p.clientId, entityType: a.entityType, entityId: a.entityId, nuevoDiario: s.presupuestoAntes!, agentId: null, approved: true,
          })).then((x) => ({ ok: x.ok, error: x.error }))
        : a.accion === "shift_budget"
          ? await import("./ads-budget.js").then(({ shiftBudget }) => shiftBudget(db, {
              clientId: p.clientId, desde: a.hacia, hacia: a.desde, monto: a.monto, agentId: null, approved: true,
            })).then((x) => ({ ok: x.ok, error: x.error }))
          : { ok: false, error: "no se guardó cómo estaba antes" };
      revertida = deshacer.ok;
      detalle = deshacer.ok ? "empeoró: se deshizo" : `empeoró y NO se pudo deshacer: ${deshacer.error ?? "error"}`;
      lineas.push(`${deshacer.ok ? "↩" : "✗"} ${p.resumen}: trajo ${leads} consultas con $${Math.round(gasto)} (a su costo anterior eran ${v.esperadas.toFixed(1)}). ${detalle}.`);
      if (deshacer.ok) out.revertidas += 1;
    }
    const revisada = { at: ahora.toISOString(), gasto: Math.round(gasto), leads, esperadas: Number(v.esperadas.toFixed(1)), revertida, detalle };
    await db.update(approvals)
      .set({ payload: { ...p, seguimiento: { ...s, revisada } } as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(approvals.id, f.id));
    out.revisadas += 1;
  }
  if (lineas.length) {
    const { avisarAlEquipo } = await import("./wa-embudo.js");
    await avisarAlEquipo(db, {
      origen: "pauta",
      nivel: lineas.some((l) => l.startsWith("✗")) ? 4 : 3,
      clave: `pauta-deshace:${ahora.toISOString().slice(0, 13)}`,
      texto: `*Pauta: cambios automáticos que empeoraron*\n\n${lineas.join("\n")}`,
    }).catch((e) => console.warn("[pauta-optimiza] no se pudo avisar:", e instanceof Error ? e.message : e));
  }
  return out;
}

/** Pasa por las propuestas pendientes de presupuesto y ejecuta las que puede hacer solo. */
export async function optimizarSolo(db: Db, ahora = new Date()): Promise<ResultadoOptimiza> {
  const r: ResultadoOptimiza = { ejecutadas: 0, fallas: 0, quedanParaPersona: 0, lineas: [] };
  if (!optimizaPrendido()) return r;

  const pendientes = await db
    .select({ id: approvals.id, payload: approvals.payload, agente: approvals.requestedByAgentId })
    .from(approvals)
    .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), eq(approvals.status, "pending"),
      sql`${approvals.payload}->'accion'->>'accion' in ('set_budget', 'shift_budget', 'duplicate')`))
    .orderBy(approvals.createdAt);
  if (!pendientes.length) return r;

  const { contextoEval } = await import("../metricas/eval-recientes.js");
  const { evaluarPropuesta, buscar } = await import("../metricas/eval-propuestas.js");
  const { fetchAccountBalances } = await import("./balance-monitor.js");
  const ayer = new Date(ahora.getTime() - 86_400_000);
  const inicioDia = new Date(ahora.getTime() - 24 * 3600_000);

  for (const f of pendientes) {
    if (r.ejecutadas >= OPTIMIZA.porVuelta) break;
    if (!esAccionPauta(f.payload)) continue;
    const p = f.payload as PayloadAccionPauta;

    const [hechas] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(approvals)
      .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), gte(approvals.decidedAt, inicioDia),
        sql`${approvals.decisionNote} like ${NOTA + "%"}`, sql`${approvals.payload}->>'clientId' = ${p.clientId}`));
    if ((hechas?.n ?? 0) >= OPTIMIZA.porClientePorDia) continue;

    // Los números de HOY, no los del momento en que se propuso.
    const { ctx, campanas } = await contextoEval(db, p.clientId, ayer);
    const v = evaluarPropuesta(p.accion, campanas, ctx);
    if (!v.ok) { r.quedanParaPersona += 1; continue; } // la limpieza diaria la cancela con el motivo

    const a = p.accion;
    const ent = a.accion === "set_budget" ? buscar(campanas, a.entityType, a.entityId)
      : a.accion === "shift_budget" ? buscar(campanas, a.hacia.entityType, a.hacia.entityId) : null;
    let diasSaldo: number | null | undefined;
    if (a.accion === "set_budget") {
      const saldos = await fetchAccountBalances(db, undefined, { clientId: p.clientId }).catch(() => null);
      // fetchAccountBalances saltea en silencio la cuenta que no pudo leer: si falta
      // alguna de Meta, no sabemos su saldo y no se sube (una cuenta en el tope se frena).
      const [mapeadas] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(adsAccountMappings)
        .innerJoin(adsConnections, eq(adsConnections.id, adsAccountMappings.connectionId))
        .where(and(eq(adsAccountMappings.clientId, p.clientId), eq(adsConnections.platform, "meta")));
      const meta = (saldos ?? []).filter((s) => s.platform === "meta");
      // daysLeft null = sin tope o sin gasto: no limita.
      const dias = meta.filter((s) => s.daysLeft != null).map((s) => s.daysLeft as number);
      diasSaldo = !saldos || meta.length < (mapeadas?.n ?? 0) ? undefined : dias.length ? Math.min(...dias) : null;
    }
    const decision = puedeIrSola(a, { presupuestoActual: ent?.numeros.presupuestoDiario ?? null, leads: ent?.numeros.leads ?? 0, diasSaldo });
    if (!decision.ok) { r.quedanParaPersona += 1; continue; }

    // Se marca aprobada ANTES de ejecutar (como approve()): si dos vueltas se pisan, la segunda no la encuentra pendiente.
    const tomada = await db.update(approvals)
      .set({ status: "approved", decisionNote: `${NOTA}: ${p.resumen}`.slice(0, 1000), decidedAt: ahora, updatedAt: ahora })
      .where(and(eq(approvals.id, f.id), eq(approvals.status, "pending")))
      .returning({ id: approvals.id });
    if (!tomada.length) continue;

    let hecha = p;
    let res = await ejecutarAccionAprobada(db, p, f.agente ?? null);
    // BOERO 20/11: pidió $2.450 y Meta no deja esa campaña debajo de $3.106,50. Se baja hasta ahí (sigue siendo bajar).
    const piso = res.ok ? null : bajaHastaMinimo(a, ent?.numeros.presupuestoDiario ?? null, res.minimo);
    if (piso != null && a.accion === "set_budget") {
      hecha = { ...p, accion: { ...a, nuevoDiario: piso } };
      const otra = await ejecutarAccionAprobada(db, hecha, f.agente ?? null);
      res = { ...otra, detalle: `Meta no deja menos de $${piso} por día: se bajó hasta ahí. ${otra.detalle}` };
    }
    // Lo que hace falta para deshacerlo a las 72 h si empeora (revisarOptimizaciones).
    const entidad = a.accion === "set_budget" ? { entityType: a.entityType, entityId: a.entityId } : a.accion === "shift_budget" ? a.hacia : null;
    const seguimiento: Seguimiento = { entidad, presupuestoAntes: ent?.numeros.presupuestoDiario ?? null, cplAntes: ent?.numeros.cpl ?? null };
    await db.update(approvals)
      .set({ payload: { ...hecha, resultado: { ok: res.ok, detalle: res.detalle, ejecutadoAt: ahora.toISOString() }, seguimiento } as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(approvals.id, f.id));
    if (res.ok) r.ejecutadas += 1;
    else r.fallas += 1;
    r.lineas.push(`${res.ok ? "✓" : "✗"} ${p.resumen}: ${res.detalle}`);
  }

  if (r.lineas.length) {
    const { avisarAlEquipo } = await import("./wa-embudo.js");
    await avisarAlEquipo(db, {
      origen: "pauta",
      nivel: r.fallas ? 4 : 3,
      clave: `pauta-optimiza:${ahora.toISOString().slice(0, 13)}`,
      texto: `*Pauta: lo que el equipo de agentes optimizó solo*\n\n${r.lineas.join("\n")}\n\nNada se pausó ni se apagó: eso sigue esperando a una persona en Pendientes.`,
    }).catch((e) => console.warn("[pauta-optimiza] no se pudo avisar:", e instanceof Error ? e.message : e));
  }
  return r;
}
