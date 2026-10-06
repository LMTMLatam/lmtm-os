// LMTM-OS: conector MCP para Claude (pedido de Nazareno 06/10: "que el sistema
// tenga un conector con Claude, que pueda hacer todo y leer todo").
//
// POST /mcp con `Authorization: Bearer <clave de tablero>`. Arma el MISMO
// servidor MCP que usan los agentes (packages/mcp-server), apuntado a esta API
// por loopback con la clave de quien conecta: cada herramienta pasa por la
// autorización de siempre, sin reglas nuevas. Solo admin de la instancia.
// Sin estado (una conexión por request): no hay sesiones que perder en un deploy.

import { Router, type Request } from "express";
import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPaperclipMcpServer } from "@paperclipai/mcp-server";
import { assertInstanceAdmin } from "./authz.js";

/** Tope de filas que devuelve una consulta del conector. */
export const MAX_FILAS_SQL = 500;

/**
 * POST /api/lectura/sql — "leer todo": una consulta SQL de solo lectura, para el
 * conector de Claude. Corre en una transacción READ ONLY con el rol
 * `lmtm_lectura` (no ve tokens ni secretos: docs/rediseno/rol-solo-lectura.sql),
 * con 20 s de tope y hasta MAX_FILAS_SQL filas. Solo admin de la instancia.
 */
export function lecturaRoutes(db: Db) {
  const router = Router();
  router.post("/lectura/sql", async (req, res) => {
    assertInstanceAdmin(req);
    const consulta = typeof req.body?.sql === "string" ? req.body.sql.trim() : "";
    if (!consulta) return res.status(422).json({ error: "Falta `sql`." });
    try {
      const r = await db.transaction(async (tx) => {
        await tx.execute(sql`set transaction read only`);
        await tx.execute(sql`set local role lmtm_lectura`);
        await tx.execute(sql`set local statement_timeout = '20s'`);
        return tx.execute(sql.raw(consulta));
      });
      const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as unknown[];
      res.json({ filas: filas.slice(0, MAX_FILAS_SQL), total: filas.length, recortado: filas.length > MAX_FILAS_SQL });
    } catch (e) {
      res.status(422).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    }
  });
  return router;
}

function claveDe(req: Request): string | null {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
}

export function conectorMcpRoutes(opts: { serverPort: number }) {
  const router = Router();

  router.post("/mcp", async (req, res) => {
    const clave = claveDe(req);
    if (!clave || req.actor.type !== "board" || !req.actor.isInstanceAdmin) {
      return res.status(401).json({ error: "El conector necesita una clave de tablero de un admin (Authorization: Bearer ...)." });
    }
    const { server } = createPaperclipMcpServer({
      apiUrl: `http://127.0.0.1:${opts.serverPort}/api`,
      apiKey: clave,
      companyId: req.actor.companyIds?.[0] ?? null,
      agentId: null,
      runId: null,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.warn("[conector-mcp] error:", e instanceof Error ? e.message : e);
      if (!res.headersSent) res.status(500).json({ error: "Error del conector MCP" });
    }
  });

  // Sin sesiones: GET (stream de eventos) y DELETE no aplican.
  router.all("/mcp", (_req, res) => res.status(405).json({ error: "Usá POST." }));

  return router;
}
