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
