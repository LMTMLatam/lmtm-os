// LMTM-OS: rutas de generación de video (Higgsfield).
//
// El flujo normal es la etiqueta "generar video" en ClickUp + el barrido de
// video-higgsfield.ts. Estas rutas son la otra puerta: el botón del panel y el
// estado de la cola, para el que no está mirando ClickUp.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentDeliverables, agents, clients } from "@paperclipai/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { barrerPendientes, estadoCuenta, generarVideoDePieza, piezasPendientes, previsualizarPieza, TAG_PEDIDO } from "../services/video-higgsfield.js";
import { hayMagnific } from "../services/magnific.js";
import { contenidoGenerado, generarContenidoLibre, type PedidoLibre } from "../services/contenido-generado.js";
import { assertMiembro, assertBoard } from "./authz.js";
import { AGENTE_EQUIPO } from "./conector-mcp.js";
import { forbidden } from "../errors.js";

/** Lo que aguanta el proxy de Railway antes de cortar la conexión (~4 min). */
const ESPERA_RESPUESTA_MS = 200_000;

export function videoRoutes(db: Db): Router {
  const router = Router();
  // Sin sesión, nada (14/10): estas rutas respondían a cualquiera, incluso POST /video/generar, que gasta créditos.
  router.use(["/video","/contenido"], (req, _res, next) => { assertMiembro(req); next(); });

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
      const { clientId, clientSlug, taskId, forzar, origen } = (req.body ?? {}) as {
        clientId?: string; clientSlug?: string; taskId?: string; forzar?: boolean; origen?: string;
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
      const trabajo = generarVideoDePieza(db, { clientId: id, taskId, forzar: !!forzar, origen: origen === "claude" ? "claude" : "panel" });
      let terminado = false;
      const resultado = await Promise.race([
        trabajo.then((r) => { terminado = true; return r; }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ESPERA_RESPUESTA_MS)),
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

  // GET /api/contenido/super-redes/:clientId — las ideas de la lista Super Redes del cliente, con el estado del pedido
  // al Productor de cada una (ficha del cliente, 20/11).
  router.get("/contenido/super-redes/:clientId", async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.clientId)) return res.status(400).json({ error: "clientId inválido" });
    try {
      const { ideasSuperRedes } = await import("../services/video-higgsfield.js");
      res.json(await ideasSuperRedes(db, req.params.clientId));
    } catch (e) {
      res.status(502).json({ error: `No se pudo leer Super Redes: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}` });
    }
  });

  // POST /api/contenido/super-redes/:clientId/:taskId/pedir — el botón «Generar con el agente»: lo mismo que la
  // etiqueta «generar contenido» de ClickUp. Gasta créditos (Magnific / modelo): solo el tablero.
  router.post("/contenido/super-redes/:clientId/:taskId/pedir", async (req, res) => {
    assertBoard(req);
    const { clientId, taskId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^[a-z0-9]{4,20}$/i.test(taskId)) return res.status(400).json({ ok: false, mensaje: "Pedido inválido." });
    try {
      const { pedirDesdeElPanel } = await import("../services/video-higgsfield.js");
      const r = await pedirDesdeElPanel(db, clientId, taskId);
      // En el camino del Productor `error` trae el mensaje del pedido («pedido al Productor de contenido (LMTM-…)»).
      res.status(r.ok ? 200 : 422).json({ ok: r.ok, mensaje: r.error ?? (r.url ? `Listo: ${r.url}` : "Pedido.") });
    } catch (e) {
      res.status(502).json({ ok: false, mensaje: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // GET /api/contenido/generado?dias=30&clientId= — todo lo generado con su
  // link de Drive y lo que gastó cada herramienta. Solo lectura.
  router.get("/contenido/generado", async (req, res) => {
    try {
      const dias = Math.min(730, Math.max(1, Number(req.query.dias) || 30));
      const clientId = typeof req.query.clientId === "string" && req.query.clientId ? req.query.clientId : null;
      res.json(await contenidoGenerado(db, { dias, clientId }));
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // ── Productor de contenido desde el panel (30/10: «que en generación de
  // contenido se le pueda pedir un video y cambios al video hecho»). Lo piden
  // personas del equipo; cada pedido es una corrida del Productor (gasta).

  // GET /api/contenido/productor/pedidos — lo que tiene entre manos o terminó hace poco.
  router.get("/contenido/productor/pedidos", async (req, res) => {
    assertMiembro(req);
    const { pedidosDelProductor } = await import("../services/video-agente.js");
    res.json({ pedidos: await pedidosDelProductor(db) });
  });

  // ── Editor de video (plan 17/11): «en el cliente X, carpeta X, tenés los crudos de hoy». ──
  router.get("/contenido/editor/pedidos", async (req, res) => {
    assertMiembro(req);
    const { pedidosDelProductor, AGENTE_EDITOR } = await import("../services/video-agente.js");
    res.json({ pedidos: await pedidosDelProductor(db, AGENTE_EDITOR) });
  });

  // POST /api/contenido/editor/pedido { clientId, ruta, pedido? }
  router.post("/contenido/editor/pedido", async (req, res) => {
    assertBoard(req);
    const b = (req.body ?? {}) as { clientId?: string; ruta?: string; pedido?: string };
    const { rutaNas } = await import("../services/nas.js");
    const ruta = rutaNas(b.ruta);
    if (!b.clientId || !ruta || !ruta.startsWith("/LMTM/")) return res.status(422).json({ error: "Falta el cliente o la carpeta del NAS con los crudos (empieza con /LMTM/)." });
    const [c] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, b.clientId)).limit(1);
    if (!c) return res.status(404).json({ error: "No encuentro ese cliente." });
    const { encargarAlEditor, AGENTE_EDITOR } = await import("../services/video-agente.js");
    const [a] = await db.select({ companyId: agents.companyId }).from(agents).where(eq(agents.name, AGENTE_EDITOR)).limit(1);
    if (!a) return res.status(503).json({ error: "No está el agente Editor de video." });
    const pedido = typeof b.pedido === "string" ? b.pedido.trim().slice(0, 4000) : "";
    const r = await encargarAlEditor(db, { companyId: a.companyId, clientId: c.id, clienteNombre: c.name, ruta, pedido, aPedido: true });
    res.status(r.ok ? 200 : 502).json(r);
  });

  // GET /api/contenido/para-validar — videos de los agentes sin veredicto (30 días): el aviso de Hoy (plan 17/11, fase 4).
  router.get("/contenido/para-validar", async (req, res) => {
    assertMiembro(req);
    const { AGENTE_EDITOR, AGENTE_PRODUCTOR } = await import("../services/video-agente.js");
    const [f] = await db.select({ n: sql<number>`count(*)::int`, desde: sql<string | null>`min(${agentDeliverables.createdAt})::text` })
      .from(agentDeliverables).innerJoin(agents, eq(agents.id, agentDeliverables.agentId))
      .where(and(eq(agentDeliverables.kind, "video"), inArray(agents.name, [AGENTE_PRODUCTOR, AGENTE_EDITOR]),
        sql`${agentDeliverables.metadata}->'veredicto' is null`, sql`${agentDeliverables.createdAt} > now() - interval '30 days'`));
    res.json({ videos: Number(f?.n ?? 0), desde: f?.desde ?? null });
  });

  // GET /api/contenido/crudos-nuevos — carpetas de crudos del NAS de los últimos días (del índice nocturno), por cliente.
  router.get("/contenido/crudos-nuevos", async (req, res) => {
    assertMiembro(req);
    const { crudosNuevos } = await import("../services/nas-indice.js");
    const clientId = typeof req.query.clientId === "string" && /^[0-9a-f-]{36}$/i.test(req.query.clientId) ? req.query.clientId : undefined;
    res.json({ carpetas: await crudosNuevos(db, Number(req.query.dias) || 7, clientId) });
  });

  // POST /api/contenido/productor/pedido { clientId, pedido }
  router.post("/contenido/productor/pedido", async (req, res) => {
    assertBoard(req);
    const b = (req.body ?? {}) as { clientId?: string; pedido?: string };
    const pedido = typeof b.pedido === "string" ? b.pedido.trim() : "";
    if (!b.clientId || pedido.length < 10) return res.status(422).json({ error: "Falta el cliente o el pedido (contá qué video querés, de qué producto y para qué)." });
    const [c] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, b.clientId)).limit(1);
    if (!c) return res.status(404).json({ error: "No encuentro ese cliente." });
    const { encargarAlProductor, AGENTE_PRODUCTOR } = await import("../services/video-agente.js");
    const [a] = await db.select({ companyId: agents.companyId }).from(agents).where(eq(agents.name, AGENTE_PRODUCTOR)).limit(1);
    if (!a) return res.status(503).json({ error: "No está el agente Productor de contenido." });
    const r = await encargarAlProductor(db, { companyId: a.companyId, clientId: c.id, clienteNombre: c.name, pedido: pedido.slice(0, 4000), aPedido: true });
    res.status(r.ok ? 200 : 502).json(r);
  });

  // POST /api/contenido/productor/cambios { deliverableId, cambios }
  router.post("/contenido/productor/cambios", async (req, res) => {
    assertBoard(req);
    const b = (req.body ?? {}) as { deliverableId?: string; cambios?: string };
    const cambios = typeof b.cambios === "string" ? b.cambios.trim() : "";
    if (!b.deliverableId || cambios.length < 5) return res.status(422).json({ error: "Contá qué cambiar del video." });
    const { pedirCambiosDeVideo } = await import("../services/video-agente.js");
    const r = await pedirCambiosDeVideo(db, { deliverableId: b.deliverableId, cambios: cambios.slice(0, 3000) });
    res.status(r.ok ? 200 : 404).json(r);
  });

  // POST /api/contenido/veredicto { deliverableId, sirve, porque } — una persona dice si la pieza sirvió (15/11).
  // Si no sirvió, el porqué queda como regla fijada del cliente para la próxima pieza. El conector del equipo también.
  router.post("/contenido/veredicto", async (req, res) => {
    let por: string;
    if (req.actor.type === "agent") {
      const [a] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, req.actor.agentId ?? "")).limit(1);
      if (a?.name !== AGENTE_EQUIPO) throw forbidden("Los agentes no juzgan sus propias piezas.");
      por = AGENTE_EQUIPO;
    } else {
      assertBoard(req);
      por = req.actor.userId ? `panel:${req.actor.userId}` : "panel";
    }
    const b = (req.body ?? {}) as { deliverableId?: string; sirve?: unknown; porque?: string };
    if (!b.deliverableId || typeof b.sirve !== "boolean") return res.status(422).json({ ok: false, motivo: "Faltan deliverableId y sirve (true/false)." });
    const { registrarVeredicto } = await import("../services/calidad-piezas.js");
    const r = await registrarVeredicto(db, b.deliverableId, { sirve: b.sirve, porque: typeof b.porque === "string" ? b.porque : "", por });
    res.status(r.ok ? 200 : 422).json(r);
  });

  // POST /api/contenido/registrar { cliente, titulo, tipo, links[], taskId?, notas? } — una pieza que alguien del
  // equipo armó en su PC (con Claude) y subió a Drive: queda en el panel, en la Actividad y se le puede dar veredicto (15/11).
  router.post("/contenido/registrar", async (req, res) => {
    let por: string;
    let agentId: string | null = null;
    if (req.actor.type === "agent") {
      const [a] = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.id, req.actor.agentId ?? "")).limit(1);
      if (a?.name !== AGENTE_EQUIPO) throw forbidden("Los agentes entregan con sus herramientas de entrega.");
      por = AGENTE_EQUIPO; agentId = a.id;
    } else { assertBoard(req); por = req.actor.userId ? `panel:${req.actor.userId}` : "panel"; }
    const b = (req.body ?? {}) as { cliente?: string; titulo?: string; tipo?: string; links?: unknown; taskId?: string; notas?: string };
    const tipos = ["placa", "carrusel", "video", "imagen"];
    const links = (Array.isArray(b.links) ? b.links : []).filter((l): l is string => typeof l === "string" && /^https:\/\//.test(l)).slice(0, 20);
    if (!b.cliente || !b.titulo || !tipos.includes(String(b.tipo)) || !links.length) {
      return res.status(422).json({ ok: false, motivo: `Faltan cliente, titulo, tipo (${tipos.join(" | ")}) o links (https).` });
    }
    const { resolverCliente } = await import("../services/cerebro.js");
    const c = await resolverCliente(db, b.cliente);
    if ("error" in c) return res.status(404).json({ ok: false, motivo: c.error, opciones: c.opciones });
    // La empresa es la de la agencia (una sola): la del agente del equipo.
    const [eq0] = await db.select({ companyId: agents.companyId }).from(agents).where(eq(agents.name, AGENTE_EQUIPO)).limit(1);
    const companyId = eq0?.companyId ?? null;
    if (!companyId) return res.status(503).json({ ok: false, motivo: "No está el agente del equipo." });
    const kind = b.tipo === "carrusel" ? "placa" : String(b.tipo);
    const [d] = await db.insert(agentDeliverables).values({
      companyId, clientId: c.id, agentId, kind,
      title: `${b.tipo === "carrusel" ? "Carrusel" : kind === "video" ? "Video" : kind === "imagen" ? "Imagen" : "Placa"}: ${String(b.titulo).slice(0, 150)}`,
      content: typeof b.notas === "string" ? b.notas.slice(0, 4000) : String(b.titulo), url: links[0],
      metadata: { via: "equipo", origen: req.actor.type === "agent" ? "claude" : "panel", por, links, piezas: links.length, taskId: b.taskId ?? null },
    }).returning({ id: agentDeliverables.id });
    res.json({ ok: true, deliverableId: d?.id, mensaje: `Registrada en el panel para ${c.name}. Se le puede dar veredicto con lmtmVeredictoPieza.` });
  });

  // POST /api/contenido/productor/vincular { deliverableId, permalink } — ya se publicó: de acá salen sus métricas.
  router.post("/contenido/productor/vincular", async (req, res) => {
    assertBoard(req);
    const b = (req.body ?? {}) as { deliverableId?: string; permalink?: string };
    if (!b.deliverableId || !/^https?:\/\//.test(b.permalink ?? "")) return res.status(422).json({ ok: false, motivo: "Pegá el link del posteo." });
    const { vincularPieza } = await import("../services/pieza-metricas.js");
    res.json(await vincularPieza(db, b.deliverableId, b.permalink as string));
  });

  // POST /api/contenido/generar-libre { clientId, tipo, prompt, titulo?, imagenUrl?, formato?, herramienta?, origen? }
  // Genera sin tarea de ClickUp (Claude por el conector, o el panel), lo sube
  // al Drive de Super Redes del cliente y lo registra con su gasto. GASTA
  // CRÉDITOS: solo personas del tablero (el conector de Claude entra como
  // tablero); los agentes no.
  router.post("/contenido/generar-libre", async (req, res) => {
    // Personas, o Claude por el conector del equipo (16/10: "que puedan generar
    // videos con eso"). Los agentes de la flota no generan solos: gastan créditos.
    if (req.actor.type === "agent") {
      const [a] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, req.actor.agentId ?? "")).limit(1);
      if (a?.name !== AGENTE_EQUIPO) throw forbidden("Los agentes no generan contenido por su cuenta.");
    } else assertBoard(req);
    const b = (req.body ?? {}) as Partial<PedidoLibre> & { origen?: string };
    if (!b.clientId || (b.tipo !== "video" && b.tipo !== "imagen") || typeof b.prompt !== "string") {
      return res.status(422).json({ error: "Faltan clientId, tipo (video | imagen) o prompt." });
    }
    const trabajo = generarContenidoLibre(db, {
      clientId: b.clientId, tipo: b.tipo, prompt: b.prompt, titulo: b.titulo, imagenUrl: b.imagenUrl,
      formato: b.formato === "vertical" ? "vertical" : "placa",
      herramienta: b.herramienta === "magnific" ? "magnific" : "auto",
      origen: b.origen === "claude" ? "claude" : "panel",
    });
    const resultado = await Promise.race([
      trabajo,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ESPERA_RESPUESTA_MS)),
    ]);
    if (resultado == null) {
      trabajo.catch((e) => console.warn("[contenido] generación libre falló:", e instanceof Error ? e.message : e));
      return res.status(202).json({
        ok: true, enCurso: true,
        mensaje: "Sigue generándose (tarda más de lo que aguanta la conexión). Va a aparecer en Contenido generado con su link de Drive.",
      });
    }
    res.status(resultado.ok ? 200 : 502).json(resultado);
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
      const { analisisCompetencia, estadoCompetencia } = await import("../services/competencia-ig.js");
      const [analisis, sinClasificar, comp, estado] = await Promise.all([
        analisisContenido(db, dias, req.query.fresco === "1"),
        pendientesDeClasificar(db),
        analisisCompetencia(db, req.query.fresco === "1"),
        estadoCompetencia(db),
      ]);
      // La competencia va aparte: nunca en el mismo ranking que lo propio.
      res.json({
        ...analisis,
        sinClasificar,
        competencia: { cuentas: comp.cuentas, publicaciones: comp.publicaciones, nichos: comp.nichos, reutilizar: comp.reutilizar.slice(0, 30), estado },
      });
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

