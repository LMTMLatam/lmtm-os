// LMTM-OS: ClickUp sync service.
//
// REAL ClickUp structure for LMTM (workspace "LMTM"):
//   Workspace (team)
//     └─ Space "Clientes"
//          └─ Folder  ← ONE PER CLIENT (name == client.name), e.g. "CAMPO TIMBO"
//               ├─ List "📲Redes Sociales"   (posts de redes)
//               ├─ List "Produccion de video" (videos a producir)
//               └─ Doc  "Enfoque Técnico"     (contexto del cliente)  ← a DOC, not a list
//
// So a client maps to a FOLDER (not a Space, as a previous version wrongly
// assumed). The "Enfoque Técnico" is a ClickUp **Doc** living under the
// client folder, fetched via the v3 Docs API.
//
// This service:
//   1. Finds the client's folder by name (preferring the "Clientes" space).
//   2. Classifies the Redes Sociales / Produccion de video lists inside it.
//   3. Finds the Enfoque Técnico doc (v3 docs filtered by parent folder).
//   4. Persists everything on the `clients` row so the dashboard can deep-link
//      and agents can pull the Enfoque Técnico content as context.
//
// Persistence (reusing the 0106 columns, no new migration):
//   clients.clickupFolderId               → folder id (deep-link target)
//   clients.clickupListRedesId            → 📲Redes Sociales list id
//   clients.clickupListVideoId            → Produccion de video list id
//   clients.clickupListEnfoqueTecnicoId   → Enfoque Técnico DOC id (repurposed)
//   clients.metadata.clickupTeamId        → workspace id (for building URLs)
//   clients.metadata.clickupSpaceId       → space id
//
// Auth: process.env.CLICKUP_API_TOKEN (same personal token as the
// lmtm-clickup MCP plugin; configured once in Render env vars).
//
// Reference: https://clickup.com/api

import type { Db } from "@paperclipai/db";
import { clients, clientContextCache } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";

const CU_API = "https://api.clickup.com/api/v2";
const CU_API_V3 = "https://api.clickup.com/api/v3";

// Normalized name matchers for the standard lists. We match loosely because
// LMTM operators use slightly different capitalizations / unicode / spacing.
const STANDARD_LISTS = {
  // "📲Redes Sociales", "Redes Sociales", "RRSS". We deliberately keep this
  // tight enough to NOT grab "Super Redes Sociales" preferentially (we pick
  // the shortest/most-exact match — see classifyLists).
  redes: /redes?\s*sociales?|rrss/i,
  // "Produccion de video", "Producción de vídeo", "Produção de Video".
  // \S* after "produ" absorbs the double-c / ç / ã variants robustly.
  video: /produ\S*\s+de\s+v[ií]deos?/i,
} as const;

const ENFOQUE_TECNICO_RE = /enfoque\s*t[eé]cnic[oó]/i;

type CuList = { id: string; name: string };
type CuFolder = { id: string; name: string; lists?: CuList[] };
type CuSpace = { id: string; name: string };
type CuTeam = { id: string; name: string };
type CuDoc = { id: string; name: string; parent?: { id: string; type: number } };

function token(): string {
  return (process.env.CLICKUP_API_TOKEN ?? "").trim();
}

