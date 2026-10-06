// LMTM-OS: rutas de avisos. Todas de solo lectura.
//
//   GET /api/avisos/resumen/ensayo     el resumen de las 9:00 tal como saldría ahora, sin mandarlo
//   GET /api/avisos/medicion?dias=30   interrupciones por día: las que hubo y las que habría
//                                      con la política nueva, sobre el historial de wa_outbox
//
// No hay una ruta para "mandar el resumen ya": probar el canal mandando un
// WhatsApp de verdad es justo lo que no se hace (la regla de no ejercitar
// rutas que escriben). Para eso está el ensayo.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { waOutbox } from "@paperclipai/db";
import { gte } from "drizzle-orm";
import { assertBoardOrgAccess } from "../routes/authz.js";
import { HttpError } from "../errors.js";
import { ensayarResumen } from "./resumen.js";
import { medirInterrupciones } from "./medir.js";
import { TOPE_INTERRUPCIONES_DIA } from "./politica.js";

export function avisosRoutes(db: Db) {
  const router = Router();

  router.get("/avisos/resumen/ensayo", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      res.json(await ensayarResumen(db));
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      res.status(500).json({ error: "No se pudo armar el resumen." });
    }
  });

  router.get("/avisos/medicion", async (req, res) => {
    try {
      assertBoardOrgAccess(req);
      const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 120);
      const desde = new Date(Date.now() - dias * 86_400_000);
      const filas = await db
        .select({ createdAt: waOutbox.createdAt, nivel: waOutbox.nivel, origen: waOutbox.origen, clave: waOutbox.clave, estado: waOutbox.estado })
        .from(waOutbox)
        .where(gte(waOutbox.createdAt, desde));
      const porDia = medirInterrupciones(filas);
      const max = (k: "interrupcionesAntes" | "interrupcionesAhora") => porDia.reduce((m, d) => Math.max(m, d[k]), 0);
      res.json({ dias, tope: TOPE_INTERRUPCIONES_DIA, maximoAntes: max("interrupcionesAntes"), maximoAhora: max("interrupcionesAhora"), porDia });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      res.status(500).json({ error: "No se pudo medir." });
    }
  });

  return router;
}
