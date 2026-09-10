// LMTM-OS: Make (make.com) API client — AutoPoster scenario health.
//
// The last leg of the pipeline is Make: a ClickUp webhook fires the post to the
// client's "AutoPoster" scenario on its start_date, Make publishes to the
// networks and tags the task "mandado a make". If that scenario ERRORS, the
// post carries the tag (or not) but never actually went out — a silent miss the
// tag-based checks can't see. This module reads each client's scenario
// execution logs and flags recent failures so an agent can open Make and fix
// the scenario (executions_get-detail → conexión/módulo/dato).
//
// Gated on MAKE_API_TOKEN — a no-op when it isn't set, so the server runs fine
// without Make configured. Each client's scenario is named after the client
// (team convention), so we resolve client→scenario by name match.

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { sendWhatsAppToNumber, alertsNumber } from "./agency-ops.js";

const MAKE_BASE = (process.env.MAKE_API_BASE?.trim() || "https://us2.make.com/api/v2").replace(/\/$/, "");
const MAKE_TEAM_ID = process.env.MAKE_TEAM_ID?.trim() || "228071";
const MAKE_ERROR_WINDOW_MS = 7 * 86_400_000; // only alert on failures in the last week

export function makeConfigured(): boolean {
  return Boolean(process.env.MAKE_API_TOKEN?.trim());
}

