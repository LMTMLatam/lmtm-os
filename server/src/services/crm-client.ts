// LMTM-OS: proxy client for the proprietary LMTM CRM (FastAPI, crm.lmtmas.com).
//
// Agents call the crm_request tool; this module handles login + token caching
// (15-min JWT) and ENFORCES the operation rules from the CRM docs §8 in code,
// so the service credential never enters an agent's context and the hard
// prohibitions can't be bypassed by a prompt. Softer "needs human approval"
// rules live in the lmtm-crm-propio skill (behavioural), the same split the
// rest of the system uses.

const CRM_BASE = (process.env.CRM_API_URL ?? "https://crm.lmtmas.com/api").replace(/\/$/, "");
const CRM_EMAIL = process.env.CRM_AGENT_EMAIL ?? "agentes@bylmtm.com";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function login(): Promise<string> {
  const password = process.env.CRM_AGENT_PASSWORD;
  if (!password) throw new Error("CRM_AGENT_PASSWORD no configurado en el entorno del servidor");
  const r = await fetch(`${CRM_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: CRM_EMAIL, password }),
  });
  if (!r.ok) throw new Error(`CRM login falló (${r.status})`);
  const j = (await r.json()) as { token?: string; requires_2fa?: boolean };
  if (j.requires_2fa) throw new Error("El usuario de servicio del CRM tiene 2FA activo — debe desactivarse para login programático");
  if (!j.token) throw new Error("CRM login no devolvió token");
  cachedToken = j.token;
  tokenExpiresAt = Date.now() + 13 * 60 * 1000; // 15-min token, renew a bit early
  return j.token;
}

async function token(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login();
}

// ── Security guards (CRM docs §8) enforced in code ──────────────────────────
const method = (m: string) => m.toUpperCase();

/** Hard-blocked regardless of anything — a human does these directly. */
function hardBlocked(m: string, path: string): string | null {
  const p = path.toLowerCase();
  if (method(m) === "DELETE") return "DELETE está prohibido para agentes (empresas, usuarios, contactos, canales). Lo hace un humano.";
  // Sending real messages to clients' contacts.
  if (/\/(messages|conversations\/[^/]+\/(send|reply))/.test(p) && method(m) === "POST")
    return "Enviar mensajes a contactos reales de clientes está prohibido para agentes.";
  // Platform-level money/suspension levers.
  if (/\/admin\/companies\/[^/]+\/(subscription|active)/.test(p) && method(m) !== "GET")
    return "Cambiar suscripción/estado de una empresa está prohibido para agentes (requiere humano).";
  if (/\/admin\/plans/.test(p) && method(m) !== "GET")
    return "Modificar/crear planes está prohibido para agentes.";
  if (/billingbypass/i.test(p)) return "billingBypass está prohibido para agentes.";
  // Credentials / infra.
  if (/\/(env|secrets?)\b/.test(p)) return "Acceso a credenciales/secretos prohibido.";
  return null;
}

/** Writes the docs mark as "requires human approval". We allow them (the user
 *  wants agents to create users/clients, connect channels, etc.) but flag so
 *  the skill/caller knows to have gotten explicit human sign-off first. */
function needsApproval(m: string, path: string): boolean {
  if (method(m) === "GET") return false;
  const p = path.toLowerCase();
  // Explicitly-safe writes (docs §8 "libres"): dry-runs and tests.
  if (/\/ai\/agents\/test-chat|\/channels\/[^/]+\/test|\/admin\/arca\/dummy|\/ai\/rag\/search/.test(p)) return false;
  return true;
}

export interface CrmResult {
  ok: boolean;
  status: number;
  approvalRequired?: boolean;
  data?: unknown;
  error?: string;
}

/** Perform an authenticated CRM API call with the rules enforced. */
export async function crmRequest(
  m: string,
  path: string,
  body?: unknown,
  opts: { approved?: boolean } = {},
): Promise<CrmResult> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const blocked = hardBlocked(m, cleanPath);
  if (blocked) return { ok: false, status: 403, error: blocked };
  if (needsApproval(m, cleanPath) && !opts.approved) {
    return {
      ok: false, status: 0, approvalRequired: true,
      error: "Esta operación de escritura requiere OK humano explícito. Proponé la acción en el issue y esperá aprobación; recién ahí ejecutá con approved=true.",
    };
  }

  const doFetch = async (jwt: string) =>
    fetch(`${CRM_BASE}${cleanPath}`, {
      method: method(m),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      ...(body != null && method(m) !== "GET" ? { body: JSON.stringify(body) } : {}),
    });

  try {
    let r = await doFetch(await token());
    if (r.status === 401) { // token expired mid-flight — re-login once
      cachedToken = null;
      r = await doFetch(await token());
    }
    const text = await r.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep raw */ }
    if (!r.ok) {
      const detail = (data as { detail?: string })?.detail ?? text.slice(0, 300);
      return { ok: false, status: r.status, error: `CRM ${r.status}: ${detail}`, data };
    }
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
