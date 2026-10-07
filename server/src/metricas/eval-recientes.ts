// El evaluador de propuestas de pauta, con base: arma el contexto del día de
// cada propuesta (objetivo por plataforma, campañas, marca) y la corrige con
// las reglas del playbook (eval-propuestas.ts). Lo usan la consola
// (eval-propuestas-cli.ts) y la pantalla Agentes: el supervisor es código.

import type { Db } from "@paperclipai/db";
import { agents, approvals, clients } from "@paperclipai/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { metricasCliente } from "./index.js";
import { metricasCampanas, type MetricasCampana } from "./campanas.js";
import { evaluarPropuesta, type ContextoEval } from "./eval-propuestas.js";
import { esAccionPauta, TIPO_ACCION_PAUTA } from "../services/ads-propuestas.js";
import { esTerminoDeMarca } from "../services/ads-keywords.js";

export const ventanaEval = (hastaDate: Date) => ({
  desde: new Date(hastaDate.getTime() - 13 * 86_400_000).toISOString().slice(0, 10),
  hasta: hastaDate.toISOString().slice(0, 10),
});

/** Lo que se sabía de un cliente el día anterior a `hastaDate` incluido. */
export async function contextoEval(db: Db, clientId: string, hastaDate: Date): Promise<{ ctx: ContextoEval; campanas: MetricasCampana[] }> {
  const v = ventanaEval(hastaDate);
  const [meta, google, campanas, [cli]] = await Promise.all([
    metricasCliente(db, clientId, { ...v, plataforma: "meta" }),
    metricasCliente(db, clientId, { ...v, plataforma: "google" }),
    metricasCampanas(db, clientId, v),
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1),
  ]);
  const nombre = cli?.name ?? "";
  return {
    ctx: {
      tcpl: { meta: meta.objetivo.tcpl, google: google.objetivo.tcpl },
      esMarca: (n) => /\b(brand|marca)\b/i.test(n) || esTerminoDeMarca(nombre, n),
    },
    campanas: campanas ?? [],
  };
}

export interface PropuestaEvaluada {
  id: string;
  agente: string | null;
  estado: string;
  resumen: string;
  ok: boolean;
  fallas: string[];
  createdAt: string;
}

/** Corrige las propuestas de pauta de los últimos `dias` contra los números del día anterior a cada una. */
export async function evaluarRecientes(db: Db, dias = 14): Promise<PropuestaEvaluada[]> {
  const filas = await db
    .select({ id: approvals.id, status: approvals.status, createdAt: approvals.createdAt, payload: approvals.payload, agente: agents.name })
    .from(approvals)
    .leftJoin(agents, eq(agents.id, approvals.requestedByAgentId))
    .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), gt(approvals.createdAt, sql`now() - make_interval(days => ${dias})`)))
    .orderBy(approvals.createdAt);
  // El contexto se arma una vez por cliente y día: el piloto propone de a decenas.
  const cache = new Map<string, Promise<{ ctx: ContextoEval; campanas: MetricasCampana[] }>>();
  const out: PropuestaEvaluada[] = [];
  for (const p of filas) {
    if (!esAccionPauta(p.payload)) continue;
    const dia = new Date(new Date(p.createdAt).getTime() - 86_400_000);
    const clave = `${p.payload.clientId}|${dia.toISOString().slice(0, 10)}`;
    if (!cache.has(clave)) cache.set(clave, contextoEval(db, p.payload.clientId, dia));
    const { ctx, campanas } = await cache.get(clave)!;
    const v = evaluarPropuesta(p.payload.accion, campanas, ctx);
    out.push({ id: p.id, agente: p.agente, estado: p.status, resumen: p.payload.resumen, ok: v.ok, fallas: v.fallas, createdAt: new Date(p.createdAt).toISOString() });
  }
  return out;
}

/** Puro: por agente, cuántas propuestas y cuántas defendibles. */
export function notaPorAgente(evaluadas: PropuestaEvaluada[]): Array<{ agente: string; propuestas: number; defendibles: number }> {
  const m = new Map<string, { agente: string; propuestas: number; defendibles: number }>();
  for (const e of evaluadas) {
    const k = e.agente ?? "sin agente";
    const x = m.get(k) ?? { agente: k, propuestas: 0, defendibles: 0 };
    x.propuestas += 1;
    if (e.ok) x.defendibles += 1;
    m.set(k, x);
  }
  return [...m.values()];
}
