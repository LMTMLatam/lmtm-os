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
import { and, eq, sql } from "drizzle-orm";

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

/** Qué acción es, sin los números: dos propuestas con la misma firma piden lo mismo. Pura. */
export function firmaAccion(a: AccionPauta): string {
  if (a.accion === "shift_budget") return `shift:${a.desde.entityId}>${a.hacia.entityId}`;
  if (a.accion === "duplicate") return `duplicate:${a.entityId}`;
  return `${a.accion}:${a.entityType}:${a.entityId}`;
}

/**
 * Deja la propuesta armada y lista para ejecutarse con un click.
 *
 * Una por acción y por agente (14/10): si el mismo agente ya tiene pendiente la
 * misma acción, se actualizan sus números en vez de sumar otra fila. Había 313
 * pendientes que eran 80 acciones: las mismas campañas, propuestas de nuevo
 * cada mañana, y nadie podía con la cola. Por agente y no en general para no
 * mezclar el piloto (Milo y el media buyer se comparan por lo que propone cada
 * uno); Hoy ya junta en una fila lo que piden los dos.
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
): Promise<{ id: string; repetida: boolean }> {
  const payload: PayloadAccionPauta = {
    clientId: input.clientId,
    justificacion: input.justificacion,
    resumen: input.resumen,
    accion: input.accion,
  };
  const firma = firmaAccion(input.accion);
  const pendientes = await db
    .select({ id: approvals.id, payload: approvals.payload })
    .from(approvals)
    .where(and(
      eq(approvals.type, TIPO_ACCION_PAUTA),
      eq(approvals.status, "pending"),
      input.agentId ? eq(approvals.requestedByAgentId, input.agentId) : sql`${approvals.requestedByAgentId} is null`,
      sql`${approvals.payload}->>'clientId' = ${input.clientId}`,
    ));
  const igual = pendientes.find((p) => esAccionPauta(p.payload) && firmaAccion(p.payload.accion) === firma);
  if (igual) {
    await db.update(approvals)
      .set({ payload: payload as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(approvals.id, igual.id));
    return { id: igual.id, repetida: true };
  }
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
  return { id: fila.id, repetida: false };
}

/**
 * Último día con gasto de una campaña o conjunto (30 días). null = no gastó.
 * Para no proponer pausar lo que ya no gasta: una campaña con la fecha de fin
 * vencida sigue figurando ACTIVE en Meta, y el 14/10 la mayor parte de la cola
 * eran pausas de campañas que no gastaban desde hacía días.
 */
export async function ultimoDiaConGasto(db: Db, clientId: string, entityType: "campaign" | "adset", entityId: string): Promise<string | null> {
  const col = entityType === "campaign" ? sql`campaign_id` : sql`adset_id`;
  const r = await db.execute(sql`
    select max(date)::text as ultimo from ads_insights
    where client_id = ${clientId} and ${col} = ${entityId} and spend > 0 and date >= current_date - 30`);
  const filas = (Array.isArray(r) ? r : (r as { rows?: unknown[] }).rows ?? []) as Array<{ ultimo: string | null }>;
  return filas[0]?.ultimo ?? null;
}

