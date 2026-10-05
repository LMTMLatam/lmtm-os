// LMTM-OS: duplicar un conjunto que rinde.
//
// ES DE OTRA CLASE DE RIESGO QUE EL RESTO
// Las tres palancas que ya existían —pausar, negativizar, mover presupuesto—
// MODIFICAN un número en algo que ya existe. Ésta CREA una entidad nueva que
// gasta. Si una pausa sale mal, se despausa; si una copia sale mal, hay una
// cosa de más en la cuenta del cliente gastando plata que nadie decidió.
//
// Por eso tiene dos guards que las otras no necesitan:
//
//   1. NACE PAUSADA, Y SE VERIFICA. Se pide `status_option: PAUSED`, pero
//      después se LEE la entidad creada para confirmarlo. Confiar en el flag es
//      confiar en que la API hizo lo que dijo; leerlo es saberlo. Si vuelve
//      activa, se pausa en el acto y se avisa.
//
//   2. SE EXIGE QUE SEA UN GANADOR. La tool se llama `duplicate_winner`: si
//      duplicara cualquier cosa, el nombre mentiría y un agente podría clonar
//      un conjunto que no trae nada. El criterio está acá abajo, es público y
//      se puede discutir.
//
// Y una decisión de diseño: la copia nace con EL MISMO presupuesto que el
// original, sin excepción. El único cambio que introduce esta acción es la
// existencia de la copia; si además eligiera un presupuesto distinto, serían
// dos cambios a la vez y después nadie sabría cuál explicó el resultado.

import type { Db } from "@paperclipai/db";
import { adsAdsets, adsConnections, adsInsights, agentActions } from "@paperclipai/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Una copia por entidad por día. Mismo criterio que el cambio de presupuesto. */
export const HORAS_ENTRE_COPIAS = 24;

/** Leads mínimos en la ventana para que "viene rindiendo" signifique algo. */
export const LEADS_MINIMOS = 5;

/** Días que se miran para juzgar si rinde. */
export const DIAS_VENTANA = 30;

export interface Rendimiento {
  leads: number;
  spend: number;
  /** CPL del conjunto. */
  cpl: number | null;
  /** CPL promedio del resto de la cuenta del cliente, para comparar. */
  cplCuenta: number | null;
}

export type VeredictoGanador = { ok: true } | { ok: false; motivo: string };

/**
 * ¿Esto es un ganador?
 *
 * Pura: es el criterio que separa "escalar lo que funciona" de "clonar ruido",
 * y tiene que poder leerse y discutirse sin abrir el resto del archivo.
 *
 * La vara es contra la PROPIA cuenta del cliente y no contra el rubro: duplicar
 * es una decisión sobre cómo repartir SU plata, y lo que importa ahí es si este
 * conjunto rinde mejor que las otras opciones que ya tiene andando.
 */
export function esGanador(r: Rendimiento): VeredictoGanador {
  if (r.leads < LEADS_MINIMOS) {
    return {
      ok: false,
      motivo: `Trajo ${r.leads} lead${r.leads === 1 ? "" : "s"} en ${DIAS_VENTANA} días y hacen falta ${LEADS_MINIMOS} para poder decir que rinde. Duplicarlo ahora es clonar una casualidad.`,
    };
  }
  if (r.cpl == null) {
    return { ok: false, motivo: "No puedo calcular su CPL, así que no puedo afirmar que rinda." };
  }
  if (r.cplCuenta == null) {
    return { ok: false, motivo: "No tengo con qué comparar: el resto de la cuenta no tiene datos suficientes." };
  }
  if (r.cpl > r.cplCuenta) {
    return {
      ok: false,
      motivo: `Su CPL ($${Math.round(r.cpl)}) está por ENCIMA del promedio de la cuenta ($${Math.round(r.cplCuenta)}): no es el que conviene escalar. Mirá primero por qué rinde menos que sus vecinos.`,
    };
  }
  return { ok: true };
}

