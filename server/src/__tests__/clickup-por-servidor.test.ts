import { afterEach, describe, expect, it, vi } from "vitest";
import { HERRAMIENTAS, pedirAlServidor, servidorDesdeEntorno } from "@paperclipai/mcp-clickup";
import { HERRAMIENTAS as GOOGLE, servidorDesdeEntorno as googleDesdeEntorno } from "@paperclipai/mcp-google";
import { esDeAccion } from "../services/agent-modo.js";

// 05/11: los agentes dejan de tener el token de ClickUp (el mismo de los 129
// Apps Scripts) y la credencial de Google. Sus MCP `clickup` y `google` le
// piden cada acción al servidor.

const paperclip = { PAPERCLIP_API_URL: "https://os.test", PAPERCLIP_API_KEY: "jwt", PAPERCLIP_RUN_ID: "run-1" };

afterEach(() => vi.unstubAllGlobals());

describe("servidorDesdeEntorno", () => {
  it("sin token y con la API del servidor, va por el servidor", () => {
    expect(servidorDesdeEntorno(paperclip)).toEqual({ apiUrl: "https://os.test/api", apiKey: "jwt", runId: "run-1" });
  });

  it("aunque se cuele un token en el entorno, sigue yendo por el servidor", () => {
    expect(servidorDesdeEntorno({ ...paperclip, CLICKUP_API_TOKEN: "pk_x" })).not.toBeNull();
  });

  it("sin la API del servidor (uso suelto) llama directo", () => {
    expect(servidorDesdeEntorno({ CLICKUP_API_TOKEN: "pk_x" })).toBeNull();
  });
});

describe("pedirAlServidor", () => {
  const s = { apiUrl: "https://os.test/api", apiKey: "jwt", runId: "run-1" };

  it("manda clickup.<nombre> con la corrida y devuelve el contenido", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, content: "{\"id\":\"t1\"}" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(pedirAlServidor(s, "get_task", { taskId: "t1" })).resolves.toBe("{\"id\":\"t1\"}");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://os.test/api/agent-tools/execute");
    expect(JSON.parse(String(init.body))).toEqual({ tool: "clickup.get_task", parameters: { taskId: "t1" } });
    expect((init.headers as Record<string, string>)["X-Paperclip-Run-Id"]).toBe("run-1");
  });

  it("un freno del servidor llega al modelo como error, con su motivo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, content: "Esa es la lista de Redes" }))));
    await expect(pedirAlServidor(s, "create_task", {})).rejects.toThrow("Esa es la lista de Redes");
  });

  it("una página de error no se pasa entera", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>" + "x".repeat(5000), { status: 502 })));
    await expect(pedirAlServidor(s, "get_task", {})).rejects.toThrow(/^El servidor no respondió \(502\)/);
  });
});

describe("modo consulta", () => {
  // El servidor bloquea por nombre: un agente que solo mira tiene que poder leer
  // ClickUp y no escribir. Si se suma una herramienta que escribe con nombre de
  // lectura, este test lo marca.
  it("solo create_task, update_task y add_comment cuentan como acción", () => {
    const deAccion = Object.keys(HERRAMIENTAS).filter((n) => esDeAccion(`clickup.${n}`));
    expect(deAccion.sort()).toEqual(["add_comment", "create_task", "update_task"]);
  });
});

describe("google", () => {
  it("con la API del servidor va por él aunque haya credencial; sin ella, directo", () => {
    expect(googleDesdeEntorno({ ...paperclip, GOOGLE_OAUTH_REFRESH_TOKEN: "rt" })).not.toBeNull();
    expect(googleDesdeEntorno({ GOOGLE_OAUTH_REFRESH_TOKEN: "rt" })).toBeNull();
  });

  it("en modo consulta se lee y no se escribe", () => {
    const deAccion = Object.keys(GOOGLE).filter((n) => esDeAccion(`google.${n}`));
    expect(deAccion.sort()).toEqual([
      "drive_copy",
      "drive_create_folder",
      "script_create",
      "script_update_content",
      "sheets_append",
      "sheets_create",
      "sheets_update",
    ]);
  });
});
