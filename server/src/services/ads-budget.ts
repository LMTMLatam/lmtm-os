// LMTM-OS: mover el presupuesto diario. La primera palanca del sistema que
// EMPUJA en vez de frenar.
//
// Por qué hacía falta: hasta ahora las únicas acciones que tocaban la cuenta de
// un cliente eran pausar, negativizar y pausar keywords. Las tres restan. Subir
// el presupuesto del conjunto que rinde, o mover plata del que no rinde al que
// sí, terminaba siempre como "creo una tarea y que lo haga alguien".
//
// LAS DOS TRAMPAS DE UNIDADES — leer antes de tocar nada acá
//
//   Meta  → unidad MENOR de la moneda (centavos). $31.000 ARS son 3100000.
//           `ads_adsets.daily_budget` guarda lo que Meta devuelve, sin
//           convertir, así que lo que leemos de la DB ya está en centavos y
//           lo que escribimos tiene que ir igual.
//   Google→ MICROS (1.000.000 = 1 unidad de la moneda). $31.000 ARS son
//           31000000000. Además el presupuesto NO vive en la campaña sino en
//           un recurso `campaign_budget` aparte, que puede estar COMPARTIDO
//           entre varias campañas.
//
// Confundir una por otra no da error: da un presupuesto 100 o 1.000.000 veces
// más grande. Por eso las conversiones viven en un solo lugar (`aMenor` /
// `aMicros`) y la comparación del tope de paso se hace siempre en la unidad
// nativa de cada plataforma, nunca mezclando las dos.

import type { Db } from "@paperclipai/db";
import { adsCampaigns, adsAdsets, adsConnections, agentActions } from "@paperclipai/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { withFreshAccessToken } from "./ads/token-refresh.js";
import { mutate, searchStream } from "./ads/providers/google.js";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Cuánto se puede mover el presupuesto de una vez, como fracción del actual.
 *
 * No es timidez: un salto grande cambia la fase de aprendizaje de la campaña y
 * el resultado del día siguiente deja de ser comparable con el anterior, así
 * que la medición de si la acción sirvió se vuelve ruido. Y acota el daño de un
 * número mal escrito.
 */
export const PASO_MAXIMO = 0.3;

/**
 * Una entidad no se toca dos veces en este plazo.
 *
 * Es el guard que más importa de los tres. Cada corrida por separado puede
 * parecer razonable —"subo 30% que viene rindiendo"— y ocho corridas en un día
 * multiplican el presupuesto por ocho. El tope de paso solo no alcanza: lo que
 * frena la escalada es el tiempo entre pasos.
 */
export const HORAS_ENTRE_CAMBIOS = 24;

/** Piso absoluto, en unidades de la moneda. Debajo de esto la campaña no entrega. */
export const MINIMO_DIARIO = 1000;

export interface ResultadoPresupuesto {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  ensayo?: boolean;
  /** En unidades de la moneda (pesos), no en centavos ni micros. */
  anterior?: number;
  nuevo?: number;
  entidad?: { tipo: string; id: string; nombre: string | null };
}

// ── Unidades ─────────────────────────────────────────────────────────────────

/** Pesos → centavos (Meta). */
export const aMenor = (unidades: number): number => Math.round(unidades * 100);
/** Centavos (Meta) → pesos. */
export const deMenor = (menor: number): number => menor / 100;
/** Pesos → micros (Google). */
export const aMicros = (unidades: number): number => Math.round(unidades * 1_000_000);
/** Micros (Google) → pesos. */
export const deMicros = (micros: number): number => micros / 1_000_000;

// ── Política (pura, para poder probarla sin red ni DB) ───────────────────────

export type VeredictoPaso =
  | { ok: true }
  | { ok: false; motivo: string };

/**
 * ¿Es válido pasar de `actual` a `nuevo`? Ambos en unidades de la moneda.
 *
 * Devuelve el motivo escrito para el agente, no un código: el mensaje es lo que
 * el modelo lee para corregirse, y "pedí 45% y el tope es 30%, probá con $X" lo
 * arregla en un intento mientras que "invalid_step" lo hace reintentar igual.
 */
