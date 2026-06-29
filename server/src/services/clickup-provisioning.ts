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
import {
  driveCopy,
  driveMove,
  scriptCreate,
  scriptGetContent,
  scriptUpdateContent,
} from "@paperclipai/mcp-google";
import { createClientTask } from "./client-tasks.js";

export const CLIENTES_SPACE_ID = "90131985551";

// Real Drive IDs (see skill lmtm-pipeline + memory lmtm-os-pipeline-integraciones).
const REDES = {
  template: "1D21iXNcBYxez0Mpd4B4BR6aZlVgoERSTyRbMAWJUXRY", // "Plantilla _Cronopost"
  folder: "15ZkCu9M2MTi-f3YPTbC1ttNv0DbBcnVQ", // "Redes -> Click Up"
  scripts: "1nbhnzZYjeKdlrIGWYBPLyFTFUC16r5pk", // "scripts redes" folder
  scriptTemplate: "14H0_s9ozhWfqlA49_rWDbuwSj8udq8EWqZw8T8Ef1P9MmQ-RK0NHLLC4", // "PLANILLA SCRIPT REDES"
};

const CU_API = "https://api.clickup.com/api/v2";

/** Find the "Redes Sociales" list inside a client's ClickUp folder (the list the
 * Cronopost script feeds). Returns its id, or null if the folder has no such list. */
async function findRedesListId(folderId: string): Promise<string | null> {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`${CU_API}/folder/${folderId}/list?archived=false`, {
      headers: { Authorization: token },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { lists?: Array<{ id: string; name: string }> };
    const hit = (j.lists ?? []).find((l) => /redes\s*sociales/i.test(l.name));
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

interface ScriptProvision {
  scriptId: string | null;
  scriptUrl: string | null;
  triggerInstalled: boolean;
  note: string;
}

/**
 * Auto-create the per-client Cronopost→ClickUp Apps Script from the template,
 * pointed at the new Sheet + the client's "Redes Sociales" list, and file it in
 * the scripts folder. The time-based trigger can't be installed via the API
 * (Apps Script requires a code run for installable triggers, which needs a GCP
 * association + runtime scopes we don't have), so it stays a 1-click step:
 * open the script and run crearTriggerDiario() once.
 */
async function provisionScriptForClient(args: {
  clientName: string;
  sheetId: string;
  clickUpListId: string;
}): Promise<ScriptProvision> {
  const out: ScriptProvision = { scriptId: null, scriptUrl: null, triggerInstalled: false, note: "" };
  // 1. Read the template's files (code + manifest).
  const tpl = (await scriptGetContent({ scriptId: REDES.scriptTemplate })) as {
    files?: Array<{ name: string; type: "SERVER_JS" | "HTML" | "JSON"; source: string }>;
  };
  const files = tpl.files ?? [];
  if (files.length === 0) {
    out.note = "no se pudo leer la plantilla de script";
    return out;
  }
  // 2. Parameterize the PROJECTS config in the SERVER_JS file.
  const parameterized = files.map((f) => {
    if (f.type !== "SERVER_JS") return f;
    let s = f.source;
    s = s.replace(/projectName:\s*"CLIENTE"/g, `projectName: ${JSON.stringify(args.clientName)}`);
    s = s.replace(/clickUpListId:\s*"ID LISTA DE CLICKUP"/g, `clickUpListId: ${JSON.stringify(args.clickUpListId)}`);
    s = s.replace(/spreadsheetId:\s*"ID DEL SHEET"/g, `spreadsheetId: ${JSON.stringify(args.sheetId)}`);
    return { name: f.name, type: f.type, source: s };
  });
  // 3. Create the project, set its content, move it into the scripts folder.
  const created = (await scriptCreate({ title: `${args.clientName} - Redes` })) as { scriptId?: string };
  const scriptId = created.scriptId;
  if (!scriptId) {
    out.note = "scriptCreate no devolvió scriptId";
    return out;
  }
  out.scriptId = scriptId;
  out.scriptUrl = `https://script.google.com/d/${scriptId}/edit`;
  await scriptUpdateContent({ scriptId, files: parameterized as never });
  try {
    await driveMove({ fileId: scriptId, addParentId: REDES.scripts, removeParentId: "root" });
  } catch {
    /* move is cosmetic; the script works wherever it lives */
  }
  out.note = "script creado y configurado; falta instalar el trigger (1 clic: abrir el script y correr crearTriggerDiario)";
  return out;
}

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
  script: ScriptProvision | null;
  errors: string[];
}

/** Provision a brand-new client folder coming from ClickUp. Idempotent on slug. */
export async function provisionClientFromClickUp(
  db: Db,
  input: { folderId: string; folderName: string },
): Promise<ProvisionResult> {
  const name = (input.folderName ?? "").trim();
  const out: ProvisionResult = { client: null, redesSheet: null, script: null, errors: [] };
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

  // 3. Auto-create the Cronopost→ClickUp Apps Script (pointed at the new Sheet
  //    + the client's "Redes Sociales" list). Best-effort: needs both the sheet
  //    and the list to exist.
  const listId = await findRedesListId(input.folderId);
  if (sheetId && listId) {
    try {
      out.script = await provisionScriptForClient({ clientName: name, sheetId, clickUpListId: listId });
    } catch (e) {
      out.errors.push(`script: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (!listId) {
    out.errors.push("lista 'Redes Sociales' no encontrada en el folder → script no creado");
  }

  // 4. File a task for the remaining manual/agent steps (trigger + Make).
  try {
    const fallbackCompanyId = (await defaultCompanyId(db)) ?? undefined;
    const scriptLine = out.script?.scriptUrl
      ? `• Apps Script creado y configurado: ${out.script.scriptUrl}\n  ⚠️ Falta 1 clic: abrir el script y correr la función *crearTriggerDiario* (instala el trigger diario).\n`
      : `• Apps Script: ⚠️ no se pudo crear (${out.errors.join("; ") || "revisar"}). Crear a mano desde la plantilla.\n`;
    await createClientTask(db, {
      clientId,
      title: `Onboarding ${name}: trigger + scenario Make`,
      description:
        `Cliente nuevo detectado en ClickUp (folder ${input.folderId}). Provisión automática:\n` +
        `• Sheet de Redes: ${out.redesSheet?.url ?? "⚠️ no se pudo crear, revisar"}\n` +
        scriptLine +
        `Falta para terminar el pipeline (ver skill lmtm-pipeline):\n` +
        `1) Instalar el trigger del script (1 clic, ver arriba).\n` +
        `2) Probar una fila de punta a punta y guardar los IDs en el brain del cliente.\n` +
        `(El scenario de Make se configura aparte — no se automatiza por ahora.)`,
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
