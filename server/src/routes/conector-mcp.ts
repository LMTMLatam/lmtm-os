// LMTM-OS: conector MCP para Claude (pedido de Nazareno 06/10: "que el sistema
// tenga un conector con Claude, que pueda hacer todo y leer todo").
//
// POST /mcp con `Authorization: Bearer <clave de tablero>`. Arma el MISMO
// servidor MCP que usan los agentes (packages/mcp-server), apuntado a esta API
// por loopback con la clave de quien conecta: cada herramienta pasa por la
// autorización de siempre, sin reglas nuevas. Solo admin de la instancia.
// Sin estado (una conexión por request): no hay sesiones que perder en un deploy.

import { timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { ADAPTER_RUNNER, createLocalAgentJwt } from "../agent-auth-jwt.js";
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

// ── Conector del equipo (16/10) ──────────────────────────────────────────
// "Que el conector de Claude lo puedan usar todos, e incluso generar videos".
// El de arriba lleva la clave de un admin: compartirlo le daría a cualquiera
// SQL de toda la base, pausar campañas y mover presupuestos. Este otro:
//  - va por POST /mcp-equipo/<código> (LMTM_CONECTOR_EQUIPO en Railway; se
//    revoca cambiándolo);
//  - actúa como el agente "Claude (equipo)", con una credencial que se firma en
//    el servidor en cada pedido y nunca sale de acá;
//  - solo ve las herramientas de HERRAMIENTAS_EQUIPO: leer clientes y
//    contenido, generar videos e imágenes (también desde una tarea de ClickUp),
//    y dejar tareas y aprendizajes. Nada de pauta, SQL, WhatsApp a clientes ni
//    la API genérica.

export const AGENTE_EQUIPO = "Claude (equipo)";

export const HERRAMIENTAS_EQUIPO = [
  "lmtmGuiaContenido", "lmtmListClients", "lmtmGetClientBrain", "lmtmGetClientAdsPerformance", "lmtmGetClientCampaigns",
  "lmtmGetClientCompetitors", "lmtmGetClientScores", "lmtmPortfolioSnapshot", "lmtmGetClientBalance",
  "lmtmGetClientMarketingPlan", "lmtmGetClientOrganicPosts", "lmtmGetClientScheduledContent",
  "lmtmGetClientContentMatrix", "lmtmGetClientVideoTasks", "lmtmGetCadenaPublicacion", "lmtmGetNicheIntel",
  "lmtmGetTeamLessons", "lmtmSearchHooks", "lmtmListDeliverables", "lmtmAnalisisSeo", "lmtmRendimientoWeb",
  "lmtmRedesPublicas", "lmtmContenidoGenerado", "lmtmEstadoGeneracion",
  // Lo que escribe: contenido, tareas y lo aprendido del cliente.
  "lmtmGenerarContenido", "lmtmGenerarPieza", "lmtmCreateClientTask", "lmtmRememberAboutClient", "lmtmSaveHook",
];

function mismoCodigo(dado: string, esperado: string | undefined): boolean {
  if (!esperado || dado.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(dado), Buffer.from(esperado));
}

/** El agente con el que actúa el conector del equipo; se crea la primera vez. */
async function agenteEquipo(db: Db): Promise<{ id: string; companyId: string }> {
  const [ya] = await db.select({ id: agents.id, companyId: agents.companyId }).from(agents).where(eq(agents.name, AGENTE_EQUIPO)).limit(1);
  if (ya) return ya;
  const [base] = await db.select({ companyId: agents.companyId }).from(agents).where(eq(agents.name, "Claude (conector)")).limit(1);
  const [empresa] = base ? [{ id: base.companyId }] : await db.select({ id: companies.id }).from(companies).orderBy(asc(companies.createdAt)).limit(1);
  if (!empresa) throw new Error("No hay empresa para el agente del equipo.");
  const [nuevo] = await db
    .insert(agents)
    .values({ companyId: empresa.id, name: AGENTE_EQUIPO, role: "general", title: "Conector de Claude del equipo", status: "idle", adapterType: "process", adapterConfig: {} })
    .returning({ id: agents.id, companyId: agents.companyId });
  return nuevo;
}

export function conectorEquipoRoutes(db: Db, opts: { serverPort: number }) {
  const router = Router();
  router.post("/mcp-equipo/:codigo", async (req, res) => {
    if (!mismoCodigo(String(req.params.codigo ?? ""), process.env.LMTM_CONECTOR_EQUIPO)) {
      return res.status(401).json({ error: "Link del conector del equipo inválido o revocado." });
    }
    const agente = await agenteEquipo(db);
    const jwt = createLocalAgentJwt(agente.id, agente.companyId, ADAPTER_RUNNER, "conector-equipo");
    if (!jwt) return res.status(500).json({ error: "Falta el secreto para firmar la identidad del agente." });
    const { server } = createPaperclipMcpServer(
      { apiUrl: `http://127.0.0.1:${opts.serverPort}/api`, apiKey: jwt, companyId: agente.companyId, agentId: agente.id, runId: null },
      HERRAMIENTAS_EQUIPO,
    );
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.warn("[conector-equipo] error:", e instanceof Error ? e.message : e);
      if (!res.headersSent) res.status(500).json({ error: "Error del conector MCP" });
    }
  });
  router.all("/mcp-equipo/:codigo", (_req, res) => res.status(405).json({ error: "Usá POST." }));
  return router;
}
