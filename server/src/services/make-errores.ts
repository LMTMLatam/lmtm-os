// LMTM-OS: los errores que Make le manda por mail al equipo, leídos de Make.
//
// Pedido de Naza (22/11): «todos los errores que nos llegan por mail de Make, los agentes
// tienen que también verlos y solucionarlos, o detectar si no son un error real». Los agentes
// no leen el correo; pero cada mail de Make sale de algo que la API muestra: una corrida que
// falló, una ejecución incompleta o un escenario que Make apagó. Esto lo junta para TODOS los
// escenarios del equipo (no solo los de publicación) y separa lo que sigue roto de lo que
// mandó un mail y ya anda.

import { fallasVigentes, makeIncompletas, makeListScenarios, makeScenarioLogs, type MakeIncompleta, type MakeLog, type MakeScenario } from "./make.js";

const SEMANA_MS = 7 * 86_400_000;
/** Escenarios cuyos registros se leen por vuelta (Make corta por ritmo de pedidos). */
const TOPE_ESCENARIOS = 90;
const DE_A = 5;

export interface EscenarioConError {
  escenario: string;
  id: number;
  /** falla: la última corrida falló · incompletas: hay ejecuciones sin resolver · apagado: no corre y tiene algo pendiente. */
  tipo: "falla" | "incompletas" | "apagado";
  que: string;
  /** Para abrir el detalle con executions_get-detail. */
  ultimaEjecucion?: string;
  motivos?: Array<{ motivo: string; veces: number; ultima: string }>;
}

export interface ErroresDeMake {
  leidos: number;
  sinLeer: number;
  siguenRotos: EscenarioConError[];
  /** Fallaron en la semana y después corrieron bien: el mail llegó, hoy no hay nada que hacer. */
  yaAndan: Array<{ escenario: string; id: number; fallo: string; corrioBienDespues: string }>;
}

const dia = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Puro. Los motivos de las incompletas sin resolver, agrupados. */
export function agruparMotivos(dlqs: MakeIncompleta[]): Array<{ motivo: string; veces: number; ultima: string }> {
  const por = new Map<string, { veces: number; ultima: string }>();
  for (const d of dlqs) {
    if (d.resolved) continue;
    const motivo = (d.reason ?? "sin motivo informado").replace(/\s+/g, " ").trim().slice(0, 220);
    const a = por.get(motivo);
    if (!a) por.set(motivo, { veces: 1, ultima: d.created });
    else { a.veces += 1; if (d.created > a.ultima) a.ultima = d.created; }
  }
  return [...por].map(([motivo, v]) => ({ motivo, veces: v.veces, ultima: dia(v.ultima) })).sort((a, b) => b.veces - a.veces);
}

/**
 * Puro. Qué pasa con un escenario, con sus registros y sus incompletas ya leídos.
 * Un escenario apagado sin nada pendiente no es un error: hay plantillas y escenarios viejos apagados a propósito.
 */
export function clasificar(
  sc: Pick<MakeScenario, "id" | "name" | "isActive" | "dlqCount"> & { isinvalid?: boolean },
  logs: Pick<MakeLog, "id" | "status" | "timestamp">[],
  dlqs: MakeIncompleta[],
  ahora: number,
): { roto: EscenarioConError | null; yaAnda: ErroresDeMake["yaAndan"][number] | null } {
  const motivos = agruparMotivos(dlqs);
  const pendientes = motivos.reduce((n, m) => n + m.veces, 0);
  if (sc.isActive === false) {
    if (!sc.isinvalid && pendientes === 0) return { roto: null, yaAnda: null };
    return {
      roto: {
        escenario: sc.name, id: sc.id, tipo: "apagado",
        que: `Apagado${sc.isinvalid ? " e inválido (Make no lo deja prender hasta corregirlo)" : ""}${pendientes ? `, con ${pendientes} ejecución(es) incompleta(s)` : ""}. Make apaga solo un escenario cuando falla varias veces seguidas.`,
        ...(motivos.length ? { motivos } : {}),
      },
      yaAnda: null,
    };
  }
  const vigentes = fallasVigentes(logs, ahora);
  if (vigentes.length > 0) {
    const ultima = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    return {
      roto: {
        escenario: sc.name, id: sc.id, tipo: "falla",
        que: `${vigentes.length === 1 ? "Falló la última corrida" : `Fallaron las últimas ${vigentes.length} corridas`} (${dia(vigentes[0]!.timestamp)}) y no hubo una buena después.`,
        ...(ultima ? { ultimaEjecucion: ultima.id } : {}),
        ...(motivos.length ? { motivos } : {}),
      },
      yaAnda: null,
    };
  }
  if (pendientes > 0) {
    return { roto: { escenario: sc.name, id: sc.id, tipo: "incompletas", que: `${pendientes} ejecución(es) incompleta(s) sin resolver; el escenario sigue corriendo.`, motivos }, yaAnda: null };
  }
  const recientes = logs.filter((l) => ahora - new Date(l.timestamp).getTime() <= SEMANA_MS).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const fallo = recientes.find((l) => l.status >= 3);
  if (fallo && recientes[0] && recientes[0].status < 3) {
    return { roto: null, yaAnda: { escenario: sc.name, id: sc.id, fallo: dia(fallo.timestamp), corrioBienDespues: dia(recientes[0].timestamp) } };
  }
  return { roto: null, yaAnda: null };
}

export async function erroresDeMake(ahora = Date.now()): Promise<ErroresDeMake> {
  const escenarios = (await makeListScenarios()) as Array<MakeScenario & { isinvalid?: boolean }>;
  // Primero los que ya se sabe que tienen algo; después los activos.
  const orden = [...escenarios].sort((a, b) => Number(Boolean(b.dlqCount || b.isinvalid)) - Number(Boolean(a.dlqCount || a.isinvalid)) || Number(b.isActive !== false) - Number(a.isActive !== false));
  const aLeer = orden.filter((s) => s.isActive !== false || s.dlqCount || s.isinvalid).slice(0, TOPE_ESCENARIOS);
  const out: ErroresDeMake = { leidos: 0, sinLeer: 0, siguenRotos: [], yaAndan: [] };
  for (let i = 0; i < aLeer.length; i += DE_A) {
    await Promise.all(aLeer.slice(i, i + DE_A).map(async (sc) => {
      try {
        const [logs, dlqs] = await Promise.all([
          sc.isActive === false ? Promise.resolve([] as MakeLog[]) : makeScenarioLogs(sc.id, 15),
          sc.dlqCount ? makeIncompletas(sc.id) : Promise.resolve([] as MakeIncompleta[]),
        ]);
        const r = clasificar(sc, logs, dlqs, ahora);
        out.leidos += 1;
        if (r.roto) out.siguenRotos.push(r.roto);
        if (r.yaAnda) out.yaAndan.push(r.yaAnda);
      } catch {
        out.sinLeer += 1;
      }
    }));
  }
  const peso = { apagado: 0, falla: 1, incompletas: 2 } as const;
  out.siguenRotos.sort((a, b) => peso[a.tipo] - peso[b.tipo] || a.escenario.localeCompare(b.escenario));
  return out;
}
