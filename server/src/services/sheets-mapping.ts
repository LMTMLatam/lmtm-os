// LMTM-OS: per-client Google Sheets planilla mapping.
//
// Each LMTM client has a planning Sheet in the agency's Drive (one per client,
// usually named after the client). This service:
//   1. Auto-detects the sheet for a client by matching the client's name
//      against Drive file titles (`q=name contains "<client name>" and
//      mimeType='application/vnd.google-apps.spreadsheet'`).
//   2. Persists the spreadsheet id on `clients.sheets_spreadsheet_id`.
//   3. Lets the operator override (set/clear) the mapping manually.
//
// Auth: same OAuth2 refresh token used by the Google MCP (grow@bylmtm.com).
// Set:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN

import type { Db } from "@paperclipai/db";
import { clients } from "@paperclipai/db";
import { eq } from "drizzle-orm";

// ── Google OAuth + Drive API (small self-contained client) ──────────────────
//
// Kept here (instead of importing the MCP server) so the route can call it
// during normal request handling without spawning a child process. Same env
// vars; same token cache semantics.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Creds = { clientId: string; clientSecret: string; refreshToken: string };

function readCreds(): Creds {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN.",
    );
  }
  return { clientId, clientSecret, refreshToken };
}

let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;
  const { clientId, clientSecret, refreshToken } = readCreds();
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !body.access_token) throw new Error(`Google OAuth: ${body.error ?? `HTTP ${r.status}`}`);
  cached = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string };

async function driveSearch(query: string, limit = 10): Promise<DriveFile[]> {
  const token = await getAccessToken();
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Drive search ${r.status}: ${t.slice(0, 300)}`);
  }
  const body = (await r.json()) as { files?: DriveFile[] };
  return body.files ?? [];
}

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Best-effort match score: 1.0 exact, 0.85 substring, 0.7 prefix, else 0.
 * Used to pick the most likely Drive Sheet for a client out of a fuzzy
 * search result.
 */
function score(clientNameNorm: string, fileName: string): number {
  const a = clientNameNorm;
  const b = norm(fileName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  // prefix overlap (first 5 chars)
  const head = a.slice(0, Math.min(5, a.length));
  if (head.length >= 3 && b.startsWith(head)) return 0.7;
  return 0;
}

export type SheetsMappingResult = {
  clientId: string;
  spreadsheetId: string | null;
  source: "auto" | "manual" | "cleared";
  candidates: Array<{ id: string; name: string; score: number; webViewLink: string | null }>;
  error?: string;
};

/**
 * Auto-detect the client's planning Sheet by scanning Drive for spreadsheets
 * whose title matches the client name. If the client already has a mapping,
 * returns it (no-op). Otherwise finds the best match and persists it.
 */
export async function autoDetectClientSheet(
  db: Db,
  clientId: string,
): Promise<SheetsMappingResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`client ${clientId} not found`);

  // Search Drive: any spreadsheet whose name contains the client name.
  const escapedName = client.name.replace(/'/g, "\\'");
  const query = `mimeType='${SPREADSHEET_MIME}' and name contains '${escapedName}' and trashed=false`;
  let files: DriveFile[];
  try {
    files = await driveSearch(query, 20);
  } catch (e) {
    return {
      clientId,
      spreadsheetId: client.sheetsSpreadsheetId,
      source: "auto",
      candidates: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const clientNameNorm = norm(client.name);
  const scored = files
    .map((f) => ({ id: f.id, name: f.name, score: score(clientNameNorm, f.name), webViewLink: f.webViewLink ?? null }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const detectedId = best && best.score >= 0.7 ? best.id : null;

  // If we found something better than the existing mapping, persist it.
  if (detectedId && detectedId !== client.sheetsSpreadsheetId) {
    await db
      .update(clients)
      .set({ sheetsSpreadsheetId: detectedId, sheetsDetectedAt: new Date(), updatedAt: new Date() })
      .where(eq(clients.id, clientId));
    return { clientId, spreadsheetId: detectedId, source: "auto", candidates: scored };
  }

  return {
    clientId,
    spreadsheetId: client.sheetsSpreadsheetId ?? detectedId,
    source: "auto",
    candidates: scored,
  };
}

/**
 * Force-set the client's Sheet (operator override). Returns the result with
 * the list of candidates seen (or empty if no search was done).
 */
export async function setClientSheet(
  db: Db,
  clientId: string,
  spreadsheetId: string,
): Promise<SheetsMappingResult> {
  await db
    .update(clients)
    .set({ sheetsSpreadsheetId: spreadsheetId, sheetsDetectedAt: new Date(), updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  return { clientId, spreadsheetId, source: "manual", candidates: [] };
}

/** Clear the mapping (operator decided this client has no Sheet). */
export async function clearClientSheet(
  db: Db,
  clientId: string,
): Promise<SheetsMappingResult> {
  await db
    .update(clients)
    .set({ sheetsSpreadsheetId: null, sheetsDetectedAt: null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  return { clientId, spreadsheetId: null, source: "cleared", candidates: [] };
}

/**
 * Run auto-detection for every active client that doesn't yet have a
 * mapping. Used by the periodic init loop to fill the column in once
 * OAuth credentials are wired up.
 */
export async function autoDetectAllMissingSheets(
  db: Db,
): Promise<{ clients: number; detected: number; errors: number }> {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.status, "active"));
  let detected = 0;
  let errors = 0;
  for (const c of rows) {
    try {
      const r = await autoDetectClientSheet(db, c.id);
      if (r.spreadsheetId && r.source === "auto") detected += 1;
    } catch {
      errors += 1;
    }
  }
  return { clients: rows.length, detected, errors };
}