import { afterEach, describe, expect, it, vi } from "vitest";
import { crmRequest } from "../crm-client.js";

// Credencial de servicio del CRM (19/11/2026): con CRM_API_KEY no hay login; sin ella, el login de siempre.
const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("crm-client", () => {
  it("con CRM_API_KEY manda la credencial y la empresa 10, sin login", async () => {
    vi.stubEnv("CRM_API_KEY", "lmtm_prueba");
    const fetchMock = vi.fn(async () => respuesta([{ id: 1 }]));
    vi.stubGlobal("fetch", fetchMock);
    const r = await crmRequest("GET", "/users/");
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/users\/$/);
    const h = init.headers as Record<string, string>;
    expect(h["X-Api-Key"]).toBe("lmtm_prueba");
    expect(h["X-Company-Id"]).toBe("10");
    expect(h.Authorization).toBeUndefined();
  });

  it("con la credencial, un 401 no intenta loguearse", async () => {
    vi.stubEnv("CRM_API_KEY", "lmtm_revocada");
    const fetchMock = vi.fn(async () => respuesta({ detail: "Credencial de servicio invalida o revocada" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const r = await crmRequest("GET", "/users/");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sin CRM_API_KEY se loguea con usuario y clave como siempre", async () => {
    vi.stubEnv("CRM_API_KEY", "");
    vi.stubEnv("CRM_AGENT_PASSWORD", "clave");
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      String(url).endsWith("/auth/login") ? respuesta({ token: "jwt-prueba" }) : respuesta({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await crmRequest("GET", "/pipeline/board");
    expect(r.ok).toBe(true);
    const llamadas = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(llamadas[0]).toMatch(/\/auth\/login$/);
    const init = fetchMock.mock.calls[1][1] as unknown as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-prueba");
  });
});
