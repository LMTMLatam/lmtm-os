// LMTM-OS: Producción → «Tipos de video» (pedido 09/11; sección propia 11/11). La grilla alcance × tipo,
// cada plantilla con sus virales, y la edición a mano: las personas agregan,
// cambian o borran reglas y aprueban. Ver services/video-tipos.ts.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { ReglaDeVideo } from "@paperclipai/db";
import { assertMiembro, getActorInfo } from "./authz.js";
import { aprobarPlantilla, crearTipo, grilla, guardarPlantilla, guardarViral, ocultarTipo, plantillaDe } from "../services/video-tipos.js";

const quien = (req: Parameters<typeof getActorInfo>[0]) => {
  const a = getActorInfo(req);
  return `${a.actorType === "agent" ? "agente" : "panel"}:${a.actorId ?? "?"}`.slice(0, 120);
};
const error = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export function videoTiposRoutes(db: Db): Router {
  const router = Router();

  router.get("/video-tipos", async (req, res) => {
    assertMiembro(req);
    const q = req.query.alcance ?? req.query.nicho;
    try { res.json(await grilla(db, typeof q === "string" && q ? q : null)); }
    catch (e) { res.status(500).json({ error: error(e) }); }
  });

  // Tipos propios: para todos, un rubro o un cliente. Solo personas.
  router.post("/video-tipos/tipos", async (req, res) => {
    assertMiembro(req);
    if (req.actor.type !== "board") return res.status(403).json({ error: "Solo una persona crea tipos de video desde el panel." });
    try {
      const b = (req.body ?? {}) as Record<string, string>;
      const r = await crearTipo(db, { nombre: b.nombre ?? "", descripcion: b.descripcion, alcance: b.alcance ?? "todos", autor: quien(req) });
      if (!r.ok) return res.status(400).json({ error: r.mensaje });
      res.json(r);
    } catch (e) { res.status(400).json({ error: error(e) }); }
  });

  router.post("/video-tipos/tipos/:slug/ocultar", async (req, res) => {
    assertMiembro(req);
    if (req.actor.type !== "board") return res.status(403).json({ error: "Solo una persona." });
    try {
      if (!(await ocultarTipo(db, req.params.slug))) return res.status(404).json({ error: "Ese tipo no existe o es de fábrica (los de fábrica no se ocultan)." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: error(e) }); }
  });

  router.get("/video-tipos/:nicho/:tipo", async (req, res) => {
    assertMiembro(req);
    try { res.json(await plantillaDe(db, req.params.nicho, req.params.tipo)); }
    catch (e) { res.status(500).json({ error: error(e) }); }
  });

  // Edición a mano desde el panel: contenido completo + reglas tal como quedan.
  router.post("/video-tipos/:nicho/:tipo", async (req, res) => {
    assertMiembro(req);
    if (req.actor.type !== "board") return res.status(403).json({ error: "Solo una persona edita desde el panel." });
    try {
      const b = (req.body ?? {}) as { contenido?: unknown; reglas?: ReglaDeVideo[]; motivo?: string };
      const autor = quien(req);
      const reglas = Array.isArray(b.reglas) ? b.reglas.map((r) => ({ ...r, autor: r.origen === "persona" ? (r.autor ?? autor) : r.autor })) : undefined;
      const r = await guardarPlantilla(db, { nicho: req.params.nicho, tipo: req.params.tipo, contenido: b.contenido ?? {}, reglas, autor, esPersona: true, motivo: b.motivo });
      if (!r.ok) return res.status(400).json({ error: r.mensaje });
      res.json(r);
    } catch (e) { res.status(500).json({ error: error(e) }); }
  });

  router.post("/video-tipos/:nicho/:tipo/aprobar", async (req, res) => {
    assertMiembro(req);
    if (req.actor.type !== "board") return res.status(403).json({ error: "Solo una persona aprueba." });
    try {
      const ok = await aprobarPlantilla(db, req.params.nicho, req.params.tipo, quien(req));
      if (!ok) return res.status(404).json({ error: "No hay plantilla para aprobar." });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: error(e) }); }
  });

  router.post("/video-tipos/virales", async (req, res) => {
    assertMiembro(req);
    try {
      const b = (req.body ?? {}) as Record<string, string>;
      const r = await guardarViral(db, { url: b.url ?? "", cuenta: b.cuenta, nicho: b.nicho ?? "", tipo: b.tipo ?? "", fuente: "equipo", autor: quien(req), gancho: b.gancho, notas: b.notas });
      if (!r.ok) return res.status(400).json({ error: r.mensaje });
      res.json(r);
    } catch (e) { res.status(500).json({ error: error(e) }); }
  });

  return router;
}
