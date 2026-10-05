// LMTM-OS: las operaciones sobre `decisiones` que hacen las personas y los agentes.
//
// Cada cambio de estado pasa por `ciclo.transicion` (la única definición de qué
// se puede hacer desde dónde) y deja una fila en el registro de actividad, con
// quién y por qué. El UPDATE además exige el estado de partida: si dos
// personas aprietan a la vez, la segunda recibe un 409 en lugar de pisar.

import { createHash } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { clients, decisiones } from "@paperclipai/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logActivity } from "../services/activity-log.js";
import { empresaDelCliente } from "./empresa.js";
import { ordenarPorPlata, transicion, type Evento } from "./ciclo.js";
import { GRACIA_DIAS } from "./reconciliar.js";
import { ejecutarAccion } from "./ejecutar.js";
import { validarSubida } from "./reglas/pauta.js";
import { presupuestoEnBase, ultimoCambioPresupuesto } from "./motor-datos.js";
import {
  ESTADOS,
  ESTADOS_VIVOS,
  RESPONSABLES,
  type Accion,
  type DecisionFila,
  type EstadoDecision,
  type Porque,
  type Responsable,
  type ResultadoEjecucion,
} from "./tipos.js";

export interface Actor {
  actorType: "user" | "agent" | "system";
  actorId: string;
  agentId: string | null;
  runId: string | null;
}

export class ErrorDecision extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 422, message: string) {
    super(message);
  }
}

export interface DecisionConCliente extends DecisionFila {
  cliente: string;
  clienteSlug: string;
}

export function aFila(r: typeof decisiones.$inferSelect): DecisionFila {
  return {
    ...r,
    porque: r.porque as unknown as Porque,
    accion: r.accion as DecisionFila["accion"],
    arsPorDia: r.arsPorDia == null ? null : Number(r.arsPorDia),
    responsable: r.responsable as Responsable,
    estado: r.estado as EstadoDecision,
  };
}

export async function listarDecisiones(
  db: Db,
  opts: { estados?: EstadoDecision[]; clientId?: string; limite?: number } = {},
): Promise<DecisionConCliente[]> {
  const estados = opts.estados?.length ? opts.estados : [...ESTADOS_VIVOS];
  const filas = await db
    .select({ d: decisiones, cliente: clients.name, clienteSlug: clients.slug })
    .from(decisiones)
    .innerJoin(clients, eq(clients.id, decisiones.clientId))
    .where(and(inArray(decisiones.estado, estados), opts.clientId ? eq(decisiones.clientId, opts.clientId) : undefined))
    .orderBy(sql`${decisiones.arsPorDia} desc nulls last`, decisiones.createdAt)
    .limit(Math.min(Math.max(opts.limite ?? 300, 1), 1000));
  return ordenarPorPlata(filas.map((f) => ({ ...aFila(f.d), cliente: f.cliente.trim(), clienteSlug: f.clienteSlug })));
}

/**
 * ¿Puede este actor tocar las decisiones de este cliente? Devuelve la empresa
 * del cliente para que la ruta aplique `assertCompanyAccess`. Sin empresa
 * comprobable se niega: no ver no es permiso.
 */
export async function empresaParaAcceso(db: Db, clientId: string): Promise<string> {
  const companyId = await empresaDelCliente(db, clientId);
  if (!companyId) throw new ErrorDecision(403, "No se puede comprobar de qué empresa es ese cliente.");
  return companyId;
}

export async function obtenerDecision(db: Db, id: string): Promise<DecisionFila> {
  const [r] = await db.select().from(decisiones).where(eq(decisiones.id, id)).limit(1);
  if (!r) throw new ErrorDecision(404, "No existe esa decisión.");
  return aFila(r);
}

