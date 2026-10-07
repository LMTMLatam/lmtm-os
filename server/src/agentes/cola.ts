// LMTM-OS: la cola del runner propio, sobre Postgres.
//
// Mismo patrón que pg-boss y graphile-worker (FOR UPDATE SKIP LOCKED), en una
// tabla propia porque cada trabajo lleva lo que la interfaz necesita mostrar:
// cliente, motivo, pasos y resultado.

import type { Db } from "@paperclipai/db";
import { agenteTrabajos, clients, decisiones, informesSemanales } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";
import { ultimaSemana } from "../decisiones/informe.js";
import { FOLDERS_ORIGEN_PLANTILLA } from "../ingest/plantilla-clickup.js";

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
  // "Hecho" sin una sola herramienta que haya respondido no es un hallazgo: pasa
  // a fallo para que se reintente (el 06/10 una credencial mal firmada dio 401 en
  // todo y las corridas quedaron como hechas, tapando el hecho para siempre).
  // Mismo criterio que resumirCorrida para las corridas nuevas.
  const sinRespuesta = await db
    .update(agenteTrabajos)
    .set({ estado: "fallo", error: "Todas las herramientas fallaron: el resultado no se apoya en datos." })
    .where(
      and(
        eq(agenteTrabajos.estado, "hecho"),
        sql`jsonb_array_length(${agenteTrabajos.pasos}) > 0`,
        sql`not exists (select 1 from jsonb_array_elements(${agenteTrabajos.pasos}) p
                        where coalesce((p->>'error')::boolean, false) = false
                          and (p->>'salida') !~ 'failed with [0-9]{3}')`,
      ),
    )
    .returning({ id: agenteTrabajos.id });
  return r.length + sinRespuesta.length;
}

/** Intentos automáticos por hecho: después de 3 fallos queda a la vista y se reintenta a mano. */
const MAX_FALLOS = 3;

/**
 * ¿Este hecho ya se trabajó (o se está trabajando, o falló hace poco o demasiadas
 * veces)? El índice único cubre lo vivo y lo hecho; esto suma los fallos, para
 * que un error de configuración no reencole el mismo hecho cada minuto.
 */
async function yaTrabajado(db: Db, rol: string, ref: string): Promise<boolean> {
  const [r] = await db
    .select({
      vivo: sql<number>`count(*) filter (where ${agenteTrabajos.estado} in ('pendiente', 'corriendo', 'hecho'))`,
      fallos: sql<number>`count(*) filter (where ${agenteTrabajos.estado} = 'fallo')`,
      reciente: sql<number>`count(*) filter (where ${agenteTrabajos.estado} = 'fallo' and ${agenteTrabajos.finishedAt} > now() - interval '30 minutes')`,
    })
    .from(agenteTrabajos)
    .where(and(eq(agenteTrabajos.rol, rol), eq(agenteTrabajos.ref, ref)));
  return Number(r?.vivo) > 0 || Number(r?.fallos) >= MAX_FALLOS || Number(r?.reciente) > 0;
}

// ── Disparadores por horario ────────────────────────────────────────────────

/**
 * Lo que es de calendario (no de un hecho). Un trabajo por cliente: tareas chicas
 * y enfocadas (Project Vend, INVESTIGACION.md). El piloto del media buyer corre
 * acá desde el 07/10, en paralelo con la rutina de Milo en paperclip, para
 * compararlos con el mismo evaluador.
 */
export const HORARIOS: ReadonlyArray<{
  rol: string;
  procedimiento: string;
  hora: number;
  dias: number[];
  /** Nombres de clientes, o "con_borrador": los que tienen el informe automático de la semana que terminó. */
  clientes: string[] | "con_borrador";
}> = [
  {
    rol: "media-buyer",
    procedimiento: "revision-diaria",
    hora: 11,
    dias: [1, 2, 3, 4, 5],
    clientes: ["distrillantas", "ma propiedades", "sebastian ramasco padilla"],
  },
  // El informe automático sale los lunes desde las 10 (informes-store.ts); el
  // estratega lo reescribe con criterio a partir de las 11.
  { rol: "estratega", procedimiento: "informe-semanal", hora: 11, dias: [1], clientes: "con_borrador" },
];

