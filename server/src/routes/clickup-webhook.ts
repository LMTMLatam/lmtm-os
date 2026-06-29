// LMTM-OS: ClickUp webhook receiver for client auto-provisioning.
//
// ClickUp posts here on folderCreated / folderDeleted in the "Clientes" space.
// Requests are authenticated by HMAC-SHA256 over the raw body using the secret
// ClickUp returned when the webhook was created (CLICKUP_WEBHOOK_SECRET). We ACK
// fast (ClickUp retries non-2xx) and do the provisioning work after responding.
//
// Mounted unauthenticated at /api/clickup (HMAC is the auth). See
// services/clickup-provisioning.ts for what provisioning does.

import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import type { Db } from "@paperclipai/db";
import {
  CLIENTES_SPACE_ID,
  deprovisionClientFromClickUp,
  provisionClientFromClickUp,
} from "../services/clickup-provisioning.js";

const CU_API = "https://api.clickup.com/api/v2";

function verifySignature(req: Request): boolean {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = req.header("x-signature") ?? "";
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

async function fetchFolder(folderId: string): Promise<{ name: string; spaceId: string } | null> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`${CU_API}/folder/${folderId}`, { headers: { Authorization: token } });
    if (!r.ok) return null;
    const j = (await r.json()) as { name?: string; space?: { id?: string } };
    return { name: j.name ?? "", spaceId: j.space?.id ?? "" };
  } catch {
    return null;
  }
}

export function clickupWebhookRoutes(db: Db): Router {
  const router = Router();

  router.post("/webhook", async (req: Request, res: Response) => {
    if (!verifySignature(req)) {
      return res.status(401).json({ error: "bad signature" });
    }
    const body = (req.body ?? {}) as { event?: string; folder_id?: string };
    // ACK immediately so ClickUp doesn't retry; do the work afterwards.
    res.json({ ok: true });

    void (async () => {
      try {
        if (body.event === "folderCreated" && body.folder_id) {
          const f = await fetchFolder(body.folder_id);
          if (!f || f.spaceId !== CLIENTES_SPACE_ID) return; // only client folders
          const r = await provisionClientFromClickUp(db, { folderId: body.folder_id, folderName: f.name });
          console.log(`[clickup-webhook] provisioned "${f.name}": ${JSON.stringify(r)}`);
        } else if (body.event === "folderDeleted" && body.folder_id) {
          const r = await deprovisionClientFromClickUp(db, { folderId: body.folder_id });
          console.log(`[clickup-webhook] deprovisioned folder ${body.folder_id}: ${JSON.stringify(r)}`);
        }
      } catch (e) {
        console.warn("[clickup-webhook] handler error:", e);
      }
    })();
  });

  // Lightweight status (no secrets) to confirm the route is mounted + configured.
  router.get("/webhook", (_req, res) =>
    res.json({ ok: true, configured: Boolean(process.env.CLICKUP_WEBHOOK_SECRET) }),
  );

  return router;
}
