// LMTM-OS: el piloto automático de las decisiones (14/10).
//
// Pedido: "quiero que todo sea más automático, no tantas decisiones humanas".
//
// CÓMO QUEDA
// Con el interruptor general prendido (LMTM_AUTONOMIA_PAUTA=1), se hace solo:
//   · negativas de Google (ya traen evidencia mínima y protegen la marca);
//   · pausar keywords que una persona ya aprobó en Hoy;
//   · crear en ClickUp la tarea de una decisión nueva del equipo.
// Nunca solo, aunque las reglas den: nada que mueva plata del cliente ni frene
// anuncios. Pedido 20/10: "no quiero que se frenen más anuncios sin autorización
// humana" (del 14 al 20/10 el piloto pausó 35 cosas, 11 que el equipo había
// vuelto a prender y una campaña con 198 leads). Pedido 26/10: tampoco bajar ni
// repartir presupuesto (el 20/10 bajó dos conjuntos de DUNOD sin que nadie lo
// viera). Las propuestas de pauta de los agentes quedan siempre para una persona.

import type { Db } from "@paperclipai/db";
import { decisiones } from "@paperclipai/db";
import { eq, inArray, sql } from "drizzle-orm";

export const POLITICA = {
  tareasPorClientePorCorrida: 2,
  tareasPorCorrida: 30,
} as const;

/** ¿Está prendido el interruptor general? */
export function pilotoPrendido(): boolean {
  return process.env.LMTM_AUTONOMIA_PAUTA === "1";
}

export interface ResultadoPiloto { decisiones: number; tareas: number; fallas: number }

/** Pasa por el piloto las decisiones abiertas del motor con acción que se puede hacer sola. */
export async function correrPiloto(db: Db): Promise<ResultadoPiloto> {
  const r: ResultadoPiloto = { decisiones: 0, tareas: 0, fallas: 0 };
  if (!pilotoPrendido()) return r;

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
