// LMTM-OS: la API de decisiones.
//
//   GET  /api/hoy                            la pantalla Hoy en una lectura
//   GET  /api/decisiones                     lo vivo, ordenado por plata (?estado=, ?clientId=)
//   POST /api/decisiones                     un agente propone (lmtm_proponer_decision)
//   GET  /api/decisiones/motor/ensayo        qué haría el motor hoy, sin escribir nada
//   POST /api/decisiones/motor               corre el motor a mano (solo el tablero)
//   POST /api/decisiones/:id/aprobar         "dale"
//   POST /api/decisiones/:id/descartar       { motivo } obligatorio
//   POST /api/decisiones/:id/ejecutar        { confirmar: true } ejecuta; sin eso, ensayo
//   POST /api/decisiones/:id/hecha           lo hecho a mano
//
// Ejecutar es ENSAYO salvo que venga `confirmar: true`. El botón de Hoy lo
// manda; cualquier otra llamada (una prueba, un script, un agente curioso) se
// queda en el ensayo y no mueve plata. Es la regla de la casa: nunca
// ejercitar una ruta que escribe para "ver si anda".

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { assertBoard, assertBoardOrgAccess, assertCompanyAccess, getActorInfo } from "../routes/authz.js";
import { HttpError, unauthorized } from "../errors.js";
import {
  aprobar,
  crearDesdeAgente,
  descartar,
  ejecutar,
  empresaParaAcceso,
  ErrorDecision,
  estadosDeQuery,
  listarDecisiones,
  marcarHecha,
  obtenerDecision,
  validarEntradaAgente,
  type Actor,
} from "./store.js";
import { correrMotor, ensayarMotor } from "./motor.js";
import { datosDeHoy } from "./hoy.js";

export function actorDe(req: Request): Actor {
  const a = getActorInfo(req);
  return { actorType: a.actorType, actorId: a.actorId, agentId: a.agentId, runId: a.runId };
}

/** Los errores del dominio salen con su código y su texto; el resto, 500 sin detalles internos. */
export function responderError(res: Response, e: unknown) {
  if (e instanceof ErrorDecision) return res.status(e.status).json({ error: e.message });
  // Las de autorización (403 sin tablero, 401 sin sesión) vienen de authz.ts.
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  console.warn("[decisiones] error:", e instanceof Error ? e.message : e);
  return res.status(500).json({ error: "No se pudo completar. Probá de nuevo." });
}

export function decisionesRoutes(db: Db) {
  const router = Router();

  /**
   * Tablero con acceso a la empresa del cliente de esta decisión. Para
   * mutar, `assertCompanyAccess` además exige membresía activa y deja a los
   * "viewer" en solo lectura.
   */
  const accesoADecision = async (req: Request, id: string) => {
    assertBoard(req);
    const d = await obtenerDecision(db, id);
    assertCompanyAccess(req, await empresaParaAcceso(db, d.clientId));
  };

  // Todo lo de acá requiere sesión: la lista tiene nombres de clientes y plata.
  for (const prefijo of ["/decisiones", "/hoy"]) {
    router.use(prefijo, (req, _res, next) => {
      if (req.actor.type === "none") throw unauthorized("Authentication required");
      next();
    });
  }

  // La pantalla Hoy en una sola lectura: incidentes, decisiones por plata, lo
  // que espera el dato y la cobertura.
  router.get("/hoy", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      res.json(await datosDeHoy(db));
    } catch (e) {
      responderError(res, e);
    }
  });

  router.get("/decisiones", async (req, res) => {
    try {
      const clientId = typeof req.query.clientId === "string" && /^[0-9a-f-]{36}$/i.test(req.query.clientId) ? req.query.clientId : undefined;
      if (req.actor.type === "agent") {
        // Un agente lee las decisiones de UN cliente de su empresa (para no
        // proponer lo que ya está), nunca la cartera entera.
        if (!clientId) return res.status(400).json({ error: "Un agente tiene que pedir las decisiones de un cliente: ?clientId=" });
        assertCompanyAccess(req, await empresaParaAcceso(db, clientId));
      } else {
        assertBoardOrgAccess(req);
        if (clientId) assertCompanyAccess(req, await empresaParaAcceso(db, clientId));
      }
      const limite = Number(req.query.limite) || undefined;
      const filas = await listarDecisiones(db, { estados: estadosDeQuery(req.query.estado), clientId, limite });
      res.json({ decisiones: filas });
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/decisiones", async (req, res) => {
    try {
      if (req.actor.type !== "agent" || !req.actor.agentId || !req.actor.companyId) {
        return res.status(403).json({ error: "Las decisiones las proponen los agentes; las reglas las crea el motor." });
      }
      const v = validarEntradaAgente(req.body);
      if (!v.ok) return res.status(422).json({ error: v.motivo });
      const r = await crearDesdeAgente(db, v.entrada, { ...actorDe(req), companyId: req.actor.companyId });
      res.status(r.creada ? 201 : 200).json({ decision: r.decision, creada: r.creada });
    } catch (e) {
      responderError(res, e);
    }
  });

  // Lo que haría el motor hoy, sin escribir: para verificar contra producción.
  router.get("/decisiones/motor/ensayo", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      res.json(await ensayarMotor(db));
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/decisiones/motor", async (req, res) => {
    try {
      assertBoard(req);
      res.json(await correrMotor(db));
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/decisiones/:id/aprobar", async (req, res) => {
    try {
      await accesoADecision(req, req.params.id);
      res.json({ decision: await aprobar(db, req.params.id, actorDe(req)) });
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/decisiones/:id/descartar", async (req, res) => {
    try {
      await accesoADecision(req, req.params.id);
      const motivo = typeof req.body?.motivo === "string" ? req.body.motivo : "";
      res.json({ decision: await descartar(db, req.params.id, motivo, actorDe(req)) });
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/decisiones/:id/ejecutar", async (req, res) => {
    try {
      await accesoADecision(req, req.params.id);
      const ensayo = req.body?.confirmar !== true;
      const r = await ejecutar(db, req.params.id, actorDe(req), { ensayo });
      res.status(r.resultado.ok ? 200 : 422).json(r);
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/decisiones/:id/hecha", async (req, res) => {
    try {
      await accesoADecision(req, req.params.id);
      const nota = typeof req.body?.nota === "string" ? req.body.nota : undefined;
      res.json({ decision: await marcarHecha(db, req.params.id, actorDe(req), nota) });
    } catch (e) {
      responderError(res, e);
    }
  });

  return router;
}
