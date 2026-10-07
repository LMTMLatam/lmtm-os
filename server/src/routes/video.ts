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
import { hayMagnific } from "../services/magnific.js";

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
        magnific: hayMagnific(),
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

  // GET /api/contenido/tablero?dias=14 — Super Redes de toda la agencia: las
  // piezas de la lista "Redes Sociales" de cada cliente, de anteayer a N días,
  // con lo que les falta para salir. Es ClickUp en vivo (una lectura por
  // cliente), así que se guarda 10 minutos; ?fresco=1 la vuelve a leer.
  router.get("/contenido/tablero", async (req, res) => {
    try {
      const dias = Math.min(31, Math.max(1, Number(req.query.dias) || 14));
      if (cacheTablero && cacheTablero.dias === dias && Date.now() - cacheTablero.at < 10 * 60_000 && req.query.fresco !== "1") {
        return res.json(cacheTablero.data);
      }
      const data = await armarTablero(db, dias);
      cacheTablero = { at: Date.now(), dias, data };
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // GET /api/contenido/que-funciona?dias=180 — qué ángulos y formatos rinden,
  // comparando todas las cuentas contra lo normal de cada una; qué reutilizar;
  // y por cliente, el ángulo que funciona en su rubro y no usa. Solo lectura.
  router.get("/contenido/que-funciona", async (req, res) => {
    try {
      const dias = Math.min(365, Math.max(30, Number(req.query.dias) || 180));
      const { analisisContenido } = await import("../services/contenido-analisis.js");
      const { pendientesDeClasificar } = await import("../services/contenido-angulos.js");
      const [analisis, sinClasificar] = await Promise.all([
        analisisContenido(db, dias, req.query.fresco === "1"),
        pendientesDeClasificar(db),
      ]);
      res.json({ ...analisis, sinClasificar });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  return router;
}

let cacheTablero: { at: number; dias: number; data: unknown } | null = null;

async function armarTablero(db: Db, dias: number) {
  const { getRedesCalendar } = await import("../services/clickup-sync.js");
  const { clienteReal } = await import("../services/intel-common.js");
  const activos = await db.select({ id: clients.id, name: clients.name, slug: clients.slug }).from(clients).where(clienteReal());
  const desde = Date.now() - 2 * 86_400_000;
  const hasta = Date.now() + dias * 86_400_000;
  const piezas: Array<Record<string, unknown>> = [];
  const sinLista: string[] = [];
  const conError: string[] = [];
  // De a seis: 59 lecturas seguidas a ClickUp tardan, todas juntas pegan en su límite.
  for (let i = 0; i < activos.length; i += 6) {
    await Promise.all(activos.slice(i, i + 6).map(async (c) => {
      const cal = await getRedesCalendar(db, c.id, desde, hasta).catch(() => undefined);
      if (cal === undefined) conError.push(c.name);
      else if (cal === null) sinLista.push(c.name);
      else for (const p of cal) piezas.push({ ...p, clientId: c.id, cliente: c.name, slug: c.slug });
    }));
  }
  piezas.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { generadoAt: new Date().toISOString(), dias, piezas, sinLista: sinLista.sort(), conError: conError.sort() };
}

