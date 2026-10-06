import { describe, expect, it } from "vitest";
import { parsearRol, cargarRol } from "../roles.js";
import { armarPedido, compuerta, resumirCorrida } from "../correr.js";
import { DISPARADORES, HORARIOS, relojLocal } from "../cola.js";

describe("compuerta", () => {
  const permitidas = new Set(["mcp__lmtm__lmtmPauseAdEntity"]);
  it("N0: le saca approved a toda llamada, la acción queda como propuesta", () => {
    const r = compuerta("media-buyer", permitidas, "mcp__lmtm__lmtmPauseAdEntity", { clientId: "c", entityId: "1", approved: true });
    expect(r).toEqual({ behavior: "allow", updatedInput: { clientId: "c", entityId: "1" } });
  });
  it("niega lo que no es del rol (Bash, otras herramientas)", () => {
    expect(compuerta("media-buyer", permitidas, "Bash", { command: "env" }).behavior).toBe("deny");
    expect(compuerta("media-buyer", permitidas, "mcp__lmtm__lmtmSql", { sql: "x" }).behavior).toBe("deny");
  });
  it("deja pasar el resultado estructurado", () => {
    expect(compuerta("x", new Set(), "StructuredOutput", { resumen: "a" }).behavior).toBe("allow");
  });
});

describe("relojLocal", () => {
  it("usa la hora de Buenos Aires (UTC-3), no la del servidor", () => {
    // Martes 06/10 01:30 UTC = lunes 05/10 22:30 en Buenos Aires.
    expect(relojLocal(new Date("2026-10-06T01:30:00Z"))).toEqual({ fecha: "2026-10-05", dia: 1, hora: 22 });
    expect(relojLocal(new Date("2026-10-06T14:00:00Z"))).toEqual({ fecha: "2026-10-06", dia: 2, hora: 11 });
  });
  it("todo horario apunta a un procedimiento que existe en su rol", () => {
    for (const h of HORARIOS) expect(cargarRol(h.rol).texto).toContain(`Procedimiento: ${h.procedimiento}`);
  });
});