async function cuFetch<T = unknown>(
  base: string,
  path: string,
  init: { method?: string; query?: Record<string, string | number | boolean>; body?: unknown } = {},
): Promise<T> {
  const t = token();
  if (!t) throw new Error("CLICKUP_API_TOKEN no configurado. Andá a Render → Environment y agregalo.");
  const url = new URL(`${base}${path}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Authorization: t };
  const fetchInit: RequestInit = { method: init.method ?? "GET", headers };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(init.body);
  }
  const r = await fetch(url.toString(), fetchInit);
  const text = await r.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!r.ok) {
    const err = parsed as { err?: string; error?: string; ECODE?: string } | null;
    const msg = err?.err ?? err?.error ?? (text ? text.slice(0, 300) : `HTTP ${r.status}`);
    throw new Error(`ClickUp ${path} → ${r.status}: ${msg}`);
  }
  return parsed as T;
}

const cu = <T = unknown>(path: string, init?: Parameters<typeof cuFetch>[2]) => cuFetch<T>(CU_API, path, init);
const cuV3 = <T = unknown>(path: string, init?: Parameters<typeof cuFetch>[2]) => cuFetch<T>(CU_API_V3, path, init);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Pick the workspace: prefer the one named "LMTM", else the first. */
async function resolveWorkspace(): Promise<CuTeam> {
  const r = await cu<{ teams: CuTeam[] }>("/team");
  if (!r.teams?.length) throw new Error("No ClickUp workspaces visible to the API token.");
  return r.teams.find((t) => norm(t.name) === "lmtm") ?? r.teams[0];
}

async function listSpaces(workspaceId: string): Promise<CuSpace[]> {
  const r = await cu<{ spaces: CuSpace[] }>(`/team/${encodeURIComponent(workspaceId)}/space`, { query: { archived: false } });
  return r.spaces ?? [];
}

async function listFolders(spaceId: string): Promise<CuFolder[]> {
  const r = await cu<{ folders: CuFolder[] }>(`/space/${encodeURIComponent(spaceId)}/folder`, { query: { archived: false } });
  return r.folders ?? [];
}

async function listListsInFolder(folderId: string): Promise<CuList[]> {
  const r = await cu<{ lists: CuList[] }>(`/folder/${encodeURIComponent(folderId)}/list`, { query: { archived: false } });
  return r.lists ?? [];
}

/**
 * Analyze the client's "Redes Sociales" ClickUp list for a date window:
 * how many posts were planned (have a start/due date in range) vs published
 * (tagged "mandado/enviado a make"), and which planned ones were missed
 * (start_date passed, no dispatch tag). Returns null if the client has no
 * Redes Sociales list synced.
 */
type RedesStats = {
  total: number;
  byStatus: Record<string, number>;
  publishedThisWeek: number;
  plannedThisWeek: number;
  missed: number;
  missedNames: string[];
  hasDates: boolean; // whether any post carries a planned date (due/start)
};

// Publication signal: the "mandado a make" / "enviado a make" ClickUp tag.
// The team applies it when the post fires to the Make scenario (Make does the
// actual publish), so the tag — not the per-client status names — is the
// authoritative "this went out" marker. The reference date is start_date:
// that's when the post is due to fire to Make.
const SENT_TO_MAKE_RE = /(mandado|enviado)\s*a\s*make/i;
const hasSentToMakeTag = (tags?: Array<{ name?: string }>): boolean =>
  (tags ?? []).some((tag) => SENT_TO_MAKE_RE.test(tag.name ?? ""));

export async function getRedesPostStats(
  db: Db,
  clientId: string,
  sinceMs: number,
  untilMs: number,
): Promise<RedesStats | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client?.clickupListRedesId) return null;
  const r = await cu<{ tasks: Array<{
    name: string;
    status?: { status?: string; type?: string };
    tags?: Array<{ name?: string }>;
    due_date?: string | null; start_date?: string | null;
    date_updated?: string | null; date_done?: string | null; date_closed?: string | null;
  }> }>(
    `/list/${encodeURIComponent(client.clickupListRedesId)}/task`,
    { query: { archived: false, include_closed: true, subtasks: false } },
  );
  const tasks = r.tasks ?? [];
  const now = Date.now();
  const byStatus: Record<string, number> = {};
  let total = 0, publishedThisWeek = 0, plannedThisWeek = 0, hasDates = false;
  const missedNames: string[] = [];

  for (const t of tasks) {
    total += 1;
    const sName = t.status?.status ?? "sin estado";
    byStatus[sName] = (byStatus[sName] ?? 0) + 1;
    const isPub = hasSentToMakeTag(t.tags);

    const planMs = Number(t.start_date ?? t.due_date ?? 0);
    if (planMs) hasDates = true;
    if (planMs && planMs >= sinceMs && planMs <= untilMs) {
      plannedThisWeek += 1;
      if (isPub) publishedThisWeek += 1;
      else if (planMs < now) missedNames.push(t.name);
    }
  }
  return { total, byStatus, publishedThisWeek, plannedThisWeek, missed: missedNames.length, missedNames, hasDates };
}

export interface ScheduledContentItem {
  name: string;
  status: string;
  /** True when the task carries the "mandado/enviado a make" tag — the
   *  authoritative publication signal (alias of sentToMake). */
  published: boolean;
  /** ClickUp tag "mandado a make" / "enviado a make": the post WAS dispatched
   *  to the Make scenario (i.e. it fired). A task past its start_date WITHOUT
   *  this tag is the real "never went out" signal; with the tag, any failure
   *  lives in Make's execution log, not in ClickUp. */
  sentToMake: boolean;
  /** ISO from ClickUp start_date ONLY — the "Fecha de inicio" that fires the
   *  Make scenario. null when the task has no start_date set, meaning Make has
   *  no trigger and will never dispatch it (a different problem than a missed
   *  fire). The publication monitor keys its "sin publicar" alert off THIS. */
  startDate: string | null;
  /** ISO planning date, start_date ?? due_date. Kept for calendar/aggregate
   *  callers; NOT the Make trigger when it falls back to due_date. */
  plannedDate: string | null;
  /** THE overdue rule (the only one the team cares about): start_date passed
   *  AND no "mandado a make" tag = the webhook never fired. Tasks without
   *  start_date are never overdue — the team always sets start_date on what
   *  they actually schedule; the rest are ideas. ClickUp status and
   *  plannedDate/due_date do NOT factor in. */
  overdue: boolean;
  url: string | null;
}

/**
 * The client's planned content from the "Redes Sociales" ClickUp list within a
 * time window (default: from 7 days ago to 14 days ahead). This is the "sheet
 * programado" the content agents need to verify what should be posted and when.
 * Returns the actual items (name, status, planned date), not just aggregates.
 */
export async function getRedesScheduledContent(
  db: Db,
  clientId: string,
  sinceMs: number,
  untilMs: number,
): Promise<ScheduledContentItem[] | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client?.clickupListRedesId) return null;
  const r = await cu<{ tasks: Array<{
    name: string;
    status?: { status?: string; type?: string };
    due_date?: string | null; start_date?: string | null;
    date_done?: string | null; date_closed?: string | null;
    url?: string | null;
    tags?: Array<{ name?: string }>;
  }> }>(
    `/list/${encodeURIComponent(client.clickupListRedesId)}/task`,
    { query: { archived: false, include_closed: true, subtasks: false } },
  );
  const tasks = r.tasks ?? [];
  const out: ScheduledContentItem[] = [];
  for (const t of tasks) {
    const planMs = Number(t.start_date ?? t.due_date ?? 0);
    if (planMs && (planMs < sinceMs || planMs > untilMs)) continue;
    const startMs = Number(t.start_date ?? 0);
    const sName = t.status?.status ?? "sin estado";
    const sentToMake = hasSentToMakeTag(t.tags);
    out.push({
      name: t.name,
      status: sName,
      published: sentToMake,
      sentToMake,
      startDate: startMs ? new Date(startMs).toISOString() : null,
      plannedDate: planMs ? new Date(planMs).toISOString() : null,
      overdue: startMs > 0 && startMs < Date.now() && !sentToMake,
      url: t.url ?? null,
    });
  }
  // Nearest-first by planned date (nulls last).
  out.sort((a, b) => {
    if (!a.plannedDate) return 1;
    if (!b.plannedDate) return -1;
    return a.plannedDate.localeCompare(b.plannedDate);
  });
  return out;
}

// ── Content calendar (Redes) ────────────────────────────────────────────────
// The publication date is ClickUp's native start_date (LMTM convention), and
// the target networks live in the "Plataformas" labels custom field. Both are
// read live per request, so the calendar is always in sync with ClickUp.

export interface RedesCalendarItem {
  id: string;
  name: string;
  status: string;
  published: boolean;
  sentToMake: boolean;
  /** ISO, from start_date. Only tasks with a start_date land on the calendar. */
  date: string;
  /** From the "Plataformas" labels custom field (e.g. ["Instagram","Facebook"]). */
  networks: string[];
  /** From "Tipo de Contenido", or a reel/carrusel/story tag as fallback. */
  format: string | null;
  /** From "Objetivo del Contenido" — the content pillar/objective (engagement,
   *  valor, educativo, comercial…). Null when the task hasn't set it. */
  objective: string | null;
  url: string | null;
  /** Si al llegar su fecha va a pasar las compuertas del despachador: aprobado,
   *  con copy y con la pieza cargada. Un post que no está listo se descarta en
   *  silencio — y la tarea igual queda etiquetada como enviada. */
  readyToPublish: boolean;
  /** Caracteres del copy cargado, para validarlo contra el tope de cada red. */
  copyLargo: number;
  /** Qué le falta, para poder avisarlo sin que nadie abra la tarea. */
  missing: string[];
}

// OJO con aflojar este regex: la misma lista tiene "Plataforma de ecommerce
// (Ingreso)", de tipo texto, y con /plataforma/i el .find() agarraba ESE
// primero. Como no tiene opciones, labelsFromField devolvia [] y networks salia
// VACIO en todos los posts de la agencia — sin error, sin aviso. Medido el
// 14/9/26: 53 de 53 posts sin redes.
const PLATAFORMAS_RE = /^plataformass*$/i;
const TIPO_CONTENIDO_RE = /tipo\s*de\s*contenido/i;
const OBJETIVO_RE = /objetivo\s*del?\s*contenido/i; // "Objetivo del/de Contenido"
const FORMAT_TAG_RE = /reel|carrusel|carousel|story|historia|est[aá]tico|foto|video/i;

// Las tres compuertas que el despachador (escenario 1427144) exige al llegar la
// fecha del post. Si falta una, descarta el bundle en silencio — y la tarea
// igual queda etiquetada "mandado a make", porque esa etiqueta la pone ClickUp.
const APROBACION_RE = /aprobaci[oó]n/i;
const COPY_RE = /copy/i;                                    // "Copy o/y Subtitulo"
const PIEZA_RE = /enlace\s*de\s*publicaci|imagen\s*o\s*video/i;

interface CuLabelField {
  name?: string;
  value?: unknown;
  type_config?: { options?: Array<{ id?: string; label?: string; name?: string }> };
}

/** Resolve a ClickUp "labels" custom field value (array of option ids) to its
 *  human labels using the field's own inline options. */
function labelsFromField(cf: CuLabelField | undefined): string[] {
  if (!cf) return [];
  const byId = new Map((cf.type_config?.options ?? []).map((o) => [o.id, o.label ?? o.name ?? ""]));
  const val = cf.value;
  const ids = Array.isArray(val) ? val.map(String) : val != null && val !== "" ? [String(val)] : [];
  return ids.map((id) => byId.get(id) ?? "").filter(Boolean);
}

/** Un drop_down de ClickUp guarda el uuid de la opción o su índice, según cómo
 *  se haya creado la lista. Resolvemos las dos formas y devolvemos la etiqueta.
 *  El despachador compara contra el índice 2 ("APROBADO") — eso se rompe en
 *  cuanto alguien reordena las opciones de una lista, así que acá miramos el
 *  texto. */
function dropdownLabel(cf: CuLabelField | undefined): string | null {
  if (!cf || cf.value === null || cf.value === undefined || cf.value === "") return null;
  const opts = cf.type_config?.options ?? [];
  const v = String(cf.value);
  const porId = opts.find((o) => o.id === v);
  if (porId) return (porId.label ?? porId.name ?? "").trim() || null;
  const i = Number(v);
  if (Number.isInteger(i) && i >= 0 && i < opts.length) {
    const o = opts[i];
    return (o.label ?? o.name ?? "").trim() || null;
  }
  return null;
}

const tieneTexto = (cf: CuLabelField | undefined): boolean =>
  cf?.value != null && String(cf.value).trim() !== "";

/** Largo del texto de un campo. Se expone para poder validarlo contra el tope
 *  de cada red ANTES de la fecha: el despachador no lo chequea y la red rechaza
 *  el post sin que nadie se entere. */
const largoTexto = (cf: CuLabelField | undefined): number =>
  cf?.value == null ? 0 : String(cf.value).trim().length;

/**
 * The client's "Redes Sociales" list as a content calendar: one entry per task
 * that has a start_date within [sinceMs, untilMs], carrying its target networks
 * and format. Live from ClickUp. Returns null if the client has no Redes list.
 */
export async function getRedesCalendar(
  db: Db,
  clientId: string,
  sinceMs: number,
  untilMs: number,
): Promise<RedesCalendarItem[] | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client?.clickupListRedesId) return null;
  const r = await cu<{ tasks: Array<{
    id: string;
    name: string;
    status?: { status?: string; type?: string };
    start_date?: string | null;
    due_date?: string | null;
    url?: string | null;
    tags?: Array<{ name?: string }>;
    custom_fields?: CuLabelField[];
  }> }>(
    `/list/${encodeURIComponent(client.clickupListRedesId)}/task`,
    { query: { archived: false, include_closed: true, subtasks: false } },
  );
  const tasks = r.tasks ?? [];
  const out: RedesCalendarItem[] = [];
  for (const t of tasks) {
    // start_date (Fecha de inicio) = when the post fires to Make — the LMTM
    // convention. Many teams only set due_date though, so fall back to it:
    // an empty calendar helps nobody.
    const startMs = Number(t.start_date ?? 0) || Number(t.due_date ?? 0);
    if (!startMs || startMs < sinceMs || startMs > untilMs) continue;
    const cfs = t.custom_fields ?? [];
    const networks = labelsFromField(campoDeEtiquetas(cfs, PLATAFORMAS_RE));
    let format: string | null = labelsFromField(cfs.find((c) => TIPO_CONTENIDO_RE.test(c.name ?? "")))[0] ?? null;
    if (!format) format = (t.tags ?? []).map((x) => x.name ?? "").find((n) => FORMAT_TAG_RE.test(n)) ?? null;
    const objective = labelsFromField(cfs.find((c) => OBJETIVO_RE.test(c.name ?? "")))[0] ?? null;
    const sName = t.status?.status ?? "sin estado";
    const sentToMake = hasSentToMakeTag(t.tags);
    const aprobacion = dropdownLabel(cfs.find((c) => APROBACION_RE.test(c.name ?? "")));
    const missing: string[] = [];
    if (!/aprobad/i.test(aprobacion ?? "")) missing.push("aprobación");
    if (!tieneTexto(cfs.find((c) => COPY_RE.test(c.name ?? "")))) missing.push("copy");
    if (!tieneTexto(cfs.find((c) => PIEZA_RE.test(c.name ?? "")))) missing.push("pieza");
    out.push({
      id: t.id,
      name: t.name,
      status: sName,
      published: sentToMake,
      sentToMake,
      date: new Date(startMs).toISOString(),
      networks,
      format,
      objective,
      url: t.url ?? null,
      readyToPublish: missing.length === 0,
      copyLargo: largoTexto(cfs.find((c) => COPY_RE.test(c.name ?? ""))),
      missing,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Create a post task on the client's "Redes Sociales" list with the calendar
 * conventions filled in: start_date = publish date, "Plataformas" labels =
 * target networks, "Tipo de Contenido" = format. The Make flow picks it up
 * from there like any manually-created post.
 */
export async function createRedesPost(
  db: Db,
  clientId: string,
  input: { name: string; description?: string; startDateMs: number; platforms: string[]; format?: string },
): Promise<{ taskId: string; url: string | null; warnings: string[] }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client?.clickupListRedesId) throw new Error("El cliente no tiene la lista Redes Sociales mapeada.");
  const listId = client.clickupListRedesId;

  // Resolve the labels fields on this list and map label names → option ids.
  const fr = await cu<{ fields: Array<{ id: string; name: string; type: string; type_config?: { options?: Array<{ id: string; label?: string; name?: string }> } }> }>(
    `/list/${encodeURIComponent(listId)}/field`,
  );
  const fields = fr.fields ?? [];
  const customFields: Array<{ id: string; value: string[] }> = [];
  const warnings: string[] = [];
  // Not every client list has these fields attached (e.g. RICCI lacks
  // "Plataformas") — we can't create fields via API, so report what we skipped
  // instead of failing or silently dropping the networks.
  const pickOptions = (fieldRe: RegExp, fieldLabel: string, wanted: string[]) => {
    if (wanted.length === 0) return;
    const f = fields.find((x) => fieldRe.test(x.name));
    if (!f) { warnings.push(`la lista no tiene el campo "${fieldLabel}" — agregalo en ClickUp para que el calendario muestre esto`); return; }
    const ids = wanted
      .map((w) => f.type_config?.options?.find((o) => (o.label ?? o.name ?? "").trim().toLowerCase() === w.trim().toLowerCase())?.id)
      .filter((v): v is string => !!v);
    if (ids.length) customFields.push({ id: f.id, value: ids });
    if (ids.length < wanted.length) warnings.push(`opciones no encontradas en "${fieldLabel}": ${wanted.length - ids.length}`);
  };
  pickOptions(PLATAFORMAS_RE, "Plataformas", input.platforms);
  if (input.format) pickOptions(TIPO_CONTENIDO_RE, "Tipo de Contenido", [input.format]);

  const r = await cu<{ id: string; url?: string }>(`/list/${encodeURIComponent(listId)}/task`, {
    method: "POST",
    body: {
      name: input.name,
      description: input.description ?? "",
      start_date: input.startDateMs,
      start_date_time: false,
      due_date: input.startDateMs,
      due_date_time: false,
      ...(customFields.length ? { custom_fields: customFields } : {}),
    },
  });
  return { taskId: r.id, url: r.url ?? null, warnings };
}

/**
 * Create a weekly-report task in the client's ClickUp folder, inside a
 * "📊 Reportes" list (created on first use). Returns the task URL.
 */
export async function createClientReportTask(
  db: Db,
  clientId: string,
  title: string,
  markdown: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { ok: false, error: "client not found" };

  let folderId = client.clickupFolderId;
  if (!folderId) {
    // Try to detect the folder first.
    try {
      const r = await detectClientClickUpLists(db, clientId);
      folderId = r.folderId;
    } catch (e) {
      return { ok: false, error: `no se pudo detectar el folder de ClickUp: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (!folderId) return { ok: false, error: "el cliente no tiene folder de ClickUp" };

  try {
    const lists = await listListsInFolder(folderId);
    let reportes = lists.find((l) => /reportes?/i.test(l.name));
    if (!reportes) {
      reportes = await cu<CuList>(`/folder/${encodeURIComponent(folderId)}/list`, {
        method: "POST",
        body: { name: "📊 Reportes" },
      });
    }
    const task = await cu<{ id: string; url?: string }>(`/list/${encodeURIComponent(reportes.id)}/task`, {
      method: "POST",
      body: { name: title, markdown_description: markdown },
    });
    return { ok: true, url: task.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Find the client's folder by name. Walks every space (the "Clientes" space
 * first, since that's where client folders live) and matches a folder whose
 * name equals / contains the client name. Returns the folder + its space.
 */
async function findClientFolder(
  workspaceId: string,
  clientName: string,
): Promise<{ folder: CuFolder; spaceId: string } | null> {
  const target = norm(clientName);
  const spaces = await listSpaces(workspaceId);
  // Search "Clientes"-like spaces first, then the rest.
  spaces.sort((a, b) => {
    const ax = /cliente/i.test(a.name) ? 0 : 1;
    const bx = /cliente/i.test(b.name) ? 0 : 1;
    return ax - bx;
  });

  let contains: { folder: CuFolder; spaceId: string } | null = null;
  for (const space of spaces) {
    const folders = await listFolders(space.id);
    for (const f of folders) {
      const n = norm(f.name);
      if (n === target) return { folder: f, spaceId: space.id }; // exact wins immediately
      if (!contains && (n.includes(target) || target.includes(n))) {
        contains = { folder: f, spaceId: space.id };
      }
    }
  }
  return contains;
}

/**
 * Classify the standard lists inside a folder. For "redes" we prefer the
 * shortest matching name so "📲Redes Sociales" wins over "Super Redes Sociales".
 */
function classifyLists(lists: CuList[]): { redes: string | null; video: string | null } {
  let redes: { id: string; len: number } | null = null;
  let video: { id: string; len: number } | null = null;
  for (const l of lists) {
    const name = l.name ?? "";
    if (STANDARD_LISTS.redes.test(name)) {
      const len = name.length;
      if (!redes || len < redes.len) redes = { id: l.id, len };
    }
    if (STANDARD_LISTS.video.test(name)) {
      const len = name.length;
      if (!video || len < video.len) video = { id: l.id, len };
    }
  }
  return { redes: redes?.id ?? null, video: video?.id ?? null };
}

/** Find the "Enfoque Técnico" doc that lives directly under the client folder. */
async function findEnfoqueTecnicoDoc(workspaceId: string, folderId: string): Promise<string | null> {
  try {
    const r = await cuV3<{ docs: CuDoc[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/docs`,
      { query: { parent_id: folderId, parent_type: 5, limit: 100 } },
    );
    const docs = r.docs ?? [];
    const hit = docs.find((d) => ENFOQUE_TECNICO_RE.test(d.name ?? ""));
    return hit?.id ?? null;
  } catch {
    // Docs API is best-effort: a failure here shouldn't fail the whole sync.
    return null;
  }
}

/** Fetch and concatenate the markdown content of every page in a doc. */
async function fetchDocMarkdown(workspaceId: string, docId: string): Promise<{ markdown: string; pages: number }> {
  // List pages, then fetch each page's content as markdown.
  const listing = await cuV3<Array<{ id: string; name?: string }> | { pages?: Array<{ id: string; name?: string }> }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/docs/${encodeURIComponent(docId)}/pages`,
  );
  const pages = Array.isArray(listing) ? listing : listing.pages ?? [];
  const parts: string[] = [];
  for (const p of pages) {
    try {
      const page = await cuV3<{ name?: string; content?: string }>(
        `/workspaces/${encodeURIComponent(workspaceId)}/docs/${encodeURIComponent(docId)}/pages/${encodeURIComponent(p.id)}`,
        { query: { content_format: "text/md" } },
      );
      const content = (page.content ?? "").trim();
      if (content) {
        const heading = page.name && page.name !== "Enfoque Técnico" ? `## ${page.name}\n` : "";
        parts.push(heading + content);
      }
    } catch { /* skip unreadable page */ }
  }
  return { markdown: parts.join("\n\n").trim(), pages: pages.length };
}

/**
 * Detect the client's ClickUp folder + standard lists + Enfoque Técnico doc,
 * and persist the IDs on the client row.
 */
export async function detectClientClickUpLists(
  db: Db,
  clientId: string,
): Promise<{
  folderId: string | null;
  redes: string | null;
  video: string | null;
  enfoqueTecnico: string | null; // doc id
  teamId: string | null;
  warnings: string[];
}> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`Client ${clientId} not found`);

  const warnings: string[] = [];
  const workspace = await resolveWorkspace();

  const match = await findClientFolder(workspace.id, client.name);
  if (!match) {
    warnings.push(`No ClickUp folder matches client "${client.name}" in workspace ${workspace.name}.`);
    return { folderId: null, redes: null, video: null, enfoqueTecnico: null, teamId: workspace.id, warnings };
  }

  const { folder, spaceId } = match;
  const lists = folder.lists?.length ? folder.lists : await listListsInFolder(folder.id);
  const { redes, video } = classifyLists(lists);
  const enfoqueDocId = await findEnfoqueTecnicoDoc(workspace.id, folder.id);

  if (!redes) warnings.push(`Lista "📲Redes Sociales" no encontrada en folder "${folder.name}".`);
  if (!video) warnings.push(`Lista "Produccion de video" no encontrada en folder "${folder.name}".`);
  if (!enfoqueDocId) warnings.push(`Doc "Enfoque Técnico" no encontrado en folder "${folder.name}".`);

  const metadata = { ...(client.metadata ?? {}), clickupTeamId: workspace.id, clickupSpaceId: spaceId };

  await db.update(clients).set({
    clickupFolderId: folder.id,
    clickupListRedesId: redes,
    clickupListVideoId: video,
    clickupListEnfoqueTecnicoId: enfoqueDocId, // repurposed: holds the DOC id
    clickupListsSyncedAt: new Date(),
    planillaExternalId: folder.id,
    planillaSource: "clickup",
    metadata,
    updatedAt: new Date(),
  }).where(eq(clients.id, clientId));

  return { folderId: folder.id, redes, video, enfoqueTecnico: enfoqueDocId, teamId: workspace.id, warnings };
}

/**
 * Fetch the Enfoque Técnico doc content (markdown) and cache it so the agent
 * context loader can read it without hitting ClickUp on every invocation.
 */
export async function refreshEnfoqueTecnicoContext(
  db: Db,
  clientId: string,
): Promise<{ chars: number; pages: number }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`Client ${clientId} not found`);
  const docId = client.clickupListEnfoqueTecnicoId; // repurposed column = doc id
  if (!docId) {
    throw new Error(`No Enfoque Técnico doc for client ${client.name}. Run detectClientClickUpLists first.`);
  }
  const teamId = (client.metadata as { clickupTeamId?: string } | null)?.clickupTeamId
    ?? (await resolveWorkspace()).id;
  const { markdown, pages } = await fetchDocMarkdown(teamId, docId);

  const payload = { docId, source: "enfoque-tecnico", markdown, pages };
  const existing = await db
    .select()
    .from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));
  if (existing.length) {
    await db.update(clientContextCache)
      .set({ payload: payload as Record<string, unknown>, fetchedAt: new Date(), updatedAt: new Date(), externalId: docId })
      .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));
  } else {
    await db.insert(clientContextCache).values({
      clientId,
      source: "clickup-enfoque-tecnico",
      externalId: docId,
      payload: payload as Record<string, unknown>,
    });
  }
  return { chars: markdown.length, pages };
}

