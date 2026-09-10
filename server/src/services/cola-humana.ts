// LMTM-OS: lo que está frenado esperando a una persona.
//
// El agente que se traba hace lo correcto: marca el issue "blocked" y deja un
// comentario explicando por qué. El problema era el otro lado: el panel sólo
// levantaba los issues cuyo TÍTULO empieza con "[HUMANO]", así que de 346
// bloqueados el equipo veía 15 (revisión de flota, 26/8/26). Los otros 331
// quedaban invisibles — 127 llevaban entre uno y tres meses parados — y encima
// cada uno seguía despertando a su agente para nada: 40.323 wakeups saltados
// por "dependencias bloqueadas" en una sola semana.
//
// Acá hay dos pasadas que corren juntas todos los días:
//   escalar  → el bloqueado que necesita una persona entra a la cola humana
//   vencer   → el bloqueado que nadie tocó en 21 días se cierra
// La segunda es la regla de siempre: toda lista que no vence se convierte en
// cementerio y tapa lo accionable (ver memoria lmtm-os-panel-cementerios).

import type { Db } from "@paperclipai/db";
import { agents, clients, issueComments, issues } from "@paperclipai/db";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { costoPorCliente, ordenarPorCosto, type CostoCliente } from "./costo-de-no-hacer.js";

const DIA = 86_400_000;
/** Un bloqueo que ya lleva esto sin moverse deja de ser "el agente está
 *  esperando algo" y pasa a ser "esto necesita una persona". */
export const DIAS_PARA_ESCALAR = 3;
/** Y esto es lo que nadie va a hacer ya. Mismo criterio que aprobaciones y
 *  oportunidades. */
export const DIAS_PARA_VENCER = 21;
/** Tope de lo que se muestra; el total va aparte para que no se esconda. */
export const TOPE_VISIBLE = 12;

const PREFIJO = "[HUMANO]";

/**
 * ¿Este bloqueo lo destraba una persona o lo destraba otro issue?
 * Reconectar una cuenta, re-autorizar un token, dar un acceso o confirmar un
 * dato son cosas que ningún agente puede hacer solo.
 */
const PIDE_PERSONA = /reconect|re-?autoriz|autoriz|token|acceso|permiso|credencial|mapear|vincular|confirmar|validar|activar|habilitar|cargar|dar de alta|contratar|pagar|firmar/i;

export function necesitaPersona(titulo: string): boolean {
  return titulo.startsWith(PREFIJO) || PIDE_PERSONA.test(titulo);
}

export interface FilaHumana {
  identifier: string | null;
  title: string;
  priority: string | null;
  updatedAt: Date;
  clientId: string | null;
  agente: string | null;
  motivo: string | null;
  diasParado: number;
}

/**
 * La cola: lo marcado [HUMANO] más todo lo bloqueado que espera a alguien.
 * Trae el último comentario del agente, que es donde explicó qué necesita —
 * sin eso la fila dice "Reconectar página Meta" y no dice de qué cuenta.
 */
export async function colaHumana(db: Db): Promise<{ filas: FilaHumana[]; total: number }> {
  const rows = await db
    .select({
      id: issues.id,
      identifier: issues.identifier,
      title: issues.title,
      priority: issues.priority,
      updatedAt: issues.updatedAt,
      clientId: issues.clientId,
      agente: agents.name,
      // El último comentario DE UN AGENTE. Si se toma el último a secas sale
      // ruido del sistema ("Paperclip automatically retried continuation…") en
      // vez de la explicación de por qué se trabó, que es lo único que hace
      // accionable la fila.
      motivo: sql<string | null>`coalesce(
        (select c.body from ${issueComments} c
          where c.issue_id = ${issues.id} and c.author_agent_id is not null
          order by c.created_at desc limit 1),
        (select c.body from ${issueComments} c
          where c.issue_id = ${issues.id} and c.author_type = 'user'
          order by c.created_at desc limit 1)
      )`,
    })
    .from(issues)
    .leftJoin(agents, eq(agents.id, issues.assigneeAgentId))
    .where(
      or(
        and(sql`${issues.title} like ${PREFIJO + "%"}`, inArray(issues.status, ["todo", "backlog", "blocked"] as never)),
        eq(issues.status, "blocked"),
      ),
    )
    .orderBy(issues.updatedAt);

  const ahora = Date.now();
  const filas = rows
    .filter((r) => necesitaPersona(r.title))
    .map((r) => ({
      identifier: r.identifier,
      title: r.title,
      priority: r.priority,
      updatedAt: r.updatedAt,
      clientId: r.clientId,
      agente: r.agente,
      // El comentario del agente suele ser largo; en la fila entra la primera
      // frase, que es la que dice qué necesita.
      motivo: r.motivo ? primeraFrase(r.motivo) : null,
      diasParado: Math.floor((ahora - new Date(r.updatedAt).getTime()) / DIA),
    }));

  // Ordenar por lo que cuesta no hacerlo. La cola se corta en TOPE_VISIBLE, así
  // que el orden decide qué ve una persona: por antigüedad, una cuenta frenada
  // que le para $43.000 por día a un cliente quedaba debajo de una consulta de
  // julio. El costo sale de la caída de gasto y ya está en la DB, así que esto
  // no depende de que Meta ni Make contesten.
  const costos = await costoPorCliente(db).catch((e) => {
    console.warn("[cola-humana] sin costos, se ordena por antigüedad:", e instanceof Error ? e.message : e);
    return new Map<string, CostoCliente>();
  });
  const ordenadas = ordenarPorCosto(filas, costos);

  return { filas: ordenadas.slice(0, TOPE_VISIBLE), total: ordenadas.length };
}

