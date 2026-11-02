// LMTM-OS: que los reels no salgan todos iguales (02/11).
//
// Pedirle variedad al modelo no alcanza: vuelve siempre al mismo arquetipo. Lo que funciona es un
// control que frena ANTES de gastar voces si la pieza repite lo reciente de ESE cliente. Entre
// clientes del mismo rubro solo avisa: el rubro de cada cliente hoy no es del todo confiable.
//
// armar.mjs llama a video_variedad con la ficha de la pieza; video_entregar guarda esa ficha en el
// metadata del entregable, que es de donde sale el historial. No hay tabla nueva.

import type { Db } from "@paperclipai/db";
import { agentDeliverables, clients } from "@paperclipai/db";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { ANGULOS, ANGULOS_ORGANICO } from "./angulos-creativos.js";

/** Los mismos nombres que MOVIMIENTOS en docker/video-skills/lmtm-video/plantilla/motion.mjs (lo controla un test). */
export const MOVIMIENTOS = ["directo", "pulso", "relato", "vitrina", "ficha"];
export const TIPOS_GANCHO = ["hora", "pregunta", "dato", "mito", "confesion", "lista", "contraste", "historia"];
/** El pilar es el ángulo de contenido: el mismo que clasifica los posteos, para poder medirlo contra lo publicado. */
export const PILARES = [...ANGULOS, ...ANGULOS_ORGANICO].map((a) => a.id);

const SIN_REPETIR_MOVIMIENTO = 3;
const SIN_REPETIR_INSERTOS = 6;
const DIAS_RUBRO = 7;

export interface FichaPieza {
  idPieza: string;
  movimiento: string;
  ganchoTipo: string;
  pilar: string;
  insertos: string[];
}
export interface PiezaAnterior extends Partial<FichaPieza> {
  titulo: string;
  cliente?: string | null;
  fecha?: string;
}

const secuencia = (xs: unknown) => (Array.isArray(xs) ? xs.join(" · ") : "");

/** Puro. `propias`: del mismo cliente, de la más nueva a la más vieja. `delRubro`: de otros clientes del rubro, esta semana. */
export function chequearVariedad(yo: FichaPieza, propias: PiezaAnterior[], delRubro: PiezaAnterior[]): { problemas: string[]; avisos: string[]; libres: string[] } {
  const problemas: string[] = [];
  const avisos: string[] = [];
  if (!MOVIMIENTOS.includes(yo.movimiento)) problemas.push(`movimiento «${yo.movimiento}» no existe. Opciones: ${MOVIMIENTOS.join(", ")}`);
  if (!TIPOS_GANCHO.includes(yo.ganchoTipo)) problemas.push(`ganchoTipo «${yo.ganchoTipo}» no vale. Opciones: ${TIPOS_GANCHO.join(", ")}`);
  if (!PILARES.includes(yo.pilar)) problemas.push(`pilar «${yo.pilar}» no vale. Opciones: ${PILARES.join(", ")}`);

  // Un pedido de cambios sobre la misma pieza no se compara contra sí mismo.
  const otras = propias.filter((p) => p.movimiento && p.idPieza !== yo.idPieza);
  const recientes = otras.slice(0, SIN_REPETIR_MOVIMIENTO);
  const usados = recientes.map((p) => p.movimiento);
  const libres = MOVIMIENTOS.filter((m) => !usados.includes(m));
  if (usados.includes(yo.movimiento)) problemas.push(`el movimiento «${yo.movimiento}» está en las últimas ${SIN_REPETIR_MOVIMIENTO} piezas de este cliente (${recientes.map((p) => `${p.titulo}: ${p.movimiento}`).join("; ")}). Libres: ${libres.join(", ")}`);
  const seq = secuencia(yo.insertos);
  if (seq) {
    const igual = otras.slice(0, SIN_REPETIR_INSERTOS).find((p) => secuencia(p.insertos) === seq);
    if (igual) problemas.push(`la secuencia de insertos (${seq}) es la misma de «${igual.titulo}». Cambiá uno, su orden o sacalo`);
  }
  if (otras[0]?.pilar === yo.pilar) avisos.push(`mismo pilar que la pieza anterior de este cliente (${yo.pilar})`);
  if (yo.ganchoTipo === "hora" && otras.slice(0, 2).some((p) => p.ganchoTipo === "hora")) avisos.push("el gancho con la hora se gasta si se repite: usalo una vez por semana como mucho");

  for (const p of delRubro) {
    if (p.movimiento === yo.movimiento && secuencia(p.insertos) === seq) avisos.push(`mismo estilo y mismos insertos que «${p.titulo}» de ${p.cliente ?? "otro cliente"} del mismo rubro esta semana: si podés, cambiá uno`);
  }
  return { problemas, avisos, libres };
}

const ficha = (f: { title: string; metadata: unknown; cliente?: string | null }): PiezaAnterior => {
  const m = (f.metadata ?? {}) as Record<string, unknown>;
  return {
    titulo: f.title.replace(/^Video: /, "").slice(0, 60), cliente: f.cliente,
    idPieza: m.idPieza as string, movimiento: m.movimiento as string, ganchoTipo: m.ganchoTipo as string, pilar: m.pilar as string, insertos: m.insertos as string[],
  };
};

export async function variedadDeCliente(db: Db, clientId: string, yo: FichaPieza) {
  const delProductor = sql`${agentDeliverables.metadata}->>'via' = 'productor-video'`;
  const propias = await db.select({ title: agentDeliverables.title, metadata: agentDeliverables.metadata })
    .from(agentDeliverables)
    .where(and(eq(agentDeliverables.clientId, clientId), eq(agentDeliverables.kind, "video"), delProductor))
    .orderBy(desc(agentDeliverables.createdAt))
    .limit(12);
  const [c] = await db.select({ industry: clients.industry }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const delRubro = c?.industry
    ? await db.select({ title: agentDeliverables.title, metadata: agentDeliverables.metadata, cliente: clients.name })
      .from(agentDeliverables)
      .innerJoin(clients, eq(clients.id, agentDeliverables.clientId))
      .where(and(eq(clients.industry, c.industry), ne(clients.id, clientId), eq(agentDeliverables.kind, "video"), delProductor, gte(agentDeliverables.createdAt, new Date(Date.now() - DIAS_RUBRO * 86_400_000))))
      .limit(40)
    : [];
  return chequearVariedad(yo, propias.map(ficha), delRubro.map(ficha));
}
