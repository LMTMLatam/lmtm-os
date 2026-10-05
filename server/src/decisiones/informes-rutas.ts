// LMTM-OS: la API de los informes semanales.
//
//   GET  /api/informes?clientId=              los últimos informes del cliente, con el texto ya completado
//   POST /api/informes                        un agente (el estratega) o una persona escribe { clientId, semana?, narrativa }
//   GET  /api/informes/borrador/ensayo?clientId=   el borrador automático de la última semana, sin guardar nada
//   POST /api/informes/borradores             arma los borradores que falten (solo el tablero)
//   POST /api/informes/:id/publicar           lo pone en el link del cliente (solo si pasó el auditor)
//   POST /api/informes/:id/retirar            lo saca del link
//   GET  /api/clientes/:clientId/resumen      la pantalla Cliente en una lectura
//   GET  /api/cartera                         la Cartera: todos los activos, por plata en riesgo
//
// Escribir devuelve siempre la auditoría: si algo no pasa, el agente lee las
// fallas y lo corrige en un intento. Nada de esto le llega al cliente hasta
// que una persona lo publica.

import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { assertBoard, assertBoardOrgAccess, assertCompanyAccess, assertInstanceAdmin } from "../routes/authz.js";
import { unauthorized } from "../errors.js";
import { auditarInforme, renderizarNarrativa, ultimaSemana } from "./informe.js";
import {
  borradorDe,
  generarBorradores,
  otrosClientes,
  guardarInforme,
  listarInformes,
  obtenerInforme,
  publicarInforme,
  retirarInforme,
  type InformeFila,
} from "./informes-store.js";
import { empresaParaAcceso } from "./store.js";
import { resumenDeCliente } from "./cliente.js";
import { datosDeCartera } from "./cartera.js";
import { microCache } from "../services/micro-cache.js";
import { actorDe, responderError } from "./rutas.js";

const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** El informe con su texto ya completado: lo que leería el cliente. */
const conTexto = (i: InformeFila) => ({ ...i, texto: renderizarNarrativa(i.narrativa, i.numeros) });

export function informesRoutes(db: Db) {
  const router = Router();

  for (const prefijo of ["/informes", "/clientes", "/cartera"]) {
    router.use(prefijo, (req, _res, next) => {
      if (req.actor.type === "none") throw unauthorized("Authentication required");
      next();
    });
  }

  // Son ~59 clientes con dos lecturas de métricas cada uno: 3 minutos de
  // caché alcanzan (los datos son de ayer para atrás). El permiso se mira
  // ANTES del caché: si no, una respuesta guardada le llegaría a cualquiera.
  const soloTablero = (req: Request, _res: unknown, next: () => void) => {
    assertBoardOrgAccess(req);
    next();
  };
  router.get("/cartera", soloTablero, microCache(3 * 60_000), async (_req, res) => {
    try {
      res.json(await datosDeCartera(db));
    } catch (e) {
      responderError(res, e);
    }
  });

  router.get("/clientes/:clientId/resumen", async (req, res) => {
    try {
      const { clientId } = req.params;
      if (!esUuid(clientId)) return res.status(400).json({ error: "clientId inválido" });
      assertBoardOrgAccess(req);
      assertCompanyAccess(req, await empresaParaAcceso(db, clientId));
      res.json(await resumenDeCliente(db, clientId));
    } catch (e) {
      responderError(res, e);
    }
  });

  /** Un agente, solo clientes de su empresa; el tablero, con acceso a la empresa del cliente. */
  const accesoAlCliente = async (req: Request, clientId: string) => {
    if (req.actor.type !== "agent") assertBoardOrgAccess(req);
    assertCompanyAccess(req, await empresaParaAcceso(db, clientId));
  };

  router.get("/informes", async (req, res) => {
    try {
      const clientId = req.query.clientId;
      if (!esUuid(clientId)) return res.status(400).json({ error: "Falta ?clientId=" });
      await accesoAlCliente(req, clientId);
      res.json({ informes: (await listarInformes(db, clientId)).map(conTexto) });
    } catch (e) {
      responderError(res, e);
    }
  });

  router.post("/informes", async (req, res) => {
    try {
      const { clientId, semana, narrativa } = (req.body ?? {}) as Record<string, unknown>;
      if (!esUuid(clientId)) return res.status(422).json({ error: "Falta `clientId` (uuid del cliente)." });
      if (semana !== undefined && typeof semana !== "string") return res.status(422).json({ error: "`semana` es el lunes de la semana, YYYY-MM-DD." });
      await accesoAlCliente(req, clientId);
      const escritoPor = req.actor.type === "agent" ? `agente:${req.actor.agentId}` : `tablero:${actorDe(req).actorId}`;
      const r = await guardarInforme(db, { clientId, semana, narrativa }, escritoPor, actorDe(req));
      if (!r) return res.status(409).json({ error: "Ese informe ya existe." });
      res.status(r.creado ? 201 : 200).json({ informe: conTexto(r.informe), auditoria: r.informe.auditoria });
    } catch (e) {
      responderError(res, e);
    }
  });

  // El borrador automático de la última semana tal como saldría, sin guardar:
  // para ver en producción qué escribiría el lunes.
  router.get("/informes/borrador/ensayo", async (req, res) => {
    try {
      const clientId = req.query.clientId;
      if (!esUuid(clientId)) return res.status(400).json({ error: "Falta ?clientId=" });
      assertBoardOrgAccess(req);
      assertCompanyAccess(req, await empresaParaAcceso(db, clientId));
      const semana = ultimaSemana().desde;
      const b = await borradorDe(db, clientId, semana);
      if (!b) return res.json({ semana, borrador: null, motivo: "sin pauta conectada" });
      res.json({ semana, borrador: b.narrativa, texto: renderizarNarrativa(b.narrativa, b.numeros), numeros: b.numeros, auditoria: auditarInforme(b.narrativa, b.numeros, await otrosClientes(db, clientId)) });
    } catch (e) {
      responderError(res, e);
    }
  });

  // Escribe para todos los clientes de la instancia: solo un administrador.
  router.post("/informes/borradores", async (req, res) => {
    try {
      assertInstanceAdmin(req);
      res.json(await generarBorradores(db));
    } catch (e) {
      responderError(res, e);
    }
  });

  for (const accion of ["publicar", "retirar"] as const) {
    router.post(`/informes/:id/${accion}`, async (req, res) => {
      try {
        assertBoard(req);
        if (!esUuid(req.params.id)) return res.status(400).json({ error: "id inválido" });
        const i = await obtenerInforme(db, req.params.id);
        assertCompanyAccess(req, await empresaParaAcceso(db, i.clientId));
        const r = accion === "publicar" ? await publicarInforme(db, i.id, actorDe(req)) : await retirarInforme(db, i.id, actorDe(req));
        res.json({ informe: conTexto(r) });
      } catch (e) {
        responderError(res, e);
      }
    });
  }

  return router;
}
