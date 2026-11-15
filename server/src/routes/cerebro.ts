// LMTM-OS: el cerebro por HTTP (plan 15/11, fase 1). Solo lectura, para
// cualquier miembro y para los agentes (lo usan por el conector y el MCP).

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { actividad, cliente, empresa, resolverCliente } from "../services/cerebro.js";
import { assertBoard, assertMiembro } from "./authz.js";

export function cerebroRoutes(db: Db): Router {
  const router = Router();
  router.use("/cerebro", (req, _res, next) => { if (req.actor.type !== "agent") assertMiembro(req); next(); });

  // GET /api/biblioteca?cliente=&tipo=&dias=&veredicto= — todo lo producido (fase 5): piezas, copys,
  // informes, specs e investigaciones, con su control y veredicto. Los «planes» no entran (D7).
  router.get("/biblioteca", async (req, res) => {
    assertMiembro(req);
    const { sql } = await import("drizzle-orm");
    let clientId: string | null = null;
    if (req.query.cliente) {
      const r = await resolverCliente(db, String(req.query.cliente));
      if ("error" in r) return res.status(404).json(r);
      clientId = r.id;
    }
    const dias = Math.min(365, Math.max(1, Number(req.query.dias) || 30));
    const tipo = typeof req.query.tipo === "string" && /^[a-z_]+$/.test(req.query.tipo) ? req.query.tipo : null;
    const veredicto = req.query.veredicto === "sirve" ? "true" : req.query.veredicto === "no" ? "false" : req.query.veredicto === "sin" ? "sin" : null;
    const r = await db.execute(sql`
      select d.id, d.kind, d.title, d.url, d.created_at, d.metadata->'links' links, d.metadata->>'via' via,
        d.metadata->'revision' revision, d.metadata->'veredicto' veredicto, left(d.content, 400) resumen,
        c.name cliente, d.client_id, a.name agente
      from agent_deliverables d left join clients c on c.id = d.client_id left join agents a on a.id = d.agent_id
      where d.created_at > now() - make_interval(days => ${dias}) and d.kind not in ('plan', 'descartado')
        ${clientId ? sql`and d.client_id = ${clientId}` : sql``}
        ${tipo ? sql`and d.kind = ${tipo}` : sql``}
        ${veredicto === "sin" ? sql`and d.metadata->'veredicto' is null and d.kind in ('placa','video','imagen')` : veredicto ? sql`and d.metadata->'veredicto'->>'sirve' = ${veredicto}` : sql``}
      order by d.created_at desc limit 300`);
    const filas = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
    const tipos = await db.execute(sql`select kind, count(*)::int n from agent_deliverables where created_at > now() - make_interval(days => ${dias}) and kind not in ('plan','descartado') ${clientId ? sql`and client_id = ${clientId}` : sql``} group by 1 order by 2 desc`);
    res.json({ dias, piezas: filas, porTipo: Array.isArray(tipos) ? tipos : ((tipos as { rows?: unknown[] }).rows ?? []) });
  });

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

  // GET /api/cerebro/medicion — medición continua del plan 15/11: lo que dice si el sistema mejora
  // o si algo se secó en silencio (tablas que deberían llenarse y siguen en cero).
  router.get("/cerebro/medicion", async (req, res) => {
    assertMiembro(req);
    const { sql } = await import("drizzle-orm");
    const r = await db.execute(sql`select
      (select count(*) from agent_deliverables where created_at > now() - interval '7 days' and kind in ('placa','video','imagen')) piezas7,
      (select count(*) from agent_deliverables where created_at > now() - interval '30 days' and kind in ('placa','video','imagen') and metadata ? 'revision') con_control30,
      (select count(*) from agent_deliverables where created_at > now() - interval '30 days' and kind in ('placa','video','imagen')) piezas30,
      (select count(*) from agent_deliverables where metadata->'veredicto'->>'sirve' = 'true') sirvio,
      (select count(*) from agent_deliverables where metadata->'veredicto'->>'sirve' = 'false') no_sirvio,
      (select count(*) from heartbeat_runs where created_at > now() - interval '7 days') corridas7,
      (select count(*) from heartbeat_runs where created_at > now() - interval '7 days' and status = 'succeeded') bien7,
      (select count(*) from issues where status = 'blocked') bloqueadas,
      (select count(*) from video_plantillas) video_plantillas,
      (select count(*) from video_virales) video_virales,
      (select count(*) from pieza_metricas) pieza_metricas,
      (select count(*) from client_context_cache where source = 'nas-indice') nas_clientes,
      (select max(fetched_at) from client_context_cache where source = 'nas-indice') nas_al`);
    const [m] = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Array<Record<string, unknown>>;
    const n = (k: string) => Number(m?.[k] ?? 0);
    const secas = ["video_plantillas", "video_virales", "pieza_metricas"].filter((k) => n(k) === 0);
    res.json({
      piezasSemana: n("piezas7"),
      controlGuardado30d: n("piezas30") ? Math.round((100 * n("con_control30")) / n("piezas30")) : null,
      veredictos: { sirvio: n("sirvio"), noSirvio: n("no_sirvio") },
      corridasSemana: { total: n("corridas7"), bien: n("bien7") },
      tareasBloqueadas: n("bloqueadas"),
      nas: { clientes: n("nas_clientes"), actualizado: m?.nas_al ?? null },
      tablasSecas: secas,
    });
  });

  // GET /api/publicacion/trabadas — posts que Make no pudo publicar, con la causa (fase 5).
  router.get("/publicacion/trabadas", async (req, res) => {
    assertMiembro(req);
    const { publicacionesTrabadas } = await import("../services/publicacion-trabada.js");
    res.json(await publicacionesTrabadas(db, Math.min(30, Math.max(1, Number(req.query.dias) || 14))));
  });

  // POST /api/publicacion/reprocesar { dlqId } — lo decide una persona: publica en la cuenta del cliente.
  router.post("/publicacion/reprocesar", async (req, res) => {
    assertBoard(req);
    const dlqId = String(req.body?.dlqId ?? "");
    const { reprocesarTrabada } = await import("../services/publicacion-trabada.js");
    const r = await reprocesarTrabada(dlqId);
    if (r.ok) {
      const { activityLog, companies } = await import("@paperclipai/db");
      const [emp] = await db.select({ id: companies.id }).from(companies).limit(1);
      if (emp) await db.insert(activityLog).values({ companyId: emp.id, actorType: "user", actorId: req.actor.userId ?? "panel", action: "publicacion.reprocesar", entityType: "make_dlq", entityId: dlqId, details: { dlqId } }).catch(() => undefined);
    }
    res.status(r.ok ? 200 : 502).json(r);
  });

  return router;
}
