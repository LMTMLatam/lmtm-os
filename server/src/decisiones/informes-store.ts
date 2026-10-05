// LMTM-OS: guardar, auditar y publicar los informes semanales.
//
// Lo puro (marcadores, auditor) vive en informe.ts. Acá: de dónde salen los
// números (siempre `metricasCliente()` de la semana), el borrador automático
// de cada lunes y quién puede publicar.

import type { Db } from "@paperclipai/db";
import { clients, decisiones, informesSemanales } from "@paperclipai/db";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { logActivity } from "../services/activity-log.js";
import { metricasCliente } from "../metricas/index.js";
import { empresaDelCliente } from "./empresa.js";
import {
  auditarInforme,
  esSemanaValida,
  numerosDeMetricas,
  semanaAnterior,
  ultimaSemana,
  validarNarrativa,
  type Auditoria,
  type Narrativa,
  type NumerosInforme,
} from "./informe.js";
import { ErrorDecision, type Actor } from "./store.js";

export type EstadoInforme = "borrador" | "observado" | "aprobado" | "publicado";

export interface InformeFila {
  id: string;
  clientId: string;
  semana: string;
  narrativa: Narrativa;
  numeros: NumerosInforme;
  estado: EstadoInforme;
  escritoPor: string;
  auditoria: (Auditoria & { at: string }) | null;
  publicadoAt: Date | null;
  publicadoPor: string | null;
  updatedAt: Date;
}

function aFila(r: typeof informesSemanales.$inferSelect): InformeFila {
  return {
    id: r.id,
    clientId: r.clientId,
    semana: String(r.semana),
    narrativa: r.narrativa as unknown as Narrativa,
    numeros: r.numeros as unknown as NumerosInforme,
    estado: r.estado as EstadoInforme,
    escritoPor: r.escritoPor,
    auditoria: r.auditoria as InformeFila["auditoria"],
    publicadoAt: r.publicadoAt,
    publicadoPor: r.publicadoPor,
    updatedAt: r.updatedAt,
  };
}

const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Los números de una semana y la anterior, de `metricasCliente()`. */
export async function numerosDeSemana(db: Db, clientId: string, desde: string): Promise<NumerosInforme> {
  const semana = { desde, hasta: sumarDias(desde, 6) };
  const ant = semanaAnterior(semana);
  const [m, a] = await Promise.all([metricasCliente(db, clientId, semana), metricasCliente(db, clientId, ant)]);
  return numerosDeMetricas(semana, m, a);
}

/** Los demás clientes activos: sus nombres no pueden aparecer en este informe. */
export async function otrosClientes(db: Db, clientId: string): Promise<string[]> {
  const filas = await db.select({ name: clients.name }).from(clients).where(and(eq(clients.status, "active"), ne(clients.id, clientId)));
  return filas.map((f) => f.name);
}

async function registrar(db: Db, i: { id: string; clientId: string }, actor: Actor, action: string, details: Record<string, unknown>) {
  const companyId = await empresaDelCliente(db, i.clientId);
  if (!companyId) return;
  await logActivity(db, {
    companyId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    agentId: actor.agentId,
    runId: actor.runId,
    action,
    entityType: "informe",
    entityId: i.id,
    details,
  });
}

// ── Escribir ─────────────────────────────────────────────────────────────

/**
 * Guarda (o reemplaza) el informe de una semana y lo audita en el acto. La
 * respuesta trae las fallas para que el agente lo corrija en un intento. Un
 * informe publicado no se pisa: lo está leyendo el cliente.
 */
