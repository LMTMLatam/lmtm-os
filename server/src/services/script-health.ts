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
// Subcarpeta "Scripts" del pipeline de Producción de video (pedido 24/7:
// vigilar los scripts de video igual que los de redes).
const SCRIPTS_FOLDER_VIDEO = "11CzUXYbr4ltaSgIxPfFGqENRhB18H7nX";

// Los dos pipelines de Apps Scripts por cliente, vigilados con la misma vara.
const PIPELINES = [
  { key: "redes", label: "Redes", folder: SCRIPTS_FOLDER_REDES, metaKey: "redesScriptId", trigger: "crearTriggerDiario", desc: "el Sheet Cronopost → lista Redes Sociales de ClickUp" },
  { key: "video", label: "Producción de video", folder: SCRIPTS_FOLDER_VIDEO, metaKey: "videoScriptId", trigger: "crearTriggerDiarioMedianoche", desc: "el Sheet de Producción → lista Produccion de video de ClickUp" },
] as const;
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

/** Map the scripts in a scripts folder to {normalizedName -> scriptId}. */
async function loadScriptIndex(folderId: string): Promise<Array<{ id: string; name: string; norm: string }>> {
  const res = (await driveList({
    query: `'${folderId}' in parents and mimeType='application/vnd.google-apps.script' and trashed=false`,
    pageSize: 100,
  })) as { files?: Array<{ id: string; name: string }> };
  return (res.files ?? []).map((f) => ({ id: f.id, name: f.name, norm: norm(f.name) }));
}

/** Resolve a client's script id for a pipeline: stored on metadata, else matched by name. */
function resolveScriptId(
  client: { id: string; name: string; metadata?: unknown },
  index: Array<{ id: string; name: string; norm: string }>,
  metaKey: string,
): string | null {
  const meta = (client.metadata ?? {}) as Record<string, unknown>;
  const stored = meta[metaKey];
  if (typeof stored === "string" && stored) return stored;
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
  const rows = await activeClients(db);
  let checked = 0;
  let broken = 0;
  for (const pipeline of PIPELINES) {
    let index: Array<{ id: string; name: string; norm: string }>;
    try {
      index = await loadScriptIndex(pipeline.folder);
    } catch (e) {
      console.warn(`[script-health] could not list ${pipeline.key} scripts folder:`, e);
      continue;
    }
    for (const client of rows) {
      const full = (await db
        .select({ id: clients.id, name: clients.name, metadata: clients.metadata })
        .from(clients)
        .where(eq(clients.id, client.id))
        .limit(1))[0];
      if (!full) continue;
      const scriptId = resolveScriptId(full, index, pipeline.metaKey);
      if (!scriptId) continue; // client has no script in this pipeline (not all do)
      checked += 1;
      let procs: Proc[] = [];
      try {
        const res = (await scriptProcesses({ scriptId, pageSize: 10 })) as { processes?: Proc[] };
        procs = res.processes ?? [];
      } catch (e) {
        console.warn(`[script-health] processes failed for ${client.name} (${pipeline.key}):`, e);
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
        title: `⚠️ Script de ${pipeline.label} con problemas: ${client.name}`,
        description:
          `La automatización (Apps Script) que sincroniza ${pipeline.desc} de ${client.name} ${verdict.state === "failing" ? "está fallando" : "no está corriendo"}.\n` +
          `• Detalle: ${verdict.detail}\n` +
          `• Script: ${scriptUrl}\n\n` +
          `Revisalo y corregilo (ver skill lmtm-pipeline):\n` +
          `1) Leé el código con la tool del Apps Script y revisá la config (spreadsheetId, clickUpListId).\n` +
          `2) Si el error es de código/config, corregilo y volvé a probar.\n` +
          `3) Si el trigger está caído, reinstalalo (función ${pipeline.trigger}).\n` +
          `4) Mientras tanto, si hay filas del Sheet sin pasar a ClickUp, transcribilas para no perder piezas.`,
        taskType: "internal",
        priority: "high",
        source: "script-health-monitor",
      }).catch(() => {});
    }
  }
  if (broken > 0) console.log(`[script-health] ${broken}/${checked} client script(s) need attention`);
  return { checked, broken };
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastRunDay = "";
const CHECK_EVERY_DAYS = Math.max(1, Number(process.env.LMTM_SCRIPT_CHECK_DAYS ?? 5));

export function initScriptHealth(db: Db): void {
  if (timer) return;
  // Run at most once every CHECK_EVERY_DAYS days. We gate on a day-of-year
  // modulo so it fires roughly every N days regardless of restarts.
  const tick = async () => {
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    if (dayKey === lastRunDay) return;
    const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
    if (dayOfYear % CHECK_EVERY_DAYS !== 0) return;
    lastRunDay = dayKey;
    await runScriptHealthCheck(db).catch((e) => console.warn("[script-health] run failed:", e));
  };
  setTimeout(() => { void tick(); }, 8 * 60 * 1000);
  timer = setInterval(() => { void tick(); }, 6 * 3600 * 1000); // checks; fires once every N days
  console.log(`[script-health] scheduled per-client Apps Script health checks (every ${CHECK_EVERY_DAYS} days)`);
}