/** Los clientes de un horario, con lo que el trabajo necesita de entrada. */
async function clientesDelHorario(
  db: Db,
  clientes: string[] | "con_borrador",
  ahora: Date,
): Promise<Array<{ id: string; nombre: string; extra: Record<string, unknown> }>> {
  if (clientes === "con_borrador") {
    const semana = ultimaSemana(ahora).desde;
    const filas = await db
      .select({ id: clients.id, nombre: clients.name, narrativa: informesSemanales.narrativa })
      .from(informesSemanales)
      .innerJoin(clients, eq(clients.id, informesSemanales.clientId))
      .where(and(eq(clients.status, "active"), eq(informesSemanales.semana, semana), eq(informesSemanales.escritoPor, "tablero:automatico")));
    return filas.map((f) => ({ id: f.id, nombre: f.nombre, extra: { semana, borrador: f.narrativa } }));
  }
  const filas = await db
    .select({ id: clients.id, nombre: clients.name })
    .from(clients)
    .where(and(eq(clients.status, "active"), sql`lower(trim(${clients.name})) in (${sql.join(clientes.map((c) => sql`${c}`), sql`, `)})`));
  return filas.map((f) => ({ ...f, extra: {} }));
}

/** Puro: fecha (aaaa-mm-dd), día de la semana (1 = lunes) y hora en Buenos Aires. */
export function relojLocal(ahora: Date): { fecha: string; dia: number; hora: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(ahora)
      .map((x) => [x.type, x.value]),
  );
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { fecha: `${p.year}-${p.month}-${p.day}`, dia: dias[p.weekday] ?? 0, hora: Number(p.hour) };
}

export async function encolarHorarios(db: Db, ahora = new Date()): Promise<number> {
  const { fecha, dia, hora } = relojLocal(ahora);
  let n = 0;
  for (const h of HORARIOS) {
    if (!h.dias.includes(dia) || hora < h.hora) continue;
    for (const c of await clientesDelHorario(db, h.clientes, ahora)) {
      const ref = `horario:${h.procedimiento}:${fecha}:${c.id}`;
      if (await yaTrabajado(db, h.rol, ref)) continue;
      const id = await encolar(db, {
        rol: h.rol,
        clientId: c.id,
        motivo: "horario",
        ref,
        pedidoPor: `horario:${h.rol}`,
        entrada: { procedimiento: h.procedimiento, cliente: { id: c.id, nombre: c.nombre.trim() }, ...c.extra },
      });
      if (id) n += 1;
    }
  }
  return n;
}

/**
 * Lo que encontraron los agentes para estas decisiones: id de la decisión →
 * resumen del último trabajo hecho. Para el resumen de las 9:00 y Hoy.
 */
export async function hallazgosDeDecisiones(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const refs = ids.map((id) => `decision:${id}`);
  const filas = await db
    .select({ ref: agenteTrabajos.ref, resumen: sql<string | null>`${agenteTrabajos.resultado}->>'resumen'` })
    .from(agenteTrabajos)
    .where(and(eq(agenteTrabajos.estado, "hecho"), sql`${agenteTrabajos.ref} in (${sql.join(refs.map((r) => sql`${r}`), sql`, `)})`))
    .orderBy(agenteTrabajos.finishedAt);
  // Del más viejo al más nuevo: el último que se escribe gana.
  return new Map(filas.filter((f) => f.ref && f.resumen).map((f) => [f.ref!.slice("decision:".length), f.resumen!]));
}

// ── Disparadores por hecho ──────────────────────────────────────────────────

/** Qué decisión despierta a qué rol, y con qué procedimiento del archivo del rol. */
export const DISPARADORES: ReadonlyArray<{ tipo: string; rol: string; procedimiento: string }> = [
  { tipo: "pauta:gasto_caido", rol: "media-buyer", procedimiento: "investigar-gasto-caido" },
  { tipo: "pauta:sin_leads", rol: "media-buyer", procedimiento: "investigar-sin-leads" },
  { tipo: "cadena:sin_calendario", rol: "contenido", procedimiento: "proponer-calendario" },
];

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
          // "Cliente Natural" y "Cliente Inmobiliario" son las carpetas plantilla
          // de ClickUp, no clientes (mismo criterio que el motor).
          sql`coalesce(${clients.clickupFolderId}, '') not in (${sql.join(FOLDERS_ORIGEN_PLANTILLA.map((f) => sql`${f}`), sql`, `)})`,
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
