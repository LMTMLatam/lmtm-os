// LMTM-OS: el motor de decisiones. Corre todas las reglas y deja la tabla al día.
//
// Determinístico a propósito: ninguna decisión sale de un modelo. Cada una se
// puede rastrear hasta la fila o la llamada que la produjo, y si una regla se
// equivoca se arregla la regla, no un prompt.
//
// Corre una vez por día a las 8:30 (antes del resumen de las 9:00) y a mano
// desde `POST /api/decisiones/motor`. Las reglas que llaman a APIs de afuera
// (Make, Meta, Google) son las mismas llamadas que ya hacían los monitores de
// cada módulo una vez por día.

import type { Db } from "@paperclipai/db";
import { activityLog, adsAdsets, adsCampaigns, clients, decisiones } from "@paperclipai/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { saludFuentes } from "../ingest/salud.js";
import { costoPorCliente } from "../services/costo-de-no-hacer.js";
import { filasColaHumana } from "../services/cola-humana.js";
import { logActivity } from "../services/activity-log.js";
import { empresaDelCliente } from "./empresa.js";
import { ESTADOS_VIVOS, type Accion, type DecisionFila, type Propuesta, type ResultadoEjecucion } from "./tipos.js";
import { planificar, verificarEfecto, verificaPorEfecto, type FilaEntidad, type Operacion, type ResultadoConFecha, type Viva } from "./reconciliar.js";
import {
  clientesConPautaCiega,
  propuestaDeCadena,
  propuestasDeCobertura,
  propuestasDeCola,
  propuestasDeCosto,
  propuestasDeSaldo,
} from "./reglas/existentes.js";
import { reglaCalificados, reglaCostoCalificado, reglaEscalar, reglaFrecuencia, reglaSinLeads } from "./reglas/pauta.js";
import { anunciosPorCliente, conjuntosEscalables, fechaLocal, ventanas } from "./motor-datos.js";
import { metricasCliente, type MetricasCliente } from "../metricas/index.js";
import { aFila } from "./store.js";

export interface ResumenMotor {
  inicio: string;
  fin: string;
  reglas: Array<{ regla: string; evaluada: boolean; propuestas: number; nota?: string }>;
  operaciones: Record<Operacion["op"], number>;
  efecto: { verificadas: number; noConfirmadas: number };
}

/** Inicio del día de hoy en Buenos Aires: los datos de pauta llegan hasta acá. */
function inicioDeHoy(ahora: Date): Date {
  // Argentina no tiene horario de verano: UTC-3 fijo.
  return new Date(`${fechaLocal(ahora)}T00:00:00-03:00`);
}

async function correrRegla(
  regla: string,
  datosHasta: Date,
  fn: () => Promise<Propuesta[] | { propuestas: Propuesta[]; evaluada: boolean; nota?: string }>,
): Promise<ResultadoConFecha> {
  try {
    const r = await fn();
    if (Array.isArray(r)) return { regla, evaluada: true, propuestas: r, datosHasta };
    return { regla, datosHasta, ...r };
  } catch (e) {
    const nota = e instanceof Error ? e.message : String(e);
    console.warn(`[decisiones] la regla ${regla} no pudo mirar:`, nota);
    return { regla, evaluada: false, propuestas: [], nota: nota.slice(0, 300), datosHasta };
  }
}

