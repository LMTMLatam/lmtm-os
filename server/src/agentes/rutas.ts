// LMTM-OS: la API del runner propio.
//
//   GET  /api/agentes/trabajos        lo que hicieron los agentes (?clientId= ?rol= ?estado= ?ref= ?limite=), sin pasos
//   GET  /api/agentes/trabajos/:id    un trabajo con todos sus pasos
//   POST /api/agentes/trabajos        pedirle algo a un rol: { rol, clientId?, pedido }
//   GET  /api/agentes/propuestas      propuestas de pauta pendientes, una por acción

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents, agenteTrabajos, approvals, clients } from "@paperclipai/db";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { TIPO_ACCION_PAUTA } from "../services/ads-propuestas.js";
import { assertBoard, assertBoardOrgAccess, assertCompanyAccess } from "../routes/authz.js";
import { unauthorized } from "../errors.js";
import { empresaParaAcceso } from "../decisiones/store.js";
import { responderError } from "../decisiones/rutas.js";
import { encolar } from "./cola.js";
import { cargarRol } from "./roles.js";

const UUID = /^[0-9a-f-]{36}$/i;

export interface PropuestaAgrupada {
  clave: string;
  ids: string[];
  agentes: string[];
  clientId: string;
  cliente: string;
  slug: string;
  resumen: string;
  justificacion: string;
  accion: unknown;
  createdAt: string;
}

/** Puro: una fila por cliente + acción (tipo, entidad, monto), en el orden en que llegaron. */
export function agruparPropuestas(
  filas: Array<{ id: string; payload: unknown; createdAt: Date | string; agente: string | null; cliente: string; slug: string }>,
): PropuestaAgrupada[] {
  const porClave = new Map<string, PropuestaAgrupada>();
  for (const f of filas) {
    const p = f.payload as { clientId?: string; resumen?: string; justificacion?: string; accion?: Record<string, unknown> } | null;
    if (!p?.clientId || !p.accion) continue;
    const clave = `${p.clientId}|${JSON.stringify(p.accion)}`;
    const ya = porClave.get(clave);
    if (ya) {
      ya.ids.push(f.id);
      if (f.agente && !ya.agentes.includes(f.agente)) ya.agentes.push(f.agente);
      continue;
    }
    porClave.set(clave, {
      clave,
      ids: [f.id],
      agentes: f.agente ? [f.agente] : [],
      clientId: p.clientId,
      cliente: f.cliente.trim(),
      slug: f.slug,
      resumen: p.resumen ?? "",
      justificacion: p.justificacion ?? "",
      accion: p.accion,
      createdAt: new Date(f.createdAt).toISOString(),
    });
  }
  return [...porClave.values()];
}
const ESTADOS = new Set(["pendiente", "corriendo", "hecho", "fallo", "cancelado"]);

export function agentesRoutes(db: Db) {
  const router = Router();

  router.use("/agentes", (req, _res, next) => {
    if (req.actor.type === "none") throw unauthorized("Authentication required");
    next();
  });

  router.get("/agentes/trabajos", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      const q = req.query;
      const filtros: SQL[] = [];
      if (typeof q.clientId === "string" && UUID.test(q.clientId)) {
        assertCompanyAccess(req, await empresaParaAcceso(db, q.clientId));
        filtros.push(eq(agenteTrabajos.clientId, q.clientId));
      }
      if (typeof q.rol === "string") filtros.push(eq(agenteTrabajos.rol, q.rol));
      if (typeof q.estado === "string" && ESTADOS.has(q.estado)) filtros.push(eq(agenteTrabajos.estado, q.estado));
      if (typeof q.ref === "string") filtros.push(eq(agenteTrabajos.ref, q.ref));
      const limite = Math.min(500, Math.max(1, Number(q.limite) || 100));
      // Sin `pasos` ni `entrada`: la lista es liviana; el detalle trae todo.
      const filas = await db
        .select({
          id: agenteTrabajos.id,
          rol: agenteTrabajos.rol,
          clientId: agenteTrabajos.clientId,
          motivo: agenteTrabajos.motivo,
          ref: agenteTrabajos.ref,
          estado: agenteTrabajos.estado,
          resultado: agenteTrabajos.resultado,
          error: agenteTrabajos.error,
          turnos: agenteTrabajos.turnos,
          tokensEntrada: agenteTrabajos.tokensEntrada,
          tokensSalida: agenteTrabajos.tokensSalida,
          pedidoPor: agenteTrabajos.pedidoPor,
          createdAt: agenteTrabajos.createdAt,
          startedAt: agenteTrabajos.startedAt,
          finishedAt: agenteTrabajos.finishedAt,
        })
        .from(agenteTrabajos)
        .where(filtros.length ? and(...filtros) : undefined)
        .orderBy(desc(agenteTrabajos.createdAt))
        .limit(limite);
      res.json({ trabajos: filas });
    } catch (e) {
      responderError(res, e);
    }
  });

  router.get("/agentes/trabajos/:id", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: "No existe." });
      const [t] = await db.select().from(agenteTrabajos).where(eq(agenteTrabajos.id, req.params.id)).limit(1);
      if (!t) return res.status(404).json({ error: "No existe." });
      if (t.clientId) assertCompanyAccess(req, await empresaParaAcceso(db, t.clientId));
      res.json({ trabajo: t });
    } catch (e) {
      responderError(res, e);
    }
  });

  // Las propuestas de pauta de los agentes (approvals accion_pauta pendientes),
  // una por acción: si dos agentes propusieron lo mismo (Milo y el media buyer
  // en paralelo durante el piloto) va una sola fila con todos los ids.
  router.get("/agentes/propuestas", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      const filas = await db
        .select({
          id: approvals.id,
          payload: approvals.payload,
          createdAt: approvals.createdAt,
          agente: agents.name,
          cliente: clients.name,
          slug: clients.slug,
        })
        .from(approvals)
        .leftJoin(agents, eq(agents.id, approvals.requestedByAgentId))
        .innerJoin(clients, sql`${clients.id}::text = ${approvals.payload}->>'clientId'`)
        .where(and(eq(approvals.type, TIPO_ACCION_PAUTA), eq(approvals.status, "pending")))
        .orderBy(approvals.createdAt);
      res.json({ propuestas: agruparPropuestas(filas) });
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/agentes/trabajos", async (req, res) => {
    try {
      assertBoard(req);
      const { rol, clientId, pedido } = (req.body ?? {}) as { rol?: unknown; clientId?: unknown; pedido?: unknown };
      if (typeof rol !== "string") return res.status(422).json({ error: "Falta el rol." });
      try {
        cargarRol(rol);
      } catch {
        return res.status(422).json({ error: `No existe el rol ${rol}.` });
      }
      if (typeof pedido !== "string" || pedido.trim().length < 5) return res.status(422).json({ error: "Escribí qué le pedís." });
      const cliente = typeof clientId === "string" && UUID.test(clientId) ? clientId : null;
      if (cliente) assertCompanyAccess(req, await empresaParaAcceso(db, cliente));
      else assertBoardOrgAccess(req);
      const id = await encolar(db, {
        rol,
        clientId: cliente,
        motivo: "pedido",
        entrada: { pedido: pedido.trim().slice(0, 4_000), ...(cliente ? { cliente: { id: cliente } } : {}) },
        pedidoPor: req.actor.type === "board" ? `tablero:${req.actor.userId}` : "tablero",
      });
      res.status(201).json({ id });
    } catch (e) {
      responderError(res, e);
    }
  });

  return router;
}
