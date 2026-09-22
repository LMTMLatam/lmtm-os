// LMTM-OS: el informe ejecutivo por cliente — "hacé 1, 2, 3".
//
// POR QUÉ EXISTE, Y POR QUÉ NO ES EL BRIEF QUE YA TENÍAMOS:
//
// `generatePortfolioBrief` (agency-ops.ts) manda un WhatsApp de toda la agencia
// donde las conclusiones las escribe un modelo. Eso sirve para leer de reojo,
// pero no para actuar: nadie puede defender una recomendación que salió de una
// narrativa, y si el modelo se equivoca no hay dónde mirar.
//
// Acá NO hay modelo. Cada acción sale de una medición que ya hacemos y se puede
// rastrear hasta la fila que la produjo:
//
//   cadena-publicacion.ts  → el primer eslabón roto del cliente (y solo el
//                            primero: si no hay destino, que la red esté muda
//                            es consecuencia y mandarlo a revisar Make es
//                            hacerle perder la tarde a alguien)
//   costo-de-no-hacer.ts   → cuánta plata por día está parada
//   balance-monitor.ts     → cuentas frenadas o con el saldo por agotarse
//
// EL ORDEN ES POR PLATA, NO POR ANTIGÜEDAD. Una cuenta frenada que quema
// 40.000/día va antes que una consulta de hace dos meses. Ese criterio ya está
// probado en `costo-de-no-hacer` y acá se reusa entero.
//
// LO QUE NO SE PUDO VERIFICAR SE DICE. Si Make no responde, el informe no dice
// "está todo bien": dice que no se pudo mirar. Un informe que calla lo que no
// vio es exactamente el verde mentiroso que este sistema existe para matar.

import type { Db } from "@paperclipai/db";
import { revisarCadena, type CadenaRota } from "./cadena-publicacion.js";
import { costoPorCliente } from "./costo-de-no-hacer.js";
import { fetchAccountBalances, mereceAvisoDeSaldo, type BalanceInfo } from "./balance-monitor.js";

/** Quién tiene que mover: cambia a dónde va el issue. */
export type Responsable = "equipo" | "cliente" | "sistema";

export interface Accion {
  /** 1, 2, 3… Ya viene ordenado por lo que cuesta no hacerlo. */
  orden: number;
  /** Qué hacer, en imperativo y sin vueltas. */
  que: string;
  /** La medición de la que salió. Sin esto la acción no es defendible. */
  porque: string;
  /** Plata por día en juego. null = no es medible en plata, no es que sea cero. */
  arsPorDia: number | null;
  responsable: Responsable;
}

export interface InformeCliente {
  clientId: string;
  cliente: string;
  acciones: Accion[];
  /** Lo que NO se pudo comprobar. Nunca se omite. */
  sinVerificar: string[];
}

/** Sin acciones y sin puntos ciegos: el cliente está bien y no ocupa lugar. */
const vacio = (i: InformeCliente) => i.acciones.length === 0 && i.sinVerificar.length === 0;

/** El eslabón roto, traducido a una acción con responsable. */
function accionDeCadena(r: CadenaRota): { que: string; responsable: Responsable } {
  switch (r.eslabon) {
    case "sin_destino":
      return { que: `Dar de alta a ${r.cliente} en el datastore de destinos de Make`, responsable: "equipo" };
    case "destino_sin_escenario":
      return { que: `Crear o encender el escenario de Make de ${r.cliente}: la fila del destino está pero no hay quién publique`, responsable: "equipo" };
    case "sin_calendario":
      return { que: `Cargar el calendario del mes en la planilla Cronopost de ${r.cliente}`, responsable: "equipo" };
    case "contenido_incompleto":
      return { que: `Completar copy, pieza y aprobación de los posts ya programados`, responsable: "equipo" };
    case "despachador_mudo":
      return { que: `Revisar el escenario de Make de ${r.cliente}: dejó de despachar`, responsable: "equipo" };
    case "despacho_sin_registro":
      return { que: `Verificar el alta del escenario de ${r.cliente}: nunca despachó`, responsable: "equipo" };
    case "sync_ciego":
      return { que: `Arreglar el sync orgánico de ${r.cliente} (suele ser el token o el permiso de la página)`, responsable: "sistema" };
    case "red_muda":
      return { que: `Revisar por qué Make dice que publicó y en la red no aparece`, responsable: "equipo" };
    default: {
      // Sumar un eslabón sin traducirlo a una acción NO compila. Mismo criterio
      // que ORDEN_AVISO en cadena-publicacion.ts: un eslabón que nadie ubica se
      // cae del informe en silencio, y eso ya pasó una vez con el aviso diario.
      const falta: never = r.eslabon;
      return falta;
    }
  }
}

/**
 * Un informe por cliente, con las acciones ordenadas por lo que cuesta no
 * hacerlas. Solo devuelve clientes que tienen algo que hacer o algo que no se
 * pudo mirar: un informe que lista 59 clientes "al día" no lo lee nadie, y es
 * el modo en que estas listas se mueren (ver el patrón cementerio).
 */
