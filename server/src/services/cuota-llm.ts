// LMTM-OS: cuota del proveedor de los agentes (22/10).
//
// EL PROBLEMA
// Los agentes corren el CLI de Claude contra el plan de MiniMax (Token Plan), que
// tiene una cuota semanal (domingo 21:00 a domingo 21:00, hora argentina) y otra
// de 5 horas. La semana del 18/10 se gastó entera en un día y medio. Desde el
// 20/10 MiniMax contestó 429 "Token Plan usage limit reached (2056)", y el
// adaptador lo trataba como un error pasajero: cuatro reintentos por corrida
// (2 min, 10, 30, 2 h) y, al terminar, el lazo de recuperación volvía a despertar
// la tarea. Unas 230 tareas giraban así: 916 corridas fallidas en un día.
//
// CÓMO QUEDA
// 1. Corte: una corrida con cuota agotada (`claude_quota_exhausted`) corta todo
//    lo que usa ese proveedor. No se despiertan agentes ni se promueven
//    reintentos hasta el reset (MiniMax lo informa) o, si no se sabe, hasta el
//    próximo sondeo (1 h). El equipo se entera una vez por día, en el resumen.
// 2. Ritmo: con la cuota de MiniMax a la vista, lo automático solo arranca si lo
//    gastado de la semana no adelanta a lo transcurrido (+10 %). Así una pila de
//    tareas no se come la semana en dos días.
// 3. Tope diario: si no se puede leer la cuota, las corridas automáticas tienen
//    un tope por día (LMTM_CORRIDAS_LLM_POR_DIA, 80; un día normal son 20 a 45).
// 4. Tope por hora (26/10): como mucho LMTM_CORRIDAS_LLM_POR_HORA (4) arranques
//    automáticos por proveedor, para que una pila de tareas no salga junta.
// Lo que pide una persona a mano pasa el ritmo y los topes, pero no el corte.
//
// La cuota se lee de /v1/api/openplatform/coding_plan/remains con la misma clave
// del plan. Es lo que usa la consola de MiniMax; no está documentado, así que si
// deja de contestar se cae al tope diario y no se corta nada por error.

import type { Db } from "@paperclipai/db";
import { sql } from "drizzle-orm";

export const SONDEO_MS = 60 * 60_000;
/** Cuánto puede adelantarse lo gastado a lo transcurrido de la semana. */
export const MARGEN_RITMO = 0.1;

const pausas = new Map<string, number>();

/** A qué proveedor le pega un agente de Claude: su ANTHROPIC_BASE_URL. Pura. */
export function proveedorDe(adapterConfig: unknown): string {
  const env = (adapterConfig as { env?: Record<string, unknown> } | null | undefined)?.env ?? {};
  const url = typeof env.ANTHROPIC_BASE_URL === "string" && env.ANTHROPIC_BASE_URL.trim() ? env.ANTHROPIC_BASE_URL.trim() : "anthropic";
  return url.replace(/\/+$/, "");
}

function claveDe(adapterConfig: unknown): string | null {
  const env = (adapterConfig as { env?: Record<string, unknown> } | null | undefined)?.env ?? {};
  const k = env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_AUTH_TOKEN;
  return typeof k === "string" && k.trim() ? k.trim() : null;
}

/** Corta el proveedor hasta `hasta` (si es futuro) o hasta el próximo sondeo. */
export function pausarPorCuota(proveedor: string, hasta?: string | number | null, ahora = Date.now()): Date {
  const reset = typeof hasta === "number" ? hasta : hasta ? Date.parse(hasta) : Number.NaN;
  const fin = Number.isFinite(reset) && reset > ahora ? reset : ahora + SONDEO_MS;
  pausas.set(proveedor, fin);
  return new Date(fin);
}

/** Hasta cuándo está cortado el proveedor, o null si se puede usar. */
export function cuotaPausadaHasta(proveedor: string, ahora = Date.now()): Date | null {
  const h = pausas.get(proveedor);
  return h != null && h > ahora ? new Date(h) : null;
}

/** Para las pruebas. */
export function olvidarPausas(): void {
  pausas.clear();
  estados.clear();
}

// ── la cuota de MiniMax ──────────────────────────────────────────────────────

export interface EstadoCuota {
  semana: { inicio: number; fin: number; restante: number };
  ventana: { fin: number; restante: number };
}