export function validarPaso(actual: number, nuevo: number): VeredictoPaso {
  if (!Number.isFinite(nuevo) || nuevo <= 0) {
    return { ok: false, motivo: `El presupuesto nuevo tiene que ser un número positivo (llegó ${nuevo}).` };
  }
  if (nuevo < MINIMO_DIARIO) {
    return { ok: false, motivo: `$${nuevo} queda por debajo del piso de $${MINIMO_DIARIO}: la campaña dejaría de entregar. Si la idea es apagarla, usá la pausa.` };
  }
  if (!Number.isFinite(actual) || actual <= 0) {
    return { ok: false, motivo: "No pude leer el presupuesto actual, así que no puedo medir cuánto cambia. Sin eso no se escribe." };
  }
  // La tolerancia no es cosmética: `10000 * 1.3` da 13000.000000000002 en coma
  // flotante, así que un agente que calcula exactamente el tope permitido se
  // comía un rechazo — y el monto que el propio mensaje le sugería también
  // fallaba, dejándolo en un bucle de reintentos contra una pared invisible.
  const salto = Math.abs(nuevo - actual) / actual;
  if (salto > PASO_MAXIMO + 1e-9) {
    const tope = Math.round(actual * (nuevo > actual ? 1 + PASO_MAXIMO : 1 - PASO_MAXIMO));
    const pct = Math.round(salto * 100);
    return {
      ok: false,
      motivo:
        `El salto es de ${pct}% y el tope por paso es ${Math.round(PASO_MAXIMO * 100)}%. ` +
        `Movelo a $${tope} ahora y volvé a evaluar en ${HORAS_ENTRE_CAMBIOS}h con datos nuevos.`,
    };
  }
  return { ok: true };
}

// ── Lado con DB y red ────────────────────────────────────────────────────────

/** ¿Ya se tocó esta entidad dentro de la ventana de enfriamiento? */
async function cambiadaHacePoco(db: Db, entityId: string): Promise<Date | null> {
  const desde = new Date(Date.now() - HORAS_ENTRE_CAMBIOS * 3600 * 1000);
  const [previa] = await db
    .select({ createdAt: agentActions.createdAt })
    .from(agentActions)
    .where(and(
      eq(agentActions.kind, "set_budget"),
      eq(agentActions.entityId, entityId),
      gte(agentActions.createdAt, desde),
    ))
    .orderBy(desc(agentActions.createdAt))
    .limit(1);
  return previa?.createdAt ?? null;
}

interface PresupuestoGoogle {
  resourceName: string;
  micros: number;
  compartido: boolean;
}

/**
 * Presupuesto vivo de una campaña de Google.
 *
 * Se consulta en vivo y no en nuestra DB porque el sync de Google NO trae
 * presupuestos (`dailyBudget` queda undefined para esa plataforma). De paso es
 * el único lugar donde se puede ver si el presupuesto está compartido, que es
 * el dato que decide si se puede tocar.
 */
async function presupuestoDeGoogle(
  conn: Parameters<typeof searchStream>[0],
  cuenta: string,
  campaignId: string,
): Promise<PresupuestoGoogle | null> {
  const filas = await searchStream(conn, cuenta, `
    SELECT campaign_budget.resource_name,
           campaign_budget.amount_micros,
           campaign_budget.explicitly_shared
    FROM campaign
    WHERE campaign.id = ${Number(campaignId)}
  `);
  const b = (filas[0] as { campaignBudget?: { resourceName?: string; amountMicros?: string | number; explicitlyShared?: boolean } } | undefined)?.campaignBudget;
  if (!b?.resourceName) return null;
  return {
    resourceName: b.resourceName,
    micros: Number(b.amountMicros ?? 0),
    compartido: b.explicitlyShared === true,
  };
}

type LecturaPresupuesto =
  | { error: string }
  | {
      actual: number;
      nombre: string | null;
      conn: typeof adsConnections.$inferSelect;
      cuentaGoogle: string | null;
      presuGoogle: PresupuestoGoogle | null;
    };

/**
 * Propiedad + conexión + presupuesto actual, en pesos, para cualquier plataforma.
 *
 * Está separado de `setBudget` porque `shiftBudget` necesita leer las DOS patas
 * antes de escribir ninguna. Antes lo hacía llamando a `setBudget` con un valor
 * inválido a propósito para quedarse con el `anterior` del error — andaba, y era
 * exactamente la clase de astucia que alguien rompe sin darse cuenta al tocar un
 * mensaje de error.
 */