/** Todas las reglas. Cada una aislada: que falle una no apaga a las otras. */
export async function correrReglas(db: Db, ahora = new Date()): Promise<ResultadoConFecha[]> {
  const hoy = inicioDeHoy(ahora);
  const v = ventanas(ahora);

  const activos = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.status, "active"));
  const nombres = new Map(activos.map((c) => [c.id, c.name.trim()]));
  const activosIds = new Set(activos.map((c) => c.id));

  // Lo que comparten varias reglas se lee una vez.
  const salud = await saludFuentes(db).catch((e) => {
    console.warn("[decisiones] sin salud de fuentes:", e instanceof Error ? e.message : e);
    return null;
  });
  const costos = await costoPorCliente(db).catch(() => null);

  const resultados: ResultadoConFecha[] = [];

  resultados.push(await correrRegla("cobertura", ahora, async () => {
    if (!salud) return { propuestas: [], evaluada: false, nota: "No se pudo leer la salud de las fuentes." };
    return propuestasDeCobertura(salud.filter((s) => activosIds.has(s.clientId)));
  }));

  // Saldo primero: las cuentas frenadas explican la plata parada de su cliente.
  const conCuentaFrenada = new Set<string>();
  const saldo = await correrRegla("saldo", ahora, async () => {
    const { fetchAccountBalances, mereceAvisoDeSaldo, motivoFrenada } = await import("../services/balance-monitor.js");
    const balances = await fetchAccountBalances(db);
    const props = propuestasDeSaldo(
      balances.filter((b) => b.clientId && activosIds.has(b.clientId)),
      costos ?? new Map(),
      { motivoFrenada, mereceAvisoDeSaldo },
    );
    for (const p of props) if (p.tipo === "saldo:frenada") conCuentaFrenada.add(p.clientId);
    return props;
  });
  resultados.push(saldo);

  resultados.push(await correrRegla("costo_de_no_hacer", hoy, async () => {
    if (!costos) return { propuestas: [], evaluada: false, nota: "No se pudo calcular la plata parada." };
    // Sin saldos no se sabe qué clientes tienen la cuenta frenada: su plata
    // parada saldría dos veces (acá y en la decisión de saldo que sigue abierta).
    if (!saldo.evaluada) return { propuestas: [], evaluada: false, nota: "Sin saldos no se puede separar una cuenta frenada de una caída sin explicar." };
    // Sin salud de fuentes no se sabe qué pauta estamos viendo mal: sin eso,
    // una caída de gasto puede ser un sync roto, y no se afirma.
    if (!salud) return { propuestas: [], evaluada: false, nota: "Sin salud de fuentes no se puede separar caída real de sync roto." };
    const excluir = new Set([...conCuentaFrenada, ...clientesConPautaCiega(salud)]);
    const soloActivos = new Map([...costos].filter(([id]) => activosIds.has(id)));
    return propuestasDeCosto(soloActivos, nombres, excluir, { desde: v.desde3, hasta: v.hasta });
  }));

  resultados.push(await correrRegla("cola_humana", ahora, async () => {
    const filas = await filasColaHumana(db);
    return propuestasDeCola(filas.filter((f) => f.clientId && activosIds.has(f.clientId)), nombres);
  }));

  resultados.push(await correrRegla("cadena_publicacion", ahora, async () => {
    const { revisarCadena } = await import("../services/cadena-publicacion.js");
    const r = await revisarCadena(db);
    if (r.ciego) return { propuestas: [], evaluada: false, nota: "No se pudo leer Make: no se sabe si la cadena está sana." };
    return r.rotas.map(propuestaDeCadena);
  }));

  // ── Pauta ──────────────────────────────────────────────────────────────
  // Una lectura de metricasCliente() por cliente activo, en la ventana de 14
  // días: de ahí salen el objetivo (con su fuente) y los números de calidad.
  // Si falla para un cliente, ese cliente queda afuera de las reglas de pauta
  // y la regla se marca como no evaluada: no se cierra nada de lo que no se miró.
  const metricas = new Map<string, MetricasCliente>();
  let metricasIncompletas = false;
  for (const c of activos) {
    try {
      metricas.set(c.id, await metricasCliente(db, c.id, { desde: v.desde14, hasta: v.hasta }));
    } catch (e) {
      metricasIncompletas = true;
      console.warn(`[decisiones] sin métricas de ${c.name.trim()}:`, e instanceof Error ? e.message : e);
    }
  }
  const conObjetivo = activos
    .map((c) => ({ c, m: metricas.get(c.id) }))
    .filter(({ m }) => m != null && m.objetivo.tcpl != null && (m.objetivo.tcplFuente === "cliente" || m.objetivo.tcplFuente === "historial"))
    .map(({ c, m }) => ({
      clientId: c.id,
      cliente: c.name.trim(),
      tcpl: m!.objetivo.tcpl,
      tcplFuente: m!.objetivo.tcplFuente as "cliente" | "historial",
      desde: v.desde14,
      hasta: v.hasta,
    }));
  const ids = conObjetivo.map((c) => c.clientId);
  const sinMetricas = { propuestas: [] as Propuesta[], evaluada: false, nota: "No se pudieron leer las métricas de todos los clientes." };

  // Los anuncios se leen para TODOS los activos: la fatiga no depende del
  // objetivo, así que la regla de frecuencia no lo espera.
  let anuncios: Awaited<ReturnType<typeof anunciosPorCliente>> | null = null;
  const anunciosDe = async () => (anuncios ??= await anunciosPorCliente(db, [...activosIds], v));

  resultados.push(await correrRegla("pauta_sin_leads", hoy, async () => {
    if (metricasIncompletas) return sinMetricas;
    const a = await anunciosDe();
    return conObjetivo.map((c) => reglaSinLeads(c, a.get(c.clientId) ?? [])).filter((p): p is Propuesta => p != null);
  }));
  resultados.push(await correrRegla("pauta_frecuencia", hoy, async () => {
    const a = await anunciosDe();
    return activos.flatMap((c) =>
      reglaFrecuencia({ clientId: c.id, cliente: c.name.trim(), tcpl: null, desde: v.desde14, hasta: v.hasta }, a.get(c.id) ?? []),
    );
  }));
  resultados.push(await correrRegla("pauta_escalar", hoy, async () => {
    if (metricasIncompletas) return sinMetricas;
    const conj = await conjuntosEscalables(db, ids, v);
    return conObjetivo.map((c) => reglaEscalar(c, conj.get(c.clientId) ?? [], ahora)).filter((p): p is Propuesta => p != null);
  }));

  // Calidad: necesita calificados del CRM. Hoy metricasCliente() los devuelve
  // en null para todos (el CRM vive en otra base) y estas reglas no afirman
  // nada; el día que lleguen, deciden solas. Sin calificados en NINGÚN cliente
  // la regla se marca como no evaluada, para que se vea en la corrida.
  const conCalificados = conObjetivo.filter((c) => metricas.get(c.clientId)?.leadsCalificados != null);
  resultados.push(await correrRegla("pauta_calificados", hoy, async () => {
    if (conCalificados.length === 0) return { propuestas: [], evaluada: false, nota: "Sin CRM: no hay calificados medidos." };
    return conCalificados
      .map((c) => {
        const m = metricas.get(c.clientId)!;
        return reglaCalificados(c, { gasto14: m.inversion ?? 0, leads14: m.leads ?? 0, calificados14: m.leadsCalificados });
      })
      .filter((p): p is Propuesta => p != null);
  }));
  resultados.push(await correrRegla("pauta_costo_calificado", hoy, async () => {
    if (conCalificados.length === 0) return { propuestas: [], evaluada: false, nota: "Sin CRM: no hay calificados medidos." };
    const out: Propuesta[] = [];
    for (const c of conCalificados) {
      const s1 = await metricasCliente(db, c.clientId, v.semana1);
      const s2 = await metricasCliente(db, c.clientId, v.semana2);
      const semanas =
        s1.leadsCalificados != null && s2.leadsCalificados != null && s1.inversion != null && s2.inversion != null
          ? ([{ gasto: s1.inversion, calificados: s1.leadsCalificados }, { gasto: s2.inversion, calificados: s2.leadsCalificados }] as [
              { gasto: number; calificados: number },
              { gasto: number; calificados: number },
            ])
          : null;
      const p = reglaCostoCalificado(c, semanas);
      if (p) out.push(p);
    }
    return out;
  }));

  return resultados;
}