export async function guardarInforme(
  db: Db,
  entrada: { clientId: string; semana?: string; narrativa: unknown },
  escritoPor: string,
  actor: Actor,
  ahora = new Date(),
): Promise<{ informe: InformeFila; creado: boolean }> {
  const v = validarNarrativa(entrada.narrativa);
  if (!v.ok) throw new ErrorDecision(422, v.motivo);
  const semana = entrada.semana ?? ultimaSemana(ahora).desde;
  if (!esSemanaValida(semana, ahora)) {
    throw new ErrorDecision(422, `La semana va por su lunes (YYYY-MM-DD) y tiene que haber terminado. La última completa empieza el ${ultimaSemana(ahora).desde}.`);
  }

  const [previo] = await db
    .select()
    .from(informesSemanales)
    .where(and(eq(informesSemanales.clientId, entrada.clientId), eq(informesSemanales.semana, semana)))
    .limit(1);
  if (previo?.estado === "publicado") {
    throw new ErrorDecision(409, "Ese informe ya está publicado y lo puede estar leyendo el cliente. Para corregirlo, una persona lo tiene que retirar primero.");
  }

  const numeros = await numerosDeSemana(db, entrada.clientId, semana);
  if (numeros.inversion == null) {
    throw new ErrorDecision(422, "Ese cliente no tiene pauta conectada: no hay números de la semana para el informe.");
  }
  const auditoria = { ...auditarInforme(v.narrativa, numeros, await otrosClientes(db, entrada.clientId)), at: ahora.toISOString() };
  const valores = {
    narrativa: v.narrativa as unknown as Record<string, unknown>,
    numeros: numeros as unknown as Record<string, unknown>,
    estado: auditoria.ok ? "aprobado" : "observado",
    escritoPor,
    auditoria: auditoria as unknown as Record<string, unknown>,
    updatedAt: ahora,
  };

  const [fila] = previo
    ? await db.update(informesSemanales).set(valores).where(eq(informesSemanales.id, previo.id)).returning()
    : await db.insert(informesSemanales).values({ clientId: entrada.clientId, semana, ...valores }).returning();
  await registrar(db, fila, actor, previo ? "informe.reescrito" : "informe.escrito", { semana, estado: fila.estado, fallas: auditoria.fallas.length });
  return { informe: aFila(fila), creado: !previo };
}

// ── Borrador automático ──────────────────────────────────────────────────

/** El verbo en primera persona del plural, para "lo que hicimos". */
const PASADO: Record<string, string> = {
  Subir: "Subimos",
  Bajar: "Bajamos",
  Mover: "Movimos",
  Cambiar: "Cambiamos",
  Reemplazar: "Reemplazamos",
  Renovar: "Renovamos",
  Pausar: "Pausamos",
  Duplicar: "Duplicamos",
  Preparar: "Preparamos",
  Reconectar: "Reconectamos",
  Conectar: "Conectamos",
  Revisar: "Revisamos",
  Averiguar: "Averiguamos",
  Probar: "Probamos",
};

/**
 * La parte de una decisión que se le puede decir al cliente: lo que va antes
 * de los dos puntos ("Cambiar el concepto del conjunto «X»"). Lo de después
 * trae números escritos por la regla, que no pasan por los marcadores: si
 * quedara alguno, la frase no va.
 */
export function fraseParaCliente(que: string): string | null {
  const antes = que.split(":")[0].trim();
  const sinNombres = antes.replace(/«[^»]*»/g, "");
  if (!antes || /\d/.test(sinNombres)) return null;
  return antes;
}

export function enPasado(frase: string): string | null {
  const [verbo, ...resto] = frase.split(" ");
  const p = PASADO[verbo];
  return p && resto.length ? `${p} ${resto.join(" ")}` : null;
}

/**
 * El informe que se puede escribir sin un modelo: números de `metricas`, lo
 * hecho (decisiones ejecutadas esa semana), lo que sigue (las abiertas que más
 * pesan) y lo que necesitamos del cliente. Pasa por el mismo auditor que lo
 * que escribe un agente; el estratega lo reemplaza con el suyo.
 */
export function armarBorrador(
  n: NumerosInforme,
  d: { hechas: string[]; abiertasEquipo: string[]; abiertasCliente: string[] },
): Narrativa {
  let resumen: string;
  if (n.leads === 0 || n.cpl == null) {
    resumen = "Del {desde} al {hasta} invertimos {inversion} y no llegaron consultas.";
    if (n.objetivo != null) resumen += " El objetivo es que cada una cueste {objetivo} o menos.";
  } else {
    resumen = "Del {desde} al {hasta} invertimos {inversion} y llegaron {leads} consultas: cada una costó {cpl}";
    resumen += n.objetivo == null ? "." : n.cpl <= n.objetivo ? ", debajo del objetivo de {objetivo}." : ", arriba del objetivo de {objetivo}.";
    if (n.anterior.cpl != null && n.anterior.cpl > 0) resumen += " Es {variacionCpl} la semana anterior.";
    if (n.leadsDudosos) resumen += " El total incluye conversiones de Google que en esta cuenta no son confiables.";
  }
  if (n.objetivo == null && n.cpl != null) resumen += " Todavía no hay un objetivo de costo por consulta acordado.";

  const unicas = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))];
  const hicimos = unicas(d.hechas.map((q) => {
    const f = fraseParaCliente(q);
    return f ? enPasado(f) : null;
  })).slice(0, 4);
  const proximos = unicas(d.abiertasEquipo.map(fraseParaCliente)).slice(0, 3);
  const pedidos = unicas(d.abiertasCliente.map(fraseParaCliente)).slice(0, 3);
  return {
    resumen,
    hicimos,
    aprendimos: [],
    proximos: proximos.length ? proximos : ["Seguir el costo por consulta contra el objetivo y avisarte si se mueve."],
    pedidos,
  };
}