export interface ResultadoCopia {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  /** Id de la entidad creada. */
  copiaId?: string;
  /** Si la copia quedó pausada (lo esperado) o hubo que pausarla a mano. */
  nacioPausada?: boolean;
  rendimiento?: Rendimiento;
}

/** Rendimiento del conjunto y de la cuenta, en la misma ventana. */
export async function rendimientoDeConjunto(db: Db, clientId: string, adsetId: string): Promise<Rendimiento> {
  // El día en curso queda afuera: ads_insights de hoy está a medio sincronizar.
  const ventana = and(
    eq(adsInsights.clientId, clientId),
    gte(adsInsights.date, sql`(current_date - ${sql.raw(String(DIAS_VENTANA + 1))}::int)`),
    sql`${adsInsights.date} <= (current_date - 1)`,
  );

  const [propio] = await db
    .select({
      leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
      spend: sql<string>`coalesce(sum(${adsInsights.spend}),0)`,
    })
    .from(adsInsights)
    .where(and(ventana, eq(adsInsights.adsetId, adsetId)));

  // El promedio de la cuenta EXCLUYE al conjunto que se está juzgando: si no,
  // un conjunto que domina el gasto se compara contra sí mismo y siempre pasa.
  const [resto] = await db
    .select({
      leads: sql<number>`coalesce(sum(${adsInsights.leads}),0)::int`,
      spend: sql<string>`coalesce(sum(${adsInsights.spend}),0)`,
    })
    .from(adsInsights)
    .where(and(ventana, sql`${adsInsights.adsetId} is distinct from ${adsetId}`));

  const leads = Number(propio?.leads ?? 0);
  const spend = Number(propio?.spend ?? 0);
  const leadsResto = Number(resto?.leads ?? 0);
  const spendResto = Number(resto?.spend ?? 0);

  return {
    leads,
    spend: Math.round(spend),
    cpl: leads > 0 ? Math.round(spend / leads) : null,
    cplCuenta: leadsResto > 0 ? Math.round(spendResto / leadsResto) : null,
  };
}

