// LMTM-OS: el piloto automático de la pauta y de las decisiones (14/10).
//
// Pedido: "quiero que todo sea más automático, no tantas decisiones humanas".
//
// EL PROBLEMA
// La autonomía graduada (ads-autonomia.ts) pedía historial medido para que una
// acción se ejecutara sola. Como nunca se ejecutó ninguna (313 propuestas sin
// decidir en 8 días), nunca iba a haber historial: el círculo no se abría.
//
// CÓMO QUEDA
// Con el interruptor general prendido (LMTM_AUTONOMIA_PAUTA=1), se ejecuta solo
// lo que pasa reglas con evidencia y topes, aunque no haya historial todavía:
//   · bajar presupuesto y mover plata entre campañas (el gasto total no sube),
//     si el evaluador lo aprueba;
//   · negativas de Google (ya traen evidencia mínima y protegen la marca);
//   · crear en ClickUp la tarea de una decisión nueva del equipo.
// Nunca solo: subir presupuesto (gasta más plata del cliente), duplicar (crea
// algo en su cuenta) y FRENAR ANUNCIOS — pausar campañas, conjuntos o keywords.
// Pedido 20/10: "no quiero que se frenen más anuncios sin autorización humana".
// Del 14 al 20/10 el piloto pausó 35 cosas, 11 que el equipo había vuelto a
// prender y una campaña con 198 leads. Eso queda como propuesta para una persona.
//
// Si el historial medido de un tipo de acción sale malo (empeoró más del 10%
// de los casos), ese tipo vuelve a pedir OK solo: el freno es el mismo dato que
// antes era la llave. Todo lo que se hace solo se avisa en el resumen.

import type { Db } from "@paperclipai/db";
import { approvals, decisiones } from "@paperclipai/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MetricasCampana } from "../metricas/campanas.js";
import type { ContextoEval } from "../metricas/eval-propuestas.js";
import type { AccionPauta, PayloadAccionPauta } from "./ads-propuestas.js";

export const POLITICA = {
  tareasPorClientePorCorrida: 2,
  tareasPorCorrida: 30,
} as const;

export interface Veredicto { si: boolean; motivo: string }

/**
 * ¿Una propuesta de pauta de un agente se ejecuta sola? Con el interruptor
 * apagado, nunca. `campanas` y `ctx` son los de la ventana que la evaluó.
 */
export async function propuestaSeEjecutaSola(
  db: Db,
  companyId: string,
  clientId: string,
  accion: AccionPauta,
  campanas: MetricasCampana[],
  ctx: ContextoEval,
): Promise<Veredicto> {
  const { autonomiaHabilitada, historialDe, TECHO_EMPEORA, MINIMO_CASOS } = await import("./ads-autonomia.js");
  if (!autonomiaHabilitada()) return { si: false, motivo: "el piloto automático está apagado" };
  if (accion.accion === "duplicate") return { si: false, motivo: "duplicar crea algo en la cuenta del cliente: siempre lo decide una persona" };
  if (accion.accion === "pause") return { si: false, motivo: "pausar frena anuncios: siempre lo autoriza una persona" };

  const kind = "set_budget";
  const h = await historialDe(db, companyId, kind).catch(() => null);
  if (h && h.total >= MINIMO_CASOS && h.peor / h.total > TECHO_EMPEORA) {
    return { si: false, motivo: `lo medido de "${kind}" empeoró el CPL en ${h.peor} de ${h.total} casos: vuelve a pedir OK` };
  }

  const buscar = (tipo: "campaign" | "adset", id: string) => {
    for (const c of campanas) {
      if (tipo === "campaign" && c.campaignId === id) return { c, n: c as { inversion: number; leads: number; presupuestoDiario: number | null } };
      const a = c.conjuntos.find((x) => x.adsetId === id);
      if (tipo === "adset" && a) return { c, n: a };
    }
    return null;
  };

  if (accion.accion === "set_budget") {
    const e = buscar(accion.entityType, accion.entityId);
    const actual = e?.n.presupuestoDiario ?? null;
    if (actual == null) return { si: false, motivo: "no se sabe el presupuesto actual" };
    if (accion.nuevoDiario > actual) return { si: false, motivo: "subir presupuesto gasta más plata del cliente: lo decide una persona" };
    return { si: true, motivo: `baja el presupuesto (de $${Math.round(actual)} a $${Math.round(accion.nuevoDiario)}): el gasto no sube` };
  }

  // shift_budget: el total no cambia; el evaluador ya exigió ir hacia lo más barato.
  return { si: true, motivo: "mueve plata hacia lo que rinde mejor sin subir el gasto total" };
}