/** Las decisiones del cliente que cuentan para el borrador de una semana. */
async function decisionesDeSemana(db: Db, clientId: string, semana: { desde: string; hasta: string }) {
  const desde = new Date(`${semana.desde}T03:00:00Z`); // 0:00 de Buenos Aires
  const hasta = new Date(`${sumarDias(semana.hasta, 1)}T03:00:00Z`);
  const hechas = await db
    .select({ que: decisiones.que })
    .from(decisiones)
    .where(and(
      eq(decisiones.clientId, clientId),
      inArray(decisiones.estado, ["ejecutada", "verificada"]),
      gte(decisiones.ejecutadaAt, desde),
      lt(decisiones.ejecutadaAt, hasta),
      sql`${decisiones.creadaPor} like 'regla:%'`,
      sql`(${decisiones.tipo} like 'pauta:%' or ${decisiones.tipo} like 'saldo:%')`,
    ));
  // Abiertas de las reglas: lo que escribe un agente no va solo al cliente.
  const abiertas = await db
    .select({ que: decisiones.que, responsable: decisiones.responsable })
    .from(decisiones)
    .where(and(
      eq(decisiones.clientId, clientId),
      inArray(decisiones.estado, ["abierta", "aprobada"]),
      sql`${decisiones.creadaPor} like 'regla:%'`,
      sql`(${decisiones.tipo} like 'pauta:%' or ${decisiones.tipo} like 'saldo:%')`,
    ))
    .orderBy(sql`${decisiones.arsPorDia} desc nulls last`);
  return {
    hechas: hechas.map((h) => h.que),
    abiertasEquipo: abiertas.filter((a) => a.responsable !== "cliente").map((a) => a.que),
    abiertasCliente: abiertas.filter((a) => a.responsable === "cliente").map((a) => a.que),
  };
}

export async function borradorDe(db: Db, clientId: string, semana: string): Promise<{ narrativa: Narrativa; numeros: NumerosInforme } | null> {
  const numeros = await numerosDeSemana(db, clientId, semana);
  if (numeros.inversion == null) return null;
  return { narrativa: armarBorrador(numeros, await decisionesDeSemana(db, clientId, numeros)), numeros };
}

/**
 * El borrador de la última semana para cada cliente activo con pauta que
 * todavía no tiene informe. Nunca pisa uno existente: lo que escribió el
 * estratega o una persona vale más que el automático.
 */