function primeraFrase(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").replace(/^\W+/, "").trim();
  const corte = limpio.search(/[.!?](\s|$)/);
  const frase = corte > 20 ? limpio.slice(0, corte + 1) : limpio;
  return frase.length > 180 ? frase.slice(0, 177) + "…" : frase;
}

/** Marca con [HUMANO] los bloqueados que ya esperan hace días a una persona. */
export async function escalarBloqueados(db: Db): Promise<number> {
  const corte = new Date(Date.now() - DIAS_PARA_ESCALAR * DIA);
  const candidatos = await db
    .select({ id: issues.id, companyId: issues.companyId, title: issues.title, updatedAt: issues.updatedAt })
    .from(issues)
    .where(and(eq(issues.status, "blocked"), lt(issues.updatedAt, corte), sql`${issues.title} not like ${PREFIJO + "%"}`));

  let n = 0;
  for (const c of candidatos) {
    if (!necesitaPersona(c.title)) continue;
    const dias = Math.floor((Date.now() - new Date(c.updatedAt).getTime()) / DIA);
    // OJO: no se toca updated_at. Si lo tocáramos, el issue "rejuvenece" y no
    // vence nunca — que es exactamente cómo se arma un cementerio.
    await db.execute(sql`
      update ${issues} set title = ${PREFIJO + " " + c.title} where id = ${c.id}
    `);
    await db.insert(issueComments).values({
      companyId: c.companyId,
      issueId: c.id,
      authorType: "system",
      body:
        `Escalado a la cola humana: lleva ${dias} día(s) bloqueado y lo que falta ` +
        `no lo puede destrabar un agente. Aparece en el Centro de Mando, en "Solo lo podés hacer vos".`,
    });
    n += 1;
  }
  return n;
}

/** Cierra lo que lleva 21 días sin moverse y no espera a una persona. */
export async function vencerBloqueados(db: Db): Promise<number> {
  const corte = new Date(Date.now() - DIAS_PARA_VENCER * DIA);
  const candidatos = await db
    .select({ id: issues.id, companyId: issues.companyId, title: issues.title, updatedAt: issues.updatedAt })
    .from(issues)
    .where(and(eq(issues.status, "blocked"), lt(issues.updatedAt, corte)));

  let n = 0;
  for (const c of candidatos) {
    // Lo que espera a una persona no vence: vive en la cola humana hasta que
    // alguien lo haga o lo cierre a mano.
    if (necesitaPersona(c.title)) continue;
    const dias = Math.floor((Date.now() - new Date(c.updatedAt).getTime()) / DIA);
    await db.insert(issueComments).values({
      companyId: c.companyId,
      issueId: c.id,
      authorType: "system",
      body:
        `Cerrado automáticamente: ${dias} días bloqueado sin que se moviera nada. ` +
        `Si todavía hace falta, reabrilo — pero dejarlo abierto sólo tapaba lo que sí es accionable.`,
    });
    await db.update(issues).set({ status: "cancelled" as never, updatedAt: new Date() }).where(eq(issues.id, c.id));
    n += 1;
  }
  return n;
}

export async function barrerColaHumana(db: Db): Promise<{ escalados: number; vencidos: number }> {
  const escalados = await escalarBloqueados(db);
  const vencidos = await vencerBloqueados(db);
  return { escalados, vencidos };
}

/** Nombres de cliente para las filas que lo tengan (lo usa la ruta). */
export async function conNombreDeCliente<T extends { clientId: string | null }>(db: Db, filas: T[]) {
  const ids = [...new Set(filas.map((f) => f.clientId).filter(Boolean))] as string[];
  if (!ids.length) return filas.map((f) => ({ ...f, clienteNombre: null, clienteSlug: null }));
  const rows = await db
    .select({ id: clients.id, name: clients.name, slug: clients.slug })
    .from(clients)
    .where(inArray(clients.id, ids));
  const byId = new Map(rows.map((c) => [c.id, c]));
  return filas.map((f) => ({
    ...f,
    clienteNombre: f.clientId ? byId.get(f.clientId)?.name ?? null : null,
    clienteSlug: f.clientId ? byId.get(f.clientId)?.slug ?? null : null,
  }));
}
