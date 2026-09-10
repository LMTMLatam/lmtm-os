// LMTM-OS: cuánto cuesta NO hacer cada cosa que está esperando.
//
// El problema que resuelve: al 10/9/26 había 565 issues abiertos, 218 esperando
// a una persona con 29 días de promedio, y CERO en progreso. No es que el
// equipo trabaje poco — es que recibe 218 pedidos sin ninguna señal de cuál
// cuesta plata hoy y cuál puede esperar tres meses. Una cuenta de pauta frenada
// (plata del cliente que no se está gastando, medible en $/día) terminaba en la
// misma pila que una consulta de contenido de julio.
//
// El costo se calcula SOLO con lo que ya está en la DB — nada de llamar a Meta
// ni a Make — porque esto ordena una lista que se abre a cada rato y no puede
// depender de que una API de terceros conteste.
//
// La señal es la caída de gasto: un cliente que venía gastando $30.000 por día
// y hace una semana gasta $0 tiene $30.000 diarios parados. Es exactamente la
// firma de Distrillantas (14 días) y MA PROPIEDADES (frenada el 5/9).

import type { Db } from "@paperclipai/db";
import { adsInsights } from "@paperclipai/db";
import { sql } from "drizzle-orm";

/** Ventana sana contra la que se compara. 30 días aguanta un mes con feriados
 *  sin que un fin de semana flojo parezca una cuenta frenada. */
export const DIAS_REFERENCIA = 30;
/** Ventana "ahora". Corta: una cuenta frenada se nota en días, no en semanas. */
export const DIAS_RECIENTES = 4;
/** Por debajo de esto no se reporta. Sin piso, el redondeo de cuentas dormidas
 *  genera costos de $12/día que ensucian el orden. */
export const PISO_ARS_POR_DIA = 500;

export interface CostoCliente {
  clientId: string;
  /** ARS por día que el cliente NO está gastando y antes sí. */
  arsPorDia: number;
  gastoDiarioPrevio: number;
  gastoDiarioActual: number;
}

/**
 * La plata parada por día. Pura para poder probarla: la caída entre lo que el
 * cliente gastaba y lo que gasta ahora.
 *
 * Se devuelve 0 cuando gasta igual o más — no hay costo de demora — y cuando el
 * previo es cero, porque un cliente que nunca gastó no tiene nada parado.
 */
export function plataParada(gastoDiarioPrevio: number, gastoDiarioActual: number): number {
  if (gastoDiarioPrevio <= 0) return 0;
  const caida = gastoDiarioPrevio - gastoDiarioActual;
  return caida < PISO_ARS_POR_DIA ? 0 : Math.round(caida);
}

/** Costo por cliente, en una sola consulta. */
export async function costoPorCliente(db: Db): Promise<Map<string, CostoCliente>> {
  const filas = await db
    .select({
      clientId: adsInsights.clientId,
      previo: sql<string>`coalesce(sum(${adsInsights.spend}) filter (
        where ${adsInsights.date} > (current_date - ${sql.raw(String(DIAS_REFERENCIA))}::int)
          and ${adsInsights.date} <= (current_date - ${sql.raw(String(DIAS_RECIENTES))}::int)
      ), 0)`,
      actual: sql<string>`coalesce(sum(${adsInsights.spend}) filter (
        where ${adsInsights.date} > (current_date - ${sql.raw(String(DIAS_RECIENTES))}::int)
      ), 0)`,
    })
    .from(adsInsights)
    .where(sql`${adsInsights.date} > (current_date - ${sql.raw(String(DIAS_REFERENCIA))}::int)`)
    .groupBy(adsInsights.clientId);

  const out = new Map<string, CostoCliente>();
  for (const f of filas) {
    if (!f.clientId) continue;
    const diarioPrevio = Number(f.previo) / (DIAS_REFERENCIA - DIAS_RECIENTES);
    const diarioActual = Number(f.actual) / DIAS_RECIENTES;
    const arsPorDia = plataParada(diarioPrevio, diarioActual);
    if (arsPorDia <= 0) continue;
    out.set(f.clientId, {
      clientId: f.clientId,
      arsPorDia,
      gastoDiarioPrevio: Math.round(diarioPrevio),
      gastoDiarioActual: Math.round(diarioActual),
    });
  }
  return out;
}

/**
 * Ordena lo que espera: primero lo que cuesta plata por día, y a igual costo lo
 * más viejo. Sin el costo, lo urgente queda sepultado entre lo viejo; sin la
 * antigüedad, lo que no se puede tasar no sale nunca de la cola.
 */
export function ordenarPorCosto<T extends { clientId?: string | null; diasParado?: number }>(
  filas: T[],
  costos: Map<string, CostoCliente>,
): Array<T & { arsPorDia: number }> {
  return filas
    .map((f) => ({ ...f, arsPorDia: (f.clientId && costos.get(f.clientId)?.arsPorDia) || 0 }))
    .sort((a, b) => (b.arsPorDia - a.arsPorDia) || ((b.diasParado ?? 0) - (a.diasParado ?? 0)));
}
