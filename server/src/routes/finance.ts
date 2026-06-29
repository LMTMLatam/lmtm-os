// LMTM-OS: business finance routes (income & expenses).
// Company-scoped under /companies/:companyId/finance, matching the rest of the
// company routes. CRUD over finance_entries + a summary for the Gastos/Ingresos
// panel.

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { financeEntriesService, type FinanceType } from "../services/finance-entries.js";

const p = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));

export function financeRoutes(db: Db): Router {
  const router = Router();
  const svc = financeEntriesService(db);

  router.get("/companies/:companyId/finance/entries", async (req: Request, res: Response) => {
    const rows = await svc.list(p(req.params.companyId), {
      type: req.query.type as FinanceType | undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      clientId: typeof req.query.clientId === "string" ? req.query.clientId : undefined,
      since: typeof req.query.since === "string" ? req.query.since : undefined,
      until: typeof req.query.until === "string" ? req.query.until : undefined,
    });
    res.json({ entries: rows });
  });

  router.get("/companies/:companyId/finance/summary", async (req: Request, res: Response) => {
    res.json(
      await svc.summary(p(req.params.companyId), {
        since: typeof req.query.since === "string" ? req.query.since : undefined,
        until: typeof req.query.until === "string" ? req.query.until : undefined,
      }),
    );
  });

  router.post("/companies/:companyId/finance/entries", async (req: Request, res: Response) => {
    const b = req.body ?? {};
    if (!b.type || b.amountCents == null) return res.status(400).json({ error: "type and amountCents required" });
    const row = await svc.create(p(req.params.companyId), b);
    res.status(201).json(row);
  });

  router.put("/companies/:companyId/finance/entries/:id", async (req: Request, res: Response) => {
    const row = await svc.update(p(req.params.id), req.body ?? {});
    if (!row) return res.status(404).json({ error: "not found" });
    res.json(row);
  });

  router.delete("/companies/:companyId/finance/entries/:id", async (req: Request, res: Response) => {
    res.json(await svc.remove(p(req.params.id)));
  });

  return router;
}