// ── Lado con base ────────────────────────────────────────────────────────

const DIA = 86_400_000;

/**
 * Los descartes de los últimos 60 días (el plazo más largo de una regla):
 * planificar decide, con el plazo de cada propuesta, si ya se puede reabrir.
 */
async function leerDescartadas(db: Db): Promise<Map<string, Date>> {
  const filas = await db
    .select({ clave: decisiones.clave, at: sql<string>`max(${decisiones.updatedAt})` })
    .from(decisiones)
    .where(and(eq(decisiones.estado, "descartada"), sql`${decisiones.updatedAt} > now() - interval '60 days'`))
    .groupBy(decisiones.clave);
  return new Map(filas.map((d) => [d.clave, new Date(d.at)]));
}

export async function leerVivas(db: Db): Promise<DecisionFila[]> {
  const filas = await db.select().from(decisiones).where(inArray(decisiones.estado, [...ESTADOS_VIVOS]));
  return filas.map(aFila);
}

function valoresDePropuesta(p: Propuesta, ahora: Date) {
  return {
    clientId: p.clientId,
    tipo: p.tipo,
    que: p.que,
    porque: p.porque as unknown as Record<string, unknown>,
    arsPorDia: p.arsPorDia == null ? null : String(Math.round(p.arsPorDia)),
    responsable: p.responsable,
    creadaPor: p.creadaPor,
    venceAt: new Date(ahora.getTime() + p.venceEnDias * DIA),
    updatedAt: ahora,
  };
}