async function leerPresupuestoActual(
  db: Db,
  clientId: string,
  entityType: "campaign" | "adset",
  entityId: string,
): Promise<LecturaPresupuesto> {
  const tabla = entityType === "campaign" ? adsCampaigns : adsAdsets;
  const [fila] = await db
    .select({ id: tabla.id, name: tabla.name, connectionId: tabla.connectionId, dailyBudget: tabla.dailyBudget })
    .from(tabla)
    .where(and(eq(tabla.id, entityId), eq(tabla.clientId, clientId)))
    .limit(1);
  if (!fila) {
    return { error: `No encontré ${entityType} ${entityId} para este cliente (o no está sincronizado). No se puede actuar sobre entidades ajenas o inexistentes.` };
  }
  if (!fila.connectionId) return { error: "La entidad no tiene conexión asociada (conexión borrada/reemplazada)." };
  const [conn] = await db.select().from(adsConnections).where(eq(adsConnections.id, fila.connectionId)).limit(1);
  if (!conn?.accessToken) return { error: "No hay token de la conexión." };

  if (conn.platform === "google") {
    if (entityType !== "campaign") {
      return { error: "En Google el presupuesto vive en la campaña, no en el grupo de anuncios. Pasá la campaña." };
    }
    const cuenta = await cuentaDeCampanaGoogle(db, entityId, clientId);
    if (!cuenta) return { error: "No pude resolver la cuenta de Google de esa campaña." };
    const fresca = await withFreshAccessToken(db, conn);
    const presu = await presupuestoDeGoogle(fresca, cuenta, entityId);
    if (!presu) return { error: "No pude leer el presupuesto actual de esa campaña en Google." };
    if (presu.compartido) {
      // Tocarlo cambiaría el gasto de campañas que nadie pidió mover, incluso
      // de otros clientes si la cuenta las comparte.
      return { error: `El presupuesto de "${fila.name}" está COMPARTIDO con otras campañas: cambiarlo movería el gasto de todas. Hay que separarlo primero, y eso lo decide una persona.` };
    }
    return { actual: deMicros(presu.micros), nombre: fila.name, conn, cuentaGoogle: cuenta, presuGoogle: presu };
  }

  if (conn.platform !== "meta") return { error: `Plataforma no soportada para escritura: ${conn.platform}.` };

  const menor = Number(fila.dailyBudget ?? 0);
  if (!menor) {
    return { error: `"${fila.name}" no tiene presupuesto diario propio (puede estar usando presupuesto a nivel campaña, CBO, o de por vida). Por esta vía solo se mueve un diario propio.` };
  }
  return { actual: deMenor(menor), nombre: fila.name, conn, cuentaGoogle: null, presuGoogle: null };
}

export interface EntradaPresupuesto {
  clientId: string;
  entityType: "campaign" | "adset";
  entityId: string;
  /** El nuevo diario, en unidades de la moneda (pesos). */
  nuevoDiario: number;
  agentId?: string | null;
  approved?: boolean;
  /** Valida contra la plataforma sin guardar. Google lo soporta nativo. */
  ensayo?: boolean;
  /** Para shiftBudget: salta el cooldown porque las dos patas son un solo movimiento. */
  omitirEnfriamiento?: boolean;
}