async function registrar(db: Db, d: Pick<DecisionFila, "id" | "clientId">, actor: Actor, action: string, details: Record<string, unknown>) {
  const companyId = await empresaDelCliente(db, d.clientId);
  if (!companyId) return;
  await logActivity(db, {
    companyId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    agentId: actor.agentId,
    runId: actor.runId,
    action,
    entityType: "decision",
    entityId: d.id,
    details,
  });
}

// ── Alta desde un agente ─────────────────────────────────────────────────

export interface EntradaAgente {
  clientId: string;
  tipo: string;
  que: string;
  porque: Porque;
  arsPorDia: number | null;
  responsable: Responsable;
  accion: Accion | null;
  venceEnDias?: number;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Valida lo que manda un agente. Devuelve el motivo del rechazo en castellano,
 * escrito para que el modelo se corrija en un intento (mismo criterio que
 * ads-budget: "pedí 45% y el tope es 30%" arregla; "invalid" hace reintentar
 * igual).
 */
export function validarEntradaAgente(body: unknown): { ok: true; entrada: EntradaAgente } | { ok: false; motivo: string } {
  if (typeof body !== "object" || body === null) return { ok: false, motivo: "El cuerpo tiene que ser un objeto JSON." };
  const b = body as Record<string, unknown>;
  const clientId = texto(b.clientId, 64);
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return { ok: false, motivo: "Falta clientId (uuid del cliente). Una decisión sin cliente no se puede mostrar ni ejecutar." };
  const tipo = texto(b.tipo, 80);
  if (!/^[a-z0-9_]+(:[a-z0-9_]+)*$/.test(tipo)) return { ok: false, motivo: 'tipo tiene que ser algo como "pauta:fatiga" o "contenido:calendario" (minúsculas, guiones bajos, dos puntos).' };
  const que = texto(b.que, 300);
  if (que.length < 10) return { ok: false, motivo: "que tiene que decir qué hacer, en imperativo y con el nombre de lo que se toca (mínimo 10 caracteres)." };

  const p = b.porque as Record<string, unknown> | undefined;
  const resumen = texto(p?.resumen, 600);
  if (!resumen) return { ok: false, motivo: "porque.resumen es obligatorio: sin el por qué, la decisión no se puede defender." };
  const datosIn = Array.isArray(p?.datos) ? (p!.datos as unknown[]) : [];
  if (datosIn.length === 0) return { ok: false, motivo: "porque.datos tiene que traer al menos un número de los que salió la decisión (etiqueta, valor, unidad)." };
  const datos: Porque["datos"] = [];
  for (const x of datosIn.slice(0, 12)) {
    const o = x as Record<string, unknown>;
    const etiqueta = texto(o?.etiqueta, 120);
    if (!etiqueta) return { ok: false, motivo: "Cada dato de porque.datos necesita una etiqueta." };
    const valor = o.valor == null ? null : typeof o.valor === "number" || typeof o.valor === "string" ? o.valor : null;
    const unidad = typeof o.unidad === "string" && ["ars", "ars_dia", "pct", "dias", "veces", "leads", "texto"].includes(o.unidad)
      ? (o.unidad as Porque["datos"][number]["unidad"])
      : undefined;
    datos.push({ etiqueta, valor: typeof valor === "string" ? valor.slice(0, 200) : valor, ...(unidad ? { unidad } : {}) });
  }

  let arsPorDia: number | null = null;
  if (b.arsPorDia != null) {
    const n = Number(b.arsPorDia);
    if (!Number.isFinite(n) || n < 0) return { ok: false, motivo: "arsPorDia tiene que ser un número >= 0, o null si no se puede medir (nunca 0 en lugar de 'no sé')." };
    arsPorDia = Math.round(n);
  }

  const responsable = texto(b.responsable, 20) as Responsable;
  if (!RESPONSABLES.includes(responsable)) return { ok: false, motivo: `responsable tiene que ser uno de: ${RESPONSABLES.join(", ")}.` };

  const accion = validarAccion(b.accion);
  if (accion && "motivo" in accion) return { ok: false, motivo: accion.motivo };

  const vence = b.venceEnDias == null ? 7 : Number(b.venceEnDias);
  if (!Number.isFinite(vence) || vence < 1 || vence > 60) return { ok: false, motivo: "venceEnDias tiene que estar entre 1 y 60." };

  const ventana = p?.ventana as { desde?: unknown; hasta?: unknown } | undefined;
  const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const porque: Porque = {
    resumen,
    datos,
    ...(ymd(ventana?.desde) && ymd(ventana?.hasta) ? { ventana: { desde: ymd(ventana!.desde)!, hasta: ymd(ventana!.hasta)! } } : {}),
  };

  return { ok: true, entrada: { clientId, tipo, que, porque, arsPorDia, responsable, accion: accion ?? null, venceEnDias: Math.round(vence) } };
}

/** null = sin acción (la hace una persona a mano). */
export function validarAccion(v: unknown): Accion | { motivo: string } | null {
  if (v == null) return null;
  if (typeof v !== "object") return { motivo: "accion tiene que ser un objeto o null." };
  const a = v as Record<string, unknown>;
  const id = (x: unknown) => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x);
  const ent = (x: unknown) => x === "campaign" || x === "adset";
  switch (a.tipo) {
    case "presupuesto": {
      const nuevo = Number(a.nuevoDiario);
      if (!ent(a.entityType) || !id(a.entityId) || !(nuevo > 0)) return { motivo: "accion presupuesto necesita entityType (campaign|adset), entityId y nuevoDiario en pesos." };
      const anterior = a.anterior == null ? undefined : Number(a.anterior);
      return { tipo: "presupuesto", entityType: a.entityType as "campaign" | "adset", entityId: a.entityId as string, nuevoDiario: Math.round(nuevo), ...(anterior && anterior > 0 ? { anterior: Math.round(anterior) } : {}), ...(typeof a.nombre === "string" ? { nombre: a.nombre.slice(0, 200) } : {}) };
    }
    case "mover_presupuesto": {
      const d = a.desde as Record<string, unknown> | undefined;
      const h = a.hacia as Record<string, unknown> | undefined;
      const monto = Number(a.monto);
      if (!d || !h || !ent(d.entityType) || !ent(h.entityType) || !id(d.entityId) || !id(h.entityId) || !(monto > 0)) {
        return { motivo: "accion mover_presupuesto necesita desde y hacia ({entityType, entityId}) y monto en pesos." };
      }
      return {
        tipo: "mover_presupuesto",
        desde: { entityType: d.entityType as "campaign" | "adset", entityId: d.entityId as string },
        hacia: { entityType: h.entityType as "campaign" | "adset", entityId: h.entityId as string },
        monto: Math.round(monto),
      };
    }
    case "duplicar":
      if (!id(a.adsetId)) return { motivo: "accion duplicar necesita adsetId." };
      return { tipo: "duplicar", adsetId: a.adsetId as string, ...(typeof a.nombre === "string" ? { nombre: a.nombre.slice(0, 200) } : {}) };
    case "pausar":
      if (!ent(a.entityType) || !id(a.entityId)) return { motivo: "accion pausar necesita entityType (campaign|adset) y entityId." };
      return { tipo: "pausar", entityType: a.entityType as "campaign" | "adset", entityId: a.entityId as string, ...(typeof a.nombre === "string" ? { nombre: a.nombre.slice(0, 200) } : {}) };
    case "tarea": {
      const titulo = texto(a.titulo, 200);
      if (titulo.length < 5) return { motivo: "accion tarea necesita un titulo." };
      return { tipo: "tarea", titulo, ...(typeof a.descripcion === "string" ? { descripcion: a.descripcion.slice(0, 4000) } : {}) };
    }
    default:
      return { motivo: "accion.tipo tiene que ser presupuesto, mover_presupuesto, duplicar, pausar o tarea." };
  }
}

