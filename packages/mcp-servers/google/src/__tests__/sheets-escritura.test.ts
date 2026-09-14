import { afterEach, describe, expect, it, vi } from "vitest";
import { sheetsAppend, sheetsRead, sheetsUpdate } from "../tools.js";

// Decisión del usuario el 14/9/26: "todavía no activemos lo de escribir en las
// planillas". Está acá y no solo en el handler de la tool porque este módulo es
// la capa que comparten LAS DOS superficies — los sheets_* de agent-tools y el
// MCP de Google que usan los agentes por claude-mcp.json.
//
// Lo que está en juego: la planilla MANDA sobre ClickUp. El Apps Script nocturno
// pisa la fecha y el horario de cada tarea con lo que diga el Sheet.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const args = { spreadsheetId: "1abc", range: "Hoja 1!A1", values: [["x"]] };

describe("escritura en planillas, apagada por defecto", () => {
  it("sheetsAppend no escribe y explica por qué", async () => {
    vi.stubEnv("LMTM_PERMITIR_ESCRIBIR_PLANILLAS", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(sheetsAppend(args)).rejects.toThrow(/desactivado/i);
    // Lo importante: no llegó a la red. Un error después de escribir no sirve.
    expect(f).not.toHaveBeenCalled();
  });

  it("sheetsUpdate tampoco, que además pisa celdas", async () => {
    vi.stubEnv("LMTM_PERMITIR_ESCRIBIR_PLANILLAS", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(sheetsUpdate(args)).rejects.toThrow(/desactivado/i);
    expect(f).not.toHaveBeenCalled();
  });

  it("el mensaje dice qué hacer, no solo que no se puede", async () => {
    vi.stubEnv("LMTM_PERMITIR_ESCRIBIR_PLANILLAS", "");
    vi.stubGlobal("fetch", vi.fn());
    await expect(sheetsAppend(args)).rejects.toThrow(/pedilo en el issue/i);
  });

  it("solo 'true' lo habilita: cualquier otro valor sigue apagado", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const v of ["1", "TRUE", "si", "yes", "false"]) {
      vi.stubEnv("LMTM_PERMITIR_ESCRIBIR_PLANILLAS", v);
      await expect(sheetsAppend(args)).rejects.toThrow(/desactivado/i);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("LEER nunca se bloqueó: el candado es solo de escritura", async () => {
    vi.stubEnv("LMTM_PERMITIR_ESCRIBIR_PLANILLAS", "");
    vi.stubEnv("GOOGLE_OAUTH_REFRESH_TOKEN", "");
    // Sin credenciales falla, pero NO por el candado — que es lo que se prueba.
    await expect(sheetsRead({ spreadsheetId: "1abc", range: "A1" }))
      .rejects.not.toThrow(/desactivado/i);
  });
});