/** Duplica un conjunto de Meta que viene rindiendo. La copia nace PAUSADA. */
export async function duplicateWinner(
  db: Db,
  input: { clientId: string; adsetId: string; agentId?: string | null; approved?: boolean },
): Promise<ResultadoCopia> {
  const { clientId, adsetId } = input;

  // 1) Enfriamiento, antes que nada: no tiene sentido evaluar ni pedir firma
  //    para algo que el guard va a rechazar igual.
  const desde = new Date(Date.now() - HORAS_ENTRE_COPIAS * 3600 * 1000);
  const [previa] = await db
    .select({ createdAt: agentActions.createdAt })
    .from(agentActions)
    .where(and(
      eq(agentActions.kind, "duplicate_winner"),
      eq(agentActions.entityId, adsetId),
      gte(agentActions.createdAt, desde),
    ))
    .orderBy(desc(agentActions.createdAt))
    .limit(1);
  if (previa) {
    const horas = Math.round((Date.now() - previa.createdAt.getTime()) / 3600_000);
    return { ok: false, error: `Ese conjunto ya se duplicó hace ${horas}h. Una copia por día: si la anterior todavía no se puso a andar, otra copia no agrega nada.` };
  }

  // 2) Propiedad: tiene que ser un conjunto de ESTE cliente y estar sincronizado.
  const [fila] = await db
    .select({ id: adsAdsets.id, name: adsAdsets.name, connectionId: adsAdsets.connectionId })
    .from(adsAdsets)
    .where(and(eq(adsAdsets.id, adsetId), eq(adsAdsets.clientId, clientId)))
    .limit(1);
  if (!fila) {
    return { ok: false, error: `No encontré el conjunto ${adsetId} para este cliente (o no está sincronizado). No se puede actuar sobre entidades ajenas o inexistentes.` };
  }
  if (!fila.connectionId) return { ok: false, error: "El conjunto no tiene conexión asociada." };
  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, fila.connectionId)).limit(1);
  if (!conn?.accessToken) return { ok: false, error: "No hay token de la conexión." };
  if (conn.platform !== "meta") {
    // En Google no hay un equivalente directo: duplicar un grupo de anuncios
    // pide recrear criterios y anuncios uno por uno, que es otra tarea.
    return { ok: false, error: "Por ahora sólo se pueden duplicar conjuntos de Meta." };
  }

  // 3) ¿Es un ganador? Es lo que promete el nombre de la acción.
  const rendimiento = await rendimientoDeConjunto(db, clientId, adsetId);
  const veredicto = esGanador(rendimiento);
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo, rendimiento };

  // 4) Firma humana.
  if (!input.approved) {
    return {
      ok: false,
      approvalRequired: true,
      rendimiento,
      error:
        `Duplicar "${fila.name}" CREA una entidad nueva en la cuenta del cliente. ` +
        `Viene rindiendo (${rendimiento.leads} leads, CPL $${rendimiento.cpl} contra $${rendimiento.cplCuenta} del resto de la cuenta). ` +
        `La copia nace PAUSADA y con el mismo presupuesto; arrancarla es una decisión humana aparte.`,
    };
  }

  // 5) Crear la copia, pidiendo explícitamente que nazca pausada.
  try {
    const r = await fetch(`${GRAPH}/${adsetId}/copies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // deep_copy baja también los anuncios: una copia sin creatividades es
        // un conjunto vacío que no sirve para nada.
        deep_copy: true,
        status_option: "PAUSED",
        access_token: conn.accessToken,
      }),
    });
    const texto = await r.text();
    if (!r.ok) return { ok: false, error: `Meta rechazó la copia (${r.status}): ${texto.slice(0, 250)}`, rendimiento };

    const copiaId = String((JSON.parse(texto) as { copied_adset_id?: string; id?: string }).copied_adset_id
      ?? (JSON.parse(texto) as { id?: string }).id ?? "");
    if (!copiaId) return { ok: false, error: `Meta respondió sin id de la copia: ${texto.slice(0, 200)}`, rendimiento };

    // 6) VERIFICAR que nació pausada en vez de confiar en el flag. Si la API
    //    cambia el significado de status_option, o lo ignora, acá se nota —
    //    y una entidad gastando sin que nadie lo decidiera es el peor final.
    const nacioPausada = await confirmarPausada(copiaId, conn.accessToken);

    await db.insert(agentActions).values({
      clientId,
      agentId: input.agentId ?? null,
      kind: "duplicate_winner",
      entityType: "adset",
      entityId: adsetId,
      detail: { nombre: fila.name, copiaId, nacioPausada, rendimiento },
    }).catch(() => {});

    return { ok: true, copiaId, nacioPausada, rendimiento };
  } catch (e) {
    return { ok: false, error: `No se pudo duplicar: ${e instanceof Error ? e.message : String(e)}`, rendimiento };
  }
}

/**
 * Lee el estado de la copia y, si quedó activa, la pausa.
 *
 * Devuelve true sólo si terminó pausada. Ante cualquier duda —no se pudo leer,
 * no se pudo pausar— devuelve false, que es lo que hace que la respuesta al
 * agente diga "andá a mirarla".
 */
async function confirmarPausada(copiaId: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(`${GRAPH}/${copiaId}?fields=status,effective_status&access_token=${encodeURIComponent(token)}`);
    if (!r.ok) return false;
    const d = (await r.json()) as { status?: string; effective_status?: string };
    const pausada = /paused/i.test(String(d.status ?? "")) || /paused/i.test(String(d.effective_status ?? ""));
    if (pausada) return true;

    const p = await fetch(`${GRAPH}/${copiaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: token }),
    });
    return p.ok;
  } catch {
    return false;
  }
}