export async function informePorCliente(db: Db): Promise<InformeCliente[]> {
  const porCliente = new Map<string, InformeCliente>();
  const nombrar = (clientId: string, cliente: string): InformeCliente => {
    let i = porCliente.get(clientId);
    if (!i) {
      i = { clientId, cliente, acciones: [], sinVerificar: [] };
      porCliente.set(clientId, i);
    }
    return i;
  };

  // ── 1. La cadena de publicación ───────────────────────────────────────
  const cadena = await revisarCadena(db);
  if (cadena.ciego) {
    // No se pudo leer Make. Eso NO es "está todo bien": es que no vimos.
    for (const i of porCliente.values()) {
      i.sinVerificar.push("No se pudo leer el datastore de Make: no sabemos si la cadena de publicación está sana.");
    }
  }
  for (const r of cadena.rotas) {
    const i = nombrar(r.clientId, r.cliente);
    if (r.eslabon === "sync_ciego") {
      // Un sync parado no es un problema del cliente: es que no lo estamos
      // viendo. Va como punto ciego y además como acción de sistema.
      i.sinVerificar.push(r.detalle);
    }
    const a = accionDeCadena(r);
    i.acciones.push({ orden: 0, que: a.que, porque: r.detalle, arsPorDia: null, responsable: a.responsable });
  }

  // ── 2. La plata parada ────────────────────────────────────────────────
  const costos = await costoPorCliente(db);
  for (const [clientId, c] of costos) {
    const i = porCliente.get(clientId);
    if (!i) continue; // sin problema detectado, la caída de gasto la explica otra cosa
    // No se agrega una acción nueva: se le pone precio a las que ya hay. La
    // plata parada es la CONSECUENCIA del eslabón roto, no un problema aparte.
    for (const acc of i.acciones) if (acc.arsPorDia === null) acc.arsPorDia = c.arsPorDia;
  }

  // ── 3. Saldo ──────────────────────────────────────────────────────────
  let balances: BalanceInfo[] = [];
  try {
    balances = await fetchAccountBalances(db);
  } catch (e) {
    console.warn("[informe] no se pudieron leer los saldos:", e instanceof Error ? e.message : e);
    for (const i of porCliente.values()) i.sinVerificar.push("No se pudieron leer los saldos de las cuentas de pauta.");
  }
  for (const b of balances.filter(mereceAvisoDeSaldo)) {
    if (!b.clientId) continue;
    const i = nombrar(b.clientId, b.clientName);
    const frenada = b.remaining !== null && b.remaining < 1;
    i.acciones.push({
      orden: 0,
      que: frenada
        ? `Recargar el presupuesto de la cuenta de ${b.platform === "google" ? "Google Ads" : "Meta"}: está FRENADA`
        : `Subir el tope de la cuenta de ${b.platform === "google" ? "Google Ads" : "Meta"} antes de que se frene`,
      porque: frenada
        ? `Consumió el tope de ${Math.round(b.spendCap)} ${b.currency}. Las campañas siguen activas pero no se muestran.`
        : `Quedan ${Math.round(b.remaining ?? 0)} ${b.currency} y gasta ${Math.round(b.dailySpend)}/día.`,
      // Una cuenta frenada para de gastar TODO lo que gastaba: ese es su costo diario.
      arsPorDia: frenada ? Math.round(b.dailySpend) : null,
      responsable: "cliente",
    });
    if (!b.gastoConocido) {
      i.sinVerificar.push("No tenemos datos de consumo de esa cuenta: revisar el mapping antes de recargar.");
    }
  }

  // ── Ordenar y numerar ─────────────────────────────────────────────────
  const informes = [...porCliente.values()].filter((i) => !vacio(i));
  for (const i of informes) {
    i.acciones.sort((a, b) => (b.arsPorDia ?? -1) - (a.arsPorDia ?? -1));
    i.acciones.forEach((a, n) => { a.orden = n + 1; });
  }
  // Los clientes también van por plata: primero el que más cuesta.
  const peso = (i: InformeCliente) => Math.max(0, ...i.acciones.map((a) => a.arsPorDia ?? 0));
  informes.sort((a, b) => peso(b) - peso(a));
  return informes;
}

/** El informe de un cliente en texto plano, listo para pegar en un issue. */
export function formatearInforme(i: InformeCliente): string {
  const money = (n: number) => `ARS ${n.toLocaleString("es-AR")}`;
  const lineas = [`*${i.cliente}*`, ""];
  for (const a of i.acciones) {
    lineas.push(`${a.orden}. ${a.que}${a.arsPorDia ? ` — ${money(a.arsPorDia)}/día parados` : ""}`);
    lineas.push(`   ${a.porque}`);
  }
  if (i.sinVerificar.length > 0) {
    lineas.push("", "No se pudo verificar:");
    for (const s of i.sinVerificar) lineas.push(`   • ${s}`);
  }
  return lineas.join("\n");
}
