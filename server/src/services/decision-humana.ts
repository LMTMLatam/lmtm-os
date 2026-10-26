// LMTM-OS: lo que decide una persona no lo cierra un agente (26/10).
//
// El 21/10, en LMTM-6165 ("[L2 · OK humano] Compuerta de pieza…"), Pablo —un
// agente— dio el "OK PM", cerró la tarea como aprobada y otro agente prendió la
// escritura en las planillas de todos los clientes. La marca del título era
// solo una convención: nada la hacía cumplir.
//
// Ahora: una tarea marcada [HUMANO], [L2…] u "OK humano" la cierra un agente
// solo si tiene vinculada una aprobación aprobada, y aprobar es solo del tablero
// (POST /approvals/:id/approve exige una persona).

import type { Db } from "@paperclipai/db";
import { approvals, issueApprovals } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";

const MARCA = /\[\s*HUMANO\s*\]|\[\s*L2\b|OK\s+humano/i;

/** ¿El título dice que esto lo decide una persona? Pura. */
export function esDecisionHumana(titulo: string | null | undefined): boolean {
  return MARCA.test(titulo ?? "");
}

/** ¿Alguien del equipo aprobó una aprobación vinculada a esta tarea? */
export async function tieneAprobacionHumana(db: Db, issueId: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: approvals.id })
    .from(issueApprovals)
    .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
    .where(and(eq(issueApprovals.issueId, issueId), eq(approvals.status, "approved")))
    .limit(1);
  return Boolean(fila);
}

export const MENSAJE_DECISION_HUMANA =
  "Esta tarea es una decisión de una persona ([HUMANO] / L2 / OK humano): un agente no la cierra ni le saca la marca. " +
  "Pedí la aprobación (paperclipCreateApproval, vinculada a esta tarea) y esperá a que la apruebe alguien del equipo; " +
  "mientras tanto dejá tu análisis en un comentario.";
