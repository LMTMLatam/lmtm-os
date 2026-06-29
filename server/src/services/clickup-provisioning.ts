// LMTM-OS: auto-provision / deprovision clients from ClickUp.
//
// In ClickUp, each client is a FOLDER inside the "Clientes" space
// (90131985551). When a folder is created there, this provisions the client's
// content-pipeline scaffolding: it copies the per-pipeline planning Sheet
// template into the right Drive folder, ensures an LMTM client record exists,
// and files a task for the pipeline agent to finish the Apps Script + Make
// scenario (the parts that need judgment). When a folder is deleted, it
// archives the client (never hard-deletes the Sheet — that's reversible via
// Drive trash) and deactivates the LMTM client.
//
// Triggered by the ClickUp webhook (routes/clickup-webhook.ts).

import type { Db } from "@paperclipai/db";
import { clients, companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { driveCopy } from "@paperclipai/mcp-google";
import { createClientTask } from "./client-tasks.js";

export const CLIENTES_SPACE_ID = "90131985551";

// Real Drive IDs (see skill lmtm-pipeline + memory lmtm-os-pipeline-integraciones).
const REDES = {
  template: "1D21iXNcBYxez0Mpd4B4BR6aZlVgoERSTyRbMAWJUXRY", // "Plantilla _Cronopost"
  folder: "15ZkCu9M2MTi-f3YPTbC1ttNv0DbBcnVQ", // "Redes -> Click Up"
  scripts: "1nbhnzZYjeKdlrIGWYBPLyFTFUC16r5pk",
};

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function defaultCompanyId(db: Db): Promise<string | null> {
  const [c] = await db.select({ id: companies.id }).from(companies).limit(1);
  return c?.id ?? null;
}

export interface ProvisionResult {
  client: { id: string; slug: string; name: string; created: boolean } | null;
  redesSheet: { id: string; url: string | null } | null;
  errors: string[];
}

/** Provision a brand-new client folder coming from ClickUp. Idempotent on slug. */
export async function provisionClientFromClickUp(
  db: Db,
  input: { folderId: string; folderName: string },
): Promise<ProvisionResult> {
  const name = (input.folderName ?? "").trim();
  const out: ProvisionResult = { client: null, redesSheet: null, errors: [] };
  if (!name) {
    out.errors.push("folderName vacío");
    return out;
  }
  const year = new Date().getFullYear();
  const slug = slugify(name);

  // 1. Copy the Redes (Cronopost) Sheet template into the Redes folder.
  let sheetId: string | null = null;
  try {
    const copy = (await driveCopy({
      fileId: REDES.template,
      name: `${name} ${year}`,
      parentFolderId: REDES.folder,
    })) as { id?: string; webViewLink?: string };
    if (copy?.id) {
      sheetId = copy.id;
      out.redesSheet = { id: copy.id, url: copy.webViewLink ?? null };
    } else {
      out.errors.push("drive_copy no devolvió id");
    }
  } catch (e) {
    out.errors.push(`sheet redes: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Ensure an LMTM client record (so it shows in the panel with all sections).
  let clientId: string;
  const [existing] = await db.select().from(clients).where(eq(clients.slug, slug)).limit(1);
  if (existing) {
    clientId = existing.id;
    out.client = { id: existing.id, slug: existing.slug, name: existing.name, created: false };
    // Backfill the planilla link if we just created the sheet and it had none.
    if (sheetId && !existing.planillaExternalId) {
      await db
        .update(clients)
        .set({ planillaSource: "google_sheets", planillaExternalId: sheetId, updatedAt: new Date() })
        .where(eq(clients.id, existing.id));
    }
  } else {
    const [row] = await db
      .insert(clients)
      .values({
        slug,
        name,
        status: "active",
        tier: "standard",
        currency: "ARS",
        monthlyRetainerCents: 0,
        crmExternalId: input.folderId,
        planillaSource: sheetId ? "google_sheets" : null,
        planillaExternalId: sheetId,
      } as never)
      .returning();
    clientId = (row as { id: string }).id;
    out.client = { id: clientId, slug, name, created: true };
  }

  // 3. File a task for the pipeline agent to finish script + Make wiring.
  try {
    const fallbackCompanyId = (await defaultCompanyId(db)) ?? undefined;
    await createClientTask(db, {
      clientId,
      title: `Onboarding ${name}: Apps Script + scenario Make`,
      description:
        `Cliente nuevo detectado en ClickUp (folder ${input.folderId}).\n` +
        `• Sheet de Redes: ${out.redesSheet?.url ?? "⚠️ no se pudo crear, revisar"}\n` +
        `Falta para completar el pipeline (ver skill lmtm-pipeline):\n` +
        `1) Crear el Apps Script en la carpeta de scripts (${REDES.scripts}) apuntando al sheetId ${sheetId ?? "(sheet pendiente)"} y al folder de ClickUp ${input.folderId}.\n` +
        `2) Clonar el scenario "AutoPoster: Plantilla Clientes" en Make para este cliente y activarlo.\n` +
        `3) Probar una fila de punta a punta y guardar los IDs en el brain del cliente.`,
      taskType: "internal",
      priority: "high",
      source: "clickup-webhook",
      fallbackCompanyId,
    });
  } catch (e) {
    out.errors.push(`tarea onboarding: ${e instanceof Error ? e.message : String(e)}`);
  }

  return out;
}

export interface DeprovisionResult {
  client: { id: string; slug: string; name: string } | null;
  deactivated: boolean;
  note: string;
}

/** Deactivate a client whose ClickUp folder was deleted. Reversible by design. */
export async function deprovisionClientFromClickUp(
  db: Db,
  input: { folderId: string; folderName?: string },
): Promise<DeprovisionResult> {
  // Prefer matching by the stored ClickUp folder id; fall back to slug by name.
  let row =
    (await db.select().from(clients).where(eq(clients.crmExternalId, input.folderId)).limit(1))[0] ?? null;
  if (!row && input.folderName) {
    row = (await db.select().from(clients).where(eq(clients.slug, slugify(input.folderName))).limit(1))[0] ?? null;
  }
  if (!row) {
    return { client: null, deactivated: false, note: "no se encontró cliente LMTM para ese folder" };
  }
  await db
    .update(clients)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(clients.id, row.id));
  // We intentionally do NOT delete the Drive Sheet/Script or the Make scenario:
  // they hold history and are trivially restorable. The team can purge manually.
  return {
    client: { id: row.id, slug: row.slug, name: row.name },
    deactivated: true,
    note: "cliente archivado; Sheet/Script/Make se conservan (baja reversible)",
  };
}
