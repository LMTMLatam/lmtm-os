// LMTM-OS: ClickUp sync service.
//
// For each LMTM client that has a ClickUp planilla, this service:
//   1. Walks the workspace → space → folder hierarchy to find the
//      three standard lists: 📲 Redes Sociales, Produção de video,
//      and Enfoque Técnico.
//   2. Persists the IDs in `clients.clickup_*` so the dashboard
//      button deep-links to the right folder, and agents can pull
//      the Enfoque Técnico list as context.
//   3. Caches the Enfoque Técnico list contents in
//      `client_context_cache` so we don't hit ClickUp on every
//      agent invocation.
//
// Auth: uses process.env.CLICKUP_API_TOKEN. In production, this
// should be the same personal API token used by the lmtm-clickup
// MCP plugin (operators configure it once in Render env vars).
//
// Reference: https://clickup.com/api

import type { Db } from "@paperclipai/db";
import { clients, clientContextCache } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";

const CU_API = "https://api.clickup.com/api/v2";

// Normalized name matchers for the 3 standard lists.
// We match loosely because LMTM operators use slightly different
// capitalizations / unicode / punctuation when they create the
// lists in ClickUp. The first match wins.
const STANDARD_LISTS: {
  redes: RegExp;
  video: RegExp;
  enfoqueTecnico: RegExp;
} = {
  // Matches: "Redes Sociales", "Redes", "RRSS", "📲 Redes Sociales"
  redes: /(redes?\s*sociales?|rrss|sociales?)/i,
  // Matches: "Produccion de video", "Producción de video", "Produção de Video", "Producao de Video", "Videos", "Video"
  video: /(producci[oó]n?\s*de\s*v[ií]deo|produ[cç][aã]o\s*de\s*v[ií]deo|v[ií]deos?)/i,
  // Matches: "Enfoque Tecnico", "Enfoque Técnico", "Enfoque T\xc3\xa9cnico"
  enfoqueTecnico: /(enfoque\s*t[eé]cnic[oó])/i,
};

type CuList = {
  id: string;
  name: string;
};

type CuTask = {
  id: string;
  name: string;
  description?: string;
  status?: { status?: string; color?: string };
  priority?: number | null;
  due_date?: string | null;
  url?: string;
  assignees?: Array<{ id: number; username?: string }>;
  list?: { id: string; name: string };
};

function token(): string {
  const t = (process.env.CLICKUP_API_TOKEN ?? "").trim();
  if (!t) {
    throw new Error(
      "CLICKUP_API_TOKEN not set. Add it to your Render env vars (or `cp .env.example .env` locally).",
    );
  }
  return t;
}

async function cu<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; query?: Record<string, string | number | boolean>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${CU_API}${path}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      url.searchParams.set(k, String(v));
    }
  }
  const fetchInit: RequestInit = { method: init.method ?? "GET" };
  const headers: Record<string, string> = { Authorization: token() };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(init.body);
  }
  fetchInit.headers = headers;
  const r = await fetch(url.toString(), fetchInit);
  const text = await r.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!r.ok) {
    const err = parsed as { err?: string; error?: string } | null;
    const msg = err?.err ?? err?.error ?? text.slice(0, 300) ?? `HTTP ${r.status}`;
    throw new Error(`ClickUp ${path} → ${r.status}: ${msg}`);
  }
  return parsed as T;
}

function classifyList(name: string): "redes" | "video" | "enfoqueTecnico" | null {
  if (STANDARD_LISTS.redes.test(name)) return "redes";
  if (STANDARD_LISTS.video.test(name)) return "video";
  if (STANDARD_LISTS.enfoqueTecnico.test(name)) return "enfoqueTecnico";
  return null;
}

/**
 * Find the space for a given client by matching its name.
 * Heuristic: exact match > case-insensitive match > contains.
 */
async function findSpaceForClient(workspaceId: string, clientName: string): Promise<{ id: string; name: string } | null> {
  const r = await cu<{ spaces: Array<{ id: string; name: string }> }>(
    `/team/${encodeURIComponent(workspaceId)}/space`,
  );
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(clientName);
  // 1) exact
  let hit = r.spaces.find((s) => norm(s.name) === target);
  // 2) case-insensitive contains
  if (!hit) hit = r.spaces.find((s) => norm(s.name).includes(target) || target.includes(norm(s.name)));
  return hit ?? null;
}

async function listFoldersInSpace(spaceId: string): Promise<Array<{ id: string; name: string }>> {
  const r = await cu<{ folders: Array<{ id: string; name: string }> }>(
    `/space/${encodeURIComponent(spaceId)}/folder`,
    { query: { archived: false } },
  );
  return r.folders;
}

async function listListsInFolder(folderId: string): Promise<CuList[]> {
  const r = await cu<{ lists: CuList[] }>(
    `/folder/${encodeURIComponent(folderId)}/list`,
    { query: { archived: false } },
  );
  return r.lists;
}

/** Lists that live directly under a space (no folder). */
async function listFolderlessLists(spaceId: string): Promise<CuList[]> {
  const r = await cu<{ lists: CuList[] }>(
    `/space/${encodeURIComponent(spaceId)}/list`,
    { query: { archived: false } },
  );
  return r.lists;
}

async function listTasksInList(listId: string): Promise<CuTask[]> {
  const r = await cu<{ tasks: CuTask[] }>(
    `/list/${encodeURIComponent(listId)}/task`,
    { query: { archived: false, page: 0 } },
  );
  return r.tasks;
}

/**
 * Detect the 3 standard lists for a given client. Walks workspace →
 * space (matched by client.name) → all folders + folderless lists,
 * then classifies each list by name. Saves the IDs to clients table.
 */