/** La clave de una decisión de agente: mismo agente, cliente, tipo y texto = mismo hecho. */
export function claveDeAgente(agentId: string, e: Pick<EntradaAgente, "clientId" | "tipo" | "que">): string {
  const h = createHash("sha256").update(e.que.toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 16);
  return `agente:${agentId}:${e.clientId}:${e.tipo}:${h}`;
}

/**
 * Alta de una decisión propuesta por un agente. Idempotente: si ya hay una
 * viva con la misma clave, devuelve esa (el agente que reintenta no duplica).
 */
export async function crearDesdeAgente(db: Db, entrada: EntradaAgente, actor: Actor & { companyId: string }): Promise<{ decision: DecisionFila; creada: boolean }> {
  if (!actor.agentId) throw new ErrorDecision(403, "Solo un agente puede proponer decisiones por esta vía.");
  const [cli] = await db.select({ id: clients.id, status: clients.status }).from(clients).where(eq(clients.id, entrada.clientId)).limit(1);
  if (!cli) throw new ErrorDecision(404, "No existe ese cliente.");
  // Aislamiento: un agente no propone sobre clientes de otra empresa. Sin
  // poder saber de qué empresa es el cliente, tampoco.
  const companyId = await empresaDelCliente(db, entrada.clientId);
  if (companyId !== actor.companyId) throw new ErrorDecision(403, "Ese cliente no es de tu empresa (o no se puede comprobar de cuál es).");

  if (entrada.accion?.tipo === "presupuesto") {
    // El "anterior" lo pone la base, no el agente: es contra lo que mide el
    // ritmo de escalar, y un número que el modelo escribió de memoria no sirve.
    const enBase = await presupuestoEnBase(db, entrada.accion.entityType, entrada.accion.entityId);
    if (enBase != null) {
      entrada.accion.anterior = Math.round(enBase);
      const motivo = validarSubida(enBase, entrada.accion.nuevoDiario, await ultimoCambioPresupuesto(db, entrada.accion.entityId));
      if (motivo) throw new ErrorDecision(422, motivo);
    }
  }

  const clave = claveDeAgente(actor.agentId, entrada);
  const [existente] = await db
    .select()
    .from(decisiones)
    .where(and(eq(decisiones.clave, clave), inArray(decisiones.estado, [...ESTADOS_VIVOS])))
    .limit(1);
  if (existente) {
    const viva = aFila(existente);
    // El agente vuelve a proponer algo que ya se ejecutó: es su forma de decir
    // "sigue pasando". Pasado el margen, vuelve a abierta con los números nuevos
    // (lo mismo que hace el motor con sus reglas).
    if (viva.estado === "ejecutada" && viva.ejecutadaAt && Date.now() - viva.ejecutadaAt.getTime() > GRACIA_DIAS.manual * 86_400_000) {
      const [fila] = await db
        .update(decisiones)
        .set({
          estado: "abierta",
          ejecutadaAt: null,
          porque: { ...entrada.porque, nota: "El agente lo volvió a encontrar después de que se marcó hecho." } as unknown as Record<string, unknown>,
          arsPorDia: entrada.arsPorDia == null ? null : String(entrada.arsPorDia),
          updatedAt: new Date(),
        })
        .where(and(eq(decisiones.id, viva.id), eq(decisiones.estado, "ejecutada")))
        .returning();
      if (fila) {
        const reabierta = aFila(fila);
        await registrar(db, reabierta, actor, "decision.reabierta", { que: reabierta.que });
        return { decision: reabierta, creada: false };
      }
    }
    return { decision: viva, creada: false };
  }

  const ahora = new Date();
  const [fila] = await db
    .insert(decisiones)
    .values({
      clientId: entrada.clientId,
      tipo: entrada.tipo,
      que: entrada.que,
      porque: entrada.porque as unknown as Record<string, unknown>,
      arsPorDia: entrada.arsPorDia == null ? null : String(entrada.arsPorDia),
      responsable: entrada.responsable,
      estado: "abierta",
      creadaPor: `agente:${actor.agentId}`,
      accion: entrada.accion as Record<string, unknown> | null,
      venceAt: new Date(ahora.getTime() + (entrada.venceEnDias ?? 7) * 86_400_000),
      clave,
    })
    .onConflictDoNothing()
    .returning();
  if (!fila) {
    // Otra llamada igual ganó la carrera: devolver la que quedó.
    const [otra] = await db.select().from(decisiones).where(and(eq(decisiones.clave, clave), inArray(decisiones.estado, [...ESTADOS_VIVOS]))).limit(1);
    if (otra) return { decision: aFila(otra), creada: false };
    throw new ErrorDecision(409, "No se pudo crear la decisión: probá de nuevo.");
  }
  const d = aFila(fila);
  await registrar(db, d, actor, "decision.propuesta", { tipo: d.tipo, que: d.que, arsPorDia: d.arsPorDia });
  return { decision: d, creada: true };
}

