// LMTM-OS: la propuesta de pauta que se ejecuta sola al aprobarla.
//
// EL PROBLEMA QUE RESUELVE
// Las tres palancas de pauta (pausar, mover presupuesto, negativizar) exigen
// `approved=true`, y eso estaba bien. Lo que estaba mal era el camino: el agente
// escribía la propuesta como TEXTO en un issue, y después una persona tenía que
// leerla, entender a qué entidad se refería, y entrar a Meta o a Google a
// hacerlo a mano. El sistema sabía exactamente qué había que hacer y lo
// entregaba como prosa.
//
// El resultado medible era la cola: propuestas que nadie bajaba a la práctica
// porque bajarlas costaba más que leerlas.
//
// CÓMO QUEDA
// El agente propone y la propuesta QUEDA ARMADA: una fila en `approvals` con la
// llamada exacta adentro. La persona ve el número que la justifica y aprueba con
// un click; el servidor ejecuta eso mismo que estaba guardado. Nadie retipea un
// id de campaña.
//
// Se cuelga de la maquinaria de aprobaciones que ya existía (tabla `approvals`,
// páginas de aprobación, `approve()` con efectos por tipo) — es un tipo nuevo,
// no un mecanismo nuevo.

import type { Db } from "@paperclipai/db";
import { approvals } from "@paperclipai/db";

export const TIPO_ACCION_PAUTA = "accion_pauta";

export type AccionPauta =
  | { accion: "pause"; entityType: "campaign" | "adset"; entityId: string }
  | { accion: "duplicate"; entityId: string }
  | { accion: "set_budget"; entityType: "campaign" | "adset"; entityId: string; nuevoDiario: number }
  | {
      accion: "shift_budget";
      desde: { entityType: "campaign" | "adset"; entityId: string };
      hacia: { entityType: "campaign" | "adset"; entityId: string };
      monto: number;
    };

export interface PayloadAccionPauta {
  clientId: string;
  /** Lo que el agente escribió para justificarla. Es lo que lee la persona. */
  justificacion: string;
  /** Resumen en una línea, para la lista de aprobaciones. */
  resumen: string;
  accion: AccionPauta;
  /** Se completa al aprobar: qué pasó realmente cuando se ejecutó. */
  resultado?: { ok: boolean; detalle: string; ejecutadoAt: string };
}

/**
 * Deja la propuesta armada y lista para ejecutarse con un click.
 *
 * Devuelve el id para que el agente lo nombre en el issue — así la persona
 * llega del comentario a la aprobación sin buscarla.
 */
export async function proponerAccionPauta(
  db: Db,
  input: {
    companyId: string;
    agentId?: string | null;
    clientId: string;
    justificacion: string;
    resumen: string;
    accion: AccionPauta;
  },
): Promise<{ id: string }> {
  const payload: PayloadAccionPauta = {
    clientId: input.clientId,
    justificacion: input.justificacion,
    resumen: input.resumen,
    accion: input.accion,
  };
  const [fila] = await db
    .insert(approvals)
    .values({
      companyId: input.companyId,
      type: TIPO_ACCION_PAUTA,
      requestedByAgentId: input.agentId ?? null,
      status: "pending",
      payload: payload as unknown as Record<string, unknown>,
    })
    .returning({ id: approvals.id });
  return { id: fila.id };
}

/**
 * Ejecuta una propuesta ya aprobada por una persona.
 *
 * Los guards NO se saltean: esto llama a las mismas funciones que llamaría el
 * agente, con `approved: true`. La aprobación humana cubre la firma, no el tope
 * de paso ni el enfriamiento ni la verificación de propiedad — si el mundo
 * cambió entre la propuesta y el click, la acción se rechaza igual y el motivo
 * queda escrito.
 */
export async function ejecutarAccionAprobada(
  db: Db,
  payload: PayloadAccionPauta,
  agentId: string | null,
): Promise<{ ok: boolean; detalle: string }> {
  const { clientId, accion } = payload;

  try {
    if (accion.accion === "pause") {
      const { pauseAdEntity } = await import("./ads-actions.js");
      const r = await pauseAdEntity(db, {
        clientId, entityType: accion.entityType, entityId: accion.entityId, agentId, approved: true,
      });
      return r.ok
        ? { ok: true, detalle: `Pausado: ${r.entity?.type} "${r.entity?.name}".` }
        : { ok: false, detalle: r.error ?? "No se pudo pausar." };
    }

    if (accion.accion === "duplicate") {
      const { duplicateWinner } = await import("./ads-duplicar.js");
      const r = await duplicateWinner(db, { clientId, adsetId: accion.entityId, agentId, approved: true });
      if (!r.ok) return { ok: false, detalle: r.error ?? "No se pudo duplicar." };
      return r.nacioPausada
        ? { ok: true, detalle: `Copia ${r.copiaId} creada y PAUSADA, con el mismo presupuesto.` }
        : {
            // No es un exito a medias: es algo gastando sin que nadie lo haya
            // decidido. Se reporta como fallo para que alguien vaya a mirar.
            ok: false,
            detalle: `Copia ${r.copiaId} creada PERO no pude confirmar que quedara pausada. Revisarla YA en Meta.`,
          };
    }

    if (accion.accion === "set_budget") {
      const { setBudget } = await import("./ads-budget.js");
      const r = await setBudget(db, {
        clientId, entityType: accion.entityType, entityId: accion.entityId,
        nuevoDiario: accion.nuevoDiario, agentId, approved: true,
      });
      return r.ok
        ? { ok: true, detalle: `Presupuesto de "${r.entidad?.nombre}" movido de $${Math.round(r.anterior ?? 0)} a $${Math.round(r.nuevo ?? 0)} por día.` }
        : { ok: false, detalle: r.error ?? "No se pudo cambiar el presupuesto." };
    }

    const { shiftBudget } = await import("./ads-budget.js");
    const r = await shiftBudget(db, {
      clientId, desde: accion.desde, hacia: accion.hacia, monto: accion.monto, agentId, approved: true,
    });
    return r.ok
      ? { ok: true, detalle: `Movidos $${Math.round(accion.monto)} por día entre las dos entidades.` }
      : { ok: false, detalle: r.error ?? "No se pudo mover el presupuesto." };
  } catch (e) {
    // Que explote acá no puede tumbar la aprobación: la fila ya quedó aprobada
    // y lo que importa es que el motivo del fallo quede a la vista.
    return { ok: false, detalle: `Error al ejecutar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** ¿Este payload es una acción de pauta bien formada? */
export function esAccionPauta(payload: unknown): payload is PayloadAccionPauta {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.clientId !== "string" || !p.clientId) return false;
  const a = p.accion as Record<string, unknown> | undefined;
  if (!a || typeof a.accion !== "string") return false;

  if (a.accion === "pause") return typeof a.entityId === "string" && !!a.entityId;
  if (a.accion === "duplicate") return typeof a.entityId === "string" && !!a.entityId;
  if (a.accion === "set_budget") {
    return typeof a.entityId === "string" && !!a.entityId && typeof a.nuevoDiario === "number";
  }
  if (a.accion === "shift_budget") {
    const d = a.desde as Record<string, unknown> | undefined;
    const h = a.hacia as Record<string, unknown> | undefined;
    return (
      typeof d?.entityId === "string" && !!d.entityId &&
      typeof h?.entityId === "string" && !!h.entityId &&
      typeof a.monto === "number"
    );
  }
  return false;
}
