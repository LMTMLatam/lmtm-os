// LMTM-OS: el cerebro por HTTP (plan 15/11, fase 1). Solo lectura, para
// cualquier miembro y para los agentes (lo usan por el conector y el MCP).

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { actividad, cliente, empresa, resolverCliente } from "../services/cerebro.js";
import { assertMiembro } from "./authz.js";

export function cerebroRoutes(db: Db): Router {
  const router = Router();
  router.use("/cerebro", (req, _res, next) => { if (req.actor.type !== "agent") assertMiembro(req); next(); });

  // GET /api/cerebro/empresa — cómo trabaja la agencia + equipo, rutinas y lecciones.
  router.get("/cerebro/empresa", async (_req, res) => { res.json(await empresa(db)); });

  // GET /api/cerebro/cliente?q=<id|slug|nombre> — la ficha completa.
  router.get("/cerebro/cliente", async (req, res) => {
    const r = await resolverCliente(db, String(req.query.q ?? ""));
    if ("error" in r) return res.status(404).json(r);
    res.json(await cliente(db, r.id));
  });

  // GET /api/cerebro/actividad?dias=7&desde=YYYY-MM-DD&cliente=&tipo=&limite=&planes=1
  router.get("/cerebro/actividad", async (req, res) => {
    let clientId: string | null = null;
    if (req.query.cliente) {
      const r = await resolverCliente(db, String(req.query.cliente));
      if ("error" in r) return res.status(404).json(r);
      clientId = r.id;
    }
    const desde = typeof req.query.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : undefined;
    res.json(await actividad(db, {
      dias: Math.min(90, Math.max(1, Number(req.query.dias) || 7)), desde, clientId,
      tipo: typeof req.query.tipo === "string" ? req.query.tipo : null,
      limite: Number(req.query.limite) || 60, conPlanes: req.query.planes === "1",
    }));
  });

  // GET /api/cerebro/cobertura — qué le falta a cada cliente activo (para completar la ficha).
  router.get("/cerebro/cobertura", async (_req, res) => {
    const { cobertura } = await import("../services/cerebro.js");
    const { sql } = await import("drizzle-orm");
    const r = await db.execute(sql`
      select c.id, c.name, c.website_url, c.metadata,
        b.tono, b.logo_url, b.colores, b.publico, b.diferencial,
        (select count(*) from client_products p where p.client_id = c.id and p.active) productos,
        (select count(*) from competitors x where x.client_id = c.id) competidores,
        (select count(*) from ads_account_mappings m where m.client_id = c.id) mapeos,
        (select count(*) from client_memory m where m.client_id = c.id) memoria
      from clients c left join client_brand b on b.client_id = c.id where c.status = 'active' order by c.name`);
    const rows = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
    const lista = rows.map((x) => {
      const meta = (x.metadata ?? {}) as Record<string, unknown>;
      return {
        clientId: String(x.id), cliente: String(x.name).trim(),
        ...cobertura({
          tono: !!x.tono, logo: !!x.logo_url, colores: Array.isArray(x.colores) && x.colores.length > 0, publico: !!x.publico,
          diferencial: !!x.diferencial, web: !!x.website_url || (Array.isArray(meta.webs) && meta.webs.length > 0),
          productos: Number(x.productos), competidores: Number(x.competidores), nas: Array.isArray(meta.nas) && meta.nas.length > 0,
          pauta: Number(x.mapeos) > 0, memoria: Number(x.memoria),
        }),
      };
    }).sort((a, b) => a.porcentaje - b.porcentaje);
    const promedio = lista.length ? Math.round(lista.reduce((t, x) => t + x.porcentaje, 0) / lista.length) : null;
    res.json({ promedio, clientes: lista });
  });

  return router;
}