export async function generarBorradores(db: Db, ahora = new Date()): Promise<{ semana: string; creados: number; yaTenian: number; sinPauta: number }> {
  const semana = ultimaSemana(ahora).desde;
  const activos = await db.select({ id: clients.id }).from(clients).where(eq(clients.status, "active"));
  const existentes = new Set(
    (await db.select({ c: informesSemanales.clientId }).from(informesSemanales).where(eq(informesSemanales.semana, semana))).map((r) => r.c),
  );
  let creados = 0;
  let sinPauta = 0;
  const sistema: Actor = { actorType: "system", actorId: "informes-semanales", agentId: null, runId: null };
  for (const c of activos) {
    if (existentes.has(c.id)) continue;
    try {
      const b = await borradorDe(db, c.id, semana);
      if (!b) {
        sinPauta++;
        continue;
      }
      await guardarInforme(db, { clientId: c.id, semana, narrativa: b.narrativa }, "tablero:automatico", sistema, ahora);
      creados++;
    } catch (e) {
      console.warn(`[informes] no se pudo armar el borrador de ${c.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return { semana, creados, yaTenian: existentes.size, sinPauta };
}

// ── Leer y publicar ──────────────────────────────────────────────────────

export async function listarInformes(db: Db, clientId: string, limite = 8): Promise<InformeFila[]> {
  const filas = await db
    .select()
    .from(informesSemanales)
    .where(eq(informesSemanales.clientId, clientId))
    .orderBy(desc(informesSemanales.semana))
    .limit(limite);
  return filas.map(aFila);
}

export async function obtenerInforme(db: Db, id: string): Promise<InformeFila> {
  const [r] = await db.select().from(informesSemanales).where(eq(informesSemanales.id, id)).limit(1);
  if (!r) throw new ErrorDecision(404, "No existe ese informe.");
  return aFila(r);
}

/** El publicado de una semana, o el último publicado si no se pide semana. */
export async function informePublicado(db: Db, clientId: string, semana?: string): Promise<InformeFila | null> {
  const [r] = await db
    .select()
    .from(informesSemanales)
    .where(and(
      eq(informesSemanales.clientId, clientId),
      eq(informesSemanales.estado, "publicado"),
      semana ? eq(informesSemanales.semana, semana) : undefined,
    ))
    .orderBy(desc(informesSemanales.semana))
    .limit(1);
  return r ? aFila(r) : null;
}

/** Solo lo que pasó el auditor se publica. */
export async function publicarInforme(db: Db, id: string, actor: Actor, ahora = new Date()): Promise<InformeFila> {
  const i = await obtenerInforme(db, id);
  if (i.estado === "publicado") return i;
  if (i.estado !== "aprobado" || !i.auditoria?.ok) {
    throw new ErrorDecision(409, "Solo se publica un informe que pasó el auditor. Corregí lo que marcó y volvé a guardarlo.");
  }
  const [fila] = await db
    .update(informesSemanales)
    .set({ estado: "publicado", publicadoAt: ahora, publicadoPor: actor.actorId, updatedAt: ahora })
    .where(and(eq(informesSemanales.id, id), eq(informesSemanales.estado, "aprobado")))
    .returning();
  if (!fila) throw new ErrorDecision(409, "El informe cambió mientras se publicaba: volvé a cargarlo.");
  await registrar(db, fila, actor, "informe.publicado", { semana: i.semana });
  return aFila(fila);
}

/** Lo saca del link del cliente; queda aprobado para corregirlo y volver a publicar. */
export async function retirarInforme(db: Db, id: string, actor: Actor, ahora = new Date()): Promise<InformeFila> {
  const i = await obtenerInforme(db, id);
  if (i.estado !== "publicado") return i;
  const [fila] = await db
    .update(informesSemanales)
    .set({ estado: "aprobado", publicadoAt: null, publicadoPor: null, updatedAt: ahora })
    .where(eq(informesSemanales.id, id))
    .returning();
  await registrar(db, fila, actor, "informe.retirado", { semana: i.semana });
  return aFila(fila);
}

// ── Programación ─────────────────────────────────────────────────────────

let reloj: ReturnType<typeof setInterval> | null = null;

/**
 * Los lunes, después del resumen de las 9:00, arma los borradores de la semana
 * que terminó. Idempotente (no pisa nada), así que correrlo de más no hace
 * daño. `LMTM_INFORMES_SEMANALES=off` lo apaga sin deploy.
 */
export function initInformesSemanales(db: Db): void {
  if (reloj || process.env.LMTM_INFORMES_SEMANALES === "off") return;
  const tick = async () => {
    const ahora = new Date();
    const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
    const dia = partes.find((p) => p.type === "weekday")?.value;
    const hora = Number(partes.find((p) => p.type === "hour")?.value);
    if (dia !== "Mon" || hora < 10) return;
    const r = await generarBorradores(db, ahora).catch((e) => {
      console.warn("[informes] falló la corrida:", e instanceof Error ? e.message : e);
      return null;
    });
    if (r && r.creados > 0) console.log(`[informes] semana ${r.semana}: ${r.creados} borradores nuevos`);
  };
  setTimeout(() => void tick(), 120_000);
  reloj = setInterval(() => void tick(), 30 * 60_000);
  console.log("[informes] programado (lunes desde las 10:00 de Buenos Aires)");
}
