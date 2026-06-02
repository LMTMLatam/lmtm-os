// LMTM-OS: ClickUp API client.
// Thin wrapper over fetch for the v2 REST API. ClickUp uses a personal
// API token in the `Authorization` header (bare, no Bearer prefix).
// All non-2xx responses throw with a structured Error so the tool
// layer can surface the right hint to the model.
//
// Reference: https://clickup.com/api

const API_BASE = "https://api.clickup.com/api/v2";

export class ClickUpApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ClickUpApiError";
  }
}

type ClickUpErrorBody = {
  err?: string;
  ECODE?: string;
  // For validation errors ClickUp returns 400 with multiple fields.
  errors?: Array<{ field?: string; message?: string }>;
};

export function readApiToken(): string {
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "CLICKUP_API_TOKEN not set. Create one in ClickUp → Settings → Apps → API Token, then export it before starting the server.",
    );
  }
  return token;
}

async function cuFetch<T = unknown>(
  token: string,
  path: string,
  init?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, string | number | boolean | undefined | null>;
    jsonBody?: Record<string, unknown> | Array<unknown>;
  },
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    Authorization: token, // bare token, NOT "Bearer ..."
    "Content-Type": "application/json",
  };
  const fetchInit: RequestInit = {
    method: init?.method ?? "GET",
    headers,
  };
  if (init?.jsonBody !== undefined) {
    fetchInit.body = JSON.stringify(init.jsonBody);
  }
  const r = await fetch(url.toString(), fetchInit);
  const text = await r.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // ClickUp sometimes returns an empty body for DELETE; treat as null.
    parsed = null;
  }
  if (!r.ok) {
    const body = parsed as ClickUpErrorBody | null;
    const msg =
      body?.err ??
      (Array.isArray(body?.errors) && body!.errors!.length > 0
        ? body!.errors!.map((e) => `${e.field ?? "?"}: ${e.message ?? "?"}`).join("; ")
        : text.slice(0, 200) || `HTTP ${r.status}`);
    throw new ClickUpApiError(r.status, body?.ECODE ?? null, msg);
  }
  return parsed as T;
}

export const clickupFetch = cuFetch;
export { API_BASE };
