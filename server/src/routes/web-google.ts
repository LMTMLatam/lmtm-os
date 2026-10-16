// LMTM-OS: Search Console y Analytics en el panel. Ver services/google-web.ts.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { clients, googleWebConexiones, webPropiedades } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { assertBoard, assertMiembro, getActorInfo } from "./authz.js";
import { inventario, rendimientoWeb, sincronizarWeb } from "../services/google-web.js";

async function resolver(db: Db, idOrSlug: string) {
  const porId = /^[0-9a-f-]{36}$/i.test(idOrSlug) ? await db.select().from(clients).where(eq(clients.id, idOrSlug)) : [];
  if (porId[0]) return porId[0];
  const [porSlug] = await db.select().from(clients).where(eq(clients.slug, idOrSlug));
  return porSlug ?? null;
}

export function webGoogleRoutes(db: Db): Router {
  const router = Router();
  // Sin sesión, nada.
  router.use(["/web","/clients/:idOrSlug/web","/clients/:idOrSlug/web-propiedades"], (req, _res, next) => { assertMiembro(req); next(); });

  // GET /api/web/estado — las cuentas conectadas (sin tokens) y qué tiene cada cliente.
  router.get("/web/estado", async (_req, res) => {
    const [conexiones, props, lista] = await Promise.all([
      db.select({ id: googleWebConexiones.id, email: googleWebConexiones.email, estado: googleWebConexiones.estado, ultimoError: googleWebConexiones.ultimoError, updatedAt: googleWebConexiones.updatedAt })
        .from(googleWebConexiones),
      db.select().from(webPropiedades),
      db.select({ id: clients.id, name: clients.name, slug: clients.slug, web: clients.websiteUrl }).from(clients).where(eq(clients.status, "active")),
    ]);
    const de = new Map(props.map((p) => [p.clientId, p]));
    const clientes = lista.map((c) => {
      const p = de.get(c.id);
      return {
        clientId: c.id, nombre: c.name.trim(), slug: c.slug, web: c.web,
        gscSitio: p?.gscSitio ?? null, ga4Propiedad: p?.ga4Propiedad ?? null, ga4Nombre: p?.ga4Nombre ?? null,
        elegidaPorPersona: !!p?.fijadaPor, sincronizadoAt: p?.sincronizadoAt ?? null, error: p?.ultimoError ?? null,
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
    res.json({
      conexiones,
      resumen: {
        clientes: clientes.length,
        conWeb: clientes.filter((c) => c.web).length,
        conSearchConsole: clientes.filter((c) => c.gscSitio).length,
        conAnalytics: clientes.filter((c) => c.ga4Propiedad).length,
      },
      clientes,
    });
  });

  // GET /api/web/inventario — sitios y propiedades que ven las cuentas conectadas (para elegir a mano).
  router.get("/web/inventario", async (req, res) => {
    const inv = await inventario(db, req.query.fresco === "1");
    res.json({
      sitios: inv.sitios.filter((s) => s.permiso !== "siteUnverifiedUser").map((s) => s.sitio).sort(),
      propiedades: inv.propiedades.map((p) => ({ id: p.propiedad, nombre: p.nombre, cuenta: p.cuenta, webs: p.hosts }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      errores: inv.errores,
    });
  });

  // GET /api/clients/:idOrSlug/web — rendimiento de la web (28 días vs los 28 anteriores).
  router.get("/clients/:idOrSlug/web", async (req, res) => {
    const c = await resolver(db, req.params.idOrSlug);
    if (!c) return res.status(404).json({ error: "Cliente no encontrado" });
    const dias = Math.min(90, Math.max(7, Number(req.query.dias) || 28));
    res.json(await rendimientoWeb(db, c.id, dias));
  });

  // PUT /api/clients/:idOrSlug/web-propiedades — una persona elige el sitio y la propiedad.
  // { automatico: true } devuelve la elección al sistema.
  router.put("/clients/:idOrSlug/web-propiedades", async (req, res) => {
    assertBoard(req);
    const c = await resolver(db, req.params.idOrSlug);
    if (!c) return res.status(404).json({ error: "Cliente no encontrado" });
    const b = (req.body ?? {}) as { gscSitio?: string | null; ga4Propiedad?: string | null; automatico?: boolean };
    if (b.automatico) {
      await db.update(webPropiedades).set({ fijadaPor: null, updatedAt: new Date() }).where(eq(webPropiedades.clientId, c.id));
    } else {
      const inv = await inventario(db);
      const gscSitio = b.gscSitio?.trim() || null;
      const ga4Propiedad = b.ga4Propiedad?.trim() || null;
      if (gscSitio && !inv.sitios.some((s) => s.sitio === gscSitio)) return res.status(400).json({ error: "Ese sitio no lo ve ninguna cuenta conectada." });
      const prop = ga4Propiedad ? inv.propiedades.find((p) => p.propiedad === ga4Propiedad) : null;
      if (ga4Propiedad && !prop) return res.status(400).json({ error: "Esa propiedad no la ve ninguna cuenta conectada." });
      const a = getActorInfo(req);
      const autor = `${a.actorType === "agent" ? "agente" : "panel"}:${a.actorId ?? "?"}`.slice(0, 120);
      const valores = { gscSitio, ga4Propiedad, ga4Nombre: prop?.nombre ?? null, fijadaPor: autor, ultimoError: null, updatedAt: new Date() };
      await db.insert(webPropiedades).values({ clientId: c.id, ...valores })
        .onConflictDoUpdate({ target: webPropiedades.clientId, set: valores });
    }
    const r = await sincronizarWeb(db, { clientId: c.id });
    res.json({ ok: true, error: r.errores[0]?.error ?? null, web: await rendimientoWeb(db, c.id) });
  });

  // POST /api/web/sincronizar — { clientId } espera; sin clientId corre en segundo plano.
  router.post("/web/sincronizar", async (req, res) => {
    assertBoard(req);
    const clientId = typeof req.body?.clientId === "string" ? req.body.clientId : undefined;
    if (clientId) return res.json(await sincronizarWeb(db, { clientId }));
    void sincronizarWeb(db).catch((e) => console.warn("[web-google] sincronización manual falló:", e instanceof Error ? e.message : e));
    res.status(202).json({ ok: true });
  });

  // DELETE /api/web/conexiones/:id — saca la cuenta y le devuelve el permiso a Google.
  router.delete("/web/conexiones/:id", async (req, res) => {
    assertBoard(req);
    const [c] = await db.delete(googleWebConexiones).where(eq(googleWebConexiones.id, req.params.id)).returning();
    if (!c) return res.status(404).json({ error: "No existe" });
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    res.status(204).end();
  });

  return router;
}