/** Deja escrito en la aprobación que la ejecutó el piloto, con su resultado. */
export async function registrarEjecutadaSola(
  db: Db,
  input: { companyId: string; agentId: string | null; approvalId?: string; payload: PayloadAccionPauta; motivo: string; resultado: { ok: boolean; detalle: string } },
): Promise<void> {
  const payload = { ...input.payload, resultado: { ...input.resultado, ejecutadoAt: new Date().toISOString() } } as unknown as Record<string, unknown>;
  const valores = {
    status: input.resultado.ok ? "approved" : "pending",
    decisionNote: input.resultado.ok ? `Ejecutada sola: ${input.motivo}` : `Intentó sola y falló: ${input.resultado.detalle}`,
    decidedAt: input.resultado.ok ? new Date() : null,
    payload,
    updatedAt: new Date(),
  };
  let id = input.approvalId ?? null;
  if (id) {
    await db.update(approvals).set(valores).where(eq(approvals.id, id));
  } else {
    [{ id }] = await db.insert(approvals).values({ companyId: input.companyId, type: "accion_pauta", requestedByAgentId: input.agentId, ...valores }).returning({ id: approvals.id });
  }
  if (!input.resultado.ok) return;
  // La misma acción propuesta por el otro agente (Milo y el media buyer
  // proponen en paralelo) ya está hecha: se cierra con referencia.
  const { esAccionPauta, firmaAccion } = await import("./ads-propuestas.js");
  const firma = firmaAccion(input.payload.accion);
  const gemelas = await db.select({ id: approvals.id, payload: approvals.payload }).from(approvals)
    .where(and(eq(approvals.type, "accion_pauta"), eq(approvals.status, "pending"), sql`${approvals.payload}->>'clientId' = ${input.payload.clientId}`));
  for (const g of gemelas) {
    if (g.id === id || !esAccionPauta(g.payload) || firmaAccion(g.payload.accion) !== firma) continue;
    await db.update(approvals)
      .set({ status: "cancelled", decisionNote: `Ya la hizo el piloto automático (${id}).`, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(approvals.id, g.id), eq(approvals.status, "pending")));
  }
}

/** Avisa al equipo lo que hizo el piloto (resumen de las 9:00, no interrumpe). */
export async function avisarHechoSolo(db: Db, clientId: string, resumen: string, justificacion: string, motivo: string, resultado: { ok: boolean; detalle: string }): Promise<void> {
  const { avisarAlEquipo } = await import("./wa-embudo.js");
  await avisarAlEquipo(db, {
    origen: "pauta-automatica",
    nivel: 3,
    clave: `auto:${resumen}`,
    clientId,
    texto: `*${resultado.ok ? "Hecho solo" : "Intentó solo y FALLÓ"}* — ${resumen}\n\n${justificacion}\n\n_${resultado.detalle}_\n_Automático porque ${motivo}._`,
  }).catch(() => {});
}

export interface ResultadoPiloto { propuestas: number; decisiones: number; tareas: number; fallas: number }

/**
 * Pasa por el piloto lo que ya está esperando: propuestas de agentes pendientes
 * y decisiones abiertas del motor con acción que se puede hacer sola.
 */