/** Lee la respuesta de /coding_plan/remains (balde "general", el de texto). Pura. */
export function leerEstado(j: unknown): EstadoCuota | null {
  const lista = (j as { model_remains?: Array<Record<string, unknown>> } | null)?.model_remains;
  const g = Array.isArray(lista) ? lista.find((m) => m.model_name === "general") ?? lista[0] : null;
  if (!g) return null;
  const n = (k: string) => (typeof g[k] === "number" ? (g[k] as number) : Number.NaN);
  const e: EstadoCuota = {
    semana: { inicio: n("weekly_start_time"), fin: n("weekly_end_time"), restante: n("current_weekly_remaining_percent") / 100 },
    ventana: { fin: n("end_time"), restante: n("current_interval_remaining_percent") / 100 },
  };
  return [e.semana.inicio, e.semana.fin, e.semana.restante, e.ventana.fin, e.ventana.restante].every(Number.isFinite) ? e : null;
}

const estados = new Map<string, { at: number; e: EstadoCuota | null }>();

/** Cuota del plan de MiniMax (5 min de caché). null si no es MiniMax o no contesta. */
export async function estadoCuota(adapterConfig: unknown, fresco = false, ahora = Date.now()): Promise<EstadoCuota | null> {
  const proveedor = proveedorDe(adapterConfig);
  const clave = claveDe(adapterConfig);
  if (!/minimax\.io/.test(proveedor) || !clave) return null;
  const c = estados.get(clave);
  if (c && !fresco && ahora - c.at < 5 * 60_000) return c.e;
  let e: EstadoCuota | null = null;
  try {
    const r = await fetch("https://api.minimax.io/v1/api/openplatform/coding_plan/remains", {
      headers: { authorization: `Bearer ${clave}` },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) e = leerEstado(await r.json());
  } catch {
    e = null;
  }
  estados.set(clave, { at: ahora, e });
  return e;
}

/** Hasta cuándo no hay cuota: fin de la semana o de la ventana de 5 h, si alguna está en cero. Pura. */
export function resetDe(e: EstadoCuota | null): number | null {
  if (!e) return null;
  if (e.semana.restante <= 0) return e.semana.fin;
  if (e.ventana.restante <= 0) return e.ventana.fin;
  return null;
}

/** ¿Lo gastado de la semana va adelantado a lo transcurrido? Pura. */
export function vaAdelantado(e: EstadoCuota, ahora = Date.now()): boolean {
  const largo = e.semana.fin - e.semana.inicio;
  if (!(largo > 0)) return false;
  const transcurrido = Math.min(1, Math.max(0, (ahora - e.semana.inicio) / largo));
  return 1 - e.semana.restante > transcurrido + MARGEN_RITMO;
}

// ── tope diario (cuando no se puede leer la cuota) ───────────────────────────

export function topePorDia(): number {
  const n = Number(process.env.LMTM_CORRIDAS_LLM_POR_DIA);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80;
}

let cuenta: { at: number; n: number } | null = null;

/** Corridas de agentes de Claude que arrancaron hoy (hora de Buenos Aires). Un minuto de caché. */
export async function corridasDeHoy(db: Db, ahora = Date.now()): Promise<number> {
  if (cuenta && ahora - cuenta.at < 60_000) return cuenta.n;
  const r = await db.execute(sql`
    select count(*)::int as n
    from heartbeat_runs r join agents a on a.id = r.agent_id
    where a.adapter_type = 'claude_local'
      and r.created_at >= date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'`);
  const filas = (r as { rows?: Array<{ n: number }> }).rows ?? (r as unknown as Array<{ n: number }>);
  cuenta = { at: ahora, n: Number(filas[0]?.n ?? 0) };
  return cuenta.n;
}

// ── tope por hora (26/10) ────────────────────────────────────────────────────
// Al terminar un corte, el barrido de tareas pendientes despierta todo lo que
// juntó en el mismo segundo: el 26/10 a las 00:00:11 arrancaron ~40 corridas y
// se comieron la ventana de 5 h en una hora (otra vez a las 05:00). El ritmo
// semanal no lo frena porque a esa hora la semana recién empieza. Se cuenta en
// memoria (no en la base) porque las corridas de una ráfaga todavía no existen
// cuando se decide la siguiente.

export function topePorHora(): number {
  const n = Number(process.env.LMTM_CORRIDAS_LLM_POR_HORA);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}

const HORA = 60 * 60_000;
const arranques = new Map<string, number[]>();

/** Arranques automáticos que se dejaron pasar en la última hora para ese proveedor. */
export function arrancadasUltimaHora(proveedor: string, ahora = Date.now()): number {
  const vivos = (arranques.get(proveedor) ?? []).filter((t) => ahora - t < HORA);
  arranques.set(proveedor, vivos);
  return vivos.length;
}

export function anotarArranque(proveedor: string, ahora = Date.now()): void {
  arranques.set(proveedor, [...(arranques.get(proveedor) ?? []), ahora]);
}

export function olvidarArranques(): void {
  arranques.clear();
}

// ── la decisión ──────────────────────────────────────────────────────────────

export type MotivoCorte = "llm.cuota_agotada" | "llm.tope_hora" | "llm.ritmo_semanal" | "llm.tope_diario";

/** ¿Este despertar se corta? Pura: decide con lo ya medido. */
export function motivoDeCorte(input: {
  pausadaHasta: Date | null;
  fuente: string;
  estado: EstadoCuota | null;
  corridasHoy: number;
  tope: number;
  arrancadasHora?: number;
  topeHora?: number;
  ahora?: number;
}): MotivoCorte | null {
  if (input.pausadaHasta) return "llm.cuota_agotada";
  if (input.fuente === "on_demand") return null;
  if ((input.arrancadasHora ?? 0) >= (input.topeHora ?? Number.POSITIVE_INFINITY)) return "llm.tope_hora";
  if (input.estado) return vaAdelantado(input.estado, input.ahora) ? "llm.ritmo_semanal" : null;
  return input.corridasHoy >= input.tope ? "llm.tope_diario" : null;
}

/** Lo que decide el despertar de un agente de Claude. */
export async function corteParaDespertar(db: Db, adapterConfig: unknown, fuente: string): Promise<MotivoCorte | null> {
  const pausadaHasta = cuotaPausadaHasta(proveedorDe(adapterConfig));
  if (pausadaHasta) return "llm.cuota_agotada";
  if (fuente === "on_demand") return null;
  const estado = await estadoCuota(adapterConfig);
  // La cuota ya en cero (por ejemplo después de un deploy, que borra el corte en memoria).
  const reset = resetDe(estado);
  if (reset) {
    pausarPorCuota(proveedorDe(adapterConfig), reset);
    return "llm.cuota_agotada";
  }
  const proveedor = proveedorDe(adapterConfig);
  const corridasHoy = estado ? 0 : await corridasDeHoy(db);
  const motivo = motivoDeCorte({
    pausadaHasta, fuente, estado, corridasHoy, tope: topePorDia(),
    arrancadasHora: arrancadasUltimaHora(proveedor), topeHora: topePorHora(),
  });
  if (!motivo) anotarArranque(proveedor);
  return motivo;
}

/** Corrida con cuota agotada: corta el proveedor hasta el reset y avisa al equipo. */
export async function registrarCuotaAgotada(db: Db, adapterConfig: unknown, retryNotBefore: string | null): Promise<Date> {
  const proveedor = proveedorDe(adapterConfig);
  const reset = retryNotBefore ?? resetDe(await estadoCuota(adapterConfig, true));
  const hasta = pausarPorCuota(proveedor, reset);
  await avisarCuotaAgotada(db, proveedor, hasta).catch(() => {});
  return hasta;
}

/** Aviso al equipo (resumen de las 9:00; el embudo no repite la misma clave en 24 h). */
export async function avisarCuotaAgotada(db: Db, proveedor: string, hasta: Date): Promise<void> {
  const { avisarAlEquipo } = await import("./wa-embudo.js");
  const hora = hasta.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
  await avisarAlEquipo(db, {
    origen: "agentes",
    nivel: 4,
    clave: `cuota-llm:${proveedor}`,
    texto:
      `*Agentes en pausa: se agotó la cuota del modelo* (${proveedor.replace(/^https?:\/\//, "")}).\n\n` +
      `El proveedor rechaza los pedidos por límite de uso del plan. Los agentes no arrancan corridas nuevas ` +
      `hasta ${hora}. Para seguir antes: ampliar el plan o comprar créditos en la consola del proveedor.`,
  });
}