async function aplicar(db: Db, op: Operacion, vivas: Map<string, DecisionFila>, ahora: Date): Promise<void> {
  if (op.op === "insertar") {
    const p = op.propuesta;
    await db
      .insert(decisiones)
      .values({ ...valoresDePropuesta(p, ahora), clave: p.clave, accion: p.accion as Record<string, unknown> | null, estado: "abierta" })
      // Si otra corrida la insertó en el medio, la clave viva ya existe: no es un error.
      .onConflictDoNothing();
    return;
  }
  if (op.op === "actualizar") {
    const actual = vivas.get(op.id);
    const v = valoresDePropuesta(op.propuesta, ahora);
    if (actual?.estado === "aprobada") {
      // Lo que una persona aprobó no cambia solo: se refrescan los números,
      // pero el qué y la acción quedan como se aprobaron. Si el mundo cambió,
      // el ejecutor lo rechaza contra el estado de hoy (ver ejecutar.ts).
      await db
        .update(decisiones)
        .set({ porque: v.porque, arsPorDia: v.arsPorDia, venceAt: v.venceAt, updatedAt: v.updatedAt })
        .where(and(eq(decisiones.id, op.id), eq(decisiones.estado, "aprobada")));
      return;
    }
    // Abierta: todo se refresca. Si hubo un intento fallido, su resultado queda
    // en la acción nueva como historia (el próximo que la abra ve por qué falló).
    const nueva = op.propuesta.accion as Record<string, unknown> | null;
    const accion = nueva && actual?.accion?.resultado ? { ...nueva, resultado: actual.accion.resultado } : nueva;
    await db
      .update(decisiones)
      .set({ ...v, accion })
      .where(and(eq(decisiones.id, op.id), eq(decisiones.estado, "abierta")));
    return;
  }
  if (op.op === "sin_confirmacion") {
    await db
      .update(decisiones)
      .set({ estado: "vencida", updatedAt: ahora })
      .where(and(eq(decisiones.id, op.id), eq(decisiones.estado, "ejecutada")));
    return;
  }
  if (op.op === "verificar") {
    await db
      .update(decisiones)
      .set({ estado: "verificada", verificadaAt: ahora, updatedAt: ahora })
      .where(and(eq(decisiones.id, op.id), eq(decisiones.estado, "ejecutada")));
    return;
  }
  if (op.op === "no_confirmada") {
    const actual = vivas.get(op.id);
    const base = op.propuesta ? valoresDePropuesta(op.propuesta, ahora) : { updatedAt: ahora };
    const porque = (op.propuesta?.porque ?? actual?.porque ?? { resumen: "", datos: [] }) as unknown as Record<string, unknown>;
    await db
      .update(decisiones)
      .set({ ...base, porque: { ...porque, nota: op.nota }, estado: "abierta", ejecutadaAt: null })
      .where(and(eq(decisiones.id, op.id), eq(decisiones.estado, "ejecutada")));
    return;
  }
  // vencer
  await db
    .update(decisiones)
    .set({ estado: "vencida", updatedAt: ahora })
    .where(and(eq(decisiones.id, op.id), inArray(decisiones.estado, ["abierta", "aprobada"])));
}

/**
 * Las acciones sobre la cuenta (presupuesto, pausa, copia) se verifican
 * mirando la cuenta: el sync de la noche trae el estado nuevo y se compara con
 * lo que se ejecutó.
 */