/**
 * Get cached Enfoque Técnico context (markdown) for a client. Falls back to
 * fetching from ClickUp if the cache is stale or missing, auto-detecting the
 * doc id first if needed.
 */
export async function getEnfoqueTecnicoContext(
  db: Db,
  clientId: string,
  opts: { forceRefresh?: boolean; maxAgeMs?: number } = {},
): Promise<{ markdown: string; cached: boolean; stale: boolean }> {
  const maxAgeMs = opts.maxAgeMs ?? 60 * 60 * 1000; // 1h default
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`Client ${clientId} not found`);

  const cached = await db
    .select()
    .from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));

  const now = Date.now();
  const isStale = !cached.length || (now - new Date(cached[0].fetchedAt).getTime()) > maxAgeMs;

  if (cached.length && !isStale && !opts.forceRefresh) {
    const p = cached[0].payload as { markdown?: string };
    return { markdown: p.markdown ?? "", cached: true, stale: false };
  }

  // Stale or missing — make sure we know the doc id, then refresh.
  if (!client.clickupListEnfoqueTecnicoId) {
    await detectClientClickUpLists(db, clientId);
    const [reloaded] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!reloaded?.clickupListEnfoqueTecnicoId) {
      return { markdown: "", cached: false, stale: true };
    }
  }
  try {
    const result = await refreshEnfoqueTecnicoContext(db, clientId);
    void result;
    const [row] = await db
      .select()
      .from(clientContextCache)
      .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));
    const p = (row?.payload ?? {}) as { markdown?: string };
    return { markdown: p.markdown ?? "", cached: false, stale: isStale };
  } catch {
    // If refresh fails, return whatever stale copy we have rather than erroring.
    if (cached.length) {
      const p = cached[0].payload as { markdown?: string };
      return { markdown: p.markdown ?? "", cached: true, stale: true };
    }
    return { markdown: "", cached: false, stale: true };
  }
}