// ── Cambios de estado de una persona ────────────────────────────────────

async function moverEstado(
  db: Db,
  d: DecisionFila,
  evento: Evento,
  extra: Partial<typeof decisiones.$inferInsert>,
): Promise<DecisionFila> {
  const t = transicion(d.estado, evento);
  if (!t.ok) throw new ErrorDecision(evento.tipo === "descartar" && t.motivo.startsWith("Para descartar") ? 422 : 409, t.motivo);
  const [fila] = await db
    .update(decisiones)
    .set({ ...extra, estado: t.estado, updatedAt: new Date() })
    // El estado de partida en el WHERE: si otro la movió en el medio, no se pisa.
    .where(and(eq(decisiones.id, d.id), eq(decisiones.estado, d.estado)))
    .returning();
  if (!fila) throw new ErrorDecision(409, "Alguien la movió recién: recargá y mirá en qué quedó.");
  return aFila(fila);
}

export async function aprobar(db: Db, id: string, actor: Actor): Promise<DecisionFila> {
  const d = await obtenerDecision(db, id);
  const nueva = await moverEstado(db, d, { tipo: "aprobar" }, {});
  await registrar(db, nueva, actor, "decision.aprobada", { que: d.que });
  return nueva;
}

export async function descartar(db: Db, id: string, motivo: string, actor: Actor): Promise<DecisionFila> {
  const d = await obtenerDecision(db, id);
  const limpio = (motivo ?? "").trim().slice(0, 1000);
  const nueva = await moverEstado(db, d, { tipo: "descartar", motivo: limpio }, { motivoDescarte: limpio });
  await registrar(db, nueva, actor, "decision.descartada", { que: d.que, motivo: limpio, creadaPor: d.creadaPor });
  return nueva;
}

