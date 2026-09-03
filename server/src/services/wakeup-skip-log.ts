// LMTM-OS: registro de wakeups que NO se ejecutaron.
//
// El scheduler despierta a cada agente cada ~90s y, cuando no hay nada que
// hacer, deja constancia y no corre. Eso está bien — es el throttle que sacó a
// Ana de hacer 335 corridas para cerrar 5 issues. Lo que no estaba bien era
// guardar una fila por cada decisión de no hacer nada: 19.000 filas por día,
// el 99,7% de agent_wakeup_requests (revisión de flota, 26/8/26). La tabla
// dejaba de servir para diagnosticar justo porque estaba llena de no-eventos.
//
// Los motivos rutinarios se agrupan: una fila por agente/motivo/hora, con
// coalesced_count contando cuántas veces se repitió. Los motivos raros —los que
// uno quiere ver uno por uno cuando algo anda mal— se siguen guardando enteros.

import type { Db } from "@paperclipai/db";
import { agentWakeupRequests } from "@paperclipai/db";
import { and, desc, eq, gte } from "drizzle-orm";

/** Motivos de alta frecuencia que se agrupan por hora. */
const RUTINARIOS = new Set([
  "heartbeat.idle.noWork",
  "issue_dependencies_blocked",
  "heartbeat.disabled",
  "heartbeat.wakeOnDemand.disabled",
]);

const VENTANA_MS = 60 * 60 * 1000;

export function esRutinario(reason: string): boolean {
  return RUTINARIOS.has(reason);
}

/** Db o transacción: las dos exponen select/insert/update. */
export type EjecutorDb = Pick<Db, "select" | "insert" | "update">;

export interface SkipValues {
  companyId: string;
  agentId: string;
  source: string;
  triggerDetail?: string | null;
  reason: string;
  payload?: unknown;
  requestedByActorType?: string | null;
  requestedByActorId?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Deja constancia de un wakeup saltado.
 * Devuelve "insert" si escribió una fila nueva, "coalesce" si sumó a la de la
 * hora en curso.
 */
export async function registrarSkip(db: EjecutorDb, v: SkipValues): Promise<"insert" | "coalesce"> {
  const base = {
    companyId: v.companyId,
    agentId: v.agentId,
    source: v.source,
    triggerDetail: v.triggerDetail ?? null,
    reason: v.reason,
    payload: v.payload ?? null,
    status: "skipped",
    requestedByActorType: v.requestedByActorType ?? null,
    requestedByActorId: v.requestedByActorId ?? null,
    idempotencyKey: v.idempotencyKey ?? null,
    finishedAt: new Date(),
  } as typeof agentWakeupRequests.$inferInsert;

  if (!esRutinario(v.reason)) {
    await db.insert(agentWakeupRequests).values(base);
    return "insert";
  }

  const [previo] = await db
    .select({ id: agentWakeupRequests.id, coalescedCount: agentWakeupRequests.coalescedCount })
    .from(agentWakeupRequests)
    .where(
      and(
        eq(agentWakeupRequests.agentId, v.agentId),
        eq(agentWakeupRequests.reason, v.reason),
        eq(agentWakeupRequests.status, "skipped"),
        gte(agentWakeupRequests.createdAt, new Date(Date.now() - VENTANA_MS)),
      ),
    )
    .orderBy(desc(agentWakeupRequests.createdAt))
    .limit(1);

  if (!previo) {
    await db.insert(agentWakeupRequests).values({ ...base, coalescedCount: 1 });
    return "insert";
  }

  await db
    .update(agentWakeupRequests)
    .set({
      coalescedCount: (previo.coalescedCount ?? 1) + 1,
      updatedAt: new Date(),
      finishedAt: new Date(),
      payload: base.payload,
    })
    .where(eq(agentWakeupRequests.id, previo.id));
  return "coalesce";
}
