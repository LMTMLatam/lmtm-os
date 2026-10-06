// LMTM-OS: lo que hay que mirar hoy, en una sola lectura.
//
// Lo usan la pantalla Hoy y el resumen de las 9:00: los dos tienen que decir
// lo mismo. Si el WhatsApp dice "3 incidentes" y la pantalla muestra 2, el que
// los compara deja de creerle a los dos.
//
// El orden es el de PLAN.md: arriba solo los incidentes (nivel 5), después las
// decisiones por plata, después lo que se hizo y espera el dato, y abajo la
// cobertura (qué estamos viendo y qué no).

import type { Db } from "@paperclipai/db";
import { activityLog, clients, waBotConfig } from "@paperclipai/db";
import { desc, eq } from "drizzle-orm";
import { saludFuentes, type EstadoFuente, type Fuente } from "../ingest/salud.js";
import { listarDecisiones, type DecisionConCliente } from "./store.js";

export interface CoberturaHoy {
  /** Clientes activos mirados. */
  clientes: number;
  /** Por fuente, cuántos clientes en cada estado. */
  porFuente: Record<Fuente, Record<EstadoFuente, number>>;
}

export interface Hoy {
  generado: string;
  /** Última corrida del motor (ISO). null = todavía no corrió nunca. */
  ultimaCorrida: string | null;
  /** El WhatsApp del sistema: si está caído, no sale ningún aviso. */
  whatsapp: "conectado" | "conectando" | "desconectado" | "sin_dato";
  incidentes: DecisionConCliente[];
  decisiones: DecisionConCliente[];
  /** Ejecutadas, esperando que el próximo dato las confirme. */
  esperando: DecisionConCliente[];
  /** Clientes sin cuenta de Meta: van en la franja de cobertura, no en la lista. */
  sinMeta: DecisionConCliente[];
  /**
   * Plata parada por día: cuentas frenadas y caídas de gasto sin explicar.
   * Son por cliente y no se pisan, así que se pueden sumar. null = no hay
   * ninguna medida (no es cero: puede ser que el motor no haya corrido).
   */
  plataParada: number | null;
  /** Clientes que suman esa plata (los mismos que se sumaron, no otros). */
  clientesParados: number;
  cobertura: CoberturaHoy | null;
}

/** Tipos cuya plata es "parada" (se puede sumar sin contar dos veces al mismo cliente). */
const TIPOS_PLATA_PARADA = new Set(["saldo:frenada", "pauta:gasto_caido"]);

export const esIncidente = (d: Pick<DecisionConCliente, "porque">) => d.porque?.nivel === 5;

/** Separa lo vivo en las cuatro franjas de Hoy. Pura. */
export function armarFranjas(vivas: DecisionConCliente[]) {
  const incidentes: DecisionConCliente[] = [];
  const decisiones: DecisionConCliente[] = [];
  const esperando: DecisionConCliente[] = [];
  const sinMeta: DecisionConCliente[] = [];
  for (const d of vivas) {
    // Un incidente se ve arriba mientras dure, aunque ya se haya hecho algo.
    if (esIncidente(d)) incidentes.push(d);
    else if (d.estado === "ejecutada") esperando.push(d);
    else if (d.tipo === "cobertura:sin_meta") sinMeta.push(d);
    else decisiones.push(d);
  }
  // Lo ejecutado también suma: "Avisarle al cliente" no destraba la cuenta. La
  // plata sigue parada hasta que el próximo dato confirme que volvió a gastar,
  // y si no sumara, el número grande diría "sin dato" mientras el incidente de
  // abajo dice $30.000.
  const conPlata = vivas.filter((d) => TIPOS_PLATA_PARADA.has(d.tipo) && d.arsPorDia != null);
  const plataParada = conPlata.length ? conPlata.reduce((s, d) => s + (d.arsPorDia ?? 0), 0) : null;
  const clientesParados = new Set(conPlata.map((d) => d.clientId)).size;
  return { incidentes, decisiones, esperando, sinMeta, plataParada, clientesParados };
}

/** Cuenta clientes por fuente y estado. Pura. */
export function contarCobertura(salud: Array<{ clientId: string; fuente: Fuente; estado: EstadoFuente }>): CoberturaHoy {
  const vacio = (): Record<EstadoFuente, number> => ({ ok: 0, sin_entrega: 0, atrasada: 0, fallando: 0, sin_conexion: 0 });
  const porFuente: Record<Fuente, Record<EstadoFuente, number>> = { meta_ads: vacio(), google_ads: vacio(), organico: vacio() };
  for (const s of salud) porFuente[s.fuente][s.estado] += 1;
  return { clientes: new Set(salud.map((s) => s.clientId)).size, porFuente };
}

const ESTADO_WA: Record<string, Hoy["whatsapp"]> = { connected: "conectado", connecting: "conectando", disconnected: "desconectado" };

export async function datosDeHoy(db: Db): Promise<Hoy> {
  const vivas = await listarDecisiones(db);
  const franjas = armarFranjas(vivas);

  const [corrida] = await db
    .select({ at: activityLog.createdAt })
    .from(activityLog)
    .where(eq(activityLog.action, "decisiones.motor_corrido"))
    .orderBy(desc(activityLog.createdAt))
    .limit(1);

  const [wa] = await db.select({ status: waBotConfig.status }).from(waBotConfig).orderBy(desc(waBotConfig.updatedAt)).limit(1).catch(() => []);

  let cobertura: CoberturaHoy | null = null;
  try {
    const activos = new Set((await db.select({ id: clients.id }).from(clients).where(eq(clients.status, "active"))).map((c) => c.id));
    cobertura = contarCobertura((await saludFuentes(db)).filter((s) => activos.has(s.clientId)));
  } catch (e) {
    // Sin cobertura no se inventa una: la franja dice "sin dato".
    console.warn("[hoy] sin salud de fuentes:", e instanceof Error ? e.message : e);
  }

  return {
    generado: new Date().toISOString(),
    ultimaCorrida: corrida?.at ? new Date(corrida.at).toISOString() : null,
    whatsapp: wa?.status ? ESTADO_WA[wa.status] ?? "sin_dato" : "sin_dato",
    ...franjas,
    cobertura,
  };
}
