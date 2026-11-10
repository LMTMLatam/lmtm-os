// LMTM-OS: Contenido → «Tipos de video» (pedido 09/11). La grilla nicho × tipo,
// cada plantilla con sus virales, y la edición a mano: las personas agregan,
// cambian o borran reglas y aprueban. Ver services/video-tipos.ts.

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import type { ReglaDeVideo } from "@paperclipai/db";
import { assertMiembro, getActorInfo } from "./authz.js";
import { aprobarPlantilla, grilla, guardarPlantilla, guardarViral, plantillaDe } from "../services/video-tipos.js";

const quien = (req: Parameters<typeof getActorInfo>[0]) => {
  const a = getActorInfo(req);
  return `${a.actorType === "agent" ? "agente" : "panel"}:${a.actorId ?? "?"}`.slice(0, 120);
};
const error = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export function videoTiposRoutes(db: Db): Router {
  const router = Router();

  router.get("/video-tipos", async (req, res) => {
    assertMiembro(req);
    try { res.json(await grilla(db, typeof req.query.nicho === "string" ? req.query.nicho : null)); }
    catch (e) { res.status(500).json({ error: error(e) }); }
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
