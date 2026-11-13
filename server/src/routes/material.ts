// LMTM-OS: descarga del material de Drive de un cliente con link firmado (21/10).
//
// GET /api/public/material/:fileId?t=<token>
// El token lo firma la guía de contenido (services/guia-contenido.ts), es de UN
// cliente y vence en 24 h. Solo baja archivos de ese cliente: los del índice de
// Drive, su logo y las fotos de su catálogo. Sin sesión, para que funcione con
// `curl` desde Claude Code y como imagen de partida en las herramientas de IA.
// Pasa el header Range a Drive: los videos se pueden adelantar y retomar.

import { Readable } from "node:stream";
import { Router } from "express";
import type { Db } from "@paperclipai/db";

export function materialRoutes(db: Db): Router {
  const router = Router();

  router.get("/material/:fileId", async (req, res) => {
    try {
      const { verificarAcceso, archivoDelCliente } = await import("../services/guia-contenido.js");
      const clientId = verificarAcceso(String(req.query.t ?? ""));
      if (!clientId) return res.status(403).json({ error: "Link vencido o inválido: pedí la guía de contenido de nuevo." });
      const fileId = req.params.fileId;
      if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId) || !(await archivoDelCliente(db, clientId, fileId))) {
        return res.status(404).json({ error: "Ese archivo no es de este cliente." });
      }

      const { drive, token } = await import("../services/contenido-drive.js");
      const meta = await drive<{ name: string; mimeType: string }>(`files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`);
      // Documentos de Google: se bajan como PDF.
      const google = meta.mimeType.startsWith("application/vnd.google-apps.");
      const url = google
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
      const headers: Record<string, string> = { Authorization: `Bearer ${await token()}` };
      if (!google && typeof req.headers.range === "string") headers.Range = req.headers.range;
      const r = await fetch(url, { headers });
      if (!r.ok || !r.body) return res.status(r.status === 416 ? 416 : 502).json({ error: `Drive respondió ${r.status}` });

      res.status(r.status);
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const v = r.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      const nombre = google ? `${meta.name}.pdf` : meta.name;
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Robots-Tag", "noindex");
      Readable.fromWeb(r.body as never).pipe(res);
    } catch (e) {
      if (!res.headersSent) res.status(502).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  });

  // GET /api/public/archivo?t=<token>: un archivo generado en el servidor (video_link, 6 h),
  // para bajarlo desde una PC del equipo con curl (13/11).
  router.get("/archivo", async (req, res) => {
    const { verificarLinkArchivo } = await import("../services/nas.js");
    const { rutaSegura } = await import("../services/video-agente.js");
    const firmada = verificarLinkArchivo(String(req.query.t ?? ""));
    const ruta = firmada ? rutaSegura(firmada) : null;
    if (!ruta || ruta !== firmada) return res.status(403).json({ error: "Link vencido o inválido: pedí otro con lmtmVideoLink." });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    res.download(ruta, (e) => {
      if (e && !res.headersSent) res.status(404).json({ error: "El archivo ya no está en el servidor (un deploy lo borra): pedilo de nuevo." });
    });
  });

  // GET /api/public/nas?t=<token>: un archivo del NAS con link firmado (nas_link, 6 h).
  router.get("/nas", async (req, res) => {
    try {
      const nas = await import("../services/nas.js");
      const ruta = nas.verificarLinkNas(String(req.query.t ?? ""));
      if (!ruta) return res.status(403).json({ error: "Link vencido o inválido: pedí otro con lmtmNasLink." });
      const r = await nas.abrirNas(ruta, typeof req.headers.range === "string" ? req.headers.range : undefined);
      if (r.statusCode !== 200 && r.statusCode !== 206) {
        r.resume();
        return res.status(r.statusCode === 416 ? 416 : r.statusCode === 404 ? 404 : 502).json({ error: `el NAS respondió ${r.statusCode}` });
      }
      res.status(r.statusCode);
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const v = r.headers[h];
        if (v) res.setHeader(h, v);
      }
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(ruta.split("/").pop() || "archivo")}`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Robots-Tag", "noindex");
      res.on("close", () => r.destroy());
      r.pipe(res);
    } catch (e) {
      if (!res.headersSent) res.status(502).json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  });

  return router;
}
