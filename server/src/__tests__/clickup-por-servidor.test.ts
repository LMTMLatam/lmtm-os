import { afterEach, describe, expect, it, vi } from "vitest";
import { HERRAMIENTAS, pedirAlServidor, servidorDesdeEntorno } from "@paperclipai/mcp-clickup";
import { esDeAccion } from "../services/agent-modo.js";

// 05/11: los agentes dejan de tener el token de ClickUp (el mismo de los 129
// Apps Scripts). Su MCP `clickup` le pide cada acción al servidor.

const paperclip = { PAPERCLIP_API_URL: "https://os.test", PAPERCLIP_API_KEY: "jwt", PAPERCLIP_RUN_ID: "run-1" };

afterEach(() => vi.unstubAllGlobals());

describe("servidorDesdeEntorno", () => {
  it("sin token y con la API del servidor, va por el servidor", () => {
    expect(servidorDesdeEntorno(paperclip)).toEqual({ apiUrl: "https://os.test/api", apiKey: "jwt", runId: "run-1" });
  });

  it("con token y sin el interruptor, sigue directo", () => {
    expect(servidorDesdeEntorno({ ...paperclip, CLICKUP_API_TOKEN: "pk_x" })).toBeNull();
  });

  it("el interruptor del agente de prueba gana aunque haya token", () => {
    expect(servidorDesdeEntorno({ ...paperclip, CLICKUP_API_TOKEN: "pk_x", LMTM_CLICKUP_POR_SERVIDOR: "1" })).not.toBeNull();
  });

  it("sin la API del servidor no hay a quién pedirle", () => {
    expect(servidorDesdeEntorno({ LMTM_CLICKUP_POR_SERVIDOR: "1" })).toBeNull();
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