/** Para lo que se hace a mano: "ya lo hice". Queda ejecutada hasta que el dato lo confirme. */
export async function marcarHecha(db: Db, id: string, actor: Actor, nota?: string): Promise<DecisionFila> {
  const d = await obtenerDecision(db, id);
  const ahora = new Date();
  const nueva = await moverEstado(db, d, { tipo: "ejecutar" }, { ejecutadaAt: ahora });
  await registrar(db, nueva, actor, "decision.marcada_hecha", { que: d.que, ...(nota ? { nota: nota.slice(0, 500) } : {}) });
  return nueva;
}

/**
 * El botón. Con `ensayo` valida todo y no escribe nada (ni en la plataforma ni
 * en el estado de la decisión). Sin ensayo, si la acción sale bien la decisión
 * pasa a ejecutada; si falla, queda donde estaba con el motivo guardado.
 */
export async function ejecutar(
  db: Db,
  id: string,
  actor: Actor,
  opts: { ensayo: boolean },
): Promise<{ decision: DecisionFila; resultado: ResultadoEjecucion }> {
  const d = await obtenerDecision(db, id);
  if (!d.accion) throw new ErrorDecision(422, "Esta decisión no tiene una acción que se pueda ejecutar sola: se hace a mano y se marca como hecha.");
  const t = transicion(d.estado, { tipo: "ejecutar" });
  if (!t.ok) throw new ErrorDecision(409, t.motivo);

  const { resultado: _previo, ...accion } = d.accion;
  if (opts.ensayo) {
    const resultado = await ejecutarAccion(db, { clientId: d.clientId, que: d.que, porque: d.porque, accion: accion as Accion }, opts);
    return { decision: d, resultado };
  }

  // Un doble click no puede mover dos veces el mismo presupuesto. Las guardas
  // de ads-budget lo frenarían por el enfriamiento, pero solo DESPUÉS de que la
  // primera escritura quede registrada: entre medio hay una ventana. El
  // servidor corre en una sola instancia, así que alcanza con un candado acá.
  if (enCurso.has(d.id)) throw new ErrorDecision(409, "Ya se está ejecutando: esperá el resultado.");
  enCurso.add(d.id);
  try {
    return await ejecutarDeVerdad(db, d, accion as Accion, actor);
  } finally {
    enCurso.delete(d.id);
  }
}