async function verificarAccionesDePlataforma(db: Db, vivas: DecisionFila[], ahora: Date) {
  let verificadas = 0;
  let noConfirmadas = 0;
  const pendientes = vivas.filter((v) => v.estado === "ejecutada" && v.ejecutadaAt && verificaPorEfecto(v.accion));

  const leerEntidad = async (tipo: "campaign" | "adset", id: string): Promise<FilaEntidad | null> => {
    const t = tipo === "campaign" ? adsCampaigns : adsAdsets;
    const [f] = await db
      .select({ syncedAt: t.syncedAt, platform: t.platform, status: t.status, dailyBudget: t.dailyBudget })
      .from(t)
      .where(eq(t.id, id))
      .limit(1);
    return f ? { syncedAt: f.syncedAt, platform: f.platform, status: f.status, dailyBudget: f.dailyBudget == null ? null : Number(f.dailyBudget) } : null;
  };

  for (const v of pendientes) {
    const accion = v.accion!;
    const ejecutadaAt = v.ejecutadaAt!;
    let veredictos: ReturnType<typeof verificarEfecto>[] = [];
    if (accion.tipo === "presupuesto" || accion.tipo === "pausar") {
      veredictos = [verificarEfecto(accion, ejecutadaAt, await leerEntidad(accion.entityType, accion.entityId), ahora)];
    } else if (accion.tipo === "duplicar") {
      const copiaId = String(accion.resultado?.efecto?.copiaId ?? "");
      veredictos = [verificarEfecto(accion, ejecutadaAt, copiaId ? await leerEntidad("adset", copiaId) : null, ahora)];
    } else if (accion.tipo === "mover_presupuesto") {
      // Las dos patas, cada una como un cambio de presupuesto propio.
      const efecto = (accion.resultado?.efecto ?? {}) as { desde?: { nuevo?: number }; hacia?: { nuevo?: number } };
      const patas: Array<[typeof accion.desde, number | undefined]> = [[accion.desde, efecto.desde?.nuevo], [accion.hacia, efecto.hacia?.nuevo]];
      for (const [e, nuevo] of patas) {
        if (nuevo == null) continue;
        const pseudo: Accion = { tipo: "presupuesto", entityType: e.entityType, entityId: e.entityId, nuevoDiario: nuevo };
        veredictos.push(verificarEfecto(pseudo, ejecutadaAt, await leerEntidad(e.entityType, e.entityId), ahora));
      }
    }
    if (veredictos.length === 0) continue;
    const malo = veredictos.find((x) => x.veredicto === "no_confirmada");
    if (malo && malo.veredicto === "no_confirmada") {
      await aplicar(db, { op: "no_confirmada", id: v.id, propuesta: null, nota: malo.nota }, new Map([[v.id, v]]), ahora);
      noConfirmadas += 1;
    } else if (veredictos.every((x) => x.veredicto === "verificar")) {
      await aplicar(db, { op: "verificar", id: v.id }, new Map(), ahora);
      verificadas += 1;
    }
  }
  return { verificadas, noConfirmadas };
}

export interface EnsayoMotor {
  reglas: ResumenMotor["reglas"];
  /** Lo que haría la corrida, sin hacerlo. */
  operaciones: Record<Operacion["op"], number>;
  /** Las propuestas de hoy, ordenadas por plata, para mirarlas a ojo. */
  propuestas: Array<Pick<Propuesta, "clientId" | "tipo" | "que" | "arsPorDia" | "responsable"> & { regla: string }>;
}

/**
 * Corre las reglas y planifica, SIN escribir nada. Es lo que se usa para
 * verificar el motor contra producción después de un deploy: muestra qué
 * decisiones abriría, cerraría o verificaría, sin tocar la tabla.
 */
export async function ensayarMotor(db: Db, ahora = new Date()): Promise<EnsayoMotor> {
  const resultados = await correrReglas(db, ahora);
  const vivas = await leerVivas(db);
  const ops = planificar(vivas as Viva[], resultados, ahora, await leerDescartadas(db));
  const operaciones: Record<Operacion["op"], number> = { insertar: 0, actualizar: 0, verificar: 0, no_confirmada: 0, vencer: 0, sin_confirmacion: 0 };
  for (const o of ops) operaciones[o.op] += 1;
  const propuestas = resultados
    .flatMap((r) => r.propuestas.map((p) => ({ regla: r.regla, clientId: p.clientId, tipo: p.tipo, que: p.que, arsPorDia: p.arsPorDia, responsable: p.responsable })))
    .sort((a, b) => (b.arsPorDia ?? -1) - (a.arsPorDia ?? -1));
  return {
    reglas: resultados.map((r) => ({ regla: r.regla, evaluada: r.evaluada, propuestas: r.propuestas.length, ...(r.nota ? { nota: r.nota } : {}) })),
    operaciones,
    propuestas,
  };
}

let corriendo: Promise<ResumenMotor> | null = null;

/** Una corrida completa. Si ya hay una en curso, devuelve esa misma. */
export function correrMotor(db: Db, ahora = new Date()): Promise<ResumenMotor> {
  if (!corriendo) {
    corriendo = correrMotorInterno(db, ahora).finally(() => {
      corriendo = null;
    });
  }
  return corriendo;
}

