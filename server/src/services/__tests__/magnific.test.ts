import { afterEach, describe, expect, it, vi } from "vitest";

describe("Magnific: el pedido que la API acepta (16/10)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("manda un modelo válido, el header nuevo y el host nuevo", async () => {
    vi.stubEnv("MAGNIFIC_API_KEY", "k");
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      const cuerpo = init.method === "POST"
        ? { data: { task_id: "t1", status: "CREATED", generated: [] } }
        : { data: { task_id: "t1", status: "COMPLETED", generated: ["https://img/1.png"] } };
      return new Response(JSON.stringify(cuerpo), { status: 200 });
    });
    vi.useFakeTimers();
    const { generarImagenMagnific, MODELOS_MAGNIFIC } = await import("../magnific.js");
    const p = generarImagenMagnific("una placa", { aspect: "9:16" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toEqual({ url: "https://img/1.png", jobId: "t1" });
    vi.useRealTimers();

    const post = llamadas[0];
    expect(post.url).toBe("https://api.magnific.com/v1/ai/mystic");
    expect((post.init.headers as Record<string, string>)["x-magnific-api-key"]).toBe("k");
    const body = JSON.parse(String(post.init.body));
    expect(MODELOS_MAGNIFIC).toContain(body.model);
    expect(body.aspect_ratio).toBe("social_story_9_16");
  });

  it("un modelo inválido en la variable no rompe: vuelve a realism", async () => {
    vi.stubEnv("MAGNIFIC_MODELO", "mystic");
    const { MODELO_MAGNIFIC } = await import("../magnific.js");
    expect(MODELO_MAGNIFIC).toBe("realism");
  });
});