describe("roles", () => {
  it("separa encabezado y texto", () => {
    const r = parsearRol("x", "---\nagente: Media buyer\nherramientas: a, b\nturnos: 7\n---\n# Hola\ntexto");
    expect(r).toMatchObject({ agente: "Media buyer", herramientas: ["a", "b"], turnos: 7, minutos: 5, texto: "# Hola\ntexto" });
  });

  it("tira si falta lo obligatorio", () => {
    expect(() => parsearRol("x", "# sin encabezado")).toThrow();
    expect(() => parsearRol("x", "---\nherramientas: a\n---\ntexto")).toThrow(/agente/);
    expect(() => parsearRol("x", "---\nagente: A\n---\ntexto")).toThrow(/herramientas/);
  });

  it("todo rol que dispara una decisión existe, carga y tiene el procedimiento", () => {
    for (const d of DISPARADORES) {
      const r = cargarRol(d.rol);
      expect(r.texto).toContain(`Procedimiento: ${d.procedimiento}`);
      expect(r.herramientas.length).toBeGreaterThan(0);
    }
  });

  it("toda herramienta de un rol existe en el servidor MCP", async () => {
    const { readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { createPaperclipMcpServer } = await import("@paperclipai/mcp-server");
    const config = { apiUrl: "http://x/api", apiKey: "k", companyId: null, agentId: null, runId: null };
    const existentes = new Set(createPaperclipMcpServer(config).tools.map((t) => t.name));
    const carpeta = fileURLToPath(new URL("../roles/", import.meta.url));
    const roles = readdirSync(carpeta).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
    expect(roles.length).toBeGreaterThan(0);
    for (const r of roles) for (const h of cargarRol(r).herramientas) expect(existentes, `${r}: ${h}`).toContain(h);
  });

  it("no acepta nombres que salgan de la carpeta", () => {
    expect(() => cargarRol("../secreto")).toThrow(/inválido/);
  });
});

describe("resumirCorrida", () => {
  const usar = (id: string, name: string, input: unknown) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
  const volver = (id: string, text: string, is_error = false) => ({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }], is_error }] },
  });

  it("arma un paso por herramienta y toma el resultado estructurado", () => {
    const c = resumirCorrida([
      { type: "system", subtype: "init" },
      usar("1", "mcp__lmtm__lmtmGetClientCampaigns", { clientId: "c1", sinceDays: 18 }),
      volver("1", '{"campanas":[]}'),
      usar("2", "StructuredOutput", { resumen: "x" }),
      volver("2", "ok"),
      {
        type: "result",
        subtype: "success",
        num_turns: 3,
        result: "",
        structured_output: { resumen: "Pausada", verificado: ["a"], supuestos: [] },
        usage: { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 20 },
      },
    ]);
    expect(c.pasos).toEqual([{ herramienta: "lmtmGetClientCampaigns", entrada: { clientId: "c1", sinceDays: 18 }, salida: '{"campanas":[]}' }]);
    expect(c.resultado).toEqual({ resumen: "Pausada", verificado: ["a"], supuestos: [] });
    expect(c).toMatchObject({ error: null, turnos: 3, tokensEntrada: 150, tokensSalida: 20 });
  });

  it("si no hay estructurado, rescata el JSON del texto", () => {
    const c = resumirCorrida([{ type: "result", subtype: "success", result: 'listo: {"resumen":"Terminó","verificado":[],"supuestos":[]}' }]);
    expect(c.resultado).toEqual({ resumen: "Terminó", verificado: [], supuestos: [] });
  });

  it("un corte es error y no inventa resultado", () => {
    const c = resumirCorrida([usar("1", "mcp__lmtm__x", {}), { type: "result", subtype: "error_max_turns", errors: ["tope"] }]);
    expect(c.resultado).toBeNull();
    expect(c.error).toBe("error_max_turns: tope");
    expect(c.pasos).toEqual([]);
  });

  it("marca la herramienta que falló", () => {
    const c = resumirCorrida([usar("1", "mcp__lmtm__x", {}), volver("1", "403", true), { type: "result", subtype: "success", result: "{}" }]);
    expect(c.pasos[0]).toMatchObject({ herramienta: "x", error: true });
  });

  it("si todas las herramientas fallaron es fallo, aunque el modelo haya 'concluido' algo", () => {
    const c = resumirCorrida([
      usar("1", "mcp__lmtm__lmtmGetClientCampaigns", {}),
      volver("1", '{"error":"POST /agent-tools/execute failed with 401: Agent authentication required"}'),
      { type: "result", subtype: "success", structured_output: { resumen: "No se puede saber", verificado: [], supuestos: [] } },
    ]);
    expect(c.resultado).toBeNull();
    expect(c.error).toMatch(/Todas las herramientas fallaron/);
  });

  it("corta las etiquetas que MiniMax deja adentro de un campo", () => {
    const c = resumirCorrida([
      {
        type: "result",
        subtype: "success",
        structured_output: { resumen: "Sube el tope.</resumen>\n<resumen>Sube el tope.", verificado: ["a</x>b"], supuestos: [], siguientePaso: { quien: "cliente", que: "Recargar" } },
      },
    ]);
    expect(c.resultado).toEqual({ resumen: "Sube el tope.", verificado: ["a"], supuestos: [], siguientePaso: { quien: "cliente", que: "Recargar" } });
  });

  it("sin mensaje de resultado es error", () => {
    expect(resumirCorrida([]).error).toMatch(/sin devolver/);
  });
});

describe("armarPedido", () => {
  it("lleva procedimiento, cliente con su id y los números de la decisión", () => {
    const p = armarPedido({
      entrada: {
        procedimiento: "investigar-gasto-caido",
        cliente: { id: "c1", nombre: "BRACHETTA" },
        decision: { que: "Averiguar", porque: { resumen: "Cayó", datos: [{ etiqueta: "Gasto diario antes", valor: 7337, unidad: "ars_dia" }, { etiqueta: "Ahora", valor: null }] } },
      },
    });
    expect(p).toContain("Procedimiento: investigar-gasto-caido");
    expect(p).toContain("clientId: c1");
    expect(p).toContain("- Gasto diario antes: 7337 (ars_dia)");
    expect(p).toContain("- Ahora: sin dato");
  });
});