export async function detectClientClickUpLists(
  db: Db,
  clientId: string,
): Promise<{
  folderId: string | null;
  redes: string | null;
  video: string | null;
  enfoqueTecnico: string | null;
  warnings: string[];
}> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`Client ${clientId} not found`);

  const warnings: string[] = [];
  const found: { folderId: string | null; redes: string | null; video: string | null; enfoqueTecnico: string | null } = {
    folderId: null,
    redes: null,
    video: null,
    enfoqueTecnico: null,
  };

  // 1. List workspaces
  const ws = await cu<{ teams: Array<{ id: string; name: string }> }>("/team");
  if (!ws.teams.length) {
    warnings.push("No ClickUp workspaces visible to the API token.");
    return { ...found, warnings };
  }
  // If we have a known workspace ID, prefer it; otherwise use the first.
  const workspace = ws.teams[0];

  // 2. Find the space for this client
  const space = await findSpaceForClient(workspace.id, client.name);
  if (!space) {
    warnings.push(`No ClickUp space matches client name "${client.name}" in workspace ${workspace.name}.`);
    return { ...found, warnings };
  }

  // 3. Walk all folders + folderless lists
  const folders = await listFoldersInSpace(space.id);
  const folderless = await listFolderlessLists(space.id);

  // Classify each list across all folders
  let primaryFolder: string | null = null;
  for (const folder of folders) {
    const lists = await listListsInFolder(folder.id);
    let folderHasStandard = false;
    for (const list of lists) {
      const kind = classifyList(list.name);
      if (kind) {
        found[kind] = list.id;
        folderHasStandard = true;
        if (!primaryFolder) primaryFolder = folder.id;
      }
    }
    if (folderHasStandard) {
      // Use this folder as the "primary" if it has any standard list
      found.folderId = folder.id;
    }
  }
  // Folderless fallback
  for (const list of folderless) {
    const kind = classifyList(list.name);
    if (kind) found[kind] = list.id;
  }

  // Warn about missing lists
  if (!found.redes) warnings.push(`📲 Redes Sociales list not found in space "${space.name}".`);
  if (!found.video) warnings.push(`Produção de video list not found in space "${space.name}".`);
  if (!found.enfoqueTecnico) warnings.push(`Enfoque Técnico list not found in space "${space.name}".`);

  // Save to DB
  await db.update(clients).set({
    clickupFolderId: found.folderId,
    clickupListRedesId: found.redes,
    clickupListVideoId: found.video,
    clickupListEnfoqueTecnicoId: found.enfoqueTecnico,
    clickupListsSyncedAt: new Date(),
    planillaExternalId: found.folderId ?? clients.planillaExternalId, // back-compat: dashboard button uses this
    planillaSource: "clickup",
  }).where(eq(clients.id, clientId));

  return { ...found, warnings };
}

/**
 * Fetch the Enfoque Técnico list contents and cache them so the
 * agent context loader can read them without hitting ClickUp.
 */
export async function refreshEnfoqueTecnicoContext(
  db: Db,
  clientId: string,
): Promise<{ count: number; payload: unknown }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`Client ${clientId} not found`);
  const listId = client.clickupListEnfoqueTecnicoId;
  if (!listId) {
    throw new Error(
      `No Enfoque Técnico list ID for client ${client.name}. Run detectClientClickUpLists first.`,
    );
  }
  const tasks = await listTasksInList(listId);
  const payload = {
    listId,
    listName: "Enfoque Técnico",
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? null,
      status: t.status?.status ?? null,
      priority: t.priority ?? null,
      dueDate: t.due_date ?? null,
      url: t.url ?? null,
    })),
  };
  // Upsert into cache
  const existing = await db
    .select()
    .from(clientContextCache)
    .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));
  if (existing.length) {
    await db.update(clientContextCache)
      .set({ payload: payload as Record<string, unknown>, fetchedAt: new Date(), updatedAt: new Date(), externalId: listId })
      .where(and(eq(clientContextCache.clientId, clientId), eq(clientContextCache.source, "clickup-enfoque-tecnico")));
  } else {
    await db.insert(clientContextCache).values({
      clientId,
      source: "clickup-enfoque-tecnico",
      externalId: listId,
      payload: payload as Record<string, unknown>,
    });
  }
  return { count: tasks.length, payload };
}

/**
 * Get cached Enfoque Técnico context for a client. Falls back to
 * fetching from ClickUp if the cache is stale (>1h) or missing.
 */
export async function getEnfoqueTecnicoContext(
  db: Db,
  clientId: string,
  opts: { forceRefresh?: boolean; maxAgeMs?: number } = {},
): Promise<{ tasks: Array<{ id: string; name: string; description: string | null; status: string | null }>; cached: boolean; stale: boolean }> {
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
    const p = cached[0].payload as { tasks: Array<{ id: string; name: string; description: string | null; status: string | null }> };
    return { tasks: p.tasks ?? [], cached: true, stale: false };
  }

  // Stale or missing — refresh
  if (!client.clickupListEnfoqueTecnicoId) {
    // No list known yet — try to detect
    await detectClientClickUpLists(db, clientId);
    const [reloaded] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!reloaded?.clickupListEnfoqueTecnicoId) {
      return { tasks: [], cached: false, stale: true };
    }
  }
  const result = await refreshEnfoqueTecnicoContext(db, clientId);
  const p = result.payload as { tasks: Array<{ id: string; name: string; description: string | null; status: string | null }> };
  return { tasks: p.tasks ?? [], cached: false, stale: isStale };
}
