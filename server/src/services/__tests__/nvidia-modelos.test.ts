import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIN_TOKENS_RAZONAMIENTO,
  MODELO_TEXTO,
  MODELO_VISION,
  analizarTexto,
  nvidiaConfigurado,
  tokensSeguros,
  verImagen,
} from "../nvidia-modelos.js";

const IMG = "https://ejemplo.test/placa.jpg";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Respuesta cruda de la API, para simular cada forma que devuelve de verdad. */
function respondeCon(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("tokensSeguros", () => {
  // Es la única defensa contra que alguien copie un max_tokens chico de otro
  // servicio: con 16 tokens, kimi-k3 devuelve content vacío y HTTP 200.
  it("sube al piso cualquier presupuesto chico de un modelo de razonamiento", () => {
    expect(tokensSeguros(16, true)).toBe(MIN_TOKENS_RAZONAMIENTO);
    expect(tokensSeguros(300, true)).toBe(MIN_TOKENS_RAZONAMIENTO);
    expect(tokensSeguros(undefined, true)).toBeGreaterThanOrEqual(MIN_TOKENS_RAZONAMIENTO);
  });

  it("respeta un presupuesto mayor al piso", () => {
    expect(tokensSeguros(16_384, true)).toBe(16_384);
  });

  it("no toca los modelos que no razonan", () => {
    expect(tokensSeguros(300, false)).toBe(300);
  });
});

describe("nvidiaConfigurado", () => {
  it("es falso sin ninguna clave", () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "");
    vi.stubEnv("NVIDIA_API_KEY", "");
    expect(nvidiaConfigurado()).toBe(false);
  });

  it("alcanza con la clave general", () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "");
    vi.stubEnv("NVIDIA_API_KEY", "nvapi-x");
    expect(nvidiaConfigurado()).toBe(true);
  });
});

describe("verImagen", () => {
  it("sin clave no llama a la red y lo dice", async () => {
    const f = respondeCon({});
    vi.stubEnv("NVIDIA_API_KEY_VISION", "");
    vi.stubEnv("NVIDIA_API_KEY", "");
    const r = await verImagen("qué ves", IMG);
    expect(r.texto).toBeNull();
    expect(r.motivo).toBe("sin_clave");
    expect(f).not.toHaveBeenCalled();
  });

  it("manda el modelo de visión y la imagen con el piso de tokens aplicado", async () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "nvapi-x");
    const f = respondeCon({ choices: [{ message: { content: "un sendero" } }], usage: { total_tokens: 734 } });
    const r = await verImagen("qué ves", IMG, { maxTokens: 10 });
    expect(r.texto).toBe("un sendero");
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.model).toBe(MODELO_VISION);
    expect(body.max_tokens).toBe(MIN_TOKENS_RAZONAMIENTO);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "qué ves" },
      { type: "image_url", image_url: { url: IMG } },
    ]);
  });

  // EL CASO QUE ESTE MÓDULO EXISTE PARA CAZAR. HTTP 200, content null, el texto
  // atrapado en reasoning_content. Devolver null a secas es lo que hizo que el
  // mismo bug en MiniMax pasara semanas sin que nadie se enterara.
  it("distingue 'se comió el presupuesto razonando' de un fallo de red", async () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "nvapi-x");
    respondeCon({ choices: [{ message: { content: null, reasoning_content: "pensando…" }, finish_reason: "length" }] });
    const r = await verImagen("qué ves", IMG);
    expect(r.texto).toBeNull();
    expect(r.motivo).toBe("razonamiento_sin_texto");
    expect(r.detalle).toContain("max_tokens");
  });

  it("un vacío sin razonamiento es 'vacio', no el caso de arriba", async () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "nvapi-x");
    respondeCon({ choices: [{ message: { content: "" }, finish_reason: "stop" }] });
    expect((await verImagen("qué ves", IMG)).motivo).toBe("vacio");
  });

  it("un HTTP malo se reporta como http, con el status", async () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "nvapi-x");
    respondeCon({ error: "rate limit" }, false, 429);
    const r = await verImagen("qué ves", IMG);
    expect(r.motivo).toBe("http");
    expect(r.detalle).toContain("429");
  });

  it("un error de red se reporta como red y no explota", async () => {
    vi.stubEnv("NVIDIA_API_KEY_VISION", "nvapi-x");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const r = await verImagen("qué ves", IMG);
    expect(r.motivo).toBe("red");
    expect(r.detalle).toContain("ECONNRESET");
  });
});

describe("analizarTexto", () => {
  it("usa el modelo de texto y le aplica el piso de razonamiento", async () => {
    vi.stubEnv("NVIDIA_API_KEY_TEXTO", "nvapi-y");
    const f = respondeCon({ choices: [{ message: { content: "LISTO" } }] });
    const r = await analizarTexto("sos analista", "decí LISTO", { maxTokens: 256 });
    expect(r.texto).toBe("LISTO");
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.model).toBe(MODELO_TEXTO);
    // Se le aplica el piso A PROPOSITO: no aplicarselo a un modelo que razona
    // pierde la respuesta entera en silencio, y aplicarselo a uno que no razona
    // solo le da mas aire. El costo de equivocarse es asimetrico.
    expect(body.max_tokens).toBe(MIN_TOKENS_RAZONAMIENTO);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("nunca manda la clave en el cuerpo, solo en el header", async () => {
    vi.stubEnv("NVIDIA_API_KEY_TEXTO", "nvapi-secreta");
    const f = respondeCon({ choices: [{ message: { content: "ok" } }] });
    await analizarTexto("s", "u");
    const [, init] = f.mock.calls[0];
    expect(String(init.body)).not.toContain("nvapi-secreta");
    expect(init.headers.Authorization).toBe("Bearer nvapi-secreta");
  });
});