// ── Plan de Marketing (pedido 20/7): reuniones, planificaciones y estrategia
// que el equipo carga en la lista "Plan de Marketing" del folder del cliente.
// Nutrición para agentes (Propuesta CM, estrategia) — el doc del jefe lo pide
// explícito: "puede ser algo importante para nutrirse en la planificación
// alineada con la marca".
export interface PlanMktItem {
  name: string;
  status: string;
  updatedAt: string | null;
  description: string | null;
}

const planMktListCache = new Map<string, { at: number; listId: string | null }>();

export async function getPlanMarketing(db: Db, clientId: string, limit = 30): Promise<PlanMktItem[] | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client?.clickupFolderId) return null;

  let cached = planMktListCache.get(clientId);
  if (!cached || Date.now() - cached.at > 6 * 3_600_000) {
    const r = await cu<{ lists: Array<{ id: string; name: string }> }>(`/folder/${encodeURIComponent(client.clickupFolderId)}/list`);
    const list = (r.lists ?? []).find((l) => /plan\s*de\s*m(arketing|kt)/i.test(l.name)) ?? null;
    cached = { at: Date.now(), listId: list?.id ?? null };
    planMktListCache.set(clientId, cached);
  }
  if (!cached.listId) return null;

  const r = await cu<{ tasks: Array<{
    name: string;
    status?: { status?: string };
    date_updated?: string | null;
    description?: string | null;
    text_content?: string | null;
  }> }>(`/list/${encodeURIComponent(cached.listId)}/task`, {
    query: { archived: false, include_closed: true, order_by: "updated", page: 0 },
  });
  // ClickUp no garantiza el sentido del orden — lo más reciente primero, acá.
  const tasks = (r.tasks ?? []).sort((a, b) => Number(b.date_updated ?? 0) - Number(a.date_updated ?? 0));
  return tasks.slice(0, limit).map((t) => ({
    name: t.name,
    status: t.status?.status ?? "sin estado",
    updatedAt: t.date_updated ? new Date(Number(t.date_updated)).toISOString().slice(0, 10) : null,
    description: ((t.description ?? t.text_content ?? "").trim().slice(0, 600)) || null,
  }));
}