export async function correrPiloto(db: Db): Promise<ResultadoPiloto> {
  const r: ResultadoPiloto = { propuestas: 0, decisiones: 0, tareas: 0, fallas: 0 };
  const { autonomiaHabilitada } = await import("./ads-autonomia.js");
  if (!autonomiaHabilitada()) return r;

  // 1) Propuestas de agentes pendientes.
  const { esAccionPauta, ejecutarAccionAprobada } = await import("./ads-propuestas.js");
  const { contextoEval } = await import("../metricas/eval-recientes.js");
  const { evaluarPropuesta } = await import("../metricas/eval-propuestas.js");
  const pendientes = await db
    .select({ id: approvals.id, companyId: approvals.companyId, agentId: approvals.requestedByAgentId, payload: approvals.payload })
    .from(approvals)
    .where(and(eq(approvals.type, "accion_pauta"), eq(approvals.status, "pending")));
  const ayer = new Date(Date.now() - 86_400_000);
  const contextos = new Map<string, Awaited<ReturnType<typeof contextoEval>>>();
  for (const f of pendientes) {
    if (!esAccionPauta(f.payload)) continue;
    const p = f.payload;
    if (!contextos.has(p.clientId)) contextos.set(p.clientId, await contextoEval(db, p.clientId, ayer));
    const { ctx, campanas } = contextos.get(p.clientId)!;
    if (!evaluarPropuesta(p.accion, campanas, ctx).ok) continue;
    const v = await propuestaSeEjecutaSola(db, f.companyId, p.clientId, p.accion, campanas, ctx);
    if (!v.si) continue;
    const res = await ejecutarAccionAprobada(db, p, f.agentId);
    await registrarEjecutadaSola(db, { companyId: f.companyId, agentId: f.agentId, approvalId: f.id, payload: p, motivo: v.motivo, resultado: res });
    await avisarHechoSolo(db, p.clientId, p.resumen, p.justificacion, v.motivo, res);
    if (res.ok) r.propuestas += 1; else r.fallas += 1;
  }

  // 2) Decisiones del motor que se pueden hacer solas.
  const { ejecutar } = await import("../decisiones/store.js");
  const sistema = { actorType: "system" as const, actorId: "piloto-automatico", agentId: null, runId: null };
  const abiertas = await db
    .select({ id: decisiones.id, clientId: decisiones.clientId, estado: decisiones.estado, accion: decisiones.accion, responsable: decisiones.responsable, createdAt: decisiones.createdAt })
    .from(decisiones)
    .where(inArray(decisiones.estado, ["abierta", "aprobada"]))
    .orderBy(decisiones.createdAt);
  // Las tareas, solo de las decisiones que nacieron con el piloto prendido: la
  // pila vieja (algunas de hace semanas) no se vuelca de golpe en ClickUp.
  const desde = await prendidoDesde(db);
  const tareasPorCliente = new Map<string, number>();
  for (const d of abiertas) {
    const tipo = (d.accion as { tipo?: string; resultado?: unknown } | null)?.tipo;
    if (!tipo || (d.accion as { resultado?: unknown }).resultado) continue;
    // Pausar keywords frena anuncios: solo si una persona ya la aprobó en Hoy (20/10).
    const esPlataforma = tipo === "negativas" || (tipo === "pausar_keywords" && d.estado === "aprobada");
    const esTarea = tipo === "tarea" && d.responsable === "equipo" && desde != null && new Date(d.createdAt) >= desde;
    if (!esPlataforma && !esTarea) continue;
    if (esTarea) {
      const n = tareasPorCliente.get(d.clientId) ?? 0;
      if (n >= POLITICA.tareasPorClientePorCorrida || r.tareas >= POLITICA.tareasPorCorrida) continue;
      tareasPorCliente.set(d.clientId, n + 1);
    }
    try {
      const { resultado } = await ejecutar(db, d.id, sistema, { ensayo: false });
      if (!resultado.ok) r.fallas += 1;
      else if (esTarea) r.tareas += 1;
      else r.decisiones += 1;
    } catch {
      r.fallas += 1;
    }
  }
  return r;
}

/** Desde cuándo está prendido el piloto (primera corrida registrada). */
async function prendidoDesde(db: Db): Promise<Date | null> {
  const { syncLogs } = await import("@paperclipai/db");
  const [f] = await db.select({ at: sql<string | null>`min(${syncLogs.createdAt})` }).from(syncLogs).where(eq(syncLogs.jobName, "piloto:prendido"));
  if (f?.at) return new Date(f.at);
  await db.insert(syncLogs).values({ jobName: "piloto:prendido", platform: "lmtm", status: "completed", completedAt: new Date() });
  return new Date();
}
