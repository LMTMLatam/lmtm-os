// LMTM-OS: rutas de generación de video (Higgsfield).
//
// El flujo normal es la etiqueta "generar video" en ClickUp + el barrido de
// video-higgsfield.ts. Estas rutas son la otra puerta: el botón del panel y el
// estado de la cola, para el que no está mirando ClickUp.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, clients } from "@paperclipai/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { barrerPendientes, estadoCuenta, generarVideoDePieza, piezasPendientes, previsualizarPieza, TAG_PEDIDO } from "../services/video-higgsfield.js";

export function videoRoutes(db: Db): Router {
  const router = Router();

  // GET /api/video/estado — saldo + cola pendiente. Alimenta la card del panel.
  router.get("/video/estado", async (_req, res) => {
    try {
      const [cuenta, pendientes] = await Promise.all([estadoCuenta(db), piezasPendientes(db)]);
      res.json({
        // Con el API de plataforma ya no hay sesión que se caiga. OJO: "ok"
        // significa credenciales válidas y API alcanzable, NO que haya saldo —
        // eso solo se sabe al generar (ver higgsfield-api.ts).
        sesion: cuenta.ok ? "ok" : "caida",
        // Con qué bolsa se está generando ahora ("plan" o "api") y el saldo del
        // plan, para que el panel muestre cuál se está gastando.
        via: cuenta.via,
        creditos: cuenta.creditosPlan,
        avisoSesion: cuenta.motivo,
        etiqueta: TAG_PEDIDO,
        pendientes: pendientes.map((p) => ({
          clientId: p.clientId, cliente: p.clientName,
          taskId: p.tarea.id, titulo: p.tarea.name, url: p.tarea.url,
          tipo: p.tarea.tipo, conImagen: !!p.tarea.imagenUrl,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // GET /api/video/generados?clientId= — TODO el contenido ya producido.
  //
  // Antes filtraba solo kind='video' y los carruseles y placas no aparecían en
  // ningún lado, aunque salen del mismo circuito y el equipo los aprueba igual
  // (18/8). La pantalla pasó a llamarse "Contenido" por eso.
  router.get("/video/generados", async (req, res) => {
    try {
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : null;
      const KINDS = ["video", "placa", "carrusel", "imagen"];
      const rows = await db.select({
        id: agentDeliverables.id, title: agentDeliverables.title, url: agentDeliverables.url,
        kind: agentDeliverables.kind,
        clientId: agentDeliverables.clientId, metadata: agentDeliverables.metadata,
        createdAt: agentDeliverables.createdAt,
      })
        .from(agentDeliverables)
        .where(clientId
          ? and(inArray(agentDeliverables.kind, KINDS), eq(agentDeliverables.clientId, clientId))
          : inArray(agentDeliverables.kind, KINDS))
        .orderBy(desc(agentDeliverables.createdAt))
        .limit(60);
      res.json({ videos: rows });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // POST /api/video/generar { clientId | clientSlug, taskId, forzar? }
  // Genera UNA pieza. Bloquea hasta tener el video (~2 min), así el botón
  // devuelve el link y no un "ya te aviso".
  router.post("/video/generar", async (req, res) => {
    try {
      const { clientId, clientSlug, taskId, forzar } = (req.body ?? {}) as {
        clientId?: string; clientSlug?: string; taskId?: string; forzar?: boolean;
      };
      if (!taskId) return res.status(400).json({ error: "falta taskId" });
      let id = clientId;
      if (!id && clientSlug) {
        const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, clientSlug));
        id = c?.id;
      }
      if (!id) return res.status(400).json({ error: "falta clientId o clientSlug" });

      // Un reel son 3 clips + concat: pasa los ~4 min que aguanta el proxy de
      // Railway y el request muere con "upstream error" AUNQUE el servidor lo
      // termine bien (14/8). Se responde 202 y el trabajo sigue: el resultado
      // llega igual al comentario de ClickUp, a Drive y al Cronopost.
      const trabajo = generarVideoDePieza(db, { clientId: id, taskId, forzar: !!forzar });
      let terminado = false;
      const resultado = await Promise.race([
        trabajo.then((r) => { terminado = true; return r; }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 200_000)),
      ]);
      if (!terminado || resultado == null) {
        trabajo.catch((e) => console.warn("[video] generación en curso falló:", e instanceof Error ? e.message : e));
        return res.status(202).json({
          ok: true, enCurso: true, taskId,
          mensaje: "Tarda más de lo que aguanta la conexión (suele ser un reel). Sigue generándose: el resultado llega al comentario de ClickUp, a Drive y al Cronopost.",
        });
      }
      res.status(resultado.ok ? 200 : 502).json(resultado);
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // POST /api/video/prompt { clientId | clientSlug, taskId }
  // Devuelve QUÉ se le va a pedir a Higgsfield para esa pieza, sin generar ni
  // gastar créditos. Sirve para revisar el prompt antes de pagarlo, y es lo que
  // permite testear la calidad de los prompts sin quemar la bolsa.
  router.post("/video/prompt", async (req, res) => {
    try {
      const { clientId, clientSlug, taskId } = (req.body ?? {}) as {
        clientId?: string; clientSlug?: string; taskId?: string;
      };
      if (!taskId) return res.status(400).json({ error: "falta taskId" });
      let id = clientId;
      if (!id && clientSlug) {
        const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, clientSlug));
        id = c?.id;
      }
      if (!id) return res.status(400).json({ error: "falta clientId o clientSlug" });
      res.json(await previsualizarPieza(db, { clientId: id, taskId }));
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // GET /api/video/modelos — catálogo del plan. Solo lectura, no gasta créditos.
  router.get("/video/modelos", async (req, res) => {
    try {
      const { modelosPlan, costoPlan, esquemaModelo } = await import("../services/higgsfield-cli.js");
      const esquema = typeof req.query.esquema === "string" ? req.query.esquema : null;
      if (esquema) return res.type("application/json").send(await esquemaModelo(db, esquema));
      const costo = typeof req.query.costo === "string" ? req.query.costo : null;
      if (costo) {
        const extra = typeof req.query.args === "string" ? req.query.args.split(" ").filter(Boolean) : [];
        return res.type("application/json").send(await costoPlan(db, costo, extra));
      }
      res.type("application/json").send(await modelosPlan(db));
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // POST /api/video/barrer — corre el barrido a mano (sin esperar los 10 min).
  router.post("/video/barrer", async (_req, res) => {
    try {
      res.json(await barrerPendientes(db));
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  return router;
}
