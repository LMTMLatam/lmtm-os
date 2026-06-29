// LMTM-OS: per-client Apps Script health monitor.
//
// Each client's Cronopost→ClickUp sync runs as a daily Apps Script. When that
// script starts failing (or stops running), posts silently stop flowing into
// ClickUp. This monitor reads each script's recent executions via the Apps
// Script API and, when a script is broken, files a task so an agent reviews and
// fixes it (script_get_content to inspect, script_update_content to patch, or
// transcribe the missing rows). Part of making the pipeline self-healing.
//
// Needs the Google refresh token to include the script.processes scope.

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { driveList, scriptProcesses } from "@paperclipai/mcp-google";
import { activeClients } from "./intel-common.js";
import { createClientTask } from "./client-tasks.js";

const SCRIPTS_FOLDER_REDES = "1nbhnzZYjeKdlrIGWYBPLyFTFUC16r5pk";
// A daily script should have run within this window; longer = "not running".
const STALE_DAYS = Number(process.env.LMTM_SCRIPT_STALE_DAYS ?? 2);

type Proc = { processStatus?: string; functionName?: string; startTime?: string };

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Map the scripts in the Redes scripts folder to {normalizedName -> scriptId}. */
async function loadScriptIndex(): Promise<Array<{ id: string; name: string; norm: string }>> {
  const res = (await driveList({
    query: `'${SCRIPTS_FOLDER_REDES}' in parents and mimeType='application/vnd.google-apps.script' and trashed=false`,
    pageSize: 100,
  })) as { files?: Array<{ id: string; name: string }> };
  return (res.files ?? []).map((f) => ({ id: f.id, name: f.name, norm: norm(f.name) }));
}

/** Resolve a client's redes script id: stored on metadata, else matched by name. */
function resolveScriptId(
  client: { id: string; name: string; metadata?: unknown },
  index: Array<{ id: string; name: string; norm: string }>,
): string | null {
  const meta = (client.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.redesScriptId === "string" && meta.redesScriptId) return meta.redesScriptId;
  const cn = norm(client.name);
  const hit = index.find((s) => s.norm === cn || s.norm.startsWith(cn) || cn.startsWith(s.norm) || s.norm.includes(cn));
  return hit?.id ?? null;
}

interface ScriptVerdict {
  scriptId: string;
  state: "ok" | "failing" | "stale";
  detail: string;
}

function judge(scriptId: string, procs: Proc[]): ScriptVerdict {
  const sorted = procs
    .filter((p) => p.startTime)
    .sort((a, b) => new Date(b.startTime!).getTime() - new Date(a.startTime!).getTime());
  if (sorted.length === 0) {
    return { scriptId, state: "stale", detail: "el script no tiene ejecuciones registradas (¿trigger sin instalar?)" };
  }
  const latest = sorted[0];
  const ageDays = (Date.now() - new Date(latest.startTime!).getTime()) / 86400000;
  const status = (latest.processStatus ?? "").toUpperCase();
  if (status === "FAILED" || status === "TIMED_OUT") {
    return {
      scriptId,
      state: "failing",
      detail: `última ejecución ${status} (${latest.functionName ?? "?"}, ${new Date(latest.startTime!).toLocaleString("es-AR")})`,
    };
  }
  if (ageDays > STALE_DAYS) {
    return {
      scriptId,
      state: "stale",
      detail: `no corre hace ${Math.round(ageDays)} día(s) (última: ${new Date(latest.startTime!).toLocaleString("es-AR")}) — el trigger puede estar apagado`,
    };
  }
  return { scriptId, state: "ok", detail: "última ejecución OK" };
}

export async function runScriptHealthCheck(db: Db): Promise<{ checked: number; broken: number }> {
  let index: Array<{ id: string; name: string; norm: string }>;
  try {
    index = await loadScriptIndex();
  } catch (e) {
    console.warn("[script-health] could not list scripts folder:", e);
    return { checked: 0, broken: 0 };
  }
  const rows = await activeClients(db);
  let checked = 0;
  let broken = 0;
  for (const client of rows) {
    const full = (await db
      .select({ id: clients.id, name: clients.name, metadata: clients.metadata })
      .from(clients)
      .where(eq(clients.id, client.id))
      .limit(1))[0];
    if (!full) continue;
    const scriptId = resolveScriptId(full, index);
    if (!scriptId) continue; // client has no redes script (not all do)
    checked += 1;
    let procs: Proc[] = [];
    try {
      const res = (await scriptProcesses({ scriptId, pageSize: 10 })) as { processes?: Proc[] };
      procs = res.processes ?? [];
    } catch (e) {
      console.warn(`[script-health] processes failed for ${client.name}:`, e);
      continue;
    }
    const verdict = judge(scriptId, procs);
    if (verdict.state === "ok") continue;
    broken += 1;
    // File a fix task. createClientTask dedups on (clientId, title, open), so a
    // still-broken script won't spam a new task every run.
    const scriptUrl = `https://script.google.com/d/${scriptId}/edit`;
    await createClientTask(db, {
      clientId: client.id,
      title: `⚠️ Script de Redes con problemas: ${client.name}`,
      description:
        `La automatización (Apps Script) que sincroniza el Sheet Cronopost → ClickUp de ${client.name} ${verdict.state === "failing" ? "está fallando" : "no está corriendo"}.\n` +
        `• Detalle: ${verdict.detail}\n` +
        `• Script: ${scriptUrl}\n\n` +
        `Revisalo y corregilo (ver skill lmtm-pipeline):\n` +
        `1) Leé el código con la tool del Apps Script y revisá la config (spreadsheetId, clickUpListId).\n` +
        `2) Si el error es de código/config, corregilo y volvé a probar.\n` +
        `3) Si el trigger está caído, reinstalalo (función crearTriggerDiario).\n` +
        `4) Mientras tanto, si hay filas del Sheet sin pasar a ClickUp, transcribilas para no perder posteos.`,
      taskType: "internal",
      priority: "high",
      source: "script-health-monitor",
    }).catch(() => {});
  }
  if (broken > 0) console.log(`[script-health] ${broken}/${checked} client script(s) need attention`);
  return { checked, broken };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function initScriptHealth(db: Db): void {
  if (timer) return;
  setTimeout(() => { void runScriptHealthCheck(db).catch((e) => console.warn("[script-health] run failed:", e)); }, 8 * 60 * 1000);
  timer = setInterval(() => { void runScriptHealthCheck(db).catch((e) => console.warn("[script-health] run failed:", e)); }, 12 * 3600 * 1000);
  console.log("[script-health] scheduled per-client Apps Script health checks (every 12h)");
}