const enCurso = new Set<string>();

async function ejecutarDeVerdad(
  db: Db,
  d: DecisionFila,
  accion: Accion,
  actor: Actor,
): Promise<{ decision: DecisionFila; resultado: ResultadoEjecucion }> {
  const resultado = await ejecutarAccion(db, { clientId: d.clientId, que: d.que, porque: d.porque, accion }, { ensayo: false });

  // Desde acá NO se puede tirar un error: la plataforma ya se tocó (o no), y
  // lo que pasó tiene que quedar escrito sí o sí. Si otro movió la decisión en
  // el medio (la aprobó, el motor la venció), el resultado se guarda igual y
  // queda en el registro: si no, el próximo click repetiría la acción.
  const accionConResultado = { ...accion, resultado } as unknown as Record<string, unknown>;
  const ahora = new Date();
  const [movida] = resultado.ok
    ? await db
        .update(decisiones)
        .set({ estado: "ejecutada", ejecutadaAt: new Date(resultado.at), accion: accionConResultado, updatedAt: ahora })
        .where(and(eq(decisiones.id, d.id), inArray(decisiones.estado, ["abierta", "aprobada"])))
        .returning()
    : [];
  let nueva: DecisionFila;
  if (movida) {
    nueva = aFila(movida);
  } else {
    // Falló la acción, o la decisión ya no estaba en un estado ejecutable:
    // no cambia de estado, pero el resultado queda en la fila.
    const [fila] = await db
      .update(decisiones)
      .set({ accion: accionConResultado, updatedAt: ahora })
      .where(eq(decisiones.id, d.id))
      .returning();
    nueva = fila ? aFila(fila) : d;
  }
  const accionLog = resultado.ok ? (movida ? "decision.ejecutada" : "decision.ejecutada_fuera_de_ciclo") : "decision.ejecucion_fallida";
  await registrar(db, nueva, actor, accionLog, { que: d.que, accion: accion.tipo, detalle: resultado.detalle }).catch((e) =>
    console.warn("[decisiones] no se pudo registrar la ejecución:", e instanceof Error ? e.message : e),
  );
  return { decision: nueva, resultado };
}

/** Estados válidos para filtrar desde la ruta. */
export function estadosDeQuery(q: unknown): EstadoDecision[] | undefined {
  if (typeof q !== "string" || !q.trim()) return undefined;
  const pedidos = q.split(",").map((s) => s.trim()).filter((s): s is EstadoDecision => (ESTADOS as readonly string[]).includes(s));
  return pedidos.length ? pedidos : undefined;
}