// ── Producción de video (pedido 23/7): tareas de la lista "Produccion de
// video" del cliente, con heurística de si YA tienen guion (descripción larga
// con estructura o comentario del equipo). El circuito "Guionista" usa esto
// para escribir el guion de las que están peladas.
export interface VideoTask {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  url: string | null;
  descripcion: string | null;
  /** Heurística: descripción ≥250 chars o con marcas de guion (escena/VO/hook). */
  tieneGuion: boolean;
}

export async function getVideoTasks(db: Db, clientId: string): Promise<VideoTask[] | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client?.clickupListVideoId) return null;
  const r = await cu<{ tasks: Array<{
    id: string;
    name: string;
    status?: { status?: string };
    due_date?: string | null;
    url?: string | null;
    description?: string | null;
    text_content?: string | null;
  }> }>(`/list/${encodeURIComponent(client.clickupListVideoId)}/task`, {
    query: { archived: false, include_closed: false, subtasks: false },
  });
  return (r.tasks ?? []).map((t) => {
    const desc = (t.description ?? t.text_content ?? "").trim();
    const tieneGuion = desc.length >= 250 || /guion|guión|escena \d|voz en off|\bvo:|\bhook\b|toma \d/i.test(desc);
    return {
      id: t.id,
      name: t.name,
      status: t.status?.status ?? "sin estado",
      dueDate: t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0, 10) : null,
      url: t.url ?? null,
      descripcion: desc.slice(0, 500) || null,
      tieneGuion,
    };
  });
}

/**
 * El campo de etiquetas que matchea `re`, prefiriendo el que de verdad TIENE
 * opciones.
 *
 * `cfs.find()` a secas devuelve el primero que matchea, y en estas listas
 * conviven campos con nombres parecidos de tipos distintos ("Plataformas" de
 * tipo labels y "Plataforma de ecommerce (Ingreso)" de tipo texto). Elegir el
 * de texto no da error: da una lista vacía, que se lee como "este post no tiene
 * redes" y nadie se entera.
 */
function campoDeEtiquetas(cfs: CuLabelField[], re: RegExp): CuLabelField | undefined {
  const candidatos = cfs.filter((c) => re.test(c.name ?? ""));
  return candidatos.find((c) => (c.type_config?.options ?? []).length > 0) ?? candidatos[0];
}
