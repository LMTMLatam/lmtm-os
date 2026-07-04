// LMTM-OS: write actions against Meta Ads (the "agents act, not just propose"
// loop). Today the only supported action is PAUSE (campaign or ad set) — the
// safest high-value lever: stop an ad burning budget with zero conversions.
//
// Guards enforced in code (a prompt can't bypass them):
//  - the entity must belong to the given client (looked up in our synced
//    ads_campaigns / ads_adsets), so an agent can never touch another client's
//    account or a made-up id;
//  - PAUSE only (never resume/create/raise budget/delete via this path);
//  - the caller must pass approved=true (human sign-off), same pattern as the
//    CRM proxy.
// Every action is recorded as a proposal→outcome row so we can later measure
// whether the pause actually improved the client's numbers.

import type { Db } from "@paperclipai/db";
import { adsCampaigns, adsAdsets, adsConnections, agentActions } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface AdActionResult {
  ok: boolean;
  approvalRequired?: boolean;
  error?: string;
  entity?: { type: string; id: string; name: string | null; clientId: string };
}

export async function pauseAdEntity(
  db: Db,
  input: { clientId: string; entityType: "campaign" | "adset"; entityId: string; agentId?: string | null; approved?: boolean },
): Promise<AdActionResult> {
  const { clientId, entityType, entityId } = input;

  // 1) Ownership: the entity must be one we've synced for THIS client.
  const table = entityType === "campaign" ? adsCampaigns : adsAdsets;
  const [row] = await db.select({ id: table.id, name: table.name, connectionId: table.connectionId, clientId: table.clientId })
    .from(table).where(and(eq(table.id, entityId), eq(table.clientId, clientId))).limit(1);
  if (!row) return { ok: false, error: `No encontré ${entityType} ${entityId} para este cliente (o no está sincronizado). No se puede actuar sobre entidades ajenas o inexistentes.` };

  // 2) Human sign-off (same gate as CRM writes and every spend-affecting action).
  if (!input.approved) {
    return {
      ok: false, approvalRequired: true,
      entity: { type: entityType, id: entityId, name: row.name, clientId },
      error: `Pausar ${entityType} "${row.name}" MUEVE plata real. Proponé la pausa en el issue con la justificación (gasto sin conversiones, etc.) y esperá OK humano; recién ahí ejecutá con approved=true.`,
    };
  }

  // 3) Resolve the connection token and write status=PAUSED.
  if (!row.connectionId) return { ok: false, error: "La entidad no tiene conexión asociada (conexión borrada/reemplazada)." };
  const [conn] = await db.select({ accessToken: adsConnections.accessToken, platform: adsConnections.platform })
    .from(adsConnections).where(eq(adsConnections.id, row.connectionId)).limit(1);
  if (!conn?.accessToken) return { ok: false, error: "No hay token de la conexión." };
  if (conn.platform !== "meta") return { ok: false, error: `Solo soportado para Meta (esta conexión es ${conn.platform}).` };

  try {
    const r = await fetch(`${GRAPH}/${entityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: conn.accessToken }),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, error: `Meta rechazó la pausa (${r.status}): ${text.slice(0, 250)}` };

    // Record the action (proposal→outcome ledger).
    await db.insert(agentActions).values({
      clientId, agentId: input.agentId ?? null, kind: "pause_ad_entity",
      entityType, entityId, detail: { name: row.name },
    }).catch(() => {});

    return { ok: true, entity: { type: entityType, id: entityId, name: row.name, clientId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