async function makeGet<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  const token = process.env.MAKE_API_TOKEN?.trim();
  if (!token) throw new Error("MAKE_API_TOKEN not set");
  const url = new URL(`${MAKE_BASE}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`Make ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export interface MakeScenario {
  id: number;
  name: string;
  /** Los apagados no publican: el detector de disparos repetidos los saltea. */
  isActive?: boolean;
}

export async function makeListScenarios(): Promise<MakeScenario[]> {
  const r = await makeGet<{ scenarios?: MakeScenario[] }>("/scenarios", { teamId: MAKE_TEAM_ID });
  return r.scenarios ?? [];
}

/** Datastore donde el despachador (escenario 1427144) busca a dónde mandar el
 *  post de cada cliente. Un cliente que NO está acá no tiene destino: el
 *  despachador lo descarta en silencio y la tarea igual queda etiquetada. */
export const DATASTORE_DESTINOS = Number(process.env.MAKE_DATASTORE_DESTINOS) || 19767;

export interface DestinoCliente {
  cliente: string;
  webhook: string;
  /** Lo escribe Make cuando despacha de verdad. Es señal más honesta que la
   *  etiqueta de ClickUp, que la pone ClickUp antes de que Make haga nada. */
  ultimoEnvio: Date | null;
}

/** Los destinos configurados. Make corta cualquier pg[limit] mayor a 100. */
export async function makeDestinos(): Promise<DestinoCliente[]> {
  const out: DestinoCliente[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = await makeGet<{ records?: Array<{ data?: Record<string, unknown> }> }>(
      `/data-stores/${DATASTORE_DESTINOS}/data`,
      { "pg[limit]": 100, "pg[offset]": offset },
    );
    const lote = r.records ?? [];
    for (const rec of lote) {
      const d = rec.data ?? {};
      const cliente = String(d["Client name"] ?? "").trim();
      if (!cliente) continue;
      const enviado = d["Last sent date"] ? new Date(String(d["Last sent date"])) : null;
      out.push({
        cliente,
        webhook: String(d.webhook ?? ""),
        ultimoEnvio: enviado && !Number.isNaN(enviado.getTime()) ? enviado : null,
      });
    }
    if (lote.length < 100) break;
  }
  return out;
}

export interface MakeLog {
  id: string;
  status: number; // Make execution status: 1 = success, 2 = warning, 3 = error
  timestamp: string;
  eventType?: string;
  /** "auto" = disparada por su webhook. Lo corrido a mano no cuenta como duplicado. */
  type?: string;
  /** Si viene con valor, alguien apretó "Replay run": tampoco es duplicación del sistema. */
  replayOfExecutionId?: string | null;
}

/** Make rechaza con 400 cualquier pg[limit] mayor a 50. */
export const MAX_LOGS_POR_LLAMADA = 50;

export async function makeScenarioLogs(scenarioId: number, limit = 20): Promise<MakeLog[]> {
  const tope = Math.min(Math.max(1, Math.trunc(limit)), MAX_LOGS_POR_LLAMADA);
  const r = await makeGet<{ scenarioLogs?: MakeLog[] }>(`/scenarios/${scenarioId}/logs`, { "pg[limit]": tope });
  return r.scenarioLogs ?? [];
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match a client to their AutoPoster scenario by name. Excludes the generic
 *  template/connection scenarios so a client never matches "Plantilla". */
function matchScenario(clientName: string, scenarios: MakeScenario[]): MakeScenario | null {
  const cn = norm(clientName);
  if (!cn) return null;
  const cand = scenarios.filter((s) => !/plantilla|template|autoposter|conexi[oó]n/i.test(s.name ?? ""));
  return (
    cand.find((s) => {
      const sn = norm(s.name ?? "");
      return sn.length > 0 && (sn === cn || sn.startsWith(cn) || cn.startsWith(sn));
    }) ?? null
  );
}

/** Check each active client's AutoPoster scenario for recent FAILED executions
 *  and WhatsApp the team the ones that need a look. Gated on MAKE_API_TOKEN. */
export async function runMakeHealthCheck(
  db: Db,
  opts: { dryRun?: boolean } = {},
): Promise<{ configured: boolean; checked: number; issues: Array<{ name: string; note: string }>; delivered: boolean }> {
  if (!makeConfigured()) return { configured: false, checked: 0, issues: [], delivered: false };

  let scenarios: MakeScenario[];
  try {
    scenarios = await makeListScenarios();
  } catch (e) {
    console.warn("[make-monitor] list scenarios failed:", e);
    return { configured: true, checked: 0, issues: [], delivered: false };
  }

  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active"));
  const now = Date.now();
  // Flag scenarios whose recent runs ERRORED — "posteó a Make pero falló". We do
  // NOT flag merely-idle scenarios: a poster that hasn't run because the client
  // has nothing scheduled (no Fecha de inicio) is not a problem per the team.
  // The "scheduled post that never fired" case is caught upstream by the
  // publication check (start_date passed + no "mandado a make" tag).
  const flagged: Array<{ name: string; note: string; errors: number }> = [];
  let checked = 0;

  for (const c of rows) {
    const sc = matchScenario(c.name, scenarios);
    if (!sc) continue; // client has no matching scenario
    checked += 1;
    let logs: MakeLog[] = [];
    try {
      logs = await makeScenarioLogs(sc.id, 20);
    } catch {
      continue;
    }
    const errs = logs.filter((l) => l.status >= 3 && now - new Date(l.timestamp).getTime() <= MAKE_ERROR_WINDOW_MS);
    if (errs.length > 0) {
      const lastErrorAt = errs.map((e) => e.timestamp).sort().reverse()[0];
      flagged.push({
        name: c.name,
        note: `${errs.length} ejecución(es) fallida(s) en 7d (últ. ${new Date(lastErrorAt).toLocaleString("es-AR")})`,
        errors: errs.length,
      });
    }
  }
  flagged.sort((a, b) => b.errors - a.errors);
  const issues = flagged.map(({ name, note }) => ({ name, note }));

  const team = alertsNumber();
  let delivered = false;
  if (team && issues.length > 0 && !opts.dryRun) {
    const lines = ["*⚙️ AutoPoster de Make falló al publicar*", ""];
    for (const it of issues.slice(0, 25)) lines.push(`• *${it.name}*: ${it.note}`);
    lines.push("", "_El scenario corrió pero falló — el post no salió. Abrir Make (executions_get-detail): conexión caída, módulo roto o dato faltante._");
    const r = await sendWhatsAppToNumber(team, lines.join("\n"));
    delivered = r.ok;
  }
  return { configured: true, checked, issues, delivered };
}