/** Mueve el presupuesto diario de una campaña o conjunto. */
export async function setBudget(db: Db, input: EntradaPresupuesto): Promise<ResultadoPresupuesto> {
  const { clientId, entityType, entityId, nuevoDiario } = input;

  // 1) Enfriamiento. Va primero a propósito: si la entidad ya se tocó hoy, no
  //    tiene sentido ir a buscar datos ni hacer que una persona apruebe algo
  //    que el guard va a rechazar igual.
  if (!input.omitirEnfriamiento && !input.ensayo) {
    const previa = await cambiadaHacePoco(db, entityId);
    if (previa) {
      const horas = Math.round((Date.now() - previa.getTime()) / 3600_000);
      return {
        ok: false,
        error: `El presupuesto de esa ${entityType === "campaign" ? "campaña" : "entidad"} ya se movió hace ${horas}h. Se puede volver a tocar después de ${HORAS_ENTRE_CAMBIOS}h: un cambio por día es lo que permite saber si el anterior sirvió.`,
      };
    }
  }

  // 2) Propiedad, conexión y presupuesto actual en pesos, para cualquier
  //    plataforma. Acá adentro también se rechaza el presupuesto compartido.
  const lectura = await leerPresupuestoActual(db, clientId, entityType, entityId);
  if ("error" in lectura) return { ok: false, error: lectura.error };
  const { actual: actualUnidades, nombre, conn, cuentaGoogle: cuenta, presuGoogle } = lectura;
  const fila = { name: nombre };

  // 3) Validar el salto.
  const veredicto = validarPaso(actualUnidades, nuevoDiario);
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo, anterior: actualUnidades };

  // 4) Firma humana. Igual que la pausa: mueve plata real.
  if (!input.approved && !input.ensayo) {
    const direccion = nuevoDiario > actualUnidades ? "SUBIR" : "BAJAR";
    return {
      ok: false,
      approvalRequired: true,
      anterior: actualUnidades,
      nuevo: nuevoDiario,
      entidad: { tipo: entityType, id: entityId, nombre: fila.name },
      error: `${direccion} el presupuesto de "${fila.name}" de $${Math.round(actualUnidades)} a $${Math.round(nuevoDiario)} MUEVE plata real. Proponelo en el issue con el número que lo justifica (CPL, leads, gasto) y esperá OK humano; recién ahí ejecutá con approved=true.`,
    };
  }

  // 5) Escribir.
  try {
    if (conn.platform === "google" && cuenta && presuGoogle) {
      const fresca = await withFreshAccessToken(db, conn);
      await mutate(fresca, cuenta, "campaignBudgets", [{
        update: { resourceName: presuGoogle.resourceName, amountMicros: String(aMicros(nuevoDiario)) },
        updateMask: "amount_micros",
      }], { validateOnly: input.ensayo === true });
    } else {
      // Meta no tiene validateOnly: el ensayo se corta acá, ya habiendo pasado
      // propiedad, unidades, paso y enfriamiento, que es lo que se quería probar.
      if (input.ensayo) {
        return { ok: true, ensayo: true, anterior: actualUnidades, nuevo: nuevoDiario, entidad: { tipo: entityType, id: entityId, nombre: fila.name } };
      }
      const r = await fetch(`${GRAPH}/${entityId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_budget: String(aMenor(nuevoDiario)), access_token: conn.accessToken }),
      });
      if (!r.ok) {
        const texto = await r.text();
        return { ok: false, error: `Meta rechazó el cambio de presupuesto (${r.status}): ${texto.slice(0, 250)}`, anterior: actualUnidades };
      }
    }

    if (!input.ensayo) {
      // El ledger es lo que después mide si la acción sirvió, Y es lo que lee el
      // enfriamiento en la próxima corrida. Sin esta fila el guard no existe.
      await db.insert(agentActions).values({
        clientId,
        agentId: input.agentId ?? null,
        kind: "set_budget",
        entityType,
        entityId,
        detail: { nombre: fila.name, plataforma: conn.platform, anterior: actualUnidades, nuevo: nuevoDiario },
      });
    }

    return {
      ok: true,
      ensayo: input.ensayo === true,
      anterior: actualUnidades,
      nuevo: nuevoDiario,
      entidad: { tipo: entityType, id: entityId, nombre: fila.name },
    };
  } catch (e) {
    return { ok: false, error: `No se pudo cambiar el presupuesto: ${e instanceof Error ? e.message : String(e)}`, anterior: actualUnidades };
  }
}

export interface ResultadoMovimiento {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  ensayo?: boolean;
  desde?: ResultadoPresupuesto;
  hacia?: ResultadoPresupuesto;
}

/**
 * Mueve plata de una entidad a otra: baja una, sube la otra, por el mismo monto.
 *
 * Es la acción que el equipo pide más seguido ("sacale al que no rinde y ponele
 * al que rinde") y es dos `setBudget`, no una palanca nueva.
 *
 * ORDEN: primero se BAJA y después se SUBE. Si la segunda pata falla, el
 * cliente queda gastando de menos, que es recuperable; al revés queda gastando
 * de más sin que nadie lo haya aprobado.
 */
export async function shiftBudget(
  db: Db,
  input: {
    clientId: string;
    desde: { entityType: "campaign" | "adset"; entityId: string };
    hacia: { entityType: "campaign" | "adset"; entityId: string };
    /** Monto a mover, en unidades de la moneda. */
    monto: number;
    agentId?: string | null;
    approved?: boolean;
    ensayo?: boolean;
  },
): Promise<ResultadoMovimiento> {
  if (input.desde.entityId === input.hacia.entityId) {
    return { ok: false, error: "El origen y el destino son la misma entidad." };
  }
  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, error: `El monto a mover tiene que ser positivo (llegó ${input.monto}).` };
  }

  // Ensayo de las dos patas antes de tocar nada: si la segunda es inválida
  // (rompe el tope, está compartida, no es de este cliente), no se ejecuta la
  // primera y el cliente no queda a mitad de camino.
  const base = { clientId: input.clientId, agentId: input.agentId, omitirEnfriamiento: true };
  const leer = async (e: { entityType: "campaign" | "adset"; entityId: string }, signo: 1 | -1) => {
    const previo = await leerPresupuestoActual(db, input.clientId, e.entityType, e.entityId);
    if ("error" in previo) return { error: previo.error };
    return { actual: previo.actual, objetivo: previo.actual + signo * input.monto };
  };

  const origen = await leer(input.desde, -1);
  if ("error" in origen) return { ok: false, error: `Origen: ${origen.error}` };
  const destino = await leer(input.hacia, 1);
  if ("error" in destino) return { ok: false, error: `Destino: ${destino.error}` };

  const vOrigen = validarPaso(origen.actual, origen.objetivo);
  if (!vOrigen.ok) return { ok: false, error: `Origen: ${vOrigen.motivo}` };
  const vDestino = validarPaso(destino.actual, destino.objetivo);
  if (!vDestino.ok) return { ok: false, error: `Destino: ${vDestino.motivo}` };

  if (!input.approved && !input.ensayo) {
    return {
      ok: false,
      approvalRequired: true,
      error: `Mover $${Math.round(input.monto)} por día MUEVE plata real: el origen baja de $${Math.round(origen.actual)} a $${Math.round(origen.objetivo)} y el destino sube de $${Math.round(destino.actual)} a $${Math.round(destino.objetivo)}. Proponelo en el issue con los números que lo justifican y esperá OK humano.`,
    };
  }

  // Primero bajar.
  const bajada = await setBudget(db, { ...base, ...input.desde, nuevoDiario: origen.objetivo, approved: true, ensayo: input.ensayo });
  if (!bajada.ok) return { ok: false, error: `No se pudo bajar el origen, no se tocó el destino: ${bajada.error}`, desde: bajada };

  const subida = await setBudget(db, { ...base, ...input.hacia, nuevoDiario: destino.objetivo, approved: true, ensayo: input.ensayo });
  if (!subida.ok) {
    return {
      ok: false,
      desde: bajada,
      hacia: subida,
      error:
        `Se bajó el origen a $${Math.round(origen.objetivo)} pero el destino NO se pudo subir: ${subida.error}. ` +
        `El cliente está gastando $${Math.round(input.monto)} menos por día hasta que se resuelva — avisá al equipo.`,
    };
  }

  return { ok: true, ensayo: input.ensayo === true, desde: bajada, hacia: subida };
}

/** Customer id de Google de una campaña, verificando que sea de ESTE cliente. */
async function cuentaDeCampanaGoogle(db: Db, campaignId: string, clientId: string): Promise<string | null> {
  const [c] = await db
    .select({ adAccountId: adsCampaigns.adAccountId, platform: adsCampaigns.platform })
    .from(adsCampaigns)
    .where(and(eq(adsCampaigns.id, campaignId), eq(adsCampaigns.clientId, clientId)))
    .limit(1);
  if (!c || c.platform !== "google") return null;
  const cid = c.adAccountId.replace(/^act_/i, "").replace(/-/g, "").trim();
  return cid || null;
}
