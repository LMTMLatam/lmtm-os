// LMTM-OS: Google API client (Sheets · Drive · Apps Script).
// Auth: OAuth2 refresh token for grow@bylmtm.com. The org policy
// iam.disableServiceAccountKeyCreation blocks Service Account keys, so we
// use a long-lived user refresh token instead. Set three env vars:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REFRESH_TOKEN
//
// Access tokens are minted on demand and cached in-process until ~1 min
// before expiry, so a single MCP session reuses one token across calls.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

type Creds = { clientId: string; clientSecret: string; refreshToken: string };

export function readCreds(): Creds {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN. Regenerate the refresh token with `node scripts/google-oauth-token.mjs <id> <secret>`.",
    );
  }
  return { clientId, clientSecret, refreshToken };
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) {
    return cached.token;
  }
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
  const body = (await r.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!r.ok || !body.access_token) {
    throw new GoogleApiError(
      r.status,
      `Could not refresh Google access token: ${body.error_description ?? body.error ?? `HTTP ${r.status}`}`,
    );
  }
  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

export async function gFetch<T = unknown>(
  url: string,
  init?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    query?: Record<string, string | number | boolean | undefined | null>;
    jsonBody?: unknown;
  },
): Promise<T> {
  const token = await getAccessToken();
  const u = new URL(url);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null || v === "") continue;
      u.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const fetchInit: RequestInit = { method: init?.method ?? "GET", headers };
  if (init?.jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(init.jsonBody);
  }
  const r = await fetch(u.toString(), fetchInit);
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!r.ok) {
    const body = parsed as { error?: { message?: string } } | null;
    const msg =
      body?.error?.message ?? (typeof parsed === "string" ? parsed.slice(0, 300) : `HTTP ${r.status}`);
    throw new GoogleApiError(r.status, msg);
  }
  return parsed as T;
}
