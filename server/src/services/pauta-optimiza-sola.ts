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
//   · mover presupuesto de lo caro a lo barato (shift_budget).
// QUÉ SIGUE SIENDO DE UNA PERSONA
//   · pausar o apagar cualquier cosa, bajar presupuesto, duplicar.
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
  if (accion.accion === "duplicate") return { ok: false, motivo: "duplicar crea gasto nuevo: lo decide una persona" };
  if (d.leads < OPTIMIZA.minLeads) {
    return { ok: false, motivo: `${d.leads} leads en la ventana: con menos de ${OPTIMIZA.minLeads} el CPL es ruido` };
  }
  if (accion.accion === "set_budget") {
    if (d.presupuestoActual == null) return { ok: false, motivo: "no se sabe el presupuesto actual" };
    if (accion.nuevoDiario <= d.presupuestoActual) return { ok: false, motivo: "bajar presupuesto frena: lo decide una persona" };
    // Subir gasta más rápido el saldo: una cuenta que se queda sin saldo se frena.
    if (d.diasSaldo === undefined) return { ok: false, motivo: "no se pudo leer el saldo de la cuenta" };
    if (d.diasSaldo != null && d.diasSaldo < OPTIMIZA.diasSaldoMinimo) {
      return { ok: false, motivo: `a la cuenta le quedan ${Math.floor(d.diasSaldo)} días de saldo: subir la frena antes` };
    }
  }
  return { ok: true };
}

export interface ResultadoOptimiza { ejecutadas: number; fallas: number; quedanParaPersona: number; lineas: string[] }

/** Pasa por las propuestas pendientes de presupuesto y ejecuta las que puede hacer solo. */
export async function optimizarSolo(db: Db, ahora = new Date()): Promise<ResultadoOptimiza> {
  const r: ResultadoOptimiza = { ejecutadas: 0, fallas: 0, quedanParaPersona: 0, lineas: [] };
  if (!optimizaPrendido()) return r;

  const pendientes = await db
    .select({ id: approvals.id, payload: approvals.payload, agente: approvals.requestedByAgentId })
    .from(approvals)
    .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), eq(approvals.status, "pending"),
      sql`${approvals.payload}->'accion'->>'accion' in ('set_budget', 'shift_budget')`))
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

    const res = await ejecutarAccionAprobada(db, p, f.agente ?? null);
    await db.update(approvals)
      .set({ payload: { ...p, resultado: { ok: res.ok, detalle: res.detalle, ejecutadoAt: ahora.toISOString() } } as unknown as Record<string, unknown>, updatedAt: new Date() })
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
      texto: `*Pauta: lo que el equipo de agentes optimizó solo*\n\n${r.lineas.join("\n")}\n\nNada se pausó ni se bajó: eso sigue esperando a una persona en Hoy.`,
    }).catch((e) => console.warn("[pauta-optimiza] no se pudo avisar:", e instanceof Error ? e.message : e));
  }
  return r;
}
