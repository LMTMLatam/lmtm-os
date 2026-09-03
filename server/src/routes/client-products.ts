// LMTM-OS: sección Productos del cliente + avatar de marca (pedido 14/8).
//
// El equipo carga acá nombre y foto de cada producto, y el avatar de la marca.
// Es la referencia que los agentes usan para generar placas, carruseles y
// videos: sin esto el modelo inventa el producto.
//
// Las imágenes se suben a Drive (super redes/<cliente>/PRODUCTOS) y acá queda
// el link — la DB no guarda binarios.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { clientBrand, clientProducts, clients } from "@paperclipai/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { subirImagenDeReferencia } from "../services/contenido-drive.js";

async function resolverCliente(db: Db, idOrSlug: string) {
  const [porId] = /^[0-9a-f-]{36}$/i.test(idOrSlug)
    ? await db.select().from(clients).where(eq(clients.id, idOrSlug))
    : [];
  if (porId) return porId;
  const [porSlug] = await db.select().from(clients).where(eq(clients.slug, idOrSlug));
  return porSlug ?? null;
}

export function clientProductRoutes(db: Db): Router {
  const router = Router();

  // GET /api/clients/:idOrSlug/productos
  router.get("/clients/:idOrSlug/productos", async (req, res) => {
    try {
      const c = await resolverCliente(db, req.params.idOrSlug);
      if (!c) return res.status(404).json({ error: "cliente no encontrado" });
      const productos = await db.select().from(clientProducts)
        .where(eq(clientProducts.clientId, c.id))
        .orderBy(asc(clientProducts.position), asc(clientProducts.createdAt));
      // La marca viaja con los productos: el equipo abre UNA pestaña y ve todo
      // lo que define al cliente, en vez de saltar entre secciones (18/8).
      const [marca] = await db.select().from(clientBrand).where(eq(clientBrand.clientId, c.id));
      res.json({
        client: { id: c.id, slug: c.slug, name: c.name, avatarUrl: c.avatarUrl ?? null, industry: c.industry ?? null },
        productos,
        marca: marca ?? null,
      });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // POST /api/clients/:idOrSlug/productos  { name, description?, imageBase64?, imageUrl? }
  // imageBase64 = data URI o base64 pelado; se sube a Drive y se guarda el link.
  router.post("/clients/:idOrSlug/productos", async (req, res) => {
    try {
      const c = await resolverCliente(db, req.params.idOrSlug);
      if (!c) return res.status(404).json({ error: "cliente no encontrado" });
      const { name, description, imageBase64, imageUrl, fileName } = (req.body ?? {}) as {
        name?: string; description?: string; imageBase64?: string; imageUrl?: string; fileName?: string;
      };
      if (!name || !name.trim()) return res.status(400).json({ error: "falta el nombre del producto" });

      let url = imageUrl ?? null;
      let driveId: string | null = null;
      if (imageBase64) {
        const sub = await subirImagenDeReferencia(db, {
          clientId: c.id, clienteNombre: c.name,
          base64: imageBase64, nombreArchivo: fileName ?? `${name.trim()}.png`,
        });
        url = sub.link; driveId = sub.id;
      }
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${clientProducts.position}), -1)::int` })
        .from(clientProducts).where(eq(clientProducts.clientId, c.id));
      const [creado] = await db.insert(clientProducts).values({
        clientId: c.id, name: name.trim(), description: description?.trim() || null,
        imageUrl: url, driveFileId: driveId, position: (max ?? -1) + 1,
      }).returning();
      res.status(201).json({ producto: creado });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // PATCH /api/productos/:id  { name?, description?, active?, position? }
  router.patch("/productos/:id", async (req, res) => {
    try {
      const { name, description, active, position } = (req.body ?? {}) as {
        name?: string; description?: string; active?: boolean; position?: number;
      };
      const cambios: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof name === "string" && name.trim()) cambios.name = name.trim();
      if (typeof description === "string") cambios.description = description.trim() || null;
      if (typeof active === "boolean") cambios.active = active;
      if (typeof position === "number") cambios.position = position;
      const [act] = await db.update(clientProducts).set(cambios)
        .where(eq(clientProducts.id, req.params.id)).returning();
      if (!act) return res.status(404).json({ error: "producto no encontrado" });
      res.json({ producto: act });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // DELETE /api/productos/:id
  router.delete("/productos/:id", async (req, res) => {
    try {
      const [borrado] = await db.delete(clientProducts)
        .where(eq(clientProducts.id, req.params.id)).returning({ id: clientProducts.id });
      if (!borrado) return res.status(404).json({ error: "producto no encontrado" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // PUT /api/clients/:idOrSlug/avatar  { imageBase64 | imageUrl, fileName? }
  router.put("/clients/:idOrSlug/avatar", async (req, res) => {
    try {
      const c = await resolverCliente(db, req.params.idOrSlug);
      if (!c) return res.status(404).json({ error: "cliente no encontrado" });
      const { imageBase64, imageUrl, fileName } = (req.body ?? {}) as {
        imageBase64?: string; imageUrl?: string; fileName?: string;
      };
      let url = imageUrl ?? null;
      if (imageBase64) {
        const sub = await subirImagenDeReferencia(db, {
          clientId: c.id, clienteNombre: c.name,
          base64: imageBase64, nombreArchivo: fileName ?? `avatar-${c.slug}.png`,
        });
        url = sub.link;
      }
      if (!url) return res.status(400).json({ error: "falta imageBase64 o imageUrl" });
      await db.update(clients).set({ avatarUrl: url }).where(eq(clients.id, c.id));
      res.json({ ok: true, avatarUrl: url });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // DELETE /api/clients/:idOrSlug/avatar
  router.delete("/clients/:idOrSlug/avatar", async (req, res) => {
    try {
      const c = await resolverCliente(db, req.params.idOrSlug);
      if (!c) return res.status(404).json({ error: "cliente no encontrado" });
      await db.update(clients).set({ avatarUrl: null }).where(eq(clients.id, c.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // GET /api/drive-img/:fileId — proxy de imágenes de Drive.
  // Las fotos de producto NO se hacen públicas; el panel las pide por acá y el
  // servidor las baja con su token. Solo sirve ids que estén referenciados por
  // un producto o un avatar: si no, sería un proxy abierto a todo el Drive.
  router.get("/drive-img/:fileId", async (req, res) => {
    try {
      const fileId = req.params.fileId;
      const [prod] = await db.select({ id: clientProducts.id }).from(clientProducts)
        .where(eq(clientProducts.driveFileId, fileId)).limit(1);
      let permitido = !!prod;
      if (!permitido) {
        const [av] = await db.select({ id: clients.id }).from(clients)
          .where(sql`${clients.avatarUrl} like ${"%" + fileId + "%"}`).limit(1);
        permitido = !!av;
      }
      if (!permitido) return res.status(404).json({ error: "no encontrado" });
      const { bajarDeDrive } = await import("../services/contenido-drive.js");
      const { bytes, mime } = await bajarDeDrive(fileId);
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(bytes);
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  });

  // GET /api/productos/cobertura — qué clientes ya cargaron productos/avatar.
  router.get("/productos/cobertura", async (_req, res) => {
    try {
      const filas = await db.select({
        id: clients.id, name: clients.name, slug: clients.slug, avatarUrl: clients.avatarUrl,
        productos: sql<number>`count(${clientProducts.id})::int`,
      })
        .from(clients)
        .leftJoin(clientProducts, and(eq(clientProducts.clientId, clients.id), eq(clientProducts.active, true)))
        .where(eq(clients.status, "active"))
        .groupBy(clients.id, clients.name, clients.slug, clients.avatarUrl)
        .orderBy(asc(clients.name));
      res.json({
        clientes: filas,
        conProductos: filas.filter((f) => f.productos > 0).length,
        conAvatar: filas.filter((f) => f.avatarUrl).length,
        total: filas.length,
      });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  // PUT /api/clients/:idOrSlug/marca — identidad de marca (colores, tono,
  // mensaje, logo). Upsert: la fila se crea sola la primera vez que se guarda.
  router.put("/clients/:idOrSlug/marca", async (req, res) => {
    try {
      const c = await resolverCliente(db, req.params.idOrSlug);
      if (!c) return res.status(404).json({ error: "cliente no encontrado" });
      const b = (req.body ?? {}) as Record<string, unknown>;
      const lista = (v: unknown): string[] =>
        Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [];
      const texto = (v: unknown): string | null => {
        const t = typeof v === "string" ? v.trim() : "";
        return t ? t.slice(0, 2000) : null;
      };
      const valores = {
        logoUrl: texto(b.logoUrl),
        colores: lista(b.colores),
        tipografias: lista(b.tipografias),
        tono: texto(b.tono),
        palabrasSi: lista(b.palabrasSi),
        palabrasNo: lista(b.palabrasNo),
        mensaje: texto(b.mensaje),
        publico: texto(b.publico),
        diferencial: texto(b.diferencial),
        notas: texto(b.notas),
        updatedBy: typeof b.updatedBy === "string" ? b.updatedBy.slice(0, 120) : null,
        updatedAt: new Date(),
      };
      await db.insert(clientBrand).values({ clientId: c.id, ...valores })
        .onConflictDoUpdate({ target: clientBrand.clientId, set: valores });
      const [marca] = await db.select().from(clientBrand).where(eq(clientBrand.clientId, c.id));
      res.json({ ok: true, marca });
    } catch (e) {
      res.status(500).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  });

  return router;
}