async function correrMotorInterno(db: Db, ahora: Date): Promise<ResumenMotor> {
  const inicio = new Date();
  const resultados = await correrReglas(db, ahora);
  const vivas = await leerVivas(db);
  const vivasPorId = new Map(vivas.map((v) => [v.id, v]));

  const ops = planificar(vivas as Viva[], resultados, ahora, await leerDescartadas(db));
  const conteo: Record<Operacion["op"], number> = { insertar: 0, actualizar: 0, verificar: 0, no_confirmada: 0, vencer: 0, sin_confirmacion: 0 };
  for (const op of ops) {
    try {
      await aplicar(db, op, vivasPorId, ahora);
      conteo[op.op] += 1;
    } catch (e) {
      console.warn(`[decisiones] no se pudo aplicar ${op.op}:`, e instanceof Error ? e.message : e);
    }
  }

  const efecto = await verificarAccionesDePlataforma(db, await leerVivas(db), ahora).catch((e) => {
    console.warn("[decisiones] verificación por efecto falló:", e instanceof Error ? e.message : e);
    return { verificadas: 0, noConfirmadas: 0 };
  });

  const resumen: ResumenMotor = {
    inicio: inicio.toISOString(),
    fin: new Date().toISOString(),
    reglas: resultados.map((r) => ({ regla: r.regla, evaluada: r.evaluada, propuestas: r.propuestas.length, ...(r.nota ? { nota: r.nota } : {}) })),
    operaciones: conteo,
    efecto,
  };

  // Una entrada por corrida en el registro de actividad: qué cambió y qué
  // reglas no pudieron mirar.
  const [cualquiera] = await db.select({ id: clients.id }).from(clients).limit(1);
  const companyId = cualquiera ? await empresaDelCliente(db, cualquiera.id) : null;
  if (companyId) {
    await logActivity(db, {
      companyId,
      actorType: "system",
      actorId: "motor-decisiones",
      action: "decisiones.motor_corrido",
      entityType: "decisiones",
      entityId: "motor",
      details: resumen as unknown as Record<string, unknown>,
    }).catch((e) => console.warn("[decisiones] no se pudo registrar la corrida:", e instanceof Error ? e.message : e));
  }
  return resumen;
}

// ── Reloj ────────────────────────────────────────────────────────────────

/** Hora local de la corrida diaria: antes del resumen de las 9:00. */
export const HORA_CORRIDA = { hora: 8, minuto: 30 };

/** ¿Toca correr ahora? Una vez por día, a partir de las 8:30 de Buenos Aires. */
export function tocaCorrer(ahora: Date, ultimaCorrida: string | null): boolean {
  const hoy = fechaLocal(ahora);
  if (ultimaCorrida === hoy) return false;
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value);
  return hora > HORA_CORRIDA.hora || (hora === HORA_CORRIDA.hora && minuto >= HORA_CORRIDA.minuto);
}

let reloj: ReturnType<typeof setInterval> | null = null;

/**
 * Programa la corrida diaria. `LMTM_MOTOR_DECISIONES=off` la apaga sin deploy.
 *
 * La última corrida se lee del registro de actividad y no de una variable en
 * memoria: un deploy a las 10:00 no tiene que volver a correr lo que ya corrió
 * a las 8:30. (No sirve mirar la decisión más nueva: una aprobación hecha a
 * las 8:10 la tocaría y el motor creería que ya corrió.)
 */
export function initMotorDecisiones(db: Db): void {
  if (reloj || process.env.LMTM_MOTOR_DECISIONES === "off") return;
  let ultima: string | null = null;
  const tick = async () => {
    const ahora = new Date();
    if (ultima == null) {
      const [r] = await db
        .select({ ultima: sql<string | null>`max(${activityLog.createdAt})` })
        .from(activityLog)
        .where(eq(activityLog.action, "decisiones.motor_corrido"))
        .catch(() => [{ ultima: null }]);
      ultima = r?.ultima ? fechaLocal(new Date(r.ultima)) : "";
    }
    if (!tocaCorrer(ahora, ultima || null)) return;
    ultima = fechaLocal(ahora);
    const res = await correrMotor(db, ahora).catch((e) => {
      console.warn("[decisiones] la corrida falló:", e instanceof Error ? e.message : e);
      return null;
    });
    if (res) console.log(`[decisiones] corrida: ${JSON.stringify(res.operaciones)}`);
  };
  reloj = setInterval(() => void tick(), 10 * 60_000);
  setTimeout(() => void tick(), 2 * 60_000);
  console.log("[decisiones] motor programado (8:30 de Buenos Aires)");
}

export type { ResultadoEjecucion };