/** ¿Dejó de gastar? Sin gasto en los últimos 3 días completos (hoy está a medio sincronizar). Pura. */
export function dejoDeGastar(ultimo: string | null, hoy: string): boolean {
  if (!ultimo) return true;
  const limite = new Date(Date.parse(`${hoy}T12:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
  return ultimo < limite;
}

/** Lo que se canceló al ordenar la cola, por motivo. */
export interface ResultadoLimpieza { repetidas: number; sinGasto: number; vencidas: number; noSeSostienen: number }

/**
 * Ordena la cola de propuestas pendientes (una vez por día). No borra nada: las
 * deja en "cancelled" con el motivo escrito.
 *   · repetidas: la misma acción del mismo agente; queda la más nueva;
 *   · pausas de lo que ya no gasta (3 días completos sin gasto);
 *   · las que nadie tocó en 7 días: los números ya no son los de hoy, y si
 *     sigue haciendo falta el agente la vuelve a proponer con números frescos.
 */
export async function limpiarPropuestas(db: Db, hoy: string): Promise<ResultadoLimpieza> {
  const filas = await db
    .select({ id: approvals.id, payload: approvals.payload, agente: approvals.requestedByAgentId, updatedAt: approvals.updatedAt })
    .from(approvals)
    .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), eq(approvals.status, "pending")));
  const cancelar = async (id: string, nota: string) =>
    db.update(approvals).set({ status: "cancelled", decisionNote: nota, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(approvals.id, id), eq(approvals.status, "pending")));
  const r: ResultadoLimpieza = { repetidas: 0, sinGasto: 0, vencidas: 0, noSeSostienen: 0 };
  const { contextoEval } = await import("../metricas/eval-recientes.js");
  const { evaluarPropuesta } = await import("../metricas/eval-propuestas.js");
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000);
  const contextos = new Map<string, ReturnType<typeof contextoEval>>();
  const vistas = new Map<string, string>();
  const ordenadas = [...filas].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const vivas: typeof filas = [];
  for (const f of ordenadas) {
    if (!esAccionPauta(f.payload)) continue;
    const clave = `${f.agente ?? "-"}|${f.payload.clientId}|${firmaAccion(f.payload.accion)}`;
    const yaEsta = vistas.get(clave);
    if (yaEsta) { await cancelar(f.id, `Repetida: la misma acción sigue pendiente en ${yaEsta}.`); r.repetidas += 1; continue; }
    vistas.set(clave, f.id);
    vivas.push(f);
  }
  const hace7 = Date.parse(`${hoy}T12:00:00Z`) - 7 * 86_400_000;
  for (const f of vivas) {
    const p = f.payload as unknown as PayloadAccionPauta;
    if (p.accion.accion === "pause") {
      const ultimo = await ultimoDiaConGasto(db, p.clientId, p.accion.entityType, p.accion.entityId);
      if (dejoDeGastar(ultimo, hoy)) {
        await cancelar(f.id, `No gasta ${ultimo ? `desde el ${ultimo}` : "en los últimos 30 días"}: pausarla no ahorra nada.`);
        r.sinGasto += 1;
        continue;
      }
    }
    if (p.accion.accion !== "duplicate") {
      if (!contextos.has(p.clientId)) contextos.set(p.clientId, contextoEval(db, p.clientId, ayer));
      const { ctx, campanas } = await contextos.get(p.clientId)!;
      const v = evaluarPropuesta(p.accion, campanas, ctx);
      if (!v.ok) {
        await cancelar(f.id, `No se sostiene con los números de hoy: ${v.fallas.join("; ")}.`.slice(0, 1000));
        r.noSeSostienen += 1;
        continue;
      }
    }
    if (new Date(f.updatedAt).getTime() < hace7) {
      await cancelar(f.id, "Vencida: nadie la decidió en 7 días y los números ya no son los de hoy. Si sigue haciendo falta, el agente la vuelve a proponer.");
      r.vencidas += 1;
    }
  }
  return r;
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

let timer: ReturnType<typeof setInterval> | null = null;

/** Ordena la cola una vez por día (y la primera vez, a los 10 minutos del arranque). */
export function initLimpiezaPropuestas(db: Db): void {
  if (timer) return;
  const vuelta = async () => {
    const { tocaHoy } = await import("./una-vez-por-dia.js");
    if (!(await tocaHoy(db, "pauta:ordenar-cola"))) return;
    const { diaLocal } = await import("../avisos/politica.js");
    const r = await limpiarPropuestas(db, diaLocal(new Date()));
    console.log(`[propuestas-pauta] cola ordenada: ${r.repetidas} repetidas, ${r.sinGasto} pausas de lo que no gasta, ${r.noSeSostienen} que no se sostienen, ${r.vencidas} vencidas`);
    const { correrPiloto } = await import("./piloto-automatico.js");
    const p = await correrPiloto(db);
    console.log(`[piloto] ${p.propuestas} propuestas de pauta y ${p.decisiones} acciones del motor hechas solas, ${p.tareas} tareas creadas en ClickUp, ${p.fallas} fallas`);
  };
  const correr = () => void vuelta().catch((e) => console.warn("[propuestas-pauta] falló:", e instanceof Error ? e.message : e));
  setTimeout(correr, 10 * 60_000);
  timer = setInterval(correr, 6 * 3600_000);
}
