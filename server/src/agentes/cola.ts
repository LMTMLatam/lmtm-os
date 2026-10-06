// LMTM-OS: la cola del runner propio, sobre Postgres.
//
// Mismo patrón que pg-boss y graphile-worker (FOR UPDATE SKIP LOCKED), en una
// tabla propia porque cada trabajo lleva lo que la interfaz necesita mostrar:
// cliente, motivo, pasos y resultado.

import type { Db } from "@paperclipai/db";
import { agenteTrabajos, clients, decisiones } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";

export type Trabajo = typeof agenteTrabajos.$inferSelect;

export interface NuevoTrabajo {
  rol: string;
  clientId: string | null;
  motivo: "decision" | "horario" | "pedido";
  ref?: string | null;
  entrada: Record<string, unknown>;
  pedidoPor: string;
}

/** Devuelve el id, o null si ese hecho ya se está trabajando (o ya se trabajó). */
export async function encolar(db: Db, n: NuevoTrabajo): Promise<string | null> {
  const [r] = await db
    .insert(agenteTrabajos)
    .values({ rol: n.rol, clientId: n.clientId, motivo: n.motivo, ref: n.ref ?? null, entrada: n.entrada, pedidoPor: n.pedidoPor })
    .onConflictDoNothing()
    .returning({ id: agenteTrabajos.id });
  return r?.id ?? null;
}

/** Toma el pendiente más viejo. Dos procesos nunca toman el mismo. */
export async function tomar(db: Db): Promise<Trabajo | null> {
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: agenteTrabajos.id })
      .from(agenteTrabajos)
      .where(eq(agenteTrabajos.estado, "pendiente"))
      .orderBy(agenteTrabajos.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!p) return null;
    const [t] = await tx
      .update(agenteTrabajos)
      .set({ estado: "corriendo", startedAt: new Date(), intentos: sql`${agenteTrabajos.intentos} + 1` })
      .where(eq(agenteTrabajos.id, p.id))
      .returning();
    return t ?? null;
  });
}

export async function terminar(
  db: Db,
  id: string,
  campos: Pick<Partial<Trabajo>, "resultado" | "pasos" | "error" | "turnos" | "tokensEntrada" | "tokensSalida"> & { estado: "hecho" | "fallo" },
): Promise<void> {
  await db
    .update(agenteTrabajos)
    .set({ ...campos, finishedAt: new Date() })
    .where(and(eq(agenteTrabajos.id, id), eq(agenteTrabajos.estado, "corriendo")));
}

/**
 * Lo que quedó "corriendo" de un proceso que se murió (deploy, reinicio) pasa a
 * fallo, para que se vea y se pueda reintentar. El tope de un rol son minutos;
 * 30 sin terminar es que nadie lo está corriendo.
 */
export async function rescatarColgados(db: Db): Promise<number> {
  const r = await db
    .update(agenteTrabajos)
    .set({ estado: "fallo", error: "Se cortó sin terminar (reinicio del servidor o tope de tiempo).", finishedAt: new Date() })
    .where(and(eq(agenteTrabajos.estado, "corriendo"), sql`${agenteTrabajos.startedAt} < now() - interval '30 minutes'`))
    .returning({ id: agenteTrabajos.id });
  return r.length;
}

// ── Disparadores por hecho ──────────────────────────────────────────────────

/** Qué decisión despierta a qué rol, y con qué procedimiento del archivo del rol. */
export const DISPARADORES: ReadonlyArray<{ tipo: string; rol: string; procedimiento: string }> = [
  { tipo: "pauta:gasto_caido", rol: "media-buyer", procedimiento: "investigar-gasto-caido" },
];

/** Intentos automáticos por decisión: después de 3 fallos queda a la vista y se reintenta a mano. */
const MAX_FALLOS = 3;

/**
 * Encola las decisiones abiertas que un rol tiene que investigar y todavía no
 * investigó. Corre seguido (es una consulta), así que una decisión nueva del
 * motor de las 8:30 se empieza a investigar en el minuto.
 */
export async function encolarDecisiones(db: Db): Promise<number> {
  let n = 0;
  for (const d of DISPARADORES) {
    const ref = sql`'decision:' || ${decisiones.id}::text`;
    const filas = await db
      .select({ id: decisiones.id, clientId: decisiones.clientId, cliente: clients.name, que: decisiones.que, porque: decisiones.porque, arsPorDia: decisiones.arsPorDia })
      .from(decisiones)
      .innerJoin(clients, eq(clients.id, decisiones.clientId))
      .where(
        and(
          eq(decisiones.tipo, d.tipo),
          eq(decisiones.estado, "abierta"),
          sql`not exists (
            select 1 from agente_trabajos t
            where t.rol = ${d.rol} and t.ref = ${ref}
              and (t.estado in ('pendiente', 'corriendo', 'hecho')
                   or (t.estado = 'fallo' and t.finished_at > now() - interval '30 minutes'))
          )`,
          sql`(select count(*) from agente_trabajos t where t.rol = ${d.rol} and t.ref = ${ref} and t.estado = 'fallo') < ${MAX_FALLOS}`,
        ),
      )
      .limit(20);
    for (const f of filas) {
      const id = await encolar(db, {
        rol: d.rol,
        clientId: f.clientId,
        motivo: "decision",
        ref: `decision:${f.id}`,
        pedidoPor: `regla:${d.tipo}`,
        entrada: {
          procedimiento: d.procedimiento,
          cliente: { id: f.clientId, nombre: f.cliente.trim() },
          decision: { id: f.id, que: f.que, porque: f.porque, arsPorDia: f.arsPorDia == null ? null : Number(f.arsPorDia) },
        },
      });
      if (id) n += 1;
    }
  }
  return n;
}
