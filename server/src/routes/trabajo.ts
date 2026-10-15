// LMTM-OS: el trabajo de los agentes en un solo lugar. Ver services/trabajo.ts.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertAuthenticated } from "./authz.js";
import { resumirTrabajo, trabajoDeAgentes } from "../services/trabajo.js";

export function trabajoRoutes(db: Db): Router {
  const router = Router();
  router.use("/trabajo", (req, _res, next) => {
    assertAuthenticated(req);
    next();
  });

  // GET /api/trabajo?clientId=&dias=30 — lo hecho, lo propuesto y lo medido.
  router.get("/trabajo", async (req, res) => {
    const clientId = typeof req.query.clientId === "string" && /^[0-9a-f-]{36}$/i.test(req.query.clientId) ? req.query.clientId : undefined;
    const dias = Number(req.query.dias) || 30;
    const items = await trabajoDeAgentes(db, { clientId, dias });
    res.json({ dias, items, resumen: resumirTrabajo(items) });
  });

  return router;
}
